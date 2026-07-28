/**
 * 战争总面板（仿HOI4战争进度对话框）
 *
 * 实现依据：M1 feature-grand-war spec 1.3
 * 布局（460×580）：
 * ┌───────────────────────────────────────────────────────────┐
 * │  区域争端                         [×]                      │
 * ├────────────────────────────┬──────────────────────────────┤
 * │  [我国国旗+国名]            │  [敌方国旗+国名]              │
 * │  ──────────────────────    │  ──────────────────────       │
 * │  投降 ████████░░ 72%       │  投降 ███░░░░░ 28%            │
 * │  (红→黄→红)                │  (红→黄→红)                   │
 * │  师团: 15  被歼: 3         │  师团: 12  被歼: 5            │
 * │  舰船: 0  飞机: 0          │  舰船: 0  飞机: 0             │
 * │  运输船损失: 12            │  运输船损失: 8                │
 * │  丢失省份: 3 (VP:0)        │  丢失省份: 5 (VP:1)           │
 * │  首都: ✓未失               │  首都: ✗已失                  │
 * │  控制VP: 25/60 (42%)       │  控制VP: 20/60 (33%)          │
 * │  ████████████░░░░░░░░      │  ████████░░░░░░░░░░           │
 * ├───────────────────────────────────────────────────────────┤
 * │  战争日志（最近10条）                                       │
 * └───────────────────────────────────────────────────────────┘
 */
import { Graphics, Label, UITransform, Color } from 'cc';
import {
  PanelBase,
  createNode,
  makeLabel,
  makeGraphicsNode,
  makeButton,
  addEdgeWidget,
} from '../../core/node_factory';
import { drawPanel, drawProgressBar } from '../../core/graphics_util';
import {
  COMBAT_PALETTE,
  INDUSTRY_PALETTE,
  NEUTRAL_PALETTE,
  FONT_SIZE,
  SPACING,
  RADIUS,
} from '../../core/ui_theme';
import type { WarOverviewShadow, WarSideLossesView, WarLogEntryView } from '../../core/shadow_reader';

interface SideHandle {
  nameLabel: Label;
  surrenderBar: Graphics;
  surrenderBarW: number;
  surrenderLabel: Label;
  divAliveLabel: Label;
  divLostLabel: Label;
  shipLabel: Label;
  aircraftLabel: Label;
  convoyLabel: Label;
  provLabel: Label;
  capitalLabel: Label;
  vpLabel: Label;
  vpBar: Graphics;
  vpBarW: number;
  lastCountryName: string;
  lastSurrenderRatio: number;
  lastSurrenderText: string;
  lastVpRatio: number;
  lastVpText: string;
  lastStatsText: string[];
}

interface LogHandle {
  label: Label;
  lastText: string;
  lastType: string;
}

const LOG_COLORS: Record<WarLogEntryView['type'], Color> = {
  combat: new Color(0x33, 0x5c, 0xb3, 0xff),
  control: new Color(0xc7, 0xad, 0x33, 0xff),
  destroy: new Color(0xd9, 0x4c, 0x4c, 0xff),
  surrender: new Color(0xd9, 0x4c, 0x4c, 0xff),
  other: new Color(0xb3, 0xb3, 0xb8, 0xff),
};

export class WarOverviewPanel extends PanelBase {
  private _playerSide!: SideHandle;
  private _enemySide!: SideHandle;
  private _logHandles: LogHandle[] = [];

