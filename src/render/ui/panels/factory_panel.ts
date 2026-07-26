/**
 * 工厂生产任务分配面板（render/ui/panels/）
 *
 * 实现依据：
 * - PROJECT.md 3.3 工厂系统：民厂/军厂/船坞生产任务分配
 * - PROJECT.md 3.3.3 空闲提醒系统：L1-L4 递进提醒，顶部角标"X 座工厂空闲"
 * - 技术设计文档 7.4：UI 以 cc.Graphics 代码绘制为主
 * - spec S.4.2：工厂属工业建设核心，用 INDUSTRY_PALETTE 高视觉权重
 *
 * 局内无广告原则：工厂面板不含加速 / 双倍 / 跳过等任何数值购买入口。
 */
import { Graphics, Label, Color } from 'cc';
import { PanelBase, createNode, makeLabel, makeGraphicsNode, addEdgeWidget } from '../../core/node_factory';
import { drawPanel, drawCard, drawProgressBar, drawBadge, colorEquals } from '../../core/graphics_util';
import {
  INDUSTRY_PALETTE,
  NEUTRAL_PALETTE,
  FONT_SIZE,
  SPACING,
  RADIUS,
} from '../../core/ui_theme';
import type { FactoryPanelShadow } from '../../core/shadow_reader';

/** 工厂卡片渲染句柄 */
interface FactoryCardHandle {
  id: number;
  gfx: Graphics;
  label: Label;
  bar: Graphics;
  barW: number;
  lastRatio: number;
  lastAccent: Color;
  lastLabelText: string;
}

export class FactoryPanel extends PanelBase {
  private _cards: FactoryCardHandle[] = [];
  private _badgeGfx: Graphics | null = null;
  private _badgeLabel: Label | null = null;
  private _selectCb: ((factoryId: number) => void) | null = null;
  private _shadow: FactoryPanelShadow | null = null;
  private _lastBadgeText = '';

  onMount(): void {
    const node = this.node!;
    const w = 360;
    const h = 540;
    node.setContentSize(w, h);
    addEdgeWidget(node, 'left', SPACING.LG, 0);

    const { graphics: bgGfx } = makeGraphicsNode(node, 'Bg', w, h);
    drawPanel(bgGfx, -w / 2, -h / 2, w, h, INDUSTRY_PALETTE.panelBg, NEUTRAL_PALETTE.border, RADIUS.PANEL);

    // 标题 + 空闲角标
    makeLabel(node, '工厂', FONT_SIZE.TITLE, NEUTRAL_PALETTE.textPrimary, 'Title')
      .node.setPosition(0, h / 2 - SPACING.LG, 0);

    const badgeNode = createNode('IdleBadge', node);
    badgeNode.setPosition(w / 2 - 32, h / 2 - 24, 0);
    const badgeGfx = badgeNode.addComponent(Graphics);
    this._badgeGfx = badgeGfx;
    const { label: badgeLabel } = makeLabel(badgeNode, '', FONT_SIZE.BADGE, NEUTRAL_PALETTE.textPrimary, 'Badge');
    badgeLabel.node.setPosition(0, 0, 0);
    this._badgeLabel = badgeLabel;
    drawBadge(badgeGfx, 0, 0, 14, NEUTRAL_PALETTE.warning);

    // 工厂列表区（动态创建卡片占位，实际数量由 update 决定）
    // 骨架阶段预创建 6 个槽位
    const listStartY = h / 2 - SPACING.LG - FONT_SIZE.TITLE - SPACING.MD;
    const cardW = w - SPACING.XL * 2;
    const cardH = 64;
    for (let i = 0; i < 6; i++) {
      const card = createNode(`Factory_${i}`, node);
      const y = listStartY - i * (cardH + SPACING.SM);
      card.setPosition(0, y, 0);
      const cardGfx = makeGraphicsNode(card, 'Card', cardW, cardH);
      drawCard(cardGfx.graphics, -cardW / 2, -cardH / 2, cardW, cardH, NEUTRAL_PALETTE.cardBg, INDUSTRY_PALETTE.primary);
      const lbl = makeLabel(card, `F-${i}`, FONT_SIZE.BODY, NEUTRAL_PALETTE.textPrimary, 'Label');
      lbl.node.setPosition(0, 12, 0);
      const barW = cardW - SPACING.LG * 2;
      const bar = makeGraphicsNode(card, 'Bar', barW, 6);
      bar.node.setPosition(0, -16, 0);
      drawProgressBar(bar.graphics, -barW / 2, -3, barW, 6, 0);
      card.on('click', () => {
        if (this._shadow && this._shadow.factories[i]) {
          this._selectCb?.(this._shadow.factories[i].id);
        }
      });
      this._cards.push({
        id: i,
        gfx: cardGfx.graphics,
        label: lbl.label,
        bar: bar.graphics,
        barW,
        lastRatio: -1,
        lastAccent: new Color(),
        lastLabelText: '',
      });
    }
  }

