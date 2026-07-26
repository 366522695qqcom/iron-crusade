/**
 * 作战面板（render/ui/panels/）
 *
 * 实现依据：
 * - PROJECT.md 3.7 战斗与拉线：前线管理、攻势箭头、作战统计
 * - spec S.2 术语脱敏：伤亡→撤离、占领→管控、伤亡统计→设备损耗
 * - spec S.4.2：作战类面板用 COMBAT_PALETTE 低视觉权重（暗灰蓝）
 * - 技术设计文档 7.4：UI 以 cc.Graphics 代码绘制为主
 *
 * 局内无广告原则：本面板不含任何广告入口 / 数值购买入口。
 */
import { Graphics, Label, Color } from 'cc';
import {
  PanelBase,
  createNode,
  makeLabel,
  makeGraphicsNode,
  makeButton,
  addEdgeWidget,
} from '../../core/node_factory';
import { drawPanel, drawCard, drawProgressBar, colorEquals } from '../../core/graphics_util';
import {
  COMBAT_PALETTE,
  NEUTRAL_PALETTE,
  FONT_SIZE,
  SPACING,
  RADIUS,
} from '../../core/ui_theme';

/** 前线影子（由 game 层从 state 读取） */
export interface FrontLineView {
  /** 前线 ID */
  frontId: string;
  /** 前线名称（如「北线-格鲁吉亚」） */
  name: string;
  /** 已部署师数 */
  deployedDivisions: number;
  /** 敌方师数 */
  enemyDivisions: number;
  /** 攻势进度 0-1（有活跃攻势时有效） */
  offensiveProgress: number;
  /** 管控变更（本日净增/减省份数） */
  provinceDelta: number;
}

/** 作战统计影子 */
export interface CombatStatsView {
  /** 已管控省份数 */
  controlledProvinces: number;
  /** 已部署师数 */
  totalDivisions: number;
  /** 设备损耗（S.2 脱敏：原伤亡数） */
  equipmentLoss: number;
  /** 敌方设备损耗 */
  enemyEquipmentLoss: number;
  /** 争端总数（S.2 脱敏：原战斗数） */
  totalDisputes: number;
}

/** 作战面板影子 */
export interface CombatPanelShadow {
  /** 活跃前线（最多 3 条） */
  fronts: FrontLineView[];
  /** 作战统计 */
  stats: CombatStatsView;
  /** 争端决心 0-1 */
  disputeResolve: number;
}

/** 作战动作回调 */
export type CombatAction = 'drawFront' | 'issueOffensive' | 'deployDivision';

/** 单条前线渲染句柄 */
interface FrontHandle {
  cardGfx: Graphics;
  nameLabel: Label;
  detailLabel: Label;
  bar: Graphics;
  barW: number;
  barLabel: Label;
  frontId: string;
  lastAccent: Color;
  lastRatio: number;
  lastNameText: string;
  lastDetailText: string;
  lastBarText: string;
}

export class CombatPanel extends PanelBase {
  private _frontHandles: FrontHandle[] = [];
  private _statsLabels: {
    controlled: Label | null;
    divisions: Label | null;
    loss: Label | null;
    enemyLoss: Label | null;
    disputes: Label | null;
  } = { controlled: null, divisions: null, loss: null, enemyLoss: null, disputes: null };
  private _lastControlledText = '';
  private _lastDivisionsText = '';
  private _lastLossText = '';
  private _lastEnemyLossText = '';
  private _lastDisputesText = '';
  private _resolveBar: Graphics | null = null;
  private _resolveBarW = 0;
  private _lastResolveRatio = -1;
  private _resolveLabel: Label | null = null;
  private _lastResolveText = '';
  private _actionCb: ((action: CombatAction) => void) | null = null;

