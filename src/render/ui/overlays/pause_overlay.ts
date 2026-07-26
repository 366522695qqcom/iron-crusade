/**
 * 暂停遮罩（render/ui/overlays/）
 *
 * 实现依据：
 * - PROJECT.md 3.16 时间控制：暂停 / 1x / 2x / 5x
 * - 技术设计文档 7.4：UI 以 cc.Graphics 代码绘制为主
 *
 * 设计要点：
 * - 全屏半透明遮罩 + 居中暂停面板
 * - 提供继续 / 设置 / 返回主菜单 三按钮
 * - 暂停时游戏 tick 不推进（由调用方设置 speed=0）
 *
 * 局内无广告原则：暂停遮罩不含任何广告入口。
 */
import { Node } from 'cc';
import { createNode, makeLabel, makeGraphicsNode, makeButton, addFullWidget } from '../../core/node_factory';
import { drawOverlay, drawPanel } from '../../core/graphics_util';
import {
  INDUSTRY_PALETTE,
  NEUTRAL_PALETTE,
  FONT_SIZE,
  SPACING,
  RADIUS,
  DESIGN_WIDTH,
  DESIGN_HEIGHT,
} from '../../core/ui_theme';

/** 暂停遮罩动作 */
export type PauseOverlayAction = 'resume' | 'settings' | 'exitToMenu';

export class PauseOverlay {
  private _node: Node | null = null;
  private _actionCb: ((action: PauseOverlayAction) => void) | null = null;

  mount(parent: Node): Node {
    if (this._node) return this._node;
    const node = createNode('PauseOverlay', parent, DESIGN_WIDTH, DESIGN_HEIGHT);
    addFullWidget(node);
    node.active = false;
    this._node = node;

    // 半透明遮罩
    const { graphics: overlayGfx } = makeGraphicsNode(node, 'Overlay', DESIGN_WIDTH, DESIGN_HEIGHT);
    drawOverlay(overlayGfx, -DESIGN_WIDTH / 2, -DESIGN_HEIGHT / 2, DESIGN_WIDTH, DESIGN_HEIGHT, 0.75);

    // 居中暂停面板
    const panelW = 360;
    const panelH = 320;
    const panelNode = createNode('Panel', node, panelW, panelH);
    panelNode.setPosition(0, 0, 0);

    const { graphics: bgGfx } = makeGraphicsNode(panelNode, 'Bg', panelW, panelH);
    drawPanel(bgGfx, -panelW / 2, -panelH / 2, panelW, panelH, INDUSTRY_PALETTE.panelBg, NEUTRAL_PALETTE.border, RADIUS.PANEL);

    makeLabel(panelNode, '已暂停', FONT_SIZE.TITLE_LG, NEUTRAL_PALETTE.textPrimary, 'Title')
      .node.setPosition(0, panelH / 2 - SPACING.LG, 0);

    const btnW = 240;
    const btnH = 48;
    const gap = SPACING.MD;
    const startY = SPACING.SM;
    const btns: { action: PauseOverlayAction; label: string }[] = [
      { action: 'resume', label: '继续游戏' },
      { action: 'settings', label: '设置' },
      { action: 'exitToMenu', label: '返回主菜单' },
    ];
    for (let i = 0; i < btns.length; i++) {
      const def = btns[i];
      const btn = makeButton(panelNode, def.label, btnW, btnH, INDUSTRY_PALETTE.primary, INDUSTRY_PALETTE.pressed, FONT_SIZE.BODY, `Btn_${def.action}`);
      btn.node.setPosition(0, startY - i * (btnH + gap), 0);
      btn.node.on('click', () => this._actionCb?.(def.action));
    }

    return node;
  }

  show(): void {
    if (this._node) this._node.active = true;
  }

  hide(): void {
    if (this._node) this._node.active = false;
  }

  onAction(cb: (action: PauseOverlayAction) => void): void {
    this._actionCb = cb;
  }

  get isShown(): boolean {
    return this._node?.active ?? false;
  }
}
