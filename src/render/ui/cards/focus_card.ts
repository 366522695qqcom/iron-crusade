/**
 * 焦点卡牌（render/ui/cards/）
 *
 * 实现依据：
 * - PROJECT.md 3.5 国家焦点：三选一候选 + 进行中焦点
 * - 技术设计文档 7.4：UI 以 cc.Graphics 代码绘制为主
 * - spec S.4.2：焦点属中性类入口（weight 0.8），但卡牌本身用 INDUSTRY_PALETTE 主色调
 *
 * 与 focus_panel 的区别：
 * - focus_panel 是右侧固定面板（始终展示当前焦点 + 三选一）
 * - focus_card 是弹窗式卡牌（如焦点完成时全屏弹卡，强调仪式感）
 *
 * 局内无广告原则：焦点卡牌不含任何广告入口。
 */
import { Graphics, Label, Color } from 'cc';
import { createNode, makeLabel, makeGraphicsNode, makeButton, addFullWidget } from '../../core/node_factory';
import { drawCard, drawProgressBar, drawOverlay } from '../../core/graphics_util';
import {
  INDUSTRY_PALETTE,
  NEUTRAL_PALETTE,
  FONT_SIZE,
  SPACING,
  DESIGN_WIDTH,
  DESIGN_HEIGHT,
} from '../../core/ui_theme';

/** 焦点卡牌视图 */
export interface FocusCardView {
  /** 焦点 ID */
  focusId: string;
  /** 焦点名 */
  name: string;
  /** 焦点描述 */
  description: string;
  /** 完成奖励摘要（如「+10 政治点 / 解锁民厂 +1」） */
  rewardSummary: string;
  /** 卡牌类型：'completed'（已完成弹窗）/ 'candidate'（候选选择） */
  kind: 'completed' | 'candidate';
  /** 进度 0-1（candidate 才有） */
  progress?: number;
}

/** 焦点卡牌动作回调 */
export type FocusCardAction = 'confirm' | 'pick';

export class FocusCard {
  private _node: import('cc').Node | null = null;
  private _bgGfx: Graphics | null = null;
  private _cardGfx: Graphics | null = null;
  private _nameLabel: Label | null = null;
  private _descLabel: Label | null = null;
  private _rewardLabel: Label | null = null;
  private _progressLabel: Label | null = null;
  private _progressBar: Graphics | null = null;
  private _progressBarW = 0;
  private _actionBtn: { node: import('cc').Node; label: Label } | null = null;
  private _actionCb: ((action: FocusCardAction, focusId: string) => void) | null = null;
  private _currentFocusId = '';

  /** 挂载到父节点（默认隐藏，show 时显示） */
  mount(parent: import('cc').Node): import('cc').Node {
    if (this._node) return this._node;
    const node = createNode('FocusCard', parent, DESIGN_WIDTH, DESIGN_HEIGHT);
    addFullWidget(node);
    node.active = false;
    this._node = node;

    // 半透明遮罩
    const { graphics: overlayGfx } = makeGraphicsNode(node, 'Overlay', DESIGN_WIDTH, DESIGN_HEIGHT);
    drawOverlay(overlayGfx, -DESIGN_WIDTH / 2, -DESIGN_HEIGHT / 2, DESIGN_WIDTH, DESIGN_HEIGHT, 0.7);
    overlayGfx.node.setPosition(0, 0, 0);
    this._bgGfx = overlayGfx;

    // 卡牌主体（居中）
    const cardW = 420;
    const cardH = 540;
    const cardNode = createNode('Card', node, cardW, cardH);
    cardNode.setPosition(0, 0, 0);

    const { graphics: cardGfx } = makeGraphicsNode(cardNode, 'CardBg', cardW, cardH);
    drawCard(cardGfx, -cardW / 2, -cardH / 2, cardW, cardH, NEUTRAL_PALETTE.cardBg, INDUSTRY_PALETTE.primary);
    this._cardGfx = cardGfx;

    this._nameLabel = makeLabel(cardNode, '—', FONT_SIZE.TITLE_LG, NEUTRAL_PALETTE.textPrimary, 'Name').label;
    this._nameLabel.node.setPosition(0, cardH / 2 - SPACING.XXL, 0);

    this._descLabel = makeLabel(cardNode, '', FONT_SIZE.BODY, NEUTRAL_PALETTE.textSecondary, 'Desc').label;
    this._descLabel.node.setPosition(0, cardH / 2 - SPACING.XXL - FONT_SIZE.TITLE_LG - SPACING.LG, 0);

    // 进度条（仅 candidate 显示）
    this._progressBarW = cardW - SPACING.XL * 2;
    this._progressLabel = makeLabel(cardNode, '', FONT_SIZE.CAPTION, NEUTRAL_PALETTE.textSecondary, 'Progress').label;
    this._progressLabel.node.setPosition(0, 0, 0);
    const barNode = makeGraphicsNode(cardNode, 'Bar', this._progressBarW, 10);
    barNode.node.setPosition(0, -SPACING.MD, 0);
    drawProgressBar(barNode.graphics, -this._progressBarW / 2, -5, this._progressBarW, 10, 0);
    this._progressBar = barNode.graphics;

    this._rewardLabel = makeLabel(cardNode, '', FONT_SIZE.CAPTION, INDUSTRY_PALETTE.resourceOk, 'Reward').label;
    this._rewardLabel.node.setPosition(0, -cardH / 2 + SPACING.XXL + SPACING.LG, 0);

    const btn = makeButton(cardNode, '确认', 160, 44, INDUSTRY_PALETTE.primary, INDUSTRY_PALETTE.pressed, FONT_SIZE.BODY, 'ActionBtn');
    btn.node.setPosition(0, -cardH / 2 + SPACING.XL, 0);
    btn.node.on('click', () => {
      if (this._currentFocusId) {
        const action: FocusCardAction = this._kind === 'completed' ? 'confirm' : 'pick';
        this._actionCb?.(action, this._currentFocusId);
      }
    });
    this._actionBtn = { node: btn.node, label: btn.label };

    return node;
  }

  private _kind: FocusCardView['kind'] = 'completed';

  /** 显示卡牌 */
  show(view: FocusCardView): void {
    if (!this._node) return;
    this._node.active = true;
    this._currentFocusId = view.focusId;
    this._kind = view.kind;

    if (this._nameLabel) this._nameLabel.string = view.name;
    if (this._descLabel) this._descLabel.string = view.description;
    if (this._rewardLabel) this._rewardLabel.string = view.rewardSummary;

    if (view.kind === 'candidate') {
      const progress = view.progress ?? 0;
      if (this._progressLabel) this._progressLabel.string = `${Math.round(progress * 100)}%`;
      if (this._progressBar) {
        drawProgressBar(this._progressBar, -this._progressBarW / 2, -5, this._progressBarW, 10, progress, NEUTRAL_PALETTE.bgMid, INDUSTRY_PALETTE.primary);
      }
      if (this._actionBtn) this._actionBtn.label.string = '选择此焦点';
    } else {
      if (this._progressLabel) this._progressLabel.string = '已完成';
      if (this._progressBar) {
        drawProgressBar(this._progressBar, -this._progressBarW / 2, -5, this._progressBarW, 10, 1, NEUTRAL_PALETTE.bgMid, NEUTRAL_PALETTE.success);
      }
      if (this._actionBtn) this._actionBtn.label.string = '确认';
    }

    // 已完成态用绿色 accent 重绘卡牌
    if (this._cardGfx) {
      const accent: Color = view.kind === 'completed' ? NEUTRAL_PALETTE.success : INDUSTRY_PALETTE.primary;
      drawCard(this._cardGfx, -210, -270, 420, 540, NEUTRAL_PALETTE.cardBg, accent);
    }
  }

  /** 隐藏卡牌 */
  hide(): void {
    if (this._node) this._node.active = false;
  }

  /** 注册动作回调 */
  onAction(cb: (action: FocusCardAction, focusId: string) => void): void {
    this._actionCb = cb;
  }

  /** 暴露背景遮罩图形（供外部访问器对齐 / 调试用） */
  get bgGfx(): Graphics | null {
    return this._bgGfx;
  }

  get isShown(): boolean {
    return this._node?.active ?? false;
  }
}