  onMount(): void {
    const node = this.node!;
    const w = 360;
    const h = 540;
    node.setContentSize(w, h);
    addEdgeWidget(node, 'right', SPACING.LG, 0);

    const { graphics: bgGfx } = makeGraphicsNode(node, 'Bg', w, h);
    drawPanel(bgGfx, -w / 2, -h / 2, w, h, COMBAT_PALETTE.panelBg, NEUTRAL_PALETTE.border, RADIUS.PANEL);

    // 标题
    makeLabel(node, '作战指挥', FONT_SIZE.TITLE_LG, NEUTRAL_PALETTE.textPrimary, 'Title')
      .node.setPosition(0, h / 2 - SPACING.LG, 0);

    // 争端决心条
    const resolveY = h / 2 - SPACING.LG - FONT_SIZE.TITLE_LG - SPACING.MD - 6;
    this._resolveLabel = makeLabel(node, '争端决心 0%', FONT_SIZE.CAPTION, NEUTRAL_PALETTE.textSecondary, 'Resolve').label;
    this._resolveLabel.node.setPosition(0, resolveY, 0);
    this._resolveBarW = w - SPACING.XL * 2;
    const resolveBar = makeGraphicsNode(node, 'ResolveBar', this._resolveBarW, 8);
    resolveBar.node.setPosition(0, resolveY - SPACING.SM - 4, 0);
    drawProgressBar(
      resolveBar.graphics,
      -this._resolveBarW / 2,
      -4,
      this._resolveBarW,
      8,
      0,
      NEUTRAL_PALETTE.bgMid,
      COMBAT_PALETTE.secondary,
    );
    this._resolveBar = resolveBar.graphics;

    // 动作按钮行（画前线 / 下达攻势 / 部署部队）
    const btnY = resolveY - SPACING.SM - 16;
    const btns: { action: CombatAction; label: string }[] = [
      { action: 'drawFront', label: '画前线' },
      { action: 'issueOffensive', label: '下达攻势' },
      { action: 'deployDivision', label: '部署部队' },
    ];
    const btnW = 96;
    const btnH = 36;
    const btnGap = SPACING.XS;
    const totalBtnW = btnW * 3 + btnGap * 2;
    for (let i = 0; i < btns.length; i++) {
      const b = btns[i];
      const bx = -totalBtnW / 2 + btnW / 2 + i * (btnW + btnGap);
      const btn = makeButton(
        node,
        b.label,
        btnW,
        btnH,
        COMBAT_PALETTE.primary,
        COMBAT_PALETTE.pressed,
        FONT_SIZE.CAPTION,
        `Btn_${b.action}`,
      );
      btn.node.setPosition(bx, btnY, 0);
      btn.node.on('click', () => this._actionCb?.(b.action));
    }

    // 前线列表（最多 3 条）
    const frontHeaderY = btnY - btnH / 2 - SPACING.LG;
    makeLabel(node, '活跃前线', FONT_SIZE.TITLE, NEUTRAL_PALETTE.textPrimary, 'FrontTitle')
      .node.setPosition(-w / 2 + SPACING.XL, frontHeaderY, 0);

    const cardW = w - SPACING.XL * 2;
    const cardH = 72;
    const cardGap = SPACING.XS;
    const frontStartY = frontHeaderY - FONT_SIZE.TITLE / 2 - SPACING.MD - cardH / 2;
    for (let i = 0; i < 3; i++) {
      const cardNode = createNode(`Front_${i}`, node);
      const y = frontStartY - i * (cardH + cardGap);
      cardNode.setPosition(0, y, 0);

      const cardGfx = makeGraphicsNode(cardNode, `CardBg_${i}`, cardW, cardH);
      drawCard(
        cardGfx.graphics,
        -cardW / 2,
        -cardH / 2,
        cardW,
        cardH,
        NEUTRAL_PALETTE.cardBg,
        COMBAT_PALETTE.primary,
      );

      const nameLbl = makeLabel(cardNode, '—', FONT_SIZE.BODY, NEUTRAL_PALETTE.textPrimary, `Name_${i}`).label;
      nameLbl.node.setPosition(-cardW / 2 + 36, cardH / 2 - SPACING.SM - 4, 0);
      nameLbl.horizontalAlign = 0;

      const detailLbl = makeLabel(cardNode, '', FONT_SIZE.CAPTION, NEUTRAL_PALETTE.textSecondary, `Detail_${i}`).label;
      detailLbl.node.setPosition(-cardW / 2 + 36, 0, 0);
      detailLbl.horizontalAlign = 0;

      const barW = cardW - 80;
      const bar = makeGraphicsNode(cardNode, `Bar_${i}`, barW, 4);
      bar.node.setPosition(0, -cardH / 2 + SPACING.SM + 4, 0);
      drawProgressBar(bar.graphics, -barW / 2, -2, barW, 4, 0);

      const barLbl = makeLabel(cardNode, '', FONT_SIZE.CAPTION, NEUTRAL_PALETTE.textSecondary, `BarLabel_${i}`).label;
      barLbl.node.setPosition(0, -cardH / 2 + SPACING.SM + 10, 0);

      this._frontHandles.push({
        cardGfx: cardGfx.graphics,
        nameLabel: nameLbl,
        detailLabel: detailLbl,
        bar: bar.graphics,
        barW,
        barLabel: barLbl,
        frontId: '',
        lastAccent: new Color(),
        lastRatio: -1,
        lastNameText: '',
        lastDetailText: '',
        lastBarText: '',
      });
    }

    // 作战统计区（底部）
    const statsY = frontStartY - cardH * 3 - cardGap * 2 - cardH / 2 - SPACING.MD;
    makeLabel(node, '作战统计', FONT_SIZE.TITLE, NEUTRAL_PALETTE.textPrimary, 'StatsTitle')
      .node.setPosition(-w / 2 + SPACING.XL, statsY, 0);

    const statRowH = 20;
    const statStartY = statsY - FONT_SIZE.TITLE / 2 - SPACING.SM - statRowH / 2;
    const statLabels: { key: keyof CombatPanel['_statsLabels']; label: string }[] = [
      { key: 'controlled', label: '已管控省份' },
      { key: 'divisions', label: '已部署部队' },
      { key: 'loss', label: '设备损耗' },
      { key: 'enemyLoss', label: '敌方损耗' },
      { key: 'disputes', label: '争端总数' },
    ];
    for (let i = 0; i < statLabels.length; i++) {
      const sl = statLabels[i];
      const sy = statStartY - i * statRowH;
      const lbl = makeLabel(node, sl.label, FONT_SIZE.CAPTION, NEUTRAL_PALETTE.textSecondary, `StatLabel_${sl.key}`);
      lbl.node.setPosition(-w / 2 + SPACING.XL, sy, 0);
      lbl.label.horizontalAlign = 0;
      const val = makeLabel(node, '0', FONT_SIZE.CAPTION, NEUTRAL_PALETTE.textPrimary, `StatVal_${sl.key}`);
      val.node.setPosition(w / 2 - SPACING.XL, sy, 0);
      val.label.horizontalAlign = 2; // RIGHT
      this._statsLabels[sl.key] = val.label;
    }
  }

