/**
 * 建筑系统默认实现（spec implement-core-simulation T3 + PROJECT.md 3.4）
 *
 * 关键规则：
 * - 钢铁扣费不返还：enqueue 时扣 steelCost，cancel 不退（3.4.5）
 * - 民厂产能加速施工：advanceTick 中 progress 增量 = factoryCount × dtMs / (timeCost × 1000)
 * - 完成时 Building 入库：progress >= 1 时新建 Building（state: 'active'）写入 state.buildings
 *
 * 实现约定：
 * - 不 import cc，core/ 层独立
 * - 不调用 Math，全部用 Fixed 运算
 * - 不依赖裸 number 参与逻辑判定（仅 level/provinceId/itemId 等整数索引用 number）
 * - 遍历 SortedMap 用 forEach（保证 key 升序，跨引擎确定性）
 * - constructionQueue.items 排序用 .sort((a,b)=>a.priority-b.priority)
 */
import { Fixed } from '../determinism/fixed';
import {
  Building,
  ConstructionQueue,
  ValidationResult,
  WorldState,
  Factory,
} from '../state/world_state';
import { BuildingType, FactoryType } from '../types';
import { BuildingSystem, NewBuildingRequest } from './interfaces';

const FIXED_1000 = Fixed.fromInt(1000);

const STEEL_COST: Record<BuildingType, Fixed> = {
  civilian_factory: Fixed.fromInt(100),
  military_factory: Fixed.fromInt(120),
  dockyard: Fixed.fromInt(150),
  air_base: Fixed.fromInt(120),
  infrastructure: Fixed.fromInt(50),
  mine: Fixed.fromInt(80),
  storage: Fixed.fromInt(60),
  supply_hub: Fixed.fromInt(100),
  fort: Fixed.fromInt(70),
};

const TIME_COST: Record<BuildingType, Fixed> = {
  civilian_factory: Fixed.fromInt(60),
  military_factory: Fixed.fromInt(70),
  dockyard: Fixed.fromInt(90),
  air_base: Fixed.fromInt(80),
  infrastructure: Fixed.fromInt(30),
  mine: Fixed.fromInt(40),
  storage: Fixed.fromInt(35),
  supply_hub: Fixed.fromInt(50),
  fort: Fixed.fromInt(45),
};

/**
 * 默认建筑系统实现
 *
 * - validate：按归属 → 沿海 → 节点 → 槽位 → 钢铁 顺序校验，首个失败即返回
 * - enqueue：校验通过后扣钢铁、生成 ConstructionQueueItem 入队
 * - cancel：从队列移除 item，钢铁不返还
 * - assignFactories：设置 item.assignedFactoryIds
 * - advanceTick：推进施工进度，完成时 Building 入库并从队列移除
 */
export class DefaultBuildingSystem implements BuildingSystem {
  /**
   * itemId → 数组索引反向索引：countryId → Map<itemId, index>。
   * 用于 cancel O(1) 定位。enqueue 排序后全量重建该国索引，advanceTick 完成删除后重建。
   */
  private itemIndex = new Map<string, Map<string, number>>();

  private rebuildIndexFor(queue: ConstructionQueue): void {
    const idx = new Map<string, number>();
    for (let i = 0; i < queue.items.length; i++) {
      idx.set(queue.items[i].id, i);
    }
    this.itemIndex.set(queue.countryId, idx);
  }

  private getOrBuildIndex(queue: ConstructionQueue): Map<string, number> {
    let idx = this.itemIndex.get(queue.countryId);
    if (!idx) {
      idx = new Map();
      for (let i = 0; i < queue.items.length; i++) {
        idx.set(queue.items[i].id, i);
      }
      this.itemIndex.set(queue.countryId, idx);
    }
    return idx;
  }

