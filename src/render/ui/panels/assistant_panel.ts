/**
 * 助理模式面板（render/ui/panels/）
 *
 * 实现依据：
 * - PROJECT.md 3.12 助理模式：新手默认开启，老手可手动关闭
 * - spec A.2.4：助理模式开关 UI 与「助理已分配 X 座工厂」提示
 * - spec A.2.3：助理操作可撤销（记录助理操作日志，玩家可回退）
 * - spec S.4.2：助理系统属工业建设辅助，用 INDUSTRY_PALETTE 高视觉权重
 *
 * 局内无广告原则：本面板不含任何广告入口 / 数值购买入口。
 */
import { Graphics, Label, Color, Node } from 'cc';
import {
  PanelBase,
  createNode,
  makeLabel,
  makeGraphicsNode,
  makeButton,
  addEdgeWidget,
} from '../../core/node_factory';
import { drawPanel, drawCard, colorEquals } from '../../core/graphics_util';
import {
  INDUSTRY_PALETTE,
  NEUTRAL_PALETTE,
  FONT_SIZE,
  SPACING,
  RADIUS,
} from '../../core/ui_theme';

/** 面板宽度（onMount 与 update 共享） */
const PANEL_W = 360;
/** 开关按钮宽度（与 onMount 内 toggleW 一致） */
const TOGGLE_W = PANEL_W - 24 * 2;
/** 开关按钮高度 */
const TOGGLE_H = 48;

/** 助理操作日志条目影子（由 game 层从 AssistantSystem.getOperationLog() 转换） */
export interface AssistantOpView {
  operationId: string;
  typeLabel: string;
  summary: string;
  canUndo: boolean;
}

/** 助理面板影子（由 game 层注入） */
export interface AssistantPanelShadow {
  enabled: boolean;
  assignedFactoryCount: number;
  idleFactoryCount: number;
  pendingSupplyCount: number;
  pendingDefenseCount: number;
  recentOps: AssistantOpView[];
}

/** 三项统计卡 key */
type StatKey = 'idle' | 'supply' | 'defense';

/** 单条操作日志的渲染句柄 */
interface OpRowHandle {
  descLabel: Label;
  undoBtn: { node: Node; label: Label };
  opId: string;
  lastDescText: string;
  lastUndoText: string;
}

export class AssistantPanel extends PanelBase {
  private _toggleGfx: Graphics | null = null;
  private _toggleLabel: Label | null = null;
  private _lastToggleText = '';
  private _lastToggleColor: Color = new Color();
  private _statusLabel: Label | null = null;
  private _lastStatusText = '';
  private _lastStatusColor: Color = new Color();
  private _statLabels: Record<StatKey, Label | null> = { idle: null, supply: null, defense: null };
  private _lastIdleText = '';
  private _lastSupplyText = '';
  private _lastDefenseText = '';
  private _opRows: OpRowHandle[] = [];
  private _toggleCb: ((action: 'enable' | 'disable') => void) | null = null;
  private _undoCb: ((operationId: string) => void) | null = null;
  private _currentEnabled = false;

