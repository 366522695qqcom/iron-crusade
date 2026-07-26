/**
 * 建筑模式面板（render/ui/panels/）
 *
 * 实现依据：
 * - PROJECT.md 3.4 建筑模式：底部建筑选择栏 + 左侧建造队列 + 顶部可用民厂数
 * - PROJECT.md 3.4.2 可建造建筑清单（8 种：民厂/军厂/船坞/基建/开采井/仓储/补给枢纽/防御工事）
 * - 技术设计文档 7.4：UI 以 cc.Graphics 代码绘制为主
 * - spec S.4.2：建造属工业建设核心，用 INDUSTRY_PALETTE 高视觉权重
 *
 * 局内无广告原则：建造面板不含加速 / 双倍 / 跳过等任何数值购买入口。
 */
import { Graphics, Label } from 'cc';
import { PanelBase, createNode, makeLabel, makeGraphicsNode, makeButton, addEdgeWidget } from '../../core/node_factory';
import { drawPanel, drawProgressBar } from '../../core/graphics_util';
import {
  INDUSTRY_PALETTE,
  NEUTRAL_PALETTE,
  FONT_SIZE,
  SPACING,
  RADIUS,
} from '../../core/ui_theme';

/** 建筑类型与显示名（PROJECT.md 3.4.2） */
const BUILDING_TYPES: { type: string; label: string }[] = [
  { type: 'civilian_factory', label: '民厂' },
  { type: 'military_factory', label: '军厂' },
  { type: 'dockyard', label: '船坞' },
  { type: 'infrastructure', label: '基建' },
  { type: 'mine', label: '开采井' },
  { type: 'storage', label: '仓储' },
  { type: 'supply_hub', label: '补给枢纽' },
  { type: 'fort', label: '防御工事' },
];

/** 建造队列项影子 */
export interface ConstructionQueueItemView {
  id: string;
  type: string;
  progress: number;
}

export class BuildingPanel extends PanelBase {
  private _queueGfx: { gfx: Graphics; label: Label; bar: Graphics; barW: number }[] = [];
  private _selectCb: ((type: string) => void) | null = null;
  private _civilianLabel: Label | null = null;

  onMount(): void {
    const node = this.node!;
    const w = 960;
    const h = 200;
    node.setContentSize(w, h);
    addEdgeWidget(node, 'bottom', SPACING.LG, 0);

    const { graphics: bgGfx } = makeGraphicsNode(node, 'Bg', w, h);
    drawPanel(bgGfx, -w / 2, -h / 2, w, h, INDUSTRY_PALETTE.panelBg, NEUTRAL_PALETTE.border, RADIUS.PANEL);

    // 顶部可用民厂数
    const header = makeLabel(node, '可用民用工厂：0', FONT_SIZE.TITLE, NEUTRAL_PALETTE.textPrimary, 'Header');
    header.node.setPosition(-w / 2 + 160, h / 2 - SPACING.LG, 0);
    this._civilianLabel = header.label;

    // 左侧建造队列
    const queueX = -w / 2 + SPACING.LG;
    makeLabel(node, '建造队列', FONT_SIZE.BODY, NEUTRAL_PALETTE.textSecondary, 'QueueTitle')
      .node.setPosition(queueX + 80, h / 2 - SPACING.LG - FONT_SIZE.TITLE - SPACING.SM, 0);
    for (let i = 0; i < 3; i++) {
      const qItem = createNode(`Queue_${i}`, node);
      qItem.setPosition(queueX + 80, 0 - i * 36, 0);
      const barW = 140;
      const bg = makeGraphicsNode(qItem, 'QBg', 160, 28);
      drawPanel(bg.graphics, -80, -14, 160, 28, NEUTRAL_PALETTE.cardBg, NEUTRAL_PALETTE.border, RADIUS.BUTTON);
      const lbl = makeLabel(qItem, '—', FONT_SIZE.CAPTION, NEUTRAL_PALETTE.textPrimary, 'QLabel');
      lbl.node.setPosition(-30, 0, 0);
      const bar = makeGraphicsNode(qItem, 'QBar', barW, 6);
      bar.node.setPosition(20, 0, 0);
      drawProgressBar(bar.graphics, -barW / 2, -3, barW, 6, 0);
      this._queueGfx.push({ gfx: bg.graphics, label: lbl.label, bar: bar.graphics, barW });
    }

    // 底部建筑选择栏（8 个按钮，2 行 × 4 列）
    const btnW = 100;
    const btnH = 48;
    const startX = 200;
    const startY = 24;
    for (let i = 0; i < BUILDING_TYPES.length; i++) {
      const col = i % 4;
      const row = Math.floor(i / 4);
      const x = startX + col * (btnW + SPACING.SM);
      const y = startY - row * (btnH + SPACING.SM);
      const def = BUILDING_TYPES[i];
      const btn = makeButton(
        node,
        def.label,
        btnW,
        btnH,
        INDUSTRY_PALETTE.primary,
        INDUSTRY_PALETTE.pressed,
        FONT_SIZE.BODY,
        `Btn_${def.type}`,
      );
      btn.node.setPosition(x, y, 0);
      btn.node.on('click', () => this._selectCb?.(def.type));
    }
  }

  /** 注册建筑选择回调 */
  onBuildingSelect(cb: (type: string) => void): void {
    this._selectCb = cb;
  }

  /** 更新可用民厂数 */
  updateCivilianCount(count: number): void {
    if (this._civilianLabel) {
      this._civilianLabel.string = `可用民用工厂：${count}`;
    }
  }

  /** 刷新建造队列 */
  updateConstructionQueue(items: ConstructionQueueItemView[]): void {
    for (let i = 0; i < this._queueGfx.length; i++) {
      const handle = this._queueGfx[i];
      const item = items[i];
      if (!item) {
        handle.label.string = '—';
        drawProgressBar(handle.bar, -handle.barW / 2, -3, handle.barW, 6, 0);
        continue;
      }
      handle.label.string = item.type;
      drawProgressBar(handle.bar, -handle.barW / 2, -3, handle.barW, 6, item.progress);
    }
  }
}