  /**
   * 建造校验
   *
   * 按 spec 顺序逐项检查，首个失败即返回（带 reason）；全部通过返回 { ok: true }。
   */
  validate(
    state: WorldState,
    countryId: string,
    type: BuildingType,
    provinceId: number,
  ): ValidationResult {
    // 1. 归属：省份不存在或 ownerId != countryId
    const province = state.provinces.get(provinceId);
    if (!province || province.ownerId !== countryId) {
      return { ok: false, reason: 'not_owned' };
    }

    // 2. 沿海（仅 dockyard）
    if (type === 'dockyard' && !province.isCoastal) {
      return { ok: false, reason: 'not_coastal' };
    }

    // 3. 节点（仅 mine）：该省份需有该国管控的资源节点
    if (type === 'mine') {
      let hasNode = false;
      state.resourceNodes.forEach((node) => {
        if (hasNode) return;
        if (node.provinceId !== provinceId) return;
        // 节点所属国家 = 省份管控方（与 ResourceSystem 一致）
        if (province.controllerId === countryId) {
          hasNode = true;
        }
      });
      if (!hasNode) {
        return { ok: false, reason: 'no_node' };
      }
    }

    // 4. 槽位：已占用（active/constructing 建筑 + 队列中待建项）>= buildingSlots
    let occupied = 0;
    state.buildings.forEach((building) => {
      if (building.provinceId !== provinceId) return;
      if (building.state === 'planned') return;
      occupied++;
    });
    const queue = state.constructionQueues.get(countryId);
    if (queue) {
      for (const item of queue.items) {
        if (item.provinceId === provinceId) occupied++;
      }
    }
    if (occupied >= province.buildingSlots) {
      return { ok: false, reason: 'no_slot' };
    }

    // 5. 钢铁：储备不足
    const stockpile = state.stockpiles.get(countryId);
    const steelCost = computeSteelCost(type);
    if (!stockpile || stockpile.steel.lessThan(steelCost)) {
      return { ok: false, reason: 'no_steel' };
    }

    return { ok: true };
  }

  /**
   * 入队建造
   *
   * 校验通过后扣钢铁、生成 ConstructionQueueItem 推入队列，按 priority 升序排序。
   * 校验失败返回 ''（空字符串表示入队失败）。
   */
  enqueue(state: WorldState, countryId: string, req: NewBuildingRequest): string {
    const result = this.validate(state, countryId, req.type, req.provinceId);
    if (!result.ok) return '';

    const steelCost = computeSteelCost(req.type);
    const timeCost = computeTimeCost(req.type);

    // 扣钢铁（钢铁不返还，3.4.5）
    const stockpile = state.stockpiles.get(countryId);
    if (!stockpile) return '';
    stockpile.steel = stockpile.steel.sub(steelCost);
    state.stockpiles.set(countryId, stockpile);

    // 生成 itemId
    const itemId = 'cq_' + state.nextEntityId;
    state.nextEntityId++;

    // 取/建 queue
    let queue = state.constructionQueues.get(countryId);
    if (!queue) {
      queue = { countryId, items: [] };
    }

    queue.items.push({
      id: itemId,
      buildingType: req.type,
      provinceId: req.provinceId,
      priority: req.priority,
      steelCost,
      timeCost,
      assignedFactoryIds: [],
      progress: Fixed.ZERO,
    });

    // 按 priority 升序（数字小优先）
    queue.items.sort((a, b) => a.priority - b.priority);

    this.rebuildIndexFor(queue);

    state.constructionQueues.set(countryId, queue);

    return itemId;
  }

  /**
   * 取消建造
   *
   * 遍历所有 constructionQueues 找到含 itemId 的队列并移除该项。
   * 钢铁不返还（3.4.5）。找不到则 noop。
   */
  cancel(state: WorldState, itemId: string, countryId?: string): void {
    if (countryId) {
      const queue = state.constructionQueues.get(countryId);
      if (queue) {
        const idx = this.getOrBuildIndex(queue);
        const pos = idx.get(itemId);
        if (pos !== undefined) {
          queue.items.splice(pos, 1);
          this.rebuildIndexFor(queue);
          state.constructionQueues.set(countryId, queue);
        }
      }
      return;
    }
    state.constructionQueues.forEach((queue) => {
      const idx = this.getOrBuildIndex(queue);
      const pos = idx.get(itemId);
      if (pos !== undefined) {
        queue.items.splice(pos, 1);
        this.rebuildIndexFor(queue);
        state.constructionQueues.set(queue.countryId, queue);
      }
    });
  }

