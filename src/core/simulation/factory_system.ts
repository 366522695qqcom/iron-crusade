/**
 * 工厂系统默认实现（spec implement-core-simulation T4 + PROJECT.md 3.3）
 *
 * 关键规则：
 * - 工厂任务分配：assignTask 置 working + idleSinceTick=-1；unassign 置 idle + idleSinceTick=当前 tick
 * - 空闲扫描告警 L1-L4：阈值 50 / 100 / 150 / 300 tick（10Hz，对应 5s / 10s / 15s / 30s）
 *   - L1 静默高亮 / L2 角标 / L3 浮窗 / L4 自动暂停
 * - 生产推进 produceTick：遍历该国所有 productionTasks（construction 由 building_system 处理，
 *   trade/production 由本系统处理）
 * - trade 任务：TRADE_CYCLE_MS=60s 完成一个周期，产出 TRADE_OUTPUT=50 资源
 * - production 任务：按 EQUIPMENT_TEMPLATES 周期产出装备
 * - oneClickBalance / autoTrade / applyTemplate 完整实现
 *
 * 实现约定：
 * - 不 import cc，core/ 层独立
 * - 不调用 Math，全部用 Fixed 运算（factoryId / tickId / level 等整数索引除外）
 * - 不依赖裸 number 参与逻辑判定
 * - 遍历 SortedMap 用 forEach（保证 key 升序，跨引擎确定性）
 */
import { Fixed } from '../determinism/fixed';
import {
  IDLE_L1,
  IDLE_L2,
  IDLE_L3,
  IDLE_L4,
  IdleAlertState,
  WorldState,
  EquipmentPool,
  ProductionTask,
} from '../state/world_state';
import { ResourceType } from '../types';
import { FactorySystem } from './interfaces';
import { GameEvent } from './types';
import { DefaultResourceSystem } from './resource_system';

const FIXED_1000 = Fixed.fromInt(1000);
const TRADE_CYCLE_SEC = Fixed.fromInt(60);
const TRADE_OUTPUT = Fixed.fromInt(50);
const TRADE_MAX_FACTORIES = 2;
const TRADE_THRESHOLD = Fixed.HALF;

const EQUIPMENT_TEMPLATES: Record<string, { cycleSec: Fixed; output: number }> = {
  infantry_equipment: { cycleSec: Fixed.fromInt(30), output: 10 },
  artillery: { cycleSec: Fixed.fromInt(60), output: 2 },
  light_tank: { cycleSec: Fixed.fromInt(90), output: 1 },
};

const TRADE_RESOURCE_TYPES: ResourceType[] = ['steel', 'oil', 'tungsten', 'rubber', 'aluminum'];

/** 预计算 0-20 个工厂对应的 Fixed 值，避免每 tick Fixed.fromInt */
const FACTORY_COUNT_FIXED: readonly Fixed[] = [
  Fixed.ZERO, Fixed.fromInt(1), Fixed.fromInt(2), Fixed.fromInt(3), Fixed.fromInt(4),
  Fixed.fromInt(5), Fixed.fromInt(6), Fixed.fromInt(7), Fixed.fromInt(8), Fixed.fromInt(9),
  Fixed.fromInt(10), Fixed.fromInt(11), Fixed.fromInt(12), Fixed.fromInt(13), Fixed.fromInt(14),
  Fixed.fromInt(15), Fixed.fromInt(16), Fixed.fromInt(17), Fixed.fromInt(18), Fixed.fromInt(19),
  Fixed.fromInt(20),
];

/**
 * 默认工厂系统实现
 *
 * - assignTask / unassign：维护 factory.state / taskId / idleSinceTick
 * - scanIdle：统计该国空闲工厂数 + 最长空闲 tick，按阈值返回 L0-L4
 * - produceTick：推进该国所有 trade/production 任务进度，完成时资源/装备入池，返回 GameEvent[]
 * - oneClickBalance：把空闲民厂分配到该国建造队列最高优先级项
 * - autoTrade：自动用空闲民厂贸易最缺资源
 * - applyTemplate：把军厂分配到装备生产任务
 */
export class DefaultFactorySystem implements FactorySystem {
  private resourceSystem = new DefaultResourceSystem();

  /**
   * 分配任务给工厂
   *
   * 工厂不存在则 noop。设置 taskId / state='working' / idleSinceTick=-1（标记从未空闲）。
   */
  assignTask(state: WorldState, factoryId: number, taskId: string): void {
    const factory = state.factories.get(factoryId);
    if (!factory) return;

    factory.taskId = taskId;
    factory.state = 'working';
    factory.idleSinceTick = -1;
  }