  onMount(): void {
    const node = this.node!;
    const w = 460;
    const h = 580;
    node.setContentSize(w, h);
    addEdgeWidget(node, 'right', SPACING.MD, 0);

    const { graphics: bgGfx } = makeGraphicsNode(node, 'Bg', w, h);
    drawPanel(bgGfx, -w / 2, -h / 2, w, h, COMBAT_PALETTE.panelBg, NEUTRAL_PALETTE.border, RADIUS.PANEL);

    makeLabel(node, '区域争端', FONT_SIZE.TITLE, NEUTRAL_PALETTE.textPrimary, 'Title')
      .node.setPosition(0, h / 2 - SPACING.LG, 0);

    const closeBtnW = 32;
    const closeBtnH = 28;
    const closeBtn = makeButton(
      node, '×', closeBtnW, closeBtnH,
      NEUTRAL_PALETTE.bgMid, NEUTRAL_PALETTE.border, FONT_SIZE.TITLE, 'CloseBtn',
    );
    closeBtn.node.setPosition(w / 2 - SPACING.LG - closeBtnW / 2, h / 2 - SPACING.LG - closeBtnH / 2, 0);
    closeBtn.node.on('click', () => this.hide());

    const sideH = 200;
    const sideGap = SPACING.MD;
    const colW = (w - SPACING.LG * 2 - sideGap) / 2;
    const sideStartY = h / 2 - SPACING.LG - FONT_SIZE.TITLE - SPACING.MD - sideH / 2 - 8;

    this._playerSide = this.makeSideBlock(node, -colW / 2 - sideGap / 2, colW, sideH, sideStartY, '我方', true);
    this._enemySide = this.makeSideBlock(node, colW / 2 + sideGap / 2, colW, sideH, sideStartY, '敌方', false);

    const logHeaderY = sideStartY - sideH / 2 - SPACING.MD;
    makeLabel(node, '战争日志', FONT_SIZE.BODY, NEUTRAL_PALETTE.textPrimary, 'LogTitle')
      .node.setPosition(-w / 2 + SPACING.LG, logHeaderY, 0);

    const logRowH = 20;
    const logStartY = logHeaderY - FONT_SIZE.BODY / 2 - SPACING.SM - logRowH / 2;
    const logCount = 10;
    for (let i = 0; i < logCount; i++) {
      const y = logStartY - i * logRowH;
      const { label } = makeLabel(node, '', FONT_SIZE.CAPTION, NEUTRAL_PALETTE.textSecondary, `Log_${i}`);
      label.node.setPosition(-w / 2 + SPACING.LG, y, 0);
      label.horizontalAlign = 0;
      label.overflow = 1;
      const uiTransform = label.node.getComponent(UITransform);
      if (uiTransform) uiTransform.setContentSize(w - SPACING.LG * 2, logRowH);
      this._logHandles.push({ label, lastText: '', lastType: '' });
    }
  }

