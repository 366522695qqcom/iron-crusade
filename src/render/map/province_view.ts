/**
 * 省份视图（render/map/）
 *
 * 实现依据：
 * - PROJECT.md 3.4.1 建筑模式：地图高亮可建造省份（己方核心区绿色、管控区黄色、不可建灰色）
 * - PROJECT.md 3.7 战斗与拉线：省份是拉线/攻势的起点和终点
 * - PROJECT.md 4.5 真实国界：城市用代号（P-{id}），不使用真实地名
 * - 技术设计文档 7.3 地图数据：矢量轮廓简化至 <500KB，等积投影
 * - 技术设计文档 7.4：UI 以 cc.Graphics 代码绘制为主（占位圆点 + 代号标签，无纹理）
 * - spec S.2 脱敏：管控色用黄（COMBAT_PALETTE.controlled）不用红
 *
 * 职责：
 * - 单省份的 Graphics 绘制：占位圆点 + provinceId 代号标签 + 状态高亮
 * - 状态：normal / owned（己方核心区绿色）/ controlled（管控区黄色）
 *         / selectable（可建造绿色）/ unselectable（不可建灰色）
 * - 提供 setHighlight(state) 接口
 * - 提供 onClick 回调注册（实际事件路由到 map_interaction）
 *
 * 注：骨架阶段轮廓为占位圆点；真实国界矢量数据后续从 configs/map_*.json 加载后，
 *     redraw 改为 Graphics.drawPolygon 绘制省份多边形（技术设计文档 7.3）。
 *     selectable 的脉冲动画待 Component update 接入后补全，骨架先用加粗描边区分。
 *     点击事件由 map_interaction 在 MapRoot 上统一监听 + hit-test 后回调本类 onClick，
 *     骨架未实现 hit-test，故 onClick 暂为注册钩子（见 map_interaction 注释）。
 */
import { Node, Graphics, Color, tween, Tween, UIOpacity } from 'cc';
import { createNode, makeGraphicsNode, makeLabel } from '../core/node_factory';
import {
  NEUTRAL_PALETTE,
  INDUSTRY_PALETTE,
  COMBAT_PALETTE,
  FONT_SIZE,
} from '../core/ui_theme';

/** 占位圆点半径（px），真实轮廓接入后弃用 */
const PROVINCE_RADIUS = 12;

/** 脉冲动画周期（秒） */
const PULSE_PERIOD = 0.8;

/** 省份高亮状态 */
export type ProvinceHighlightState =
  | 'normal'
  | 'owned'
  | 'controlled'
  | 'selectable'
  | 'unselectable'
  | 'moveTarget'
  | 'attackTarget'
  | 'buildable';

interface HighlightStyle {
  fill: Color;
  stroke: Color;
  lineWidth: number;
}

/**
 * 省份视图
 *
 * 不继承 Component：mount/setHighlight/setPosition 由 MapView 驱动，
 * 避免每省份一个脚本组件带来的开销（省份可达数百）。
 */
export class ProvinceView {
  private _provinceId: number;
  private _node: Node | null = null;
  private _graphics: Graphics | null = null;
  private _state: ProvinceHighlightState = 'normal';
  /** 点击回调（由 map_interaction hit-test 命中后派发，骨架阶段为注册钩子） */
  private _onClickCb: ((provinceId: number) => void) | null = null;
  private _pulseTween: Tween<UIOpacity> | null = null;
  private _uiOpacity: UIOpacity | null = null;
  private _pulsing = false;

  constructor(provinceId: number) {
    this._provinceId = provinceId;
  }

  get provinceId(): number {
    return this._provinceId;
  }

  /** 挂载到父节点（通常是 MapRoot），返回省份根节点 */
  mount(parent: Node): Node {
    if (this._node) return this._node;
    const node = createNode(`Province_${this._provinceId}`, parent);
    this._node = node;
    this._uiOpacity = node.addComponent(UIOpacity);
    // 占位圆点图层（代码绘制，无纹理）
    const { graphics } = makeGraphicsNode(
      node,
      'Dot',
      PROVINCE_RADIUS * 2,
      PROVINCE_RADIUS * 2,
    );
    this._graphics = graphics;
    // 省份代号标签（P-{id}，PROJECT.md 4.5 城市用代号），置于圆点下方
    makeLabel(
      node,
      `P-${this._provinceId}`,
      FONT_SIZE.CAPTION,
      NEUTRAL_PALETTE.textSecondary,
      'IdLabel',
    ).node.setPosition(0, -PROVINCE_RADIUS - 10, 0);
    this.redraw();
    return node;
  }

