/**
 * 地图交互（render/map/）
 *
 * 实现依据：
 * - PROJECT.md 3.4 建筑模式：选省份放置建筑
 * - PROJECT.md 3.7 战斗与拉线：画前线 → 下达攻势箭头
 * - 技术设计文档 1.5 render/ 目录：map/ 含拉线交互
 * - 技术设计文档 7.4：UI 以 cc.Graphics 代码绘制为主（攻势箭头实时绘制）
 * - spec S.2 脱敏：攻势箭头用 COMBAT_PALETTE（低饱和蓝灰），不用红
 *
 * 职责：
 * - 监听 MapView 节点的触摸事件（touch-start / touch-move / touch-end）
 * - 触摸开始：记录起点（拉线模式）
 * - 触摸移动：绘制临时攻势箭头（Graphics.moveTo/lineTo）
 * - 触摸结束：发出 onProvinceClick(provinceId) 或 onDrawLine(fromId, toId) 回调
 * - 提供 setMode('select' | 'drawLine' | 'placeBuilding') 接口
 *
 * 注：骨架阶段只做事件路由 + 回调注册，不做实际 hit-test（点-in-polygon）。
 *     因此 touch-end 派发的 provinceId 暂以 -1 占位，正式实现替换为
 *     MapView.getProvinceView + 点-in-polygon 命中查询。
 */
import { Node, Graphics } from 'cc';
import { makeGraphicsNode } from '../core/node_factory';
import { COMBAT_PALETTE } from '../core/ui_theme';

/** 地图交互模式 */
export type MapInteractionMode = 'select' | 'drawLine' | 'placeBuilding';

/** 触摸点（屏幕/世界坐标，骨架阶段未做节点空间转换） */
interface TouchPoint {
  x: number;
  y: number;
}

/**
 * 地图交互
 *
 * 集中监听 MapRoot 触摸事件，按当前模式派发回调。
 * 拉线模式下用临时 Graphics 图层实时绘制攻势箭头，松手后清除并发出 onDrawLine。
 */
export class MapInteraction {
  private _mapRoot: Node | null = null;
  private _tempLine: Graphics | null = null;
  private _mode: MapInteractionMode = 'select';
  private _startPos: TouchPoint | null = null;
  private _provinceClickCb: ((provinceId: number) => void) | null = null;
  private _drawLineCb: ((fromId: number, toId: number) => void) | null = null;

  /** 挂载到 MapRoot，注册触摸事件 + 创建临时箭头图层 */
  mount(mapRoot: Node): void {
    this._mapRoot = mapRoot;
    // 临时攻势箭头图层（drawLine 模式下实时绘制，松手清除）
    const { graphics } = makeGraphicsNode(mapRoot, 'TempLine', 0, 0);
    this._tempLine = graphics;
    mapRoot.on('touch-start', this.onTouchStart, this);
    mapRoot.on('touch-move', this.onTouchMove, this);
    mapRoot.on('touch-end', this.onTouchEnd, this);
  }

  /** 切换交互模式，切换时清空临时拉线与起点 */
  setMode(mode: MapInteractionMode): void {
    this._mode = mode;
    this.clearTempLine();
    this._startPos = null;
  }

  /** 注册省份点击回调（select / placeBuilding 模式下派发） */
  onProvinceClick(cb: (provinceId: number) => void): void {
    this._provinceClickCb = cb;
  }

  /** 注册拉线回调（drawLine 模式下派发） */
  onDrawLine(cb: (fromId: number, toId: number) => void): void {
    this._drawLineCb = cb;
  }

  /** 清除临时攻势箭头 */
  clearTempLine(): void {
    if (this._tempLine) this._tempLine.clear();
  }

  /** 暴露地图根节点（供外部访问器对齐） */
  get mapRoot(): Node | null {
    return this._mapRoot;
  }

  private onTouchStart = (...args: unknown[]): void => {
    if (this._mode !== 'drawLine') return;
    this._startPos = this.extractPos(args);
  };

  private onTouchMove = (...args: unknown[]): void => {
    if (this._mode !== 'drawLine' || !this._startPos) return;
    const pos = this.extractPos(args);
    this.drawTempLine(this._startPos, pos);
  };

  private onTouchEnd = (): void => {
    if (this._mode === 'drawLine') {
      if (this._startPos && this._drawLineCb) {
        // 骨架阶段未实现 hit-test，from/to 传 -1 表示待 point-in-polygon 解析
        this._drawLineCb(-1, -1);
      }
      this.clearTempLine();
      this._startPos = null;
    } else {
      // select / placeBuilding：单击选省份
      if (this._provinceClickCb) {
        // 骨架阶段未实现 hit-test，provinceId 传 -1 表示待命中解析
        this._provinceClickCb(-1);
      }
    }
  };

  /**
   * 绘制临时攻势箭头（起点 → 当前触摸点 + 箭头头部）。
   * 色彩用 COMBAT_PALETTE.primary（S.2 脱敏：低饱和蓝灰，不用红）。
   */
  private drawTempLine(from: TouchPoint, to: TouchPoint): void {
    const g = this._tempLine;
    if (!g) return;
    g.clear();
    g.strokeColor = COMBAT_PALETTE.primary;
    g.lineWidth = 4;
    // 主线段
    g.moveTo(from.x, from.y);
    g.lineTo(to.x, to.y);
    // 箭头头部（简易两翼三角）
    const angle = Math.atan2(to.y - from.y, to.x - from.x);
    const headLen = 14;
    const a1 = angle + Math.PI - 0.4;
    const a2 = angle + Math.PI + 0.4;
    g.moveTo(to.x, to.y);
    g.lineTo(to.x + headLen * Math.cos(a1), to.y + headLen * Math.sin(a1));
    g.moveTo(to.x, to.y);
    g.lineTo(to.x + headLen * Math.cos(a2), to.y + headLen * Math.sin(a2));
    g.stroke();
  }

  /** 从触摸事件参数中提取位置（兼容 cc EventTouch.getLocation()） */
  private extractPos(args: unknown[]): TouchPoint {
    const evt = args[0] as { getLocation?: () => TouchPoint } | undefined;
    if (evt && typeof evt.getLocation === 'function') return evt.getLocation();
    return { x: 0, y: 0 };
  }
}