  private makeSideBlock(
    parent: ReturnType<typeof createNode>,
    x: number,
    blockW: number,
    h: number,
    y: number,
    defaultName: string,
    isPlayer: boolean,
  ): SideHandle {
    const block = createNode(`Side_${defaultName}`, parent, blockW, h);
    block.setPosition(x, y, 0);
    const { graphics } = makeGraphicsNode(block, 'Bg', blockW, h);
    drawPanel(
      graphics,
      -blockW / 2,
      -h / 2,
      blockW,
      h,
      NEUTRAL_PALETTE.cardBg,
      isPlayer ? INDUSTRY_PALETTE.primary : COMBAT_PALETTE.primary,
      RADIUS.CARD,
    );

    const innerW = blockW - SPACING.MD * 2;
    let curY = h / 2 - SPACING.MD;

    const nameLbl = makeLabel(block, defaultName, FONT_SIZE.BODY, NEUTRAL_PALETTE.textPrimary, 'Name').label;
    nameLbl.node.setPosition(-innerW / 2, curY - FONT_SIZE.BODY / 2, 0);
    nameLbl.horizontalAlign = 0;
    curY -= FONT_SIZE.BODY + SPACING.SM;

    // 分隔线
    const { graphics: divider } = makeGraphicsNode(block, 'Divider', innerW, 1);
    divider.node.setPosition(0, curY, 0);
    divider.rect(-innerW / 2, -0.5, innerW, 1);
    divider.fillColor = NEUTRAL_PALETTE.border;
    divider.fill();
    curY -= SPACING.SM;

    // 投降标签
    const progLbl = makeLabel(block, '投降 0%', FONT_SIZE.CAPTION, NEUTRAL_PALETTE.textSecondary, 'ProgText').label;
    progLbl.node.setPosition(-innerW / 2, curY - FONT_SIZE.CAPTION / 2, 0);
    progLbl.horizontalAlign = 0;
    curY -= FONT_SIZE.CAPTION + SPACING.XS;

    // 投降条
    const barW = innerW;
    const barH = 8;
    const { graphics: barGfx } = makeGraphicsNode(block, 'SurrBar', barW, barH);
    barGfx.node.setPosition(0, curY - barH / 2, 0);
    drawProgressBar(barGfx, -barW / 2, -barH / 2, barW, barH, 0, NEUTRAL_PALETTE.bgMid, NEUTRAL_PALETTE.warning);
    curY -= barH + SPACING.MD;

    const statRowH = 16;

    // 师团数 + 被歼
    const divAliveLbl = makeLabel(block, '师团: 0', FONT_SIZE.CAPTION, NEUTRAL_PALETTE.textSecondary, 'DivAlive').label;
    divAliveLbl.node.setPosition(-innerW / 2, curY - statRowH / 2, 0);
    divAliveLbl.horizontalAlign = 0;
    curY -= statRowH + 2;

    const divLostLbl = makeLabel(block, '被歼师团: 0', FONT_SIZE.CAPTION, NEUTRAL_PALETTE.textSecondary, 'DivLost').label;
    divLostLbl.node.setPosition(-innerW / 2, curY - statRowH / 2, 0);
    divLostLbl.horizontalAlign = 0;
    curY -= statRowH + 2;

    const shipLbl = makeLabel(block, '舰船损失: 0  飞机损失: 0', FONT_SIZE.CAPTION, NEUTRAL_PALETTE.textSecondary, 'Ship').label;
    shipLbl.node.setPosition(-innerW / 2, curY - statRowH / 2, 0);
    shipLbl.horizontalAlign = 0;
    curY -= statRowH + 2;

    const convLbl = makeLabel(block, '运输船损失: 0', FONT_SIZE.CAPTION, NEUTRAL_PALETTE.textSecondary, 'Conv').label;
    convLbl.node.setPosition(-innerW / 2, curY - statRowH / 2, 0);
    convLbl.horizontalAlign = 0;
    curY -= statRowH + 2;

    const provLbl = makeLabel(block, '丢失省份: 0 (VP: 0)', FONT_SIZE.CAPTION, NEUTRAL_PALETTE.textSecondary, 'Prov').label;
    provLbl.node.setPosition(-innerW / 2, curY - statRowH / 2, 0);
    provLbl.horizontalAlign = 0;
    curY -= statRowH + 2;

    const capLbl = makeLabel(block, '首都: 未失', FONT_SIZE.CAPTION, INDUSTRY_PALETTE.resourceOk, 'Cap').label;
    capLbl.node.setPosition(-innerW / 2, curY - statRowH / 2, 0);
    capLbl.horizontalAlign = 0;
    curY -= statRowH + SPACING.SM;

    // VP标签
    const vpLbl = makeLabel(block, '控制VP: 0/0 (0%)', FONT_SIZE.CAPTION, NEUTRAL_PALETTE.textSecondary, 'VpText').label;
    vpLbl.node.setPosition(-innerW / 2, curY - FONT_SIZE.CAPTION / 2, 0);
    vpLbl.horizontalAlign = 0;
    curY -= FONT_SIZE.CAPTION + SPACING.XS;

    // VP条
    const { graphics: vpGfx } = makeGraphicsNode(block, 'VpBar', barW, 6);
    vpGfx.node.setPosition(0, curY - 3, 0);
    drawProgressBar(vpGfx, -barW / 2, -3, barW, 6, 0, NEUTRAL_PALETTE.bgMid, isPlayer ? INDUSTRY_PALETTE.primary : COMBAT_PALETTE.primary);

    return {
      nameLabel: nameLbl,
      surrenderBar: barGfx,
      surrenderBarW: barW,
      surrenderLabel: progLbl,
      divAliveLabel: divAliveLbl,
      divLostLabel: divLostLbl,
      shipLabel: shipLbl,
      aircraftLabel: shipLbl, // 与舰船合并到同一行显示
      convoyLabel: convLbl,
      provLabel: provLbl,
      capitalLabel: capLbl,
      vpLabel: vpLbl,
      vpBar: vpGfx,
      vpBarW: barW,
      lastCountryName: '',
      lastSurrenderRatio: -1,
      lastSurrenderText: '',
      lastVpRatio: -1,
      lastVpText: '',
      lastStatsText: [],
    };
  }

  update(shadow: WarOverviewShadow): void {
    if (!shadow.atWar) {
      this.hide();
      return;
    }
    if (!this.isShown) this.show();
    this.updateSide(this._playerSide, shadow.playerSide, true);
    this.updateSide(this._enemySide, shadow.enemySide, false);
    for (let i = 0; i < this._logHandles.length; i++) {
      const h = this._logHandles[i];
      const entry = shadow.recentLogs[i];
      const text = entry ? entry.text : '';
      const type = entry ? entry.type : 'other';
      if (h.lastText !== text || h.lastType !== type) {
        h.lastText = text;
        h.lastType = type;
        h.label.string = text;
        h.label.color = LOG_COLORS[type];
      }
    }
  }