  onMount(): void {
    const node = this.node!;
    const w = PANEL_W;
    const h = 540;
    node.setContentSize(w, h);
    addEdgeWidget(node, 'left', SPACING.LG, 0);

    const { graphics: bgGfx } = makeGraphicsNode(node, 'Bg', w, h);
    drawPanel(bgGfx, -w / 2, -h / 2, w, h, INDUSTRY_PALETTE.panelBg, NEUTRAL_PALETTE.border, RADIUS.PANEL);

    // 顶部标题
    makeLabel(node, '助理模式', FONT_SIZE.TITLE_LG, NEUTRAL_PALETTE.textPrimary, 'Title')
      .node.setPosition(0, h / 2 - SPACING.LG, 0);

    // 开关按钮
    const toggleY = h / 2 - SPACING.LG - FONT_SIZE.TITLE_LG - SPACING.MD - TOGGLE_H / 2;
    const toggle = makeButton(
      node,
      '开启助理',
      TOGGLE_W,
      TOGGLE_H,
      INDUSTRY_PALETTE.primary,
      INDUSTRY_PALETTE.pressed,
      FONT_SIZE.BODY,
      'ToggleBtn',
    );
    toggle.node.setPosition(0, toggleY, 0);
    toggle.node.on('click', () => {
      this._toggleCb?.(this._currentEnabled ? 'disable' : 'enable');
    });
    this._toggleGfx = toggle.graphics;
    this._toggleLabel = toggle.label;

    // 状态标签（A.2.4 核心：「助理已分配 X 座工厂」）
    const statusY = toggleY - TOGGLE_H / 2 - SPACING.MD - 12;
    this._statusLabel = makeLabel(
      node,
      '助理未开启',
      FONT_SIZE.BODY,
      NEUTRAL_PALETTE.textSecondary,
      'Status',
    ).label;
    this._statusLabel.node.setPosition(0, statusY, 0);

    // 三项统计卡（2 上 1 下，留空第 4 位）
    const statCardW = (w - SPACING.XL * 2 - SPACING.SM) / 2;
    const statCardH = 56;
    const statStartY = statusY - SPACING.MD - statCardH / 2;
    const stats: { key: StatKey; label: string; x: number; y: number }[] = [
      { key: 'idle', label: '空闲工厂', x: -statCardW / 2 - SPACING.SM / 2, y: statStartY },
      { key: 'supply', label: '调度补给', x: statCardW / 2 + SPACING.SM / 2, y: statStartY },
      { key: 'defense', label: '待布防', x: -statCardW / 2 - SPACING.SM / 2, y: statStartY - statCardH - SPACING.SM },
    ];
    for (const s of stats) {
      const cardNode = createNode(`Stat_${s.key}`, node);
      cardNode.setPosition(s.x, s.y, 0);
      const cardGfx = makeGraphicsNode(cardNode, `Card_${s.key}`, statCardW, statCardH);
      drawCard(
        cardGfx.graphics,
        -statCardW / 2,
        -statCardH / 2,
        statCardW,
        statCardH,
        NEUTRAL_PALETTE.cardBg,
        INDUSTRY_PALETTE.secondary,
      );
      const nameLbl = makeLabel(cardNode, s.label, FONT_SIZE.CAPTION, NEUTRAL_PALETTE.textSecondary, `Name_${s.key}`);
      nameLbl.node.setPosition(0, statCardH / 2 - SPACING.SM - 4, 0);
      const valLbl = makeLabel(cardNode, '0', FONT_SIZE.TITLE, NEUTRAL_PALETTE.textPrimary, `Val_${s.key}`);
      valLbl.node.setPosition(0, -4, 0);
      this._statLabels[s.key] = valLbl.label;
    }

    // 操作日志区
    const logTitleY = statStartY - statCardH - SPACING.SM - statCardH / 2 - SPACING.LG;
    makeLabel(node, '助理操作', FONT_SIZE.TITLE, NEUTRAL_PALETTE.textPrimary, 'LogTitle')
      .node.setPosition(0, logTitleY, 0);

    // 4 行操作日志（每行：背景 + 文本 + 撤销按钮）
    const rowW = w - SPACING.XL * 2;
    const rowH = 40;
    const rowGap = SPACING.XS;
    const logStartY = logTitleY - FONT_SIZE.TITLE / 2 - SPACING.MD - rowH / 2;
    for (let i = 0; i < 4; i++) {
      const rowNode = createNode(`Op_${i}`, node);
      const y = logStartY - i * (rowH + rowGap);
      rowNode.setPosition(0, y, 0);

      const rowGfx = makeGraphicsNode(rowNode, `RowBg_${i}`, rowW, rowH);
      drawPanel(
        rowGfx.graphics,
        -rowW / 2,
        -rowH / 2,
        rowW,
        rowH,
        NEUTRAL_PALETTE.cardBg,
        NEUTRAL_PALETTE.border,
        RADIUS.BUTTON,
      );

      const descLbl = makeLabel(rowNode, '—', FONT_SIZE.CAPTION, NEUTRAL_PALETTE.textSecondary, `Desc_${i}`).label;
      descLbl.node.setPosition(-rowW / 2 + 80, 0, 0);
      descLbl.horizontalAlign = 0; // LEFT

      const undoBtn = makeButton(
        rowNode,
        '撤销',
        56,
        24,
        INDUSTRY_PALETTE.secondary,
        INDUSTRY_PALETTE.pressed,
        FONT_SIZE.CAPTION,
        `UndoBtn_${i}`,
      );
      undoBtn.node.setPosition(rowW / 2 - 36, 0, 0);
      undoBtn.node.active = false;

      this._opRows.push({
        descLabel: descLbl,
        undoBtn: { node: undoBtn.node, label: undoBtn.label },
        opId: '',
        lastDescText: '',
        lastUndoText: '',
      });
    }
  }

