/**
 * 科研面板（render/ui/panels/）
 *
 * 实现依据：
 * - PROJECT.md 3.6 科研：线性科技线（非树状），7 条线（工业/电子/步兵/装甲/炮兵/空军/海军）
 * - 技术设计文档 7.4：UI 以 cc.Graphics 代码绘制为主
 * - spec S.4.2：科研属工业建设类，用 INDUSTRY_PALETTE 配色
 *
 * 局内无广告原则：科研面板不含跳过等待 / 双倍进度等任何数值购买入口。
 */
import { Graphics, Label } from 'cc';
import { PanelBase, createNode, makeLabel, makeGraphicsNode, addEdgeWidget } from '../../core/node_factory';
import { drawPanel, drawProgressBar } from '../../core/graphics_util';
import {
  INDUSTRY_PALETTE,
  NEUTRAL_PALETTE,
  FONT_SIZE,
  SPACING,
  RADIUS,
} from '../../core/ui_theme';
import type { ResearchPanelShadow } from '../../core/shadow_reader';

/** 7 条科研线（PROJECT.md 3.6） */
const RESEARCH_LINES: { lineId: string; label: string }[] = [
  { lineId: 'industry', label: '工业' },
  { lineId: 'electronics', label: '电子' },
  { lineId: 'infantry', label: '步兵' },
  { lineId: 'armor', label: '装甲' },
  { lineId: 'artillery', label: '炮兵' },
  { lineId: 'air', label: '空军' },
  { lineId: 'naval', label: '海军' },
];

interface LineHandle {
  lineId: string;
  label: Label;
  statusLabel: Label;
  bar: Graphics;
  barW: number;
  lastRatio: number;
  lastStatusText: string;
}

export class ResearchPanel extends PanelBase {
  private _lines: LineHandle[] = [];
  private _assignCb: ((lineId: string) => void) | null = null;

  onMount(): void {
    const node = this.node!;
    const w = 360;
    const h = 540;
    node.setContentSize(w, h);
    addEdgeWidget(node, 'right', SPACING.LG, 240);

    const { graphics: bgGfx } = makeGraphicsNode(node, 'Bg', w, h);
    drawPanel(bgGfx, -w / 2, -h / 2, w, h, INDUSTRY_PALETTE.panelBg, NEUTRAL_PALETTE.border, RADIUS.PANEL);

    makeLabel(node, '科研', FONT_SIZE.TITLE, NEUTRAL_PALETTE.textPrimary, 'Title')
      .node.setPosition(0, h / 2 - SPACING.LG, 0);

    // 7 条线列表
    const listStartY = h / 2 - SPACING.LG - FONT_SIZE.TITLE - SPACING.MD;
    const rowH = 56;
    const barW = w - SPACING.XL * 2 - 120;
    for (let i = 0; i < RESEARCH_LINES.length; i++) {
      const def = RESEARCH_LINES[i];
      const row = createNode(`Line_${def.lineId}`, node);
      const y = listStartY - i * (rowH + SPACING.SM);
      row.setPosition(0, y, 0);
      row.on('click', () => this._assignCb?.(def.lineId));

      const lbl = makeLabel(row, def.label, FONT_SIZE.BODY, NEUTRAL_PALETTE.textPrimary, 'Name');
      lbl.node.setPosition(-w / 2 + 60, 8, 0);

      const statusLbl = makeLabel(row, '未分配', FONT_SIZE.CAPTION, NEUTRAL_PALETTE.textSecondary, 'Status');
      statusLbl.node.setPosition(-w / 2 + 60, -10, 0);

      const bar = makeGraphicsNode(row, 'Bar', barW, 8);
      bar.node.setPosition(60, 0, 0);
      drawProgressBar(bar.graphics, -barW / 2, -4, barW, 8, 0);

      this._lines.push({
        lineId: def.lineId,
        label: lbl.label,
        statusLabel: statusLbl.label,
        bar: bar.graphics,
        barW,
        lastRatio: -1,
        lastStatusText: '',
      });
    }
  }

  /** 注册科研分配回调 */
  onResearchAssign(cb: (lineId: string) => void): void {
    this._assignCb = cb;
  }

  update(shadow: ResearchPanelShadow): void {
    for (const handle of this._lines) {
      const line = shadow.lines.find((l) => l.lineId === handle.lineId);
      if (!line) {
        if (handle.lastStatusText !== '未分配') {
          handle.lastStatusText = '未分配';
          handle.statusLabel.string = '未分配';
        }
        if (handle.lastRatio !== 0) {
          handle.lastRatio = 0;
          drawProgressBar(handle.bar, -handle.barW / 2, -4, handle.barW, 8, 0);
        }
        continue;
      }
      let statusText: string;
      let ratio: number;
      let fgColor = NEUTRAL_PALETTE.success;
      if (line.assignedSlot === -1) {
        statusText = '已完成';
        ratio = 1;
        fgColor = NEUTRAL_PALETTE.success;
      } else if (line.assignedSlot >= 0) {
        statusText = `进行中 · ${line.currentNode}`;
        ratio = line.progress;
        fgColor = INDUSTRY_PALETTE.steel;
      } else {
        statusText = '未分配';
        ratio = 0;
      }
      if (handle.lastStatusText !== statusText) {
        handle.lastStatusText = statusText;
        handle.statusLabel.string = statusText;
      }
      if (handle.lastRatio !== ratio) {
        handle.lastRatio = ratio;
        drawProgressBar(handle.bar, -handle.barW / 2, -4, handle.barW, 8, ratio, NEUTRAL_PALETTE.bgMid, fgColor);
      }
    }
  }
}