  private updateSide(handle: SideHandle, side: WarSideLossesView, isPlayer: boolean): void {
    const playerAccent = INDUSTRY_PALETTE.primary;
    const enemyAccent = COMBAT_PALETTE.primary;
    const accent = isPlayer ? playerAccent : enemyAccent;

    if (handle.lastCountryName !== side.countryName) {
      handle.lastCountryName = side.countryName;
      handle.nameLabel.string = side.countryName || (isPlayer ? '我方' : '敌方');
      handle.nameLabel.color = accent;
    }

    const ratio = side.surrenderThreshold > 0 ? Math.min(1, side.surrenderProgress / side.surrenderThreshold) : 0;
    const pct = Math.round(side.surrenderProgress * 100);
    const surrendered = side.surrenderProgress >= side.surrenderThreshold;
    const progText = surrendered ? '投降 已投降' : `投降 ${pct}%`;
    if (handle.lastSurrenderText !== progText) {
      handle.lastSurrenderText = progText;
      handle.surrenderLabel.string = progText;
      handle.surrenderLabel.color = surrendered
        ? NEUTRAL_PALETTE.warning
        : ratio > 0.7 ? NEUTRAL_PALETTE.warning : NEUTRAL_PALETTE.textSecondary;
    }
    if (Math.abs(handle.lastSurrenderRatio - ratio) > 0.005) {
      handle.lastSurrenderRatio = ratio;
      let barColor: Color;
      if (surrendered) {
        barColor = NEUTRAL_PALETTE.warning;
      } else if (ratio > 0.7) {
        barColor = NEUTRAL_PALETTE.warning;
      } else if (ratio > 0.4) {
        barColor = COMBAT_PALETTE.disputeLow;
      } else {
        barColor = isPlayer ? INDUSTRY_PALETTE.resourceOk : COMBAT_PALETTE.controlled;
      }
      drawProgressBar(
        handle.surrenderBar,
        -handle.surrenderBarW / 2,
        -4,
        handle.surrenderBarW,
        8,
        ratio,
        NEUTRAL_PALETTE.bgMid,
        barColor,
      );
    }

    const vpRatio = side.totalVPs > 0 ? Math.min(1, side.controlledVPs / side.totalVPs) : 0;
    const vpPct = Math.round(vpRatio * 100);
    const vpText = surrendered
      ? '控制VP: 已投降'
      : `控制VP: ${side.controlledVPs}/${side.totalVPs} (${vpPct}%)`;
    if (handle.lastVpText !== vpText) {
      handle.lastVpText = vpText;
      handle.vpLabel.string = vpText;
    }
    if (Math.abs(handle.lastVpRatio - vpRatio) > 0.005) {
      handle.lastVpRatio = vpRatio;
      drawProgressBar(
        handle.vpBar,
        -handle.vpBarW / 2,
        -3,
        handle.vpBarW,
        6,
        vpRatio,
        NEUTRAL_PALETTE.bgMid,
        accent,
      );
    }

    const stats = [
      `师团: ${side.divisionsAlive}`,
      `被歼师团: ${side.divisionsDestroyed}`,
      `舰船损失: ${side.shipsDestroyed}  飞机损失: ${side.aircraftDestroyed}`,
      `运输船损失: ${side.convoysDestroyed}`,
      `丢失省份: ${side.provincesTaken} (VP省:${side.majorCitiesLost})`,
      `首都: ${side.capitalLost ? '✗ 已失' : '✓ 未失'}`,
    ];
    let changed = handle.lastStatsText.length !== stats.length;
    for (let i = 0; i < stats.length; i++) {
      if (handle.lastStatsText[i] !== stats[i]) { changed = true; break; }
    }
    if (changed) {
      handle.lastStatsText = stats.slice();
      handle.divAliveLabel.string = stats[0];
      handle.divLostLabel.string = stats[1];
      handle.shipLabel.string = stats[2];
      handle.convoyLabel.string = stats[3];
      handle.provLabel.string = stats[4];
      handle.capitalLabel.string = stats[5];
      handle.capitalLabel.color = side.capitalLost ? NEUTRAL_PALETTE.warning : INDUSTRY_PALETTE.resourceOk;
    }
  }
}
