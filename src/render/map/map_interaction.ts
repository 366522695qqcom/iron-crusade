/**
 * 地图交互（render/map/）
 *
 * 实现依据：
 * - PROJECT.md 3.4 建筑模式：选省份放置建筑
 * - PROJECT.md 3.7 战斗与拉线：画前线 → 下达攻势箭头
 * - M1 feature-grand-war：点击师团选择、点击省份下达移动/进攻命令
 * - 技术设计文档 1.5 render/ 目录：map/ 含拉线交互
 * - 技术设计文档 7.4：UI 以 cc.Graphics 代码绘制为主（攻势箭头实时绘制）
 * - spec S.2 脱敏：攻势箭头用 COMBAT_PALETTE（低饱和蓝灰），不用红
 *
 * 职责：
 * - 监听 MapView.rootNode 的触摸事件（touch-start / touch-move / touch-end）
 * - select 模式：优先命中己方师团（发 onDivisionClick），其次命中省份（发 onProvinceClick）；
 *   点击空白处取消选择（发 onCancelSelect）
 * - move 模式：已选师团后，点目标省份发出 onMoveOrder(provinceId)
 * - drawLine 模式：触摸开始记录起点，触摸移动实时绘制临时箭头，松手发出 onDrawLine
 * - placeBuilding 模式：点己方/管控省份发出 onProvinceClick
 */
import { Node, Graphics } from 'cc';
import { makeGraphicsNode } from '../core/node_factory';
import { DESIGN_WIDTH, DESIGN_HEIGHT, COMBAT_PALETTE } from '../core/ui_theme';
import type { MapView } from './map_view';

/** 地图交互模式 */
export type MapInteractionMode = 'select' | 'drawLine' | 'placeBuilding' | 'move';

interface TouchPoint { x: number; y: number; }

export class MapInteraction {
  private _mapView: MapView | null = null;
  private _mapRoot: Node | null = null;
  private _tempLine: Graphics | null = null;
  private _mode: MapInteractionMode = 'select';
  private _startPos: TouchPoint | null = null;
  private _playerCountryId = '';
  private _provinceClickCb: ((provinceId: number) => void) | null = null;
  private _drawLineCb: ((fromId: number, toId: number) => void) | null = null;
  private _divisionClickCb: ((divisionId: number, additive: boolean) => void) | null = null;
  private _cancelCb: (() => void) | null = null;
  private _moveOrderCb: ((provinceId: number) => void) | null = null;
  private _placeBuildingCb: ((provinceId: number) => void) | null = null;

  /** 挂载到 MapView，注册触摸事件 + 创建临时箭头图层 */
  mount(mapView: MapView): void {
    this._mapView = mapView;
    const mapRoot = mapView.rootNode;
    if (!mapRoot) return;
    this._mapRoot = mapRoot;
    const { graphics } = makeGraphicsNode(mapRoot, 'TempLine', 0, 0);
    this._tempLine = graphics;
    mapRoot.on('touch-start', this.onTouchStart, this);
    mapRoot.on('touch-move', this.onTouchMove, this);
    mapRoot.on('touch-end', this.onTouchEnd, this);
    mapRoot.on('touch-cancel', this.onTouchEnd, this);
  }

  /** 设置玩家国家ID，用于师团命中过滤 */
  setPlayerCountryId(countryId: string): void {
    this._playerCountryId = countryId;
  }

  setMode(mode: MapInteractionMode): void {
    this._mode = mode;
    this.clearTempLine();
    this._startPos = null;
  }

  get mode(): MapInteractionMode { return this._mode; }

  onProvinceClick(cb: (provinceId: number) => void): void {
    this._provinceClickCb = cb;
  }
  onDrawLine(cb: (fromId: number, toId: number) => void): void {
    this._drawLineCb = cb;
  }
  onDivisionClick(cb: (divisionId: number, additive: boolean) => void): void {
    this._divisionClickCb = cb;
  }
  onCancel(cb: () => void): void {
    this._cancelCb = cb;
  }
  onMoveOrder(cb: (provinceId: number) => void): void {
    this._moveOrderCb = cb;
  }
  onPlaceBuilding(cb: (provinceId: number) => void): void {
    this._placeBuildingCb = cb;
  }

  clearTempLine(): void {
    if (this._tempLine) this._tempLine.clear();
  }

  get mapRoot(): Node | null { return this._mapRoot; }

  private onTouchStart = (...args: unknown[]): void => {
    const pos = this.extractLocal(args);
    if (this._mode === 'drawLine') {
      this._startPos = pos;
    }
  };

  private onTouchMove = (...args: unknown[]): void => {
    if (this._mode !== 'drawLine' || !this._startPos) return;
    const pos = this.extractLocal(args);
    this.drawTempLine(this._startPos, pos);
  };

  private onTouchEnd = (...args: unknown[]): void => {
    const pos = this.extractLocal(args);
    if (this._mode === 'drawLine') {
      if (this._startPos && this._drawLineCb && this._mapView) {
        const from = this._mapView.hitTestProvince(this._startPos.x, this._startPos.y);
        const to = this._mapView.hitTestProvince(pos.x, pos.y);
        if (from && to && from.provinceId !== to.provinceId) {
          this._drawLineCb(from.provinceId, to.provinceId);
        }
      }
      this.clearTempLine();
      this._startPos = null;
      return;
    }

    if (!this._mapView) return;

    // move 模式：点省份 → 发移动命令；点空白退回 select
    if (this._mode === 'move') {
      const prov = this._mapView.hitTestProvince(pos.x, pos.y);
      if (prov) {
        this._moveOrderCb?.(prov.provinceId);
      } else {
        this.setMode('select');
        this._cancelCb?.();
      }
      return;
    }

    // placeBuilding 模式：点省份 → 发放置回调；点空白取消建造模式
    if (this._mode === 'placeBuilding') {
      const prov = this._mapView.hitTestProvince(pos.x, pos.y);
      if (prov && prov.isPlayerControlled) {
        this._placeBuildingCb?.(prov.provinceId);
      } else if (!prov) {
        this.setMode('select');
        this._cancelCb?.();
      }
      return;
    }

    // select：优先命中师团，再命中省份
    if (this._playerCountryId) {
      const div = this._mapView.hitTestDivision(pos.x, pos.y, this._playerCountryId);
      if (div) {
        this._divisionClickCb?.(div.divisionId, false);
        return;
      }
    }

    const prov = this._mapView.hitTestProvince(pos.x, pos.y);
    if (prov) {
      this._provinceClickCb?.(prov.provinceId);
    } else {
      this._cancelCb?.();
    }
  };

  /**
   * 从触摸事件参数中提取 MapRoot 局部坐标。
   * 骨架阶段：MapRoot 居中铺满，事件 getLocation 返回左下原点屏幕坐标，
   * 减去设计分辨率半宽/半高即得到中心原点的局部坐标。
   */
  private extractLocal(args: unknown[]): TouchPoint {
    const evt = args[0] as { getLocation?: () => TouchPoint } | undefined;
    if (evt && typeof evt.getLocation === 'function') {
      const p = evt.getLocation();
      return { x: p.x - DESIGN_WIDTH / 2, y: p.y - DESIGN_HEIGHT / 2 };
    }
    return { x: 0, y: 0 };
  }

  private drawTempLine(from: TouchPoint, to: TouchPoint): void {
    const g = this._tempLine;
    if (!g) return;
    g.clear();
    g.strokeColor = COMBAT_PALETTE.primary;
    g.lineWidth = 4;
    g.moveTo(from.x, from.y);
    g.lineTo(to.x, to.y);
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
}
