/**
 * 焦点树面板（render/ui/panels/）
 *
 * 实现依据：
 * - PROJECT.md 3.5 国家焦点树：三选一卡牌，每 60s 刷新
 * - PROJECT.md 3.5 焦点效果：给工厂/部队/政治点/解锁科技/领土宣称
 * - 技术设计文档 7.4：UI 以 cc.Graphics 代码绘制为主
 *
 * 局内无广告原则：焦点面板不含刷新按钮 / 跳过等待等任何数值购买入口。
 */
import { Graphics, Label, Color } from 'cc';
import { PanelBase, makeLabel, makeGraphicsNode, addEdgeWidget } from '../../core/node_factory';
import { drawPanel, drawCard, drawProgressBar, colorEquals } from '../../core/graphics_util';
import {
  INDUSTRY_PALETTE,
  NEUTRAL_PALETTE,
  FONT_SIZE,
  SPACING,
  RADIUS,
} from '../../core/ui_theme';
import type { FocusPanelShadow } from '../../core/shadow_reader';

/** 三选一候选卡牌句柄 */
interface CandidateCardHandle {
  gfx: Graphics;
  label: Label;
  costLabel: Label;
  cardW: number;
  cardH: number;
  lastAccent: Color;
  lastLabelText: string;
  lastCostText: string;
}

export class FocusPanel extends PanelBase {
  private _candidates: CandidateCardHandle[] = [];
  private _activeLabel: Label | null = null;
  private _lastActiveText = '';
  private _activeBar: Graphics | null = null;
  private _activeBarW = 0;
  private _lastActiveProgress = -1;
  private _refreshLabel: Label | null = null;
  private _lastRefreshText = '';
  private _pickCb: ((focusId: string) => void) | null = null;
  private _shadow: FocusPanelShadow | null = null;

  onMount(): void {
    const node = this.node!;
    const w = 360;
    const h = 540;
    node.setContentSize(w, h);
    addEdgeWidget(node, 'right', SPACING.LG, -240); // 右侧偏下，避让资源面板

    const { graphics: bgGfx } = makeGraphicsNode(node, 'Bg', w, h);
    drawPanel(bgGfx, -w / 2, -h / 2, w, h, INDUSTRY_PALETTE.panelBg, NEUTRAL_PALETTE.border, RADIUS.PANEL);

    makeLabel(node, '焦点', FONT_SIZE.TITLE, NEUTRAL_PALETTE.textPrimary, 'Title')
      .node.setPosition(0, h / 2 - SPACING.LG, 0);

    // 当前进行中焦点区
    const activeY = h / 2 - SPACING.LG - FONT_SIZE.TITLE - SPACING.MD;
    this._activeLabel = makeLabel(node, '当前：无', FONT_SIZE.BODY, NEUTRAL_PALETTE.textSecondary, 'ActiveLabel').label;
    this._activeLabel.node.setPosition(0, activeY, 0);
    const activeBarW = w - SPACING.XL * 2;
    this._activeBarW = activeBarW;
    const activeBar = makeGraphicsNode(node, 'ActiveBar', activeBarW, 8);
    activeBar.node.setPosition(0, activeY - SPACING.MD, 0);
    drawProgressBar(activeBar.graphics, -activeBarW / 2, -4, activeBarW, 8, 0);
    this._activeBar = activeBar.graphics;

    // 三选一候选卡牌区
    const cardW = 96;
    const cardH = 140;
    const gap = SPACING.SM;
    const totalW = cardW * 3 + gap * 2;
    const startX = -totalW / 2 + cardW / 2;
    const cardY = -40;
    for (let i = 0; i < 3; i++) {
      const card = makeGraphicsNode(node, `Candidate_${i}`, cardW, cardH);
      card.node.setPosition(startX + i * (cardW + gap), cardY, 0);
      drawCard(card.graphics, -cardW / 2, -cardH / 2, cardW, cardH, NEUTRAL_PALETTE.cardBg, INDUSTRY_PALETTE.primary);
      const lbl = makeLabel(card.node, '—', FONT_SIZE.BODY, NEUTRAL_PALETTE.textPrimary, 'Name');
      lbl.node.setPosition(0, 16, 0);
      const costLbl = makeLabel(card.node, '', FONT_SIZE.CAPTION, NEUTRAL_PALETTE.textSecondary, 'Cost');
      costLbl.node.setPosition(0, -16, 0);
      card.node.on('click', () => {
        if (this._shadow && this._shadow.candidates[i]) {
          this._pickCb?.(this._shadow.candidates[i].focusId);
        }
      });
      this._candidates.push({
        gfx: card.graphics,
        label: lbl.label,
        costLabel: costLbl.label,
        cardW,
        cardH,
        lastAccent: new Color(),
        lastLabelText: '',
        lastCostText: '',
      });
    }

    // 刷新倒计时
    this._refreshLabel = makeLabel(node, '下次刷新：—s', FONT_SIZE.CAPTION, NEUTRAL_PALETTE.textSecondary, 'Refresh').label;
    this._refreshLabel.node.setPosition(0, -h / 2 + SPACING.LG, 0);
  }

