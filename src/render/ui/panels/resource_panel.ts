/**
 * 资源详情面板（render/ui/panels/）
 *
 * 实现依据：
 * - PROJECT.md 3.2.6 资源 UI：6 种资源图标 + 储备/上限，储备满高亮、储备低红色脉冲
 * - PROJECT.md 3.2 资源系统：未使用资源保留不清零
 * - 技术设计文档 7.4：UI 以 cc.Graphics 代码绘制为主
 * - spec S.4.2：资源属工业建设类，用 INDUSTRY_PALETTE 暖色
 *
 * 局内无广告原则：本面板不包含任何广告位 / 加速 / 双倍入口。
 */
import { Graphics, Label, Color } from 'cc';
import { PanelBase, createNode, makeLabel, makeGraphicsNode, addEdgeWidget } from '../../core/node_factory';
import { drawPanel, drawResourceIcon, drawProgressBar } from '../../core/graphics_util';
import {
  INDUSTRY_PALETTE,
  NEUTRAL_PALETTE,
  RESOURCE_COLORS,
  FONT_SIZE,
  SPACING,
  RADIUS,
} from '../../core/ui_theme';
import type { ResourceBarShadow } from '../../core/shadow_reader';

const RESOURCE_ORDER = ['steel', 'oil', 'tungsten', 'rubber', 'aluminum', 'political'];

/** 单个资源项的渲染句柄 */
interface ResourceItemHandle {
  type: string;
  iconGfx: Graphics;
  valueLabel: Label;
  barGfx: Graphics;
  barWidth: number;
}

export class ResourcePanel extends PanelBase {
  private _items: ResourceItemHandle[] = [];
  private _values: { ratio: number; current: number; cap: number; type: string }[] = [];

  onMount(): void {
    const node = this.node!;
    const w = 480;
    const h = 360;
    node.setContentSize(w, h);
    addEdgeWidget(node, 'right', SPACING.LG, 0);

    const { graphics: bgGfx } = makeGraphicsNode(node, 'Bg', w, h);
    drawPanel(bgGfx, -w / 2, -h / 2, w, h, INDUSTRY_PALETTE.panelBg, NEUTRAL_PALETTE.border, RADIUS.PANEL);

    makeLabel(node, '资源详情', FONT_SIZE.TITLE, NEUTRAL_PALETTE.textPrimary, 'Title')
      .node.setPosition(0, h / 2 - SPACING.LG, 0);

    const colW = (w - SPACING.XL * 3) / 2;
    const rowH = 64;
    const startY = h / 2 - SPACING.XXL - FONT_SIZE.TITLE;
    const barW = colW - 40;

    for (let i = 0; i < RESOURCE_ORDER.length; i++) {
      const col = i % 2;
      const row = Math.floor(i / 2);
      const x = -w / 2 + SPACING.XL + colW / 2 + col * (colW + SPACING.XL);
      const y = startY - row * (rowH + SPACING.SM);

      const item = createNode(`Res_${RESOURCE_ORDER[i]}`, node);
      item.setPosition(x, y, 0);

      const icon = makeGraphicsNode(item, 'Icon', 24, 24);
      icon.node.setPosition(-colW / 2 + 16, 0, 0);
      drawResourceIcon(icon.graphics, -12, -12, 24, RESOURCE_COLORS[RESOURCE_ORDER[i]]);

      const { label } = makeLabel(item, '0 / 0', FONT_SIZE.CAPTION, NEUTRAL_PALETTE.textPrimary, 'Val');
      label.node.setPosition(8, 8, 0);

      const bar = makeGraphicsNode(item, 'Bar', barW, 8);
      bar.node.setPosition(8, -10, 0);
      drawProgressBar(bar.graphics, -barW / 2, -4, barW, 8, 0);

      this._items.push({
        type: RESOURCE_ORDER[i],
        iconGfx: icon.graphics,
        valueLabel: label,
        barGfx: bar.graphics,
        barWidth: barW,
      });
    }
  }

  update(shadow: ResourceBarShadow): void {
    this._values = shadow.items.map((it) => ({
      type: it.type,
      current: it.current,
      cap: it.cap,
      ratio: it.ratio,
    }));
    this.redraw();
  }

  private redraw(): void {
    for (const handle of this._items) {
      const v = this._values.find((x) => x.type === handle.type);
      if (!v) continue;
      drawResourceIcon(handle.iconGfx, -12, -12, 24, RESOURCE_COLORS[handle.type]);
      handle.valueLabel.string = `${Math.round(v.current)} / ${Math.round(v.cap)}`;
      let barColor: Color = INDUSTRY_PALETTE.resourceOk;
      if (v.ratio >= 0.95) barColor = NEUTRAL_PALETTE.success;
      else if (v.ratio < 0.2) barColor = NEUTRAL_PALETTE.warning;
      drawProgressBar(
        handle.barGfx,
        -handle.barWidth / 2,
        -4,
        handle.barWidth,
        8,
        v.ratio,
        NEUTRAL_PALETTE.bgMid,
        barColor,
      );
    }
  }
}