  /**
   * 取消工厂任务
   *
   * 工厂不存在则 noop。清空 taskId / state='idle' / idleSinceTick=当前 tick（开始计空闲）。
   */
  unassign(state: WorldState, factoryId: number): void {
    const factory = state.factories.get(factoryId);
    if (!factory) return;

    factory.taskId = null;
    factory.state = 'idle';
    factory.idleSinceTick = state.tickId;
  }

  /**
   * 扫描该国空闲工厂
   *
   * 遍历 factory.provinceId → province.controllerId === countryId 的工厂，
   * 统计空闲工厂数与最长空闲 tick，按阈值返回 L0-L4 级别。
   *
   * 阈值（10Hz tick 数）：
   * - L1: 50 tick（5s）静默高亮
   * - L2: 100 tick（10s）角标
   * - L3: 150 tick（15s）浮窗
   * - L4: 300 tick（30s）自动暂停
   */
  scanIdle(state: WorldState, countryId: string): IdleAlertState {
    let idleCount = 0;
    let longestIdle = 0;
    let firstIdleFactoryId = 0;

    state.factories.forEach((factory, id) => {
      const province = state.provinces.get(factory.provinceId);
      if (!province || province.controllerId !== countryId) return;

      if (factory.state === 'idle' && factory.idleSinceTick >= 0) {
        idleCount++;
        if (firstIdleFactoryId === 0) firstIdleFactoryId = id;
        const idleTicks = state.tickId - factory.idleSinceTick;
        if (idleTicks > longestIdle) longestIdle = idleTicks;
      }
    });

    let level: 0 | 1 | 2 | 3 | 4 = 0;
    if (idleCount === 0) {
      level = 0;
    } else if (longestIdle >= IDLE_L4) {
      level = 4;
    } else if (longestIdle >= IDLE_L3) {
      level = 3;
    } else if (longestIdle >= IDLE_L2) {
      level = 2;
    } else if (longestIdle >= IDLE_L1) {
      level = 1;
    } else {
      level = 0;
    }

    return {
      idleFactoryCount: idleCount,
      longestIdleTicks: longestIdle,
      level,
      firstIdleFactoryId,
    };
  }

  /**
   * 推进单 tick 生产
   *
   * 遍历该国所有 productionTasks：
   * - type='construction'：跳过（由 building_system 处理）
   * - type='trade'：推进贸易进度，完成时资源入池
   * - type='production'：推进装备生产进度，完成时装备入池
   *
   * @returns 本 tick 产生的 GameEvent 列表（tradeCompleted / productionCompleted）
   */
  produceTick(state: WorldState, countryId: string, dtMs: Fixed): GameEvent[] {
    const events: GameEvent[] = [];
    const tasksToProcess: { key: string; task: ProductionTask }[] = [];

    state.productionTasks.forEach((task, key) => {
      if (task.countryId !== countryId) return;
      if (task.type === 'construction') return;
      tasksToProcess.push({ key: String(key), task });
    });

    for (const { task } of tasksToProcess) {
      let activeFactoryCount = 0;
      for (const factoryId of task.assignedFactoryIds) {
        const factory = state.factories.get(factoryId);
        if (factory && factory.state === 'working') {
          activeFactoryCount++;
        }
      }
      if (activeFactoryCount === 0) continue;

      const countFixed = activeFactoryCount < FACTORY_COUNT_FIXED.length
        ? FACTORY_COUNT_FIXED[activeFactoryCount]
        : Fixed.fromInt(activeFactoryCount);

      const dtSec = dtMs.div(FIXED_1000);

      let cycleSec: Fixed;
      let baseIncrement: Fixed;
      if (task.type === 'trade') {
        cycleSec = TRADE_CYCLE_SEC;
        baseIncrement = countFixed.mul(dtSec).div(cycleSec);
      } else {
        const tpl = EQUIPMENT_TEMPLATES[task.target];
        cycleSec = tpl ? tpl.cycleSec : TRADE_CYCLE_SEC;
        baseIncrement = countFixed.mul(dtSec).mul(task.efficiency).div(cycleSec);
      }

      task.progress = task.progress.add(baseIncrement);

      if (task.progress.greaterOrEqual(Fixed.ONE)) {
        task.progress = Fixed.ZERO;
        if (task.type === 'trade') {
          const ev = this.completeTrade(state, countryId, task);
          if (ev) events.push(ev);
        } else if (task.type === 'production') {
          const ev = this.completeProduction(state, countryId, task);
          if (ev) events.push(ev);
        }
      }
    }

    return events;
  }

