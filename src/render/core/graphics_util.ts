/**
 * cc.Graphics 代码绘制工具（render/ 层共用）
 *
 * 实现依据：技术设计文档 7.4：UI 以 cc.Graphics 代码绘制为主，严控纹理资源量
 *
 * 提供面板/按钮/卡牌/角标/进度条的代码绘制辅助函数，避免重复样板代码。
 * 所有函数操作传入的 Graphics 组件，不创建新节点（节点创建由 node_factory 负责）。
 */
import { Graphics, Color } from 'cc';
import { RADIUS, NEUTRAL_PALETTE } from './ui_theme';

export function colorEquals(a: Color, b: Color): boolean {
  return a.r === b.r && a.g === b.g && a.b === b.b && a.a === b.a;
}

/** 绘制圆角矩形面板（带填充 + 边框） */
export function drawPanel(
  g: Graphics,
  x: number,
  y: number,
  w: number,
  h: number,
  fill: Color,
  border: Color = NEUTRAL_PALETTE.border,
  radius: number = RADIUS.PANEL,
  borderWidth: number = 2,
): void {
  g.clear();
  g.lineWidth = borderWidth;
  g.strokeColor = border;
  g.fillColor = fill;
  g.roundRect(x, y, w, h, radius);
  g.fill();
  g.stroke();
}

/** 绘制实心按钮（圆角矩形 + 文字由调用方另加 Label） */
export function drawButton(
  g: Graphics,
  x: number,
  y: number,
  w: number,
  h: number,
  fill: Color,
  pressed: Color,
  radius: number = RADIUS.BUTTON,
  isPressed: boolean = false,
): void {
  g.clear();
  g.lineWidth = 1;
  g.strokeColor = NEUTRAL_PALETTE.border;
  g.fillColor = isPressed ? pressed : fill;
  g.roundRect(x, y, w, h, radius);
  g.fill();
  g.stroke();
}

/** 绘制卡牌（圆角矩形 + 顶部高亮条） */
export function drawCard(
  g: Graphics,
  x: number,
  y: number,
  w: number,
  h: number,
  bg: Color,
  accent: Color,
  radius: number = RADIUS.CARD,
): void {
  g.clear();
  // 卡牌底
  g.lineWidth = 1;
  g.strokeColor = NEUTRAL_PALETTE.border;
  g.fillColor = bg;
  g.roundRect(x, y, w, h, radius);
  g.fill();
  g.stroke();
  // 顶部高亮条（accent 色，高 6px）
  g.fillColor = accent;
  g.roundRect(x, y + h - 6, w, 6, radius);
  g.fill();
}

/** 绘制进度条（背景 + 前景比例） */
export function drawProgressBar(
  g: Graphics,
  x: number,
  y: number,
  w: number,
  h: number,
  ratio: number,
  bg: Color = NEUTRAL_PALETTE.bgMid,
  fg: Color = NEUTRAL_PALETTE.success,
  radius: number = 4,
): void {
  g.clear();
  // 背景
  g.fillColor = bg;
  g.roundRect(x, y, w, h, radius);
  g.fill();
  // 前景（按 ratio 裁剪宽度）
  const fgW = Math.max(0, Math.min(1, ratio)) * w;
  if (fgW > 0) {
    g.fillColor = fg;
    g.roundRect(x, y, fgW, h, radius);
    g.fill();
  }
}

/** 绘制圆形角标（如空闲工厂数量） */
export function drawBadge(
  g: Graphics,
  cx: number,
  cy: number,
  r: number,
  fill: Color = NEUTRAL_PALETTE.warning,
): void {
  g.clear();
  g.fillColor = fill;
  g.circle(cx, cy, r);
  g.fill();
}

/** 绘制资源图标占位（小方块 + 资源色，避免纹理依赖） */
export function drawResourceIcon(
  g: Graphics,
  x: number,
  y: number,
  size: number,
  color: Color,
): void {
  g.clear();
  g.fillColor = color;
  g.lineWidth = 1;
  g.strokeColor = NEUTRAL_PALETTE.border;
  g.roundRect(x, y, size, size, 4);
  g.fill();
  g.stroke();
}

/** 绘制遮罩层（半透明黑，新手引导/暂停遮罩用） */
export function drawOverlay(
  g: Graphics,
  x: number,
  y: number,
  w: number,
  h: number,
  alpha: number = 0.7,
): void {
  g.clear();
  g.fillColor = new Color(0, 0, 0, alpha);
  g.rect(x, y, w, h);
  g.fill();
}

/** 绘制高亮框（新手引导聚焦目标） */
export function drawHighlightFrame(
  g: Graphics,
  x: number,
  y: number,
  w: number,
  h: number,
  color: Color = NEUTRAL_PALETTE.success,
  lineWidth: number = 4,
): void {
  g.clear();
  g.lineWidth = lineWidth;
  g.strokeColor = color;
  g.roundRect(x, y, w, h, RADIUS.BUTTON);
  g.stroke();
}