  /** 注册焦点选择回调 */
  onFocusPick(cb: (focusId: string) => void): void {
    this._pickCb = cb;
  }

  update(shadow: FocusPanelShadow): void {
    this._shadow = shadow;
    this.redraw();
  }

  private redraw(): void {
    if (!this._shadow) return;
    const s = this._shadow;

    // 当前焦点
    const activeText = s.active ? `当前：${s.active.name}` : '当前：无';
    if (this._activeLabel && this._lastActiveText !== activeText) {
      this._lastActiveText = activeText;
      this._activeLabel.string = activeText;
    }
    const activeRatio = s.active ? s.active.progress : 0;
    if (this._activeBar && this._lastActiveProgress !== activeRatio) {
      this._lastActiveProgress = activeRatio;
      drawProgressBar(this._activeBar, -this._activeBarW / 2, -4, this._activeBarW, 8, activeRatio);
    }

    // 三选一候选
    for (let i = 0; i < this._candidates.length; i++) {
      const handle = this._candidates[i];
      const c = s.candidates[i];
      if (!c) {
        if (handle.lastLabelText !== '—') {
          handle.lastLabelText = '—';
          handle.label.string = '—';
        }
        if (handle.lastCostText !== '') {
          handle.lastCostText = '';
          handle.costLabel.string = '';
        }
        continue;
      }
      if (handle.lastLabelText !== c.name) {
        handle.lastLabelText = c.name;
        handle.label.string = c.name;
      }
      const costText = c.cost > 0 ? `${c.cost} 政治点` : '';
      if (handle.lastCostText !== costText) {
        handle.lastCostText = costText;
        handle.costLabel.string = costText;
      }
      // 已激活的候选加 success 描边
      const accent = s.active?.focusId === c.focusId ? NEUTRAL_PALETTE.success : INDUSTRY_PALETTE.primary;
      if (!colorEquals(handle.lastAccent, accent)) {
        handle.lastAccent.r = accent.r;
        handle.lastAccent.g = accent.g;
        handle.lastAccent.b = accent.b;
        handle.lastAccent.a = accent.a;
        drawCard(handle.gfx, -handle.cardW / 2, -handle.cardH / 2, handle.cardW, handle.cardH, NEUTRAL_PALETTE.cardBg, accent);
      }
    }

    // 刷新倒计时（10Hz → 秒 = ticks / 10）
    const refreshText = `下次刷新：${Math.ceil(s.refreshInTicks / 10)}s`;
    if (this._refreshLabel && this._lastRefreshText !== refreshText) {
      this._lastRefreshText = refreshText;
      this._refreshLabel.string = refreshText;
    }
  }
}