  /**
   * 完成贸易：资源入池
   */
  private completeTrade(state: WorldState, countryId: string, task: ProductionTask): GameEvent | null {
    const stockpile = state.stockpiles.get(countryId);
    if (!stockpile) return null;

    const resType = task.target as ResourceType;
    const caps = this.resourceSystem.reserveCap(state, countryId);
    const current = this.getRes(stockpile, resType);
    const cap = this.getCap(caps, resType);
    const next = current.add(TRADE_OUTPUT).min(cap);
    this.setRes(stockpile, resType, next);
    state.stockpiles.set(countryId, stockpile);

    return {
      kind: 'tradeCompleted',
      countryId,
      resourceType: resType,
      amount: TRADE_OUTPUT,
    };
  }

  /**
   * 完成生产：装备入池
   */
  private completeProduction(state: WorldState, countryId: string, task: ProductionTask): GameEvent | null {
    let pool = state.equipmentPools.get(countryId);
    if (!pool) {
      pool = this.ensureEquipmentPool(state, countryId);
    }

    const tpl = EQUIPMENT_TEMPLATES[task.target] ?? { cycleSec: TRADE_CYCLE_SEC, output: 1 };
    let stock = pool.stocks.find(s => s.type === task.target);
    if (!stock) {
      stock = { type: task.target, count: 0 };
      pool.stocks.push(stock);
    }
    stock.count += tpl.output;
    state.equipmentPools.set(countryId, pool);

    return {
      kind: 'productionCompleted',
      countryId,
      equipmentType: task.target,
      count: tpl.output,
    };
  }

  /**
   * 一键平衡
   *
   * M1 简化：把该国空闲民厂分配到该国建造队列中 priority 最小（最高优先级）且未完成的 item。
   */
  oneClickBalance(state: WorldState, countryId: string): void {
    const queue = state.constructionQueues.get(countryId);
    if (!queue) return;

    let targetItem = null;
    for (const item of queue.items) {
      if (item.progress.lessThan(Fixed.ONE)) {
        targetItem = item;
        break;
      }
    }
    if (!targetItem) return;

    const assignedSet = new Set<number>(targetItem.assignedFactoryIds);
    state.factories.forEach((factory, id) => {
      const province = state.provinces.get(factory.provinceId);
      if (!province || province.controllerId !== countryId) return;

      if (factory.type === 'civilian' && factory.state === 'idle') {
        factory.taskId = targetItem!.id;
        factory.state = 'working';
        factory.idleSinceTick = -1;

        if (!assignedSet.has(id)) {
          assignedSet.add(id);
          targetItem!.assignedFactoryIds.push(id);
        }
      }
    });

    state.constructionQueues.set(countryId, queue);
  }

  /**
   * 自动贸易：用空闲民厂换取最缺资源
   *
   * 逻辑：
   * 1. 遍历 steel/oil/tungsten/rubber/aluminum，计算缺口 = cap * 0.5 - current
   * 2. 找缺口最大且 > 0 的资源；若都 ≤0 则 return
   * 3. 收集该国空闲民厂（type='civilian' && state='idle' && 省份 controllerId===countryId）
   * 4. 创建/更新 trade task（key = trade_<countryId>），补充工厂到 TRADE_MAX_FACTORIES
   */
  autoTrade(state: WorldState, countryId: string): void {
    const stockpile = state.stockpiles.get(countryId);
    if (!stockpile) return;

    const caps = this.resourceSystem.reserveCap(state, countryId);

    let maxGap = Fixed.ZERO;
    let targetRes: ResourceType | null = null;
    for (const resType of TRADE_RESOURCE_TYPES) {
      const cap = this.getCap(caps, resType);
      const current = this.getRes(stockpile, resType);
      const threshold = cap.mul(TRADE_THRESHOLD);
      const gap = threshold.sub(current);
      if (gap.greaterThan(maxGap)) {
        maxGap = gap;
        targetRes = resType;
      }
    }

    if (!targetRes || maxGap.lessOrEqual(Fixed.ZERO)) return;

    const tradeKey = `trade_${countryId}`;
    let tradeTask = state.productionTasks.get(tradeKey) as ProductionTask | undefined;

    if (!tradeTask || tradeTask.target !== targetRes) {
      if (tradeTask) {
        for (const fid of tradeTask.assignedFactoryIds) {
          const f = state.factories.get(fid);
          if (f && f.taskId === tradeKey) {
            f.taskId = null;
            f.state = 'idle';
            f.idleSinceTick = state.tickId;
          }
        }
      }
      tradeTask = {
        id: tradeKey,
        type: 'trade',
        countryId,
        target: targetRes,
        assignedFactoryIds: [],
        priority: 99,
        progress: Fixed.ZERO,
        efficiency: Fixed.HALF,
      };
      state.productionTasks.set(tradeKey, tradeTask);
    }

    const idleFactories: number[] = [];
    state.factories.forEach((factory, id) => {
      const province = state.provinces.get(factory.provinceId);
      if (!province || province.controllerId !== countryId) return;
      if (factory.type === 'civilian' && factory.state === 'idle') {
        idleFactories.push(id);
      }
    });

    const needed = TRADE_MAX_FACTORIES - tradeTask.assignedFactoryIds.length;
    const toAssign = idleFactories.slice(0, needed > 0 ? needed : 0);

    for (const fid of toAssign) {
      const factory = state.factories.get(fid);
      if (!factory) continue;
      factory.taskId = tradeKey;
      factory.state = 'working';
      factory.idleSinceTick = -1;
      tradeTask.assignedFactoryIds.push(fid);
    }
  }

