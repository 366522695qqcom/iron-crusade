/**
 * 新手引导遮罩（render/ui/overlays/）
 *
 * 实现依据：
 * - PROJECT.md 3.13 阶梯式新手引导：Day1/Day2/Day3 按日解锁
 * - spec A 级 - A.3.4：引导 UI（高亮、气泡、遮罩）
 * - spec S.4.1：玩法重心倾斜，工业与资源优先教学，战斗延后
 * - 技术设计文档 7.4：UI 以 cc.Graphics 代码绘制为主
 *
 * 设计要点：
 * - 全屏半透明遮罩 + 目标节点高亮框（drawHighlightFrame）
 * - 引导气泡：箭头指向高亮目标 + 任务文案 + 「下一步」按钮
 * - 调用方通过 setTarget(rect) 指定高亮区域，setText 设置文案
 *
 * 局内无广告原则：引导遮罩不含任何广告入口。
 */
import { Graphics, Label, Node, Color } from 'cc';
import { createNode, makeLabel, makeGraphicsNode, makeButton, addFullWidget } from '../../core/node_factory';
import { drawOverlay, drawPanel, drawHighlightFrame } from '../../core/graphics_util';
import {
  INDUSTRY_PALETTE,
  NEUTRAL_PALETTE,
  FONT_SIZE,
  SPACING,
  RADIUS,
  DESIGN_WIDTH,
  DESIGN_HEIGHT,
} from '../../core/ui_theme';

/** 高亮目标矩形（节点世界坐标） */
export interface HighlightRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** 引导文案 */
export interface OnboardingGuideText {
  /** 任务标题（如「Day1 - 资源与工厂」） */
  title: string;
  /** 引导文案（如「点击「建造」入口，放置 1 座民用工厂」） */
  body: string;
  /** 步骤进度（如「2 / 5」） */
  step: string;
}

export class OnboardingOverlay {
  private _node: Node | null = null;
  private _overlayGfx: Graphics | null = null;
  private _highlightGfx: Graphics | null = null;
  private _bubbleGfx: Graphics | null = null;
  private _titleLabel: Label | null = null;
  private _bodyLabel: Label | null = null;
  private _stepLabel: Label | null = null;
  private _nextBtn: { node: Node; label: Label } | null = null;
  private _nextCb: (() => void) | null = null;
  private _skipCb: (() => void) | null = null;

  mount(parent: Node): Node {
    if (this._node) return this._node;
    const node = createNode('OnboardingOverlay', parent, DESIGN_WIDTH, DESIGN_HEIGHT);
    addFullWidget(node);
    node.active = false;
    this._node = node;

    // 全屏遮罩
    const { graphics: overlayGfx } = makeGraphicsNode(node, 'Overlay', DESIGN_WIDTH, DESIGN_HEIGHT);
    drawOverlay(overlayGfx, -DESIGN_WIDTH / 2, -DESIGN_HEIGHT / 2, DESIGN_WIDTH, DESIGN_HEIGHT, 0.55);
    this._overlayGfx = overlayGfx;

    // 高亮框图层（位于遮罩之上）
    const { graphics: highlightGfx } = makeGraphicsNode(node, 'Highlight', DESIGN_WIDTH, DESIGN_HEIGHT);
    this._highlightGfx = highlightGfx;

    // 引导气泡（默认在屏幕下方居中）
    const bubbleW = 480;
    const bubbleH = 160;
    const bubbleNode = createNode('Bubble', node, bubbleW, bubbleH);
    bubbleNode.setPosition(0, -DESIGN_HEIGHT / 2 + bubbleH / 2 + SPACING.LG, 0);

    const { graphics: bubbleGfx } = makeGraphicsNode(bubbleNode, 'BubbleBg', bubbleW, bubbleH);
    drawPanel(bubbleGfx, -bubbleW / 2, -bubbleH / 2, bubbleW, bubbleH, INDUSTRY_PALETTE.panelBg, INDUSTRY_PALETTE.primary, RADIUS.PANEL);
    this._bubbleGfx = bubbleGfx;

    this._titleLabel = makeLabel(bubbleNode, '—', FONT_SIZE.TITLE, INDUSTRY_PALETTE.primary, 'Title').label;
    this._titleLabel.node.setPosition(0, bubbleH / 2 - SPACING.LG - 8, 0);

    this._bodyLabel = makeLabel(bubbleNode, '', FONT_SIZE.BODY, NEUTRAL_PALETTE.textPrimary, 'Body').label;
    this._bodyLabel.node.setPosition(0, SPACING.SM, 0);

    this._stepLabel = makeLabel(bubbleNode, '', FONT_SIZE.CAPTION, NEUTRAL_PALETTE.textSecondary, 'Step').label;
    this._stepLabel.node.setPosition(-bubbleW / 2 + 40, -bubbleH / 2 + SPACING.MD, 0);

    const nextBtn = makeButton(bubbleNode, '下一步', 96, 36, INDUSTRY_PALETTE.primary, INDUSTRY_PALETTE.pressed, FONT_SIZE.BODY, 'NextBtn');
    nextBtn.node.setPosition(bubbleW / 2 - 64, -bubbleH / 2 + SPACING.MD + 6, 0);
    nextBtn.node.on('click', () => this._nextCb?.());
    this._nextBtn = { node: nextBtn.node, label: nextBtn.label };

    const skipBtn = makeButton(bubbleNode, '跳过', 80, 28, NEUTRAL_PALETTE.bgMid, NEUTRAL_PALETTE.textDisabled, FONT_SIZE.CAPTION, 'SkipBtn');
    skipBtn.node.setPosition(bubbleW / 2 - 180, -bubbleH / 2 + SPACING.MD + 4, 0);
    skipBtn.node.on('click', () => this._skipCb?.());

    return node;
  }

  /** 显示引导步骤 */
  show(text: OnboardingGuideText, target?: HighlightRect): void {
    if (!this._node) return;
    this._node.active = true;
    if (this._titleLabel) this._titleLabel.string = text.title;
    if (this._bodyLabel) this._bodyLabel.string = text.body;
    if (this._stepLabel) this._stepLabel.string = text.step;
    this.updateHighlight(target);
  }

  /** 隐藏引导 */
  hide(): void {
    if (this._node) this._node.active = false;
  }

  /** 更新高亮目标（null = 无高亮，仅遮罩） */
  updateHighlight(target?: HighlightRect): void {
    if (!this._highlightGfx) return;
    if (!target) {
      this._highlightGfx.clear();
      return;
    }
    const accent: Color = INDUSTRY_PALETTE.primary;
    drawHighlightFrame(this._highlightGfx, target.x, target.y, target.w, target.h, accent, 4);
  }

  /** 注册下一步回调 */
  onNext(cb: () => void): void {
    this._nextCb = cb;
  }

  /** 注册跳过回调 */
  onSkip(cb: () => void): void {
    this._skipCb = cb;
  }

  /** 暴露遮罩图形（供外部访问器对齐 / 调试用） */
  get overlayGfx(): Graphics | null {
    return this._overlayGfx;
  }

  /** 暴露气泡图形（供外部访问器对齐 / 调试用） */
  get bubbleGfx(): Graphics | null {
    return this._bubbleGfx;
  }

  /** 暴露下一步按钮节点（供外部访问器对齐） */
  get nextBtn(): { node: Node; label: Label } | null {
    return this._nextBtn;
  }

  get isShown(): boolean {
    return this._node?.active ?? false;
  }
}
