/**
 * 师团命令条（render/ui/）
 *
 * 实现依据：
 * - M1 feature-grand-war：师团命令条（拆分/合并/移动/停止/选中/取消选中）
 * - spec S.4.2：作战类用 COMBAT_PALETTE 低视觉权重
 * - 技术设计文档 7.4：cc.Graphics 代码绘制
 *
 * 布局：贴底部栏上方，选中师团时显示。左侧师团信息，右侧命令按钮。
 */
import { Graphics, Label, Node, Color } from 'cc';
import { createNode, makeLabel, makeGraphicsNode, makeButton, addEdgeWidget } from '../core/node_factory';
import { drawPanel, drawButton, drawProgressBar } from '../core/graphics_util';
import {
  COMBAT_PALETTE,
  INDUSTRY_PALETTE,
  NEUTRAL_PALETTE,
  FONT_SIZE,
  SPACING,
  RADIUS,
} from '../core/ui_theme';
import type { UnitCommandShadow } from '../core/shadow_reader';

export type UnitCommandAction =
  | 'move'
  | 'attack'
  | 'assault'
  | 'retreat'
  | 'split'
  | 'merge'
  | 'stop'
  | 'selectAll'
  | 'deselect';

interface CmdButton {
  action: UnitCommandAction;
  label: string;
  node: Node;
  graphics: Graphics;
  labelComp: Label;
}

export class UnitCommandBar {
  private _node: Node | null = null;
  private _statusLabel: Label | null = null;
  private _lastStatusText = '';
  private _provinceLabel: Label | null = null;
  private _lastProvinceText = '';
  private _moveHintActive = false;
  private _strBar: Graphics | null = null;
  private _strBarW = 0;
  private _lastStrRatio = -1;
  private _orgBar: Graphics | null = null;
  private _orgBarW = 0;
  private _lastOrgRatio = -1;
  private _countLabel: Label | null = null;
  private _lastCountText = '';
  private _buttons: CmdButton[] = [];
  private _actionCb: ((action: UnitCommandAction) => void) | null = null;

  mount(parent: Node): Node {
    if (this._node) return this._node;
    const w = 1280;
    const h = 88;
    const node = createNode('UnitCommandBar', parent, w, h);
    addEdgeWidget(node, 'bottom', 96, 0);
    this._node = node;

    const { graphics: bgGfx } = makeGraphicsNode(node, 'Bg', w, h);
    drawPanel(bgGfx, -w / 2, -h / 2, w, h, COMBAT_PALETTE.panelBg, COMBAT_PALETTE.primary, RADIUS.PANEL);

    // 左侧：师团信息
    const infoX = -w / 2 + SPACING.XL;
    this._countLabel = makeLabel(node, '', FONT_SIZE.BODY, NEUTRAL_PALETTE.textPrimary, 'Count').label;
    this._countLabel.node.setPosition(infoX + 60, h / 2 - SPACING.MD - FONT_SIZE.BODY / 2, 0);
    this._countLabel.horizontalAlign = 0;

    this._statusLabel = makeLabel(node, '', FONT_SIZE.TITLE, NEUTRAL_PALETTE.textPrimary, 'Status').label;
    this._statusLabel.node.setPosition(infoX + 60, h / 2 - SPACING.MD - FONT_SIZE.BODY - SPACING.SM - FONT_SIZE.TITLE / 2, 0);
    this._statusLabel.horizontalAlign = 0;

    this._provinceLabel = makeLabel(node, '', FONT_SIZE.CAPTION, NEUTRAL_PALETTE.textSecondary, 'Prov').label;
    this._provinceLabel.node.setPosition(infoX + 60, -h / 2 + SPACING.MD + FONT_SIZE.CAPTION + SPACING.XS, 0);
    this._provinceLabel.horizontalAlign = 0;

    const barW = 140;
    this._strBarW = barW;
    const { graphics: strBarGfx } = makeGraphicsNode(node, 'StrBar', barW, 6);
    strBarGfx.node.setPosition(infoX + 60 + barW / 2 + 20, h / 2 - SPACING.LG, 0);
    drawProgressBar(strBarGfx, -barW / 2, -3, barW, 6, 0, NEUTRAL_PALETTE.bgMid, INDUSTRY_PALETTE.resourceOk);
    makeLabel(node, '兵力', FONT_SIZE.CAPTION, NEUTRAL_PALETTE.textSecondary, 'StrLabel')
      .node.setPosition(infoX + 60 - 10, h / 2 - SPACING.LG, 0);
    this._strBar = strBarGfx;

    this._orgBarW = barW;
    const { graphics: orgBarGfx } = makeGraphicsNode(node, 'OrgBar', barW, 6);
    orgBarGfx.node.setPosition(infoX + 60 + barW / 2 + 20, h / 2 - SPACING.LG - 18, 0);
    drawProgressBar(orgBarGfx, -barW / 2, -3, barW, 6, 0, NEUTRAL_PALETTE.bgMid, COMBAT_PALETTE.primary);
    makeLabel(node, '组织', FONT_SIZE.CAPTION, NEUTRAL_PALETTE.textSecondary, 'OrgLabel')
      .node.setPosition(infoX + 60 - 10, h / 2 - SPACING.LG - 18, 0);
    this._orgBar = orgBarGfx;

    // 右侧按钮
    const btnDefs: { action: UnitCommandAction; label: string; fill?: Color; pressed?: Color }[] = [
      { action: 'move', label: '移动' },
      { action: 'attack', label: '进攻', fill: COMBAT_PALETTE.pressed, pressed: NEUTRAL_PALETTE.warning },
      { action: 'assault', label: '强攻', fill: NEUTRAL_PALETTE.warning, pressed: new Color(0xFF, 0x30, 0x30, 0xFF) },
      { action: 'retreat', label: '撤退' },
      { action: 'stop', label: '停止' },
      { action: 'split', label: '拆分' },
      { action: 'merge', label: '合并' },
      { action: 'selectAll', label: '全选' },
      { action: 'deselect', label: '取消' },
    ];
    const btnW = 70;
    const btnH = 44;
    const gap = SPACING.XS;
    const totalW = btnDefs.length * btnW + (btnDefs.length - 1) * gap;
    const startX = w / 2 - SPACING.XL - totalW + btnW / 2;
    for (let i = 0; i < btnDefs.length; i++) {
      const def = btnDefs[i];
      const btn = makeButton(
        node,
        def.label,
        btnW,
        btnH,
        def.fill ?? COMBAT_PALETTE.primary,
        def.pressed ?? COMBAT_PALETTE.pressed,
        FONT_SIZE.CAPTION,
        `Btn_${def.action}`,
      );
      btn.node.setPosition(startX + i * (btnW + gap), 0, 0);
      btn.node.on('click', () => this._actionCb?.(def.action));
      this._buttons.push({
        action: def.action,
        label: def.label,
        node: btn.node,
        graphics: btn.graphics,
        labelComp: btn.label,
      });
    }

    this._node.active = false;
    return node;
  }

