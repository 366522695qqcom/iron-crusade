/**
 * 地图根节点（render/map/）
 *
 * 实现依据：
 * - PROJECT.md 3.1 核心循环：地图是主舞台，玩家在地图上选省份/拉线/建造
 * - PROJECT.md 4.5 地图（真实国界）：照搬真实世界国界矢量，省份内抽象化划分，城市用代号
 * - 技术设计文档 7.3 地图数据：矢量轮廓简化至 <500KB，等积投影
 * - 技术设计文档 7.4：UI 以 cc.Graphics 代码绘制为主
 * - spec S.2 脱敏：管控区用 COMBAT_PALETTE.controlled（黄），不用红
 * - M1 feature-grand-war：师团标记 + 战斗泡泡
 *
 * 职责：
 * - 装配地图根节点（MapRoot），后续省份/拉线/选区/师团/泡泡作为子节点
 * - 提供 buildMap(state) 接口：遍历 state.provinces 创建 ProvinceView
 * - 提供 highlightCountry(countryId) / clearHighlight() 接口
 * - 提供 updateDivisions(views) / updateBubbles(views) 接口渲染师团与战斗泡泡
 * - 不做交互逻辑（交互由 map_interaction.ts 负责）
 * - 不修改 core/：仅只读 WorldState（设计约束 #4）
 *
 * 局内无广告/无数值购买入口约束（设计约束 #1）：本模块纯地图渲染，
 * 不挂载任何商店/广告/数值购买节点。
 *
 * 地图矢量数据来源：未来从 configs/map_*.json 加载，骨架阶段先用占位坐标
 * （圆点 + provinceId 代号），按省份数量方阵居中排布。
 */
import { Node } from 'cc';
import { createNode, addFullWidget } from '../core/node_factory';
import { DESIGN_WIDTH, DESIGN_HEIGHT } from '../core/ui_theme';
import { WorldState, Province } from '../../core/state/world_state';
import { ProvinceView } from './province_view';
import { DivisionMarker } from './division_marker';
import { CombatBubble } from './combat_bubble';
import type { MapDivisionView, CombatBubbleView } from '../core/shadow_reader';

/** 省份圆点命中半径（px），与 province_view.ts 中 PROVINCE_RADIUS 对应 */
const PROVINCE_HIT_RADIUS = 18;

/** 师团叠放偏移（同省多师团） */
const MARKER_OFFSETS: Array<{ dx: number; dy: number }> = [
  { dx: 0, dy: 14 },
  { dx: -14, dy: 14 },
  { dx: 14, dy: 14 },
  { dx: -28, dy: 14 },
  { dx: 28, dy: 14 },
  { dx: -14, dy: -4 },
  { dx: 14, dy: -4 },
];

/**
 * 地图根视图
 *
 * 装配 MapRoot 节点并管理 ProvinceView 集合。交互逻辑（选省/拉线/建造）由
 * map_interaction.ts 监听 MapRoot 触摸事件实现，本类只负责装配与高亮。
 */
export class MapView {
  private _rootNode: Node | null = null;
  private _state: WorldState | null = null;
  private _views: Map<number, ProvinceView> = new Map();
  private _divLayer: Node | null = null;
  private _bubbleLayer: Node | null = null;
  private _markers: Map<number, DivisionMarker> = new Map();
  private _bubbles: Map<number, CombatBubble> = new Map();

  /** 创建 MapRoot 节点，addFullWidget 铺满父节点，返回根节点 */
  mount(parent: Node): Node {
    if (this._rootNode) return this._rootNode;
    const root = createNode('MapRoot', parent);
    addFullWidget(root);
    this._rootNode = root;
    // 师团标记层（在省份之上）
    this._divLayer = createNode('DivLayer', root);
    // 战斗泡泡层（在师团之上）
    this._bubbleLayer = createNode('BubbleLayer', root);
    return root;
  }

  /**
   * 遍历 state.provinces 创建 ProvinceView 并挂载到 MapRoot。
   * 骨架阶段用方阵占位坐标排布；真实国界矢量接入后改读 configs/map_*.json。
   */
  buildMap(state: WorldState): void {
    const root = this._rootNode;
    if (!root || this._views.size > 0) return; // 未 mount 或已构建则跳过
    this._state = state;
    const total = state.provinces.size();
    let index = 0;
    state.provinces.forEach((p: Province) => {
      const view = new ProvinceView(p.id);
      view.mount(root);
      const pos = this.layoutPlaceholder(total, index);
      view.setPosition(pos.x, pos.y);
      this._views.set(p.id, view);
      index++;
    });
  }

  /**
   * 高亮指定国家的省份：主权省份绿色（owned），管控省份黄色（controlled，S.2），
   * 其余归 normal。
   */
  highlightCountry(countryId: string): void {
    const state = this._state;
    if (!state) return;
    this._views.forEach((view) => {
      const province = state.provinces.get(view.provinceId);
      if (!province) return;
      if (province.ownerId === countryId) {
        view.setHighlight('owned');
      } else if (province.controllerId === countryId) {
        view.setHighlight('controlled');
      } else {
        view.setHighlight('normal');
      }
    });
  }

  /** 清除所有省份高亮，回归 normal */
  clearHighlight(): void {
    this._views.forEach((view) => {
      view.setHighlight('normal');
    });
  }

  /** 按 provinceId 取省份视图，不存在返回 null */
  getProvinceView(provinceId: number): ProvinceView | null {
    return this._views.get(provinceId) ?? null;
  }

  /** 进入建造模式：高亮己方有空闲槽位的省份为 buildable（脉冲），己方无槽位为 owned/controlled，敌方为 unselectable */
  startBuildMode(countryId: string): void {
    this.showBuildTargets(countryId);
  }

  /** 退出建造模式：停止所有脉冲，恢复默认国家高亮 */
  stopBuildMode(countryId: string): void {
    this.clearBuildTargets(countryId);
  }

  /** 更新师团标记 */
  updateDivisions(views: MapDivisionView[], playerCountryId: string): void {
    if (!this._divLayer) return;
    const byProvince = new Map<number, MapDivisionView[]>();
    for (const v of views) {
      if (v.status === 'training') continue;
      let arr = byProvince.get(v.provinceId);
      if (!arr) { arr = []; byProvince.set(v.provinceId, arr); }
      arr.push(v);
    }
    const seen = new Set<number>();
    byProvince.forEach((divs, provId) => {
      const pView = this._views.get(provId);
      const basePos = pView ? this.getProvincePos(provId) : { x: 0, y: 0 };
      divs.forEach((dv, idx) => {
        seen.add(dv.divisionId);
        let marker = this._markers.get(dv.divisionId);
        if (!marker) {
          marker = new DivisionMarker(dv.divisionId);
          marker.mount(this._divLayer!, dv.ownerId === playerCountryId, dv.ownerId);
          this._markers.set(dv.divisionId, marker);
        }
        const off = MARKER_OFFSETS[Math.min(idx, MARKER_OFFSETS.length - 1)];
        marker.setPosition(basePos.x + off.dx, basePos.y + off.dy + 16);
        marker.update(dv, dv.ownerId === playerCountryId);
      });
    });
    this._markers.forEach((m, id) => {
      if (!seen.has(id)) { m.destroy(); this._markers.delete(id); }
    });
  }

  /** 更新战斗泡泡 */
  updateCombatBubbles(bubbles: CombatBubbleView[]): void {
    if (!this._bubbleLayer) return;
    const seen = new Set<number>();
    for (const b of bubbles) {
      seen.add(b.provinceId);
      let bubble = this._bubbles.get(b.provinceId);
      if (!bubble) {
        bubble = new CombatBubble(b.provinceId);
        bubble.mount(this._bubbleLayer);
        this._bubbles.set(b.provinceId, bubble);
      }
      const pos = this.getProvincePos(b.provinceId);
      bubble.setPosition(pos.x, pos.y);
      bubble.update(b);
    }
    this._bubbles.forEach((b, id) => {
      if (!seen.has(id)) { b.destroy(); this._bubbles.delete(id); }
    });
  }

  /** 高亮某省份为选中（师团点击） */
  setProvinceSelected(provinceId: number | null): void {
    this._views.forEach((v) => {
      if (v.provinceId === provinceId) {
        v.setHighlight('selectable');
      } else {
        if (this._state) {
          const p = this._state.provinces.get(v.provinceId);
          const pid = this._getCurrentPlayerId();
          if (p && pid) {
            if (p.ownerId === pid) v.setHighlight('owned');
            else if (p.controllerId === pid) v.setHighlight('controlled');
            else v.setHighlight('normal');
          }
        }
      }
    });
  }

  /**
   * 进入移动命令模式：高亮选中师团所有相邻省份为合法目标。
   * - 己方控制 → moveTarget（绿色）
   * - 敌方/中立 → attackTarget（黄色带警告描边）
   */
  showMoveTargets(selectedDivisionIds: number[], playerCountryId: string): void {
    const state = this._state;
    if (!state) return;
    const targetProvIds = new Set<number>();
    for (const divId of selectedDivisionIds) {
      const div = state.divisions.get(divId);
      if (!div || div.ownerId !== playerCountryId) continue;
      if (div.status === 'fighting' || div.status === 'training' || div.status === 'retreating') continue;
      const curProv = state.provinces.get(div.currentProvinceId);
      if (!curProv) continue;
      for (const adjId of curProv.adjacentProvinceIds) {
        targetProvIds.add(adjId);
      }
    }
    this._views.forEach((v) => {
      const p = state.provinces.get(v.provinceId);
      if (!p) return;
      if (targetProvIds.has(v.provinceId)) {
        const isFriendly = p.controllerId === playerCountryId;
        v.setHighlight(isFriendly ? 'moveTarget' : 'attackTarget');
        v.startBuildablePulse();
      } else {
        v.stopBuildablePulse();
        if (p.ownerId === playerCountryId) v.setHighlight('owned');
        else if (p.controllerId === playerCountryId) v.setHighlight('controlled');
        else v.setHighlight('normal');
      }
    });
  }

  /** 退出移动命令模式：恢复默认的国家高亮 */
  clearMoveTargets(playerCountryId: string): void {
    this._views.forEach((v) => {
      v.stopBuildablePulse();
      if (!this._state) return;
      const p = this._state.provinces.get(v.provinceId);
      if (!p) return;
      if (p.ownerId === playerCountryId) v.setHighlight('owned');
      else if (p.controllerId === playerCountryId) v.setHighlight('controlled');
      else v.setHighlight('normal');
    });
  }

  /**
   * 进入建造放置模式：高亮己方有空闲建筑槽位的省份。
   * 槽位占用 = 该省已建成 + 建造中建筑数 < buildingSlots。
   */
  showBuildTargets(playerCountryId: string): void {
    const state = this._state;
    if (!state) return;
    // 统计每省建筑数（含建造中）
    const buildingCountByProv = new Map<number, number>();
    state.buildings.forEach((b) => {
      buildingCountByProv.set(b.provinceId, (buildingCountByProv.get(b.provinceId) ?? 0) + 1);
    });
    this._views.forEach((v) => {
      const p = state.provinces.get(v.provinceId);
      if (!p) return;
      const count = buildingCountByProv.get(v.provinceId) ?? 0;
      const canBuild = p.controllerId === playerCountryId && count < p.buildingSlots;
      if (canBuild) {
        v.setHighlight('buildable');
        v.startBuildablePulse();
      } else {
        v.stopBuildablePulse();
        if (p.ownerId === playerCountryId) v.setHighlight('owned');
        else if (p.controllerId === playerCountryId) v.setHighlight('controlled');
        else v.setHighlight('normal');
      }
    });
  }

  /** 退出建造放置模式 */
  clearBuildTargets(playerCountryId: string): void {
    this._views.forEach((v) => {
      v.stopBuildablePulse();
      if (!this._state) return;
      const p = this._state.provinces.get(v.provinceId);
      if (!p) return;
      if (p.ownerId === playerCountryId) v.setHighlight('owned');
      else if (p.controllerId === playerCountryId) v.setHighlight('controlled');
      else v.setHighlight('normal');
    });
  }

  private _getCurrentPlayerId(): string | null {
    if (!this._state) return null;
    let pid: string | null = null;
    this._state.countries.forEach((c) => { if (c.isPlayer && pid === null) pid = c.id; });
    return pid;
  }

  /** 取省份在 MapRoot 的局部坐标 */
  getProvincePos(provinceId: number): { x: number; y: number } {
    const v = this._views.get(provinceId);
    if (!v) return { x: 0, y: 0 };
    return v.getPosition();
  }

  /** 获取 MapRoot 节点（供 MapInteraction 做坐标转换） */
  get rootNode(): Node | null {
    return this._rootNode;
  }

  /**
   * 命中检测：给定 MapRoot 局部坐标，返回命中的玩家师团（优先于省份）。
   * 仅返回己方师团，敌方师团不可选。
   */
  hitTestDivision(lx: number, ly: number, playerCountryId: string): DivisionMarker | null {
    let found: DivisionMarker | null = null;
    let bestY = -Infinity;
    this._markers.forEach((m) => {
      if (!m.isPlayer || m.ownerId !== playerCountryId) return;
      if (m.containsPoint(lx, ly)) {
        // 同位置多个师团时选最靠上（y 更大，视觉更靠前）的
        const my = m.node?.position.y ?? -Infinity;
        if (my > bestY) {
          bestY = my;
          found = m;
        }
      }
    });
    return found;
  }

  /**
   * 命中检测：给定 MapRoot 局部坐标，返回命中的省份。
   * 骨架阶段以圆点半径做圆形命中，真实国界接入后替换为 point-in-polygon。
   */
  hitTestProvince(lx: number, ly: number): { provinceId: number; isPlayerControlled: boolean } | null {
    let hit: ProvinceView | null = null;
    let bestDist = PROVINCE_HIT_RADIUS * PROVINCE_HIT_RADIUS;
    for (const v of this._views.values()) {
      const p = v.getPosition();
      const dx = lx - p.x;
      const dy = ly - p.y;
      const d2 = dx * dx + dy * dy;
      if (d2 <= bestDist) {
        bestDist = d2;
        hit = v;
      }
    }
    if (!hit) return null;
    const pid = this._getCurrentPlayerId();
    const prov = this._state?.provinces.get(hit.provinceId);
    const isPlayerControlled = !!(pid && prov && prov.controllerId === pid);
    return { provinceId: hit.provinceId, isPlayerControlled };
  }

  /** 获取当前所有师团标记（只读访问） */
  get markers(): ReadonlyMap<number, DivisionMarker> {
    return this._markers;
  }

  /**
   * 占位方阵布局：按省份总数开方取列数，居中排布在 MapRoot 局部坐标原点周围。
   * 真实国界矢量接入后由 configs/map_*.json 的投影坐标替代。
   */
  private layoutPlaceholder(count: number, index: number): { x: number; y: number } {
    const cols = Math.max(1, Math.ceil(Math.sqrt(Math.max(1, count))));
    const rows = Math.max(1, Math.ceil(count / cols));
    // 间距按设计分辨率与行列数自适应，保证占位点落在可视区内
    const spacing = Math.min(DESIGN_WIDTH, DESIGN_HEIGHT) / (Math.max(cols, rows) + 2);
    const col = index % cols;
    const row = Math.floor(index / cols);
    const offsetX = ((cols - 1) * spacing) / 2;
    const offsetY = ((rows - 1) * spacing) / 2;
    // row=0 在顶部 → y 正方向（Cocos UI Y 轴向上）
    return { x: col * spacing - offsetX, y: (rows - 1 - row) * spacing - offsetY };
  }
}