  /**
   * 分配民厂到建造项
   *
   * 遍历所有 constructionQueues 找到 itemId 并设置 assignedFactoryIds（拷贝）。
   * 当传入 countryId 时直接定位该国队列，避免全局遍历。
   */
  assignFactories(state: WorldState, itemId: string, factoryIds: number[], countryId?: string): void {
    const applyTo = (queue: ConstructionQueue): void => {
      const idx = this.getOrBuildIndex(queue);
      const pos = idx.get(itemId);
      if (pos !== undefined) {
        queue.items[pos].assignedFactoryIds = factoryIds.slice();
        state.constructionQueues.set(queue.countryId, queue);
      }
    };
    if (countryId) {
      const queue = state.constructionQueues.get(countryId);
      if (queue) applyTo(queue);
      return;
    }
    state.constructionQueues.forEach((queue) => applyTo(queue));
  }

  /**
   * 推进单 tick 施工
   *
   * - 无民厂分配的项进度不动
   * - progress 增量 = factoryCount × dtMs / (timeCost × 1000)
   * - progress >= 1 时 clamp 到 ONE 并生成 Building 入库（state: 'active'）
   * - 完成项从队列移除
   *
   * 返回 void（事件由 Simulation 层扫描 buildings 变化生成）。
   */
  advanceTick(state: WorldState, countryId: string, dtMs: Fixed): void {
    const queue = state.constructionQueues.get(countryId);
    if (!queue) return;

    const completedIdx: number[] = [];
    const items = queue.items;
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (item.progress.greaterOrEqual(Fixed.ONE)) {
        completedIdx.push(i);
        continue;
      }

      const factoryCount = item.assignedFactoryIds.length;
      if (factoryCount === 0) continue;

      const increment = Fixed.fromInt(factoryCount)
        .mul(dtMs)
        .div(item.timeCost)
        .div(FIXED_1000);

      item.progress = item.progress.add(increment);

      if (item.progress.greaterOrEqual(Fixed.ONE)) {
        item.progress = Fixed.ONE;
        const buildingId = state.nextEntityId++;
        const building: Building = {
          id: buildingId,
          provinceId: item.provinceId,
          type: item.buildingType,
          level: 1,
          state: 'active',
          constructionProgress: Fixed.ONE,
          assignedCivilianFactories: 0,
        };
        state.buildings.set(buildingId, building);

        const factoryType = buildingTypeToFactoryType(item.buildingType);
        if (factoryType) {
          const factory: Factory = {
            id: buildingId,
            provinceId: item.provinceId,
            type: factoryType,
            level: 1,
            state: 'idle',
            taskId: null,
            idleSinceTick: state.tickId,
            productionProgress: Fixed.ZERO,
          };
          state.factories.set(buildingId, factory);
        }

        completedIdx.push(i);
      }
    }

    for (let j = completedIdx.length - 1; j >= 0; j--) {
      const completedItem = items[completedIdx[j]];
      // 释放建造用的民厂回 idle
      for (const fid of completedItem.assignedFactoryIds) {
        const factory = state.factories.get(fid);
        if (factory && factory.taskId === completedItem.id) {
          factory.taskId = null;
          factory.state = 'idle';
          factory.idleSinceTick = state.tickId;
          state.factories.set(fid, factory);
        }
      }
      items.splice(completedIdx[j], 1);
    }

    this.rebuildIndexFor(queue);

    state.constructionQueues.set(countryId, queue);
  }
}

function computeSteelCost(type: BuildingType): Fixed {
  return STEEL_COST[type];
}

function computeTimeCost(type: BuildingType): Fixed {
  return TIME_COST[type];
}

function buildingTypeToFactoryType(type: BuildingType): FactoryType | null {
  switch (type) {
    case 'civilian_factory': return 'civilian';
    case 'military_factory': return 'military';
    case 'dockyard': return 'dockyard';
    default: return null;
  }
}