  /**
   * 应用生产线模板：把军厂分配到装备生产任务
   */
  applyTemplate(state: WorldState, factoryIds: number[], templateId: string): void {
    let targetCountryId: string | null = null;
    for (const id of factoryIds) {
      const factory = state.factories.get(id);
      if (factory && factory.type === 'military') {
        const province = state.provinces.get(factory.provinceId);
        if (province) {
          targetCountryId = province.controllerId;
          break;
        }
      }
    }
    if (!targetCountryId) return;

    const countryId = targetCountryId;
    const taskKey = `tpl_${templateId}`;
    let task = state.productionTasks.get(taskKey) as ProductionTask | undefined;

    let equipmentType = templateId;
    if (templateId === 'infantry' || templateId === 'infantry_equipment') {
      equipmentType = 'infantry_equipment';
    } else if (templateId === 'artillery') {
      equipmentType = 'artillery';
    } else if (templateId === 'light_tank' || templateId === 'tank') {
      equipmentType = 'light_tank';
    }

    if (!task) {
      task = {
        id: taskKey,
        type: 'production',
        countryId,
        target: equipmentType,
        assignedFactoryIds: [],
        priority: 10,
        progress: Fixed.ZERO,
        efficiency: Fixed.HALF,
      };
      state.productionTasks.set(taskKey, task);
    } else if (task.countryId !== countryId) {
      task.countryId = countryId;
      task.target = equipmentType;
    }

    this.ensureEquipmentPool(state, countryId);

    for (const id of factoryIds) {
      const factory = state.factories.get(id);
      if (!factory || factory.type !== 'military') continue;
      const province = state.provinces.get(factory.provinceId);
      if (!province || province.controllerId !== countryId) continue;

      if (!task.assignedFactoryIds.includes(id)) {
        task.assignedFactoryIds.push(id);
      }
      factory.taskId = taskKey;
      factory.state = 'working';
      factory.idleSinceTick = -1;
    }
  }

  private ensureEquipmentPool(state: WorldState, countryId: string): EquipmentPool {
    let pool = state.equipmentPools.get(countryId);
    if (!pool) {
      pool = {
        countryId,
        stocks: [
          { type: 'infantry_equipment', count: 0 },
          { type: 'artillery', count: 0 },
          { type: 'light_tank', count: 0 },
        ],
      };
      state.equipmentPools.set(countryId, pool);
    } else {
      const required = ['infantry_equipment', 'artillery', 'light_tank'];
      for (const t of required) {
        if (!pool.stocks.find(s => s.type === t)) {
          pool.stocks.push({ type: t, count: 0 });
        }
      }
    }
    return pool;
  }

  private getRes(stockpile: { steel: Fixed; oil: Fixed; tungsten: Fixed; rubber: Fixed; aluminum: Fixed; political: Fixed }, type: ResourceType): Fixed {
    switch (type) {
      case 'steel': return stockpile.steel;
      case 'oil': return stockpile.oil;
      case 'tungsten': return stockpile.tungsten;
      case 'rubber': return stockpile.rubber;
      case 'aluminum': return stockpile.aluminum;
      case 'political': return stockpile.political;
    }
  }

  private setRes(stockpile: { steel: Fixed; oil: Fixed; tungsten: Fixed; rubber: Fixed; aluminum: Fixed; political: Fixed }, type: ResourceType, v: Fixed): void {
    switch (type) {
      case 'steel': stockpile.steel = v; break;
      case 'oil': stockpile.oil = v; break;
      case 'tungsten': stockpile.tungsten = v; break;
      case 'rubber': stockpile.rubber = v; break;
      case 'aluminum': stockpile.aluminum = v; break;
      case 'political': stockpile.political = v; break;
    }
  }

  private getCap(caps: { steel: Fixed; oil: Fixed; tungsten: Fixed; rubber: Fixed; aluminum: Fixed; political: Fixed }, type: ResourceType): Fixed {
    switch (type) {
      case 'steel': return caps.steel;
      case 'oil': return caps.oil;
      case 'tungsten': return caps.tungsten;
      case 'rubber': return caps.rubber;
      case 'aluminum': return caps.aluminum;
      case 'political': return caps.political;
    }
  }
}
