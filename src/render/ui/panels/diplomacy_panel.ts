/**
 * 外交面板（render/ui/panels/）
 *
 * 实现依据：
 * - PROJECT.md 3.9 外交：三按钮极简（结盟 / 发起区域争端 / 贸易）
 * - spec S.2 术语脱敏：宣战→发起区域争端，战争支持度→争端决心
 * - spec S.4.2：作战类面板用 COMBAT_PALETTE 低视觉权重（暗灰蓝）
 *
 * 局内无广告原则：外交面板不含任何数值购买入口。
 * 「发起区域争端」需争端决心达标，是玩法约束，非付费门槛。
 */
import { Graphics, Label } from 'cc';
import { PanelBase, makeLabel, makeGraphicsNode, makeButton, addEdgeWidget } from '../../core/node_factory';
import { drawPanel, drawProgressBar } from '../../core/graphics_util';
import {
  COMBAT_PALETTE,
  INDUSTRY_PALETTE,
  NEUTRAL_PALETTE,
  FONT_SIZE,
  SPACING,
  RADIUS,
} from '../../core/ui_theme';

export type DiplomacyAction = 'ally' | 'initiateDispute' | 'trade';

export class DiplomacyPanel extends PanelBase {
  private _disputeBar: Graphics | null = null;
  private _disputeBarW = 0;
  private _disputeLabel: Label | null = null;
  private _actionCb: ((action: DiplomacyAction) => void) | null = null;

  onMount(): void {
    const node = this.node!;
    const w = 320;
    const h = 280;
    node.setContentSize(w, h);
    addEdgeWidget(node, 'left', SPACING.LG, 240);

    const { graphics: bgGfx } = makeGraphicsNode(node, 'Bg', w, h);
    drawPanel(bgGfx, -w / 2, -h / 2, w, h, COMBAT_PALETTE.panelBg, NEUTRAL_PALETTE.border, RADIUS.PANEL);

    makeLabel(node, '外交', FONT_SIZE.TITLE, NEUTRAL_PALETTE.textPrimary, 'Title')
      .node.setPosition(0, h / 2 - SPACING.LG, 0);

    // 争端决心进度条（S.2 脱敏：原"战争支持度"）
    const barY = h / 2 - SPACING.LG - FONT_SIZE.TITLE - SPACING.MD;
    this._disputeLabel = makeLabel(node, '争端决心：0%', FONT_SIZE.CAPTION, NEUTRAL_PALETTE.textSecondary, 'DisputeLabel').label;
    this._disputeLabel.node.setPosition(0, barY, 0);
    const barW = w - SPACING.XL * 2;
    this._disputeBarW = barW;
    const bar = makeGraphicsNode(node, 'DisputeBar', barW, 8);
    bar.node.setPosition(0, barY - SPACING.MD, 0);
    drawProgressBar(bar.graphics, -barW / 2, -4, barW, 8, 0, NEUTRAL_PALETTE.bgMid, COMBAT_PALETTE.disputeLow);
    this._disputeBar = bar.graphics;

    // 三按钮
    const btnW = w - SPACING.XL * 2;
    const btnH = 44;
    const gap = SPACING.SM;
    const startY = -h / 2 + SPACING.LG + btnH / 2;
    const btns: { action: DiplomacyAction; label: string; fill: typeof COMBAT_PALETTE.primary; pressed: typeof COMBAT_PALETTE.pressed }[] = [
      { action: 'ally', label: '结盟', fill: NEUTRAL_PALETTE.textPrimary, pressed: NEUTRAL_PALETTE.textSecondary },
      { action: 'initiateDispute', label: '发起区域争端', fill: COMBAT_PALETTE.disputeLow, pressed: COMBAT_PALETTE.primary },
      { action: 'trade', label: '贸易', fill: INDUSTRY_PALETTE.resourceOk, pressed: INDUSTRY_PALETTE.secondary },
    ];
    for (let i = 0; i < btns.length; i++) {
      const def = btns[i];
      const btn = makeButton(node, def.label, btnW, btnH, def.fill, def.pressed, FONT_SIZE.BODY, `Btn_${def.action}`);
      btn.node.setPosition(0, startY + (2 - i) * (btnH + gap), 0);
      btn.node.on('click', () => this._actionCb?.(def.action));
    }
  }

  /** 注册外交动作回调 */
  onAction(cb: (action: DiplomacyAction) => void): void {
    this._actionCb = cb;
  }

  /** 刷新争端决心（S.2 脱敏：原"战争支持度"） */
  updateDisputeResolve(ratio: number): void {
    if (this._disputeLabel) {
      this._disputeLabel.string = `争端决心：${Math.round(ratio * 100)}%`;
    }
    if (this._disputeBar) {
      drawProgressBar(this._disputeBar, -this._disputeBarW / 2, -4, this._disputeBarW, 8, ratio, NEUTRAL_PALETTE.bgMid, COMBAT_PALETTE.disputeLow);
    }
  }
}