  /** 注册工厂选择回调 */
  onFactorySelect(cb: (factoryId: number) => void): void {
    this._selectCb = cb;
  }

  /** 刷新工厂列表 + 空闲角标 */
  update(shadow: FactoryPanelShadow): void {
    this._shadow = shadow;
    this.redrawCards();
    this.redrawBadge();
  }

  private redrawCards(): void {
    if (!this._shadow) return;
    const factories = this._shadow.factories;
    for (let i = 0; i < this._cards.length; i++) {
      const handle = this._cards[i];
      const f = factories[i];
      if (!f) {
        if (handle.lastLabelText !== '—') {
          handle.lastLabelText = '—';
          handle.label.string = '—';
        }
        if (handle.lastRatio !== 0) {
          handle.lastRatio = 0;
          drawProgressBar(handle.bar, -handle.barW / 2, -3, handle.barW, 6, 0);
        }
        continue;
      }
      const stateText = f.state === 'idle' ? '空闲' : f.state === 'working' ? '生产中' : '建造中';
      const labelText = `${f.type} · ${stateText}`;
      let accent: Color = INDUSTRY_PALETTE.primary;
      if (f.state === 'idle') accent = NEUTRAL_PALETTE.warning;
      else if (f.state === 'working') accent = NEUTRAL_PALETTE.success;
      if (!colorEquals(handle.lastAccent, accent)) {
        handle.lastAccent.r = accent.r;
        handle.lastAccent.g = accent.g;
        handle.lastAccent.b = accent.b;
        handle.lastAccent.a = accent.a;
        drawCard(handle.gfx, -180, -32, 360, 64, NEUTRAL_PALETTE.cardBg, accent);
      }
      if (handle.lastLabelText !== labelText) {
        handle.lastLabelText = labelText;
        handle.label.string = labelText;
      }
      if (handle.lastRatio !== f.productionProgress) {
        handle.lastRatio = f.productionProgress;
        drawProgressBar(handle.bar, -handle.barW / 2, -3, handle.barW, 6, f.productionProgress);
      }
    }
  }

  private redrawBadge(): void {
    if (!this._shadow || !this._badgeGfx || !this._badgeLabel) return;
    const { idleCount, alertLevel } = this._shadow;
    if (idleCount > 0 && alertLevel >= 2) {
      const badgeText = String(idleCount);
      if (this._lastBadgeText !== badgeText) {
        this._lastBadgeText = badgeText;
        this._badgeLabel.string = badgeText;
        const color = alertLevel >= 4 ? NEUTRAL_PALETTE.warning : NEUTRAL_PALETTE.warning;
        drawBadge(this._badgeGfx, 0, 0, 14, color);
      }
    } else {
      if (this._lastBadgeText !== '') {
        this._lastBadgeText = '';
        this._badgeLabel.string = '';
        this._badgeGfx.clear();
      }
    }
  }
}