  onAction(cb: (action: UnitCommandAction) => void): void {
    this._actionCb = cb;
  }

  /** 设置移动模式提示（move 按钮按下后，提示玩家点目标省份） */
  setMoveHint(active: boolean, subMode: 'move' | 'retreat' = 'move'): void {
    this._moveHintActive = active;
    if (!this._provinceLabel) return;
    if (active) {
      if (subMode === 'retreat') {
        this._provinceLabel.string = '请点击相邻己方省份撤退（点击空白取消）';
        this._provinceLabel.color = NEUTRAL_PALETTE.warning;
      } else {
        this._provinceLabel.string = '请点击目标省份下达移动/进攻命令（点击空白取消）';
        this._provinceLabel.color = COMBAT_PALETTE.controlled;
      }
    } else {
      this._lastProvinceText = '';
      this._provinceLabel.string = this._lastProvinceText;
      this._provinceLabel.color = NEUTRAL_PALETTE.textSecondary;
    }
  }

  update(shadow: UnitCommandShadow): void {
    if (!shadow.hasSelection) {
      if (this._node && this._node.active) this._node.active = false;
      return;
    }
    if (this._node && !this._node.active) this._node.active = true;

    const countText = `×${shadow.selectedCount}`;
    if (this._countLabel && this._lastCountText !== countText) {
      this._lastCountText = countText;
      this._countLabel.string = countText;
    }
    if (this._statusLabel && this._lastStatusText !== shadow.statusSummary) {
      this._lastStatusText = shadow.statusSummary;
      this._statusLabel.string = shadow.statusSummary;
    }
    if (this._provinceLabel && this._lastProvinceText !== shadow.provinceSummary && !this._moveHintActive) {
      this._lastProvinceText = shadow.provinceSummary;
      this._provinceLabel.string = shadow.provinceSummary;
    }
    if (this._strBar && Math.abs(this._lastStrRatio - shadow.avgStrength) > 0.01) {
      this._lastStrRatio = shadow.avgStrength;
      const c = shadow.avgStrength > 0.6 ? INDUSTRY_PALETTE.resourceOk : shadow.avgStrength > 0.3 ? COMBAT_PALETTE.disputeLow : NEUTRAL_PALETTE.warning;
      drawProgressBar(this._strBar, -this._strBarW / 2, -3, this._strBarW, 6, shadow.avgStrength, NEUTRAL_PALETTE.bgMid, c);
    }
    if (this._orgBar && Math.abs(this._lastOrgRatio - shadow.avgOrganization) > 0.01) {
      this._lastOrgRatio = shadow.avgOrganization;
      const c = shadow.avgOrganization > 0.5 ? COMBAT_PALETTE.primary : shadow.avgOrganization > 0.25 ? COMBAT_PALETTE.disputeLow : NEUTRAL_PALETTE.warning;
      drawProgressBar(this._orgBar, -this._orgBarW / 2, -3, this._orgBarW, 6, shadow.avgOrganization, NEUTRAL_PALETTE.bgMid, c);
    }

    this.setButtonEnabled('move', shadow.canMove);
    this.setButtonEnabled('split', shadow.canSplit);
    this.setButtonEnabled('merge', shadow.canMerge);
    this.setButtonEnabled('stop', shadow.canStop);
  }

  private setButtonEnabled(action: UnitCommandAction, enabled: boolean): void {
    const b = this._buttons.find((x) => x.action === action);
    if (!b) return;
    const color = enabled ? COMBAT_PALETTE.primary : NEUTRAL_PALETTE.bgMid;
    const pressed = enabled ? COMBAT_PALETTE.pressed : NEUTRAL_PALETTE.bgMid;
    b.labelComp.color = enabled ? NEUTRAL_PALETTE.textPrimary : NEUTRAL_PALETTE.textDisabled;
    drawButton(b.graphics, -44, -22, 88, 44, color, pressed, RADIUS.BUTTON);
  }

  get node(): Node | null {
    return this._node;
  }
}