  /** 注册动作回调 */
  onAction(cb: (action: CombatAction) => void): void {
    this._actionCb = cb;
  }

  /** 刷新面板 */
  update(shadow: CombatPanelShadow): void {
    // 争端决心条
    const resolveText = `争端决心 ${Math.round(shadow.disputeResolve * 100)}%`;
    if (this._resolveLabel && this._lastResolveText !== resolveText) {
      this._lastResolveText = resolveText;
      this._resolveLabel.string = resolveText;
    }
    if (this._resolveBar && this._lastResolveRatio !== shadow.disputeResolve) {
      this._lastResolveRatio = shadow.disputeResolve;
      drawProgressBar(
        this._resolveBar,
        -this._resolveBarW / 2,
        -4,
        this._resolveBarW,
        8,
        shadow.disputeResolve,
        NEUTRAL_PALETTE.bgMid,
        COMBAT_PALETTE.secondary,
      );
    }

    // 前线
    for (let i = 0; i < this._frontHandles.length; i++) {
      const handle = this._frontHandles[i];
      const front = shadow.fronts[i];
      if (!front) {
        if (handle.lastNameText !== '—') {
          handle.lastNameText = '—';
          handle.nameLabel.string = '—';
        }
        if (handle.lastDetailText !== '') {
          handle.lastDetailText = '';
          handle.detailLabel.string = '';
        }
        if (handle.lastBarText !== '') {
          handle.lastBarText = '';
          handle.barLabel.string = '';
        }
        if (handle.frontId !== '') {
          handle.frontId = '';
        }
        if (handle.lastRatio !== 0) {
          handle.lastRatio = 0;
          drawProgressBar(handle.bar, -handle.barW / 2, -2, handle.barW, 4, 0);
        }
        continue;
      }
      handle.frontId = front.frontId;
      if (handle.lastNameText !== front.name) {
        handle.lastNameText = front.name;
        handle.nameLabel.string = front.name;
      }
      const detailText = `${front.deployedDivisions} 师 vs ${front.enemyDivisions} 师`;
      if (handle.lastDetailText !== detailText) {
        handle.lastDetailText = detailText;
        handle.detailLabel.string = detailText;
      }
      const barText = front.offensiveProgress > 0
        ? `攻势 ${Math.round(front.offensiveProgress * 100)}%`
        : front.provinceDelta !== 0
          ? `管控 ${front.provinceDelta > 0 ? '+' : ''}${front.provinceDelta}`
          : '对峙中';
      if (handle.lastBarText !== barText) {
        handle.lastBarText = barText;
        handle.barLabel.string = barText;
      }
      const barRatio = front.offensiveProgress > 0 ? front.offensiveProgress : 0.5;
      const barFg: Color = front.offensiveProgress > 0 ? COMBAT_PALETTE.primary : COMBAT_PALETTE.secondary;
      if (handle.lastRatio !== barRatio || !colorEquals(handle.lastAccent, barFg)) {
        handle.lastRatio = barRatio;
        handle.lastAccent.r = barFg.r;
        handle.lastAccent.g = barFg.g;
        handle.lastAccent.b = barFg.b;
        handle.lastAccent.a = barFg.a;
        drawProgressBar(
          handle.bar,
          -handle.barW / 2,
          -2,
          handle.barW,
          4,
          barRatio,
          NEUTRAL_PALETTE.bgMid,
          barFg,
        );
      }
    }

    // 作战统计
    const controlledText = String(shadow.stats.controlledProvinces);
    if (this._statsLabels.controlled && this._lastControlledText !== controlledText) {
      this._lastControlledText = controlledText;
      this._statsLabels.controlled.string = controlledText;
    }
    const divisionsText = String(shadow.stats.totalDivisions);
    if (this._statsLabels.divisions && this._lastDivisionsText !== divisionsText) {
      this._lastDivisionsText = divisionsText;
      this._statsLabels.divisions.string = divisionsText;
    }
    const lossText = String(shadow.stats.equipmentLoss);
    if (this._statsLabels.loss && this._lastLossText !== lossText) {
      this._lastLossText = lossText;
      this._statsLabels.loss.string = lossText;
    }
    const enemyLossText = String(shadow.stats.enemyEquipmentLoss);
    if (this._statsLabels.enemyLoss && this._lastEnemyLossText !== enemyLossText) {
      this._lastEnemyLossText = enemyLossText;
      this._statsLabels.enemyLoss.string = enemyLossText;
    }
    const disputesText = String(shadow.stats.totalDisputes);
    if (this._statsLabels.disputes && this._lastDisputesText !== disputesText) {
      this._lastDisputesText = disputesText;
      this._statsLabels.disputes.string = disputesText;
    }
  }
}