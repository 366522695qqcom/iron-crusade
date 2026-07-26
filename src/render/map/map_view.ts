/**
 * 地图根节点（render/map/）
 *
 * 实现依据：
 * - PROJECT.md 3.1 核心循环：地图是主舞台，玩家在地图上选省份/拉线/建造
 * - PROJECT.md 4.5 地图（真实国界）：照搬真实世界国界矢量，省份内抽象化划分，城市用代号
 * - 技术设计文档 7.3 地图数据：矢量轮廓简化至 <500KB，等积投影
 * - 技术设计文档 7.4：UI 以 cc.Graphics 代码绘制为主
 * - spec S.2 脱敏：管控区用 COMBAT_PALETTE.controlled（黄），不用红
 *
 * 职责：
 * - 装配地图根节点（MapRoot），后续省份/拉线/选区作为子节点
 * - 提供 buildMap(state) 接口：遍历 state.provinces 创建 ProvinceView
 * - 提供 highlightCountry(countryId) / clearHighlight() 接口
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

  /** 创建 MapRoot 节点，addFullWidget 铺满父节点，返回根节点 */
  mount(parent: Node): Node {
    if (this._rootNode) return this._rootNode;
    const root = createNode('MapRoot', parent);
    addFullWidget(root);
    this._rootNode = root;
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

  /** 进入建造模式：高亮己方省份为 selectable 并启动脉冲 */
  startBuildMode(countryId: string): void {
    const state = this._state;
    if (!state) return;
    this._views.forEach((view) => {
      const province = state.provinces.get(view.provinceId);
      if (!province) return;
      if (province.ownerId === countryId || province.controllerId === countryId) {
        view.setHighlight('selectable');
        view.startBuildablePulse();
      } else {
        view.setHighlight('unselectable');
        view.stopBuildablePulse();
      }
    });
  }

  /** 退出建造模式：停止所有脉冲，恢复 normal/owned/controlled 高亮 */
  stopBuildMode(countryId: string): void {
    this._views.forEach((view) => {
      view.stopBuildablePulse();
    });
    this.highlightCountry(countryId);
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