  /** 注册开关回调 */
  onToggle(cb: (action: 'enable' | 'disable') => void): void {
    this._toggleCb = cb;
  }

  /** 注册撤销回调 */
  onUndo(cb: (operationId: string) => void): void {
    this._undoCb = cb;
  }

  /** 刷新整个面板 */
  update(shadow: AssistantPanelShadow): void {
    this._currentEnabled = shadow.enabled;

    // 开关按钮态
    const fill: Color = shadow.enabled ? NEUTRAL_PALETTE.bgMid : INDUSTRY_PALETTE.primary;
    const toggleText = shadow.enabled ? '关闭助理' : '开启助理';
    if (this._toggleGfx && !colorEquals(this._lastToggleColor, fill)) {
      this._lastToggleColor.r = fill.r;
      this._lastToggleColor.g = fill.g;
      this._lastToggleColor.b = fill.b;
      this._lastToggleColor.a = fill.a;
      drawPanel(
        this._toggleGfx,
        -TOGGLE_W / 2,
        -TOGGLE_H / 2,
        TOGGLE_W,
        TOGGLE_H,
        fill,
        NEUTRAL_PALETTE.border,
        RADIUS.BUTTON,
      );
    }
    if (this._toggleLabel && this._lastToggleText !== toggleText) {
      this._lastToggleText = toggleText;
      this._toggleLabel.string = toggleText;
    }

    // 状态标签（A.2.4 核心提示）
    let statusText: string;
    let statusColor: Color;
    if (shadow.enabled) {
      statusText = `助理已分配 ${shadow.assignedFactoryCount} 座工厂`;
      statusColor = INDUSTRY_PALETTE.resourceOk;
    } else {
      statusText = '助理未开启';
      statusColor = NEUTRAL_PALETTE.textSecondary;
    }
    if (this._statusLabel) {
      if (this._lastStatusText !== statusText) {
        this._lastStatusText = statusText;
        this._statusLabel.string = statusText;
      }
      if (!colorEquals(this._lastStatusColor, statusColor)) {
        this._lastStatusColor.r = statusColor.r;
        this._lastStatusColor.g = statusColor.g;
        this._lastStatusColor.b = statusColor.b;
        this._lastStatusColor.a = statusColor.a;
        this._statusLabel.color = statusColor;
      }
    }

    // 三项统计
    const idleText = String(shadow.idleFactoryCount);
    if (this._statLabels.idle && this._lastIdleText !== idleText) {
      this._lastIdleText = idleText;
      this._statLabels.idle.string = idleText;
    }
    const supplyText = String(shadow.pendingSupplyCount);
    if (this._statLabels.supply && this._lastSupplyText !== supplyText) {
      this._lastSupplyText = supplyText;
      this._statLabels.supply.string = supplyText;
    }
    const defenseText = String(shadow.pendingDefenseCount);
    if (this._statLabels.defense && this._lastDefenseText !== defenseText) {
      this._lastDefenseText = defenseText;
      this._statLabels.defense.string = defenseText;
    }

    // 操作日志（最多 4 条）
    for (let i = 0; i < this._opRows.length; i++) {
      const handle = this._opRows[i];
      const op = shadow.recentOps[i];
      handle.undoBtn.node.off('click');
      if (!op) {
        if (handle.lastDescText !== '—') {
          handle.lastDescText = '—';
          handle.descLabel.string = '—';
        }
        handle.descLabel.color = NEUTRAL_PALETTE.textDisabled;
        if (handle.undoBtn.node.active) {
          handle.undoBtn.node.active = false;
        }
        if (handle.opId !== '') {
          handle.opId = '';
        }
        continue;
      }
      handle.opId = op.operationId;
      const descText = `${op.typeLabel}：${op.summary}`;
      if (handle.lastDescText !== descText) {
        handle.lastDescText = descText;
        handle.descLabel.string = descText;
      }
      handle.descLabel.color = NEUTRAL_PALETTE.textPrimary;
      if (op.canUndo) {
        if (handle.lastUndoText !== '撤销' || !handle.undoBtn.node.active) {
          handle.lastUndoText = '撤销';
          handle.undoBtn.label.string = '撤销';
          handle.undoBtn.node.active = true;
        }
        handle.undoBtn.node.on('click', () => {
          if (handle.opId) this._undoCb?.(handle.opId);
        });
      } else {
        if (handle.undoBtn.node.active) {
          handle.undoBtn.node.active = false;
        }
      }
    }
  }
}
