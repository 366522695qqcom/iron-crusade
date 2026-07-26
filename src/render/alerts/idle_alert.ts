/**
 * 空闲工厂提醒浮窗（render/alerts/）
 *
 * 实现依据：
 * - PROJECT.md 3.3.3 空闲提醒系统：L0 无 / L1 静默 / L2 角标 / L3 浮窗 / L4 自动暂停
 * - 技术设计文档 1.5 目录：render/alerts/ 空闲工厂提醒浮窗 + 资源不足警告
 * - 技术设计文档 7.4：UI 以 cc.Graphics 代码绘制为主
 *
 * 设计要点：
 * - 屏幕右上角浮窗，alertLevel >= L3 时显示
 * - 显示空闲工厂数 + 最长空闲时长
 * - 点击「前往工厂」按钮触发 onGotoFactory 回调
 * - L4 自动暂停时附带「已自动暂停」提示
 *
 * 局内无广告原则：提醒浮窗不含任何广告入口。
 */
import { Graphics, Label, Node } from 'cc';
import { createNode, makeLabel, makeGraphicsNode, makeButton, addEdgeWidget } from '../core/node_factory';
import { drawPanel } from '../core/graphics_util';
import {
  INDUSTRY_PALETTE,
  NEUTRAL_PALETTE,
  FONT_SIZE,
  SPACING,
  RADIUS,
} from '../core/ui_theme';
import type { FactoryPanelShadow } from '../core/shadow_reader';

export class IdleAlert {
  private _node: Node | null = null;
  private _bgGfx: Graphics | null = null;
  private _titleLabel: Label | null = null;
  private _detailLabel: Label | null = null;
  private _actionBtn: { node: Node; label: Label } | null = null;
  private _gotoCb: (() => void) | null = null;
  private _dismissCb: (() => void) | null = null;

  mount(parent: Node): Node {
    if (this._node) return this._node;
    const w = 280;
    const h = 120;
    const node = createNode('IdleAlert', parent, w, h);
    addEdgeWidget(node, 'top', 96, 0);
    node.active = false;
    this._node = node;

    const { graphics: bgGfx } = makeGraphicsNode(node, 'Bg', w, h);
    drawPanel(bgGfx, -w / 2, -h / 2, w, h, INDUSTRY_PALETTE.panelBg, NEUTRAL_PALETTE.warning, RADIUS.PANEL);
    this._bgGfx = bgGfx;

    this._titleLabel = makeLabel(node, '工厂空闲提醒', FONT_SIZE.TITLE, NEUTRAL_PALETTE.warning, 'Title').label;
    this._titleLabel.node.setPosition(0, h / 2 - SPACING.LG, 0);

    this._detailLabel = makeLabel(node, '—', FONT_SIZE.BODY, NEUTRAL_PALETTE.textPrimary, 'Detail').label;
    this._detailLabel.node.setPosition(0, 0, 0);

    const btn = makeButton(node, '前往工厂', 96, 32, INDUSTRY_PALETTE.primary, INDUSTRY_PALETTE.pressed, FONT_SIZE.CAPTION, 'GotoBtn');
    btn.node.setPosition(-48, -h / 2 + SPACING.LG, 0);
    btn.node.on('click', () => this._gotoCb?.());
    this._actionBtn = { node: btn.node, label: btn.label };

    const dismissBtn = makeButton(node, '忽略', 64, 32, NEUTRAL_PALETTE.bgMid, NEUTRAL_PALETTE.border, FONT_SIZE.CAPTION, 'DismissBtn');
    dismissBtn.node.setPosition(64, -h / 2 + SPACING.LG, 0);
    dismissBtn.node.on('click', () => this._dismissCb?.());

    return node;
  }

  /** 刷新提醒状态（alertLevel >= L3 时显示） */
  update(shadow: FactoryPanelShadow): void {
    if (!this._node) return;
    if (shadow.alertLevel >= 3) {
      this._node.active = true;
      const seconds = Math.round(shadow.longestIdleTicks / 10);
      if (this._detailLabel) {
        const autoPause = shadow.alertLevel >= 4 ? '（已自动暂停）' : '';
        this._detailLabel.string = `${shadow.idleCount} 座工厂空闲 ${seconds}s${autoPause}`;
      }
    } else {
      this._node.active = false;
    }
  }

  /** 注册前往工厂回调 */
  onGoto(cb: () => void): void {
    this._gotoCb = cb;
  }

  /** 注册忽略回调 */
  onDismiss(cb: () => void): void {
    this._dismissCb = cb;
  }

  hide(): void {
    if (this._node) this._node.active = false;
  }

  get isShown(): boolean {
    return this._node?.active ?? false;
  }

  /** 暴露背景图层节点（供外部访问器对齐） */
  get bgGfx(): Graphics | null {
    return this._bgGfx;
  }

  /** 暴露行动按钮节点（供外部访问器对齐） */
  get actionBtn(): { node: Node; label: Label } | null {
    return this._actionBtn;
  }
}