  /** 设置高亮状态，触发重绘 */
  setHighlight(state: ProvinceHighlightState): void {
    if (this._state === state) return;
    this._state = state;
    this.redraw();
  }

  /** 启动建造模式脉冲动画（selectable 状态使用） */
  startBuildablePulse(): void {
    if (this._pulsing || !this._uiOpacity) return;
    this._pulsing = true;
    this._uiOpacity.opacity = 255;
    this._pulseTween = tween(this._uiOpacity)
      .to(PULSE_PERIOD / 2, { opacity: 102 }, { easing: 'sineOut' })
      .to(PULSE_PERIOD / 2, { opacity: 255 }, { easing: 'sineIn' })
      .union()
      .repeatForever()
      .start();
  }

  /** 停止建造模式脉冲动画，恢复正常透明度 */
  stopBuildablePulse(): void {
    if (!this._pulsing) return;
    this._pulsing = false;
    if (this._pulseTween) {
      this._pulseTween.stop();
      this._pulseTween = null;
    }
    if (this._uiOpacity) {
      this._uiOpacity.opacity = 255;
    }
  }

  /** 设置省份在 MapRoot 局部坐标的位置（由 MapView 占位布局调用） */
  setPosition(x: number, y: number): void {
    if (this._node) this._node.setPosition(x, y, 0);
  }

  /** 取省份在父节点（MapRoot）局部坐标 */
  getPosition(): { x: number; y: number } {
    if (!this._node) return { x: 0, y: 0 };
    return { x: this._node.position.x, y: this._node.position.y };
  }

  /**
   * 注册点击回调（事件实际由 map_interaction 统一路由）。
   * 骨架阶段 hit-test 未实现，本钩子暂不自动触发；
   * 正式实现由 map_interaction 解析命中省份后调用。
   */
  onClick(cb: (provinceId: number) => void): void {
    this._onClickCb = cb;
  }

  /** 供 map_interaction 命中后派发点击（骨架阶段预留） */
  fireClick(): void {
    if (this._onClickCb) this._onClickCb(this._provinceId);
  }

  private redraw(): void {
    const g = this._graphics;
    if (!g) return;
    const style = this.styleForState(this._state);
    g.clear();
    g.fillColor = style.fill;
    g.strokeColor = style.stroke;
    g.lineWidth = style.lineWidth;
    g.circle(0, 0, PROVINCE_RADIUS);
    g.fill();
    g.stroke();
  }

  private styleForState(state: ProvinceHighlightState): HighlightStyle {
    switch (state) {
      case 'owned':
        return {
          fill: INDUSTRY_PALETTE.resourceOk,
          stroke: NEUTRAL_PALETTE.textPrimary,
          lineWidth: 2,
        };
      case 'controlled':
        return {
          fill: COMBAT_PALETTE.controlled,
          stroke: NEUTRAL_PALETTE.textPrimary,
          lineWidth: 2,
        };
      case 'selectable':
        return {
          fill: INDUSTRY_PALETTE.primary,
          stroke: INDUSTRY_PALETTE.resourceOk,
          lineWidth: 4,
        };
      case 'unselectable':
        return {
          fill: NEUTRAL_PALETTE.textDisabled,
          stroke: NEUTRAL_PALETTE.border,
          lineWidth: 1,
        };
      case 'moveTarget':
        return {
          fill: INDUSTRY_PALETTE.resourceOk,
          stroke: INDUSTRY_PALETTE.primary,
          lineWidth: 3,
        };
      case 'attackTarget':
        return {
          fill: COMBAT_PALETTE.controlled,
          stroke: NEUTRAL_PALETTE.warning,
          lineWidth: 3,
        };
      case 'buildable':
        return {
          fill: INDUSTRY_PALETTE.primary,
          stroke: INDUSTRY_PALETTE.resourceOk,
          lineWidth: 3,
        };
      case 'normal':
      default:
        return {
          fill: NEUTRAL_PALETTE.border,
          stroke: NEUTRAL_PALETTE.textSecondary,
          lineWidth: 1,
        };
    }
  }
}
