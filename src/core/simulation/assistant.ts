/**
 * 助理模式接口（spec A 级 - A.2）
 *
 * 仅定义接口契约，实现由 A.2.x 任务完成。
 *
 * 设计要点（spec Requirement: 助理模式）：
 * - 新手默认开启，老手可手动关闭
 * - 助理功能：自动分配空闲工厂 / 自动调度补给 / 自动布防前线
 * - 玩家仅做焦点、科研、总攻等核心决策
 * - 助理操作可撤销（玩家可回退单个助理操作）
 *
 * 与联机 AI 接管的关系：
 * - 复用附录 B.2 联机 AI 行为树核心
 * - 助理参数更保守（不抢占玩家核心决策资源）
 * - 联机 drop-out 时 AI 接管使用激进参数，助理模式使用保守参数
 */
import { WorldState } from '../state/world_state';
import { FactoryState } from '../types';
import {
  AssistantBehaviorTree,
  AssistantDecision,
  AssistantDecisionType,
} from '../ai/assistant_behavior_tree';
import { FactorySystem } from './interfaces';
import { DefaultFactorySystem } from './factory_system';

/** 助理操作类型 */
export type AssistantOperationType =
  | 'assign_factory'        // 分配空闲工厂
  | 'schedule_supply'       // 调度补给
  | 'defend_front'          // 布防前线
  | 'trade'                 // 自动贸易
  | 'reorder_construction'; // 重排建造队列

/**
 * 助理操作日志条目（可撤销）
 */
export interface AssistantOperation {
  /** 操作 ID（用于 undo） */
  id: string;
  /** 操作类型 */
  type: AssistantOperationType;
  /** 操作生效的 tick */
  tickId: number;
  /** 操作详情（具体 schema 由实现细化） */
  details: {
    factoryIds?: number[];
    provinceIds?: number[];
    taskId?: string;
    reason: string;
  };
  /** 撤销所需的反向操作数据（由实现填充） */
  rollback?: unknown;
}

/**
 * 助理系统接口
 *
 * 注：本接口仅描述能力契约，具体决策逻辑由附录 B.2 行为树核心实现，
 * 助理模式与联机 AI 接管复用同一行为树但参数不同（助理更保守）。
 */
export interface AssistantSystem {
  /** 为指定国家开启助理模式 */
  enable(state: WorldState, countryId: string): void;
  /** 为指定国家关闭助理模式 */
  disable(state: WorldState, countryId: string): void;
  /**
   * 单次 tick 并应用全部三类决策（autoAssignFactories/autoScheduleSupply/autoDefendFront 合一）
   * 性能优化：每 tick 只执行一次 tree.tick()，三类决策复用同一次遍历结果。
   */
  tickAndApply(state: WorldState, countryId: string): void;
  /** 自动分配空闲民用工厂到建造队列最高优先级项 */
  autoAssignFactories(state: WorldState, countryId: string): void;
  /** 自动调度补给到前线部队 */
  autoScheduleSupply(state: WorldState, countryId: string): void;
  /** 自动布防前线省份 */
  autoDefendFront(state: WorldState, countryId: string): void;
  /** 查询助理操作日志（可撤销） */
  getOperationLog(): AssistantOperation[];
  /** 撤销单个助理操作 */
  undo(operationId: string): void;
}

/**
 * Factory 决策回滚数据（autoAssignFactories 写入 AssistantOperation.rollback）
 *
 * 用于 undo 时反向应用：还原工厂 state/taskId，还原队列项 assignedFactoryIds。
 */
interface FactoryAssignRollback {
  kind: 'assign_factory';
  /** 所属国家 ID（undo 时定位建造队列） */
  countryId: string;
  /** 队列项 ID */
  itemId: string;
  /** 队列项原 assignedFactoryIds（拷贝） */
  prevAssigned: number[];
  /** 各工厂的原状态（用于还原） */
  factoryRollback: Array<{
    factoryId: number;
    prevState: FactoryState;
    prevTaskId: string | null;
  }>;
}

/**
 * 布防回滚数据（autoDefendFront 写入 AssistantOperation.rollback）
 *
 * 用于 undo 时还原师团位置。
 */
interface DefendFrontRollback {
  kind: 'defend_front';
  /** 各师团之前的驻防省份 */
  divisionRollback: Array<{
    divisionId: number;
    prevProvinceId: number;
  }>;
}

/**
 * 默认助理系统实现（spec A 级 - A.2.2 / A.2.3）
 *
 * 实现要点：
 * - enable/disable：采用内部 Map<string, boolean> 维护开关（不修改 WorldState，
 *   spec 任务说明明确禁止用 seedMap 或新增字段）。
 * - autoAssignFactories：实际分配工厂（mutate state：Factory.state/taskId + 队列项
 *   assignedFactoryIds），记录可撤销 operation（含 rollback 反向数据）。
 * - autoScheduleSupply / autoDefendFront：最小实现仅记录 operation log
 *   （不真实修改 Division.supply、不生成部队），undo 直接从日志移除。
 * - undo：assign_factory 根据 rollback 反向应用；log-only 操作仅移除日志。
 *
 * 接口兼容：undo(operationId) 未传 state，故缓存最近一次 autoXxx/enable/disable 的
 * WorldState 引用（cachedState）用于反向应用。
 *
 * 确定性：operation ID 用单调递增计数器生成（禁止 Math.random）；
 *         遍历 SortedMap 保持升序；数值比较交由行为树用 Fixed 完成。
 */
export class DefaultAssistantSystem implements AssistantSystem {
  /** 按国家 ID 维护助理开关（不写入 WorldState） */
  private enabled = new Map<string, boolean>();
  /** 助理操作日志（按生成顺序，可撤销） */
  private operationLog: AssistantOperation[] = [];
  /** operation ID 单调计数器（确定性，禁止 Math.random） */
  private opCounter = 0;
  /** 行为树（保守参数，与联机 AI 接管复用同一核心） */
  private tree = new AssistantBehaviorTree();
  /** 工厂系统实例（用于自动贸易） */
  private factorySystem: FactorySystem = new DefaultFactorySystem();
  /** 最近一次操作的 WorldState 引用（undo 接口未传 state，需缓存以反向应用） */
  private cachedState: WorldState | null = null;
  /** 上次执行 tick 的 tickId（同 tick 不重复执行 tree.tick()） */
  private lastTickId = -1;
  /** 上次执行 tick 的国家 ID */
  private lastCountryId = '';
  /** 本 tick 决策缓存（tickAndApply 执行后写入） */
  private currentDecisions: AssistantDecision[] = [];

  enable(state: WorldState, countryId: string): void {
    this.cachedState = state;
    this.enabled.set(countryId, true);
  }

  disable(state: WorldState, countryId: string): void {
    this.cachedState = state;
    this.enabled.set(countryId, false);
  }

  /** 查询该国助理是否开启（内部辅助） */
  private isEnabled(countryId: string): boolean {
    return this.enabled.get(countryId) === true;
  }

  /**
   * 单次 tick 并应用全部三类决策（性能优化：每 tick 只执行一次 tree.tick()）
   *
   * game_runner 应调用此方法替代分别调用三个 auto 方法，避免每 tick 重复执行 3 次 tree.tick()。
   * 若同 tick 同国家已调用过，直接返回（不重复执行）。
   */
  tickAndApply(state: WorldState, countryId: string): void {
    this.cachedState = state;
    if (!this.isEnabled(countryId)) return;
    if (state.tickId === this.lastTickId && countryId === this.lastCountryId) return;

    this.lastTickId = state.tickId;
    this.lastCountryId = countryId;
    this.tree.tick(state, countryId);
    this.currentDecisions = this.tree.getDecisions();

    this.applyFactoryDecision(state, countryId);
    this.applySupplyDecision(state, countryId);
    this.applyDefenseDecision(state, countryId);
  }

  /**
   * 应用 Factory 决策（从 currentDecisions 取，不再调用 tree.tick）
   */
  private applyFactoryDecision(state: WorldState, countryId: string): void {
    const decision = this.pickDecisionFromList('factory', this.currentDecisions);
    if (!decision || !decision.factoryIds || decision.factoryIds.length === 0) return;
    const taskId = decision.taskId;
    if (!taskId) return;

    const queue = state.constructionQueues.get(countryId);
    if (!queue) return;

    // 决策中已确认 topItem，通过 taskId 直接定位；决策阶段已确认空闲，无需二次 indexOf 检查
    const item = queue.items.find((it) => it.id === taskId);
    if (!item) return;

    const factoryRollback: FactoryAssignRollback['factoryRollback'] = [];
    const prevAssigned = item.assignedFactoryIds.slice();

    for (const factoryId of decision.factoryIds) {
      const factory = state.factories.get(factoryId);
      if (!factory) continue;
      if (factory.state !== 'idle') continue;
      factoryRollback.push({
        factoryId,
        prevState: factory.state,
        prevTaskId: factory.taskId,
      });
      factory.state = 'working';
      factory.taskId = item.id;
      item.assignedFactoryIds.push(factoryId);
    }

    if (factoryRollback.length === 0) return;

    const rollback: FactoryAssignRollback = {
      kind: 'assign_factory',
      countryId,
      itemId: item.id,
      prevAssigned,
      factoryRollback,
    };
    this.operationLog.push({
      id: this.nextOpId(),
      type: 'assign_factory',
      tickId: state.tickId,
      details: {
        factoryIds: factoryRollback.map((r) => r.factoryId),
        taskId: item.id,
        reason: decision.reason,
      },
      rollback,
    });
  }

  /**
   * 应用 Supply 决策：调用自动贸易
   */
  private applySupplyDecision(state: WorldState, countryId: string): void {
    this.factorySystem.autoTrade(state, countryId);

    const decision = this.pickDecisionFromList('supply', this.currentDecisions);
    if (!decision) return;

    this.operationLog.push({
      id: this.nextOpId(),
      type: 'schedule_supply',
      tickId: state.tickId,
      details: {
        provinceIds: decision.provinceIds ? decision.provinceIds.slice() : [],
        reason: decision.reason,
      },
      rollback: undefined,
    });
  }

  /**
   * 应用 Defense 决策：调度 ready 师团到被进攻省份驻防
   */
  private applyDefenseDecision(state: WorldState, countryId: string): void {
    const decision = this.pickDecisionFromList('defense', this.currentDecisions);

    const attackedProvinces: number[] = [];
    const attackedSet = new Set<number>();
    state.fronts.forEach((fronts) => {
      for (const f of fronts) {
        if (f.defenderId === countryId && !attackedSet.has(f.toProvince)) {
          attackedSet.add(f.toProvince);
          attackedProvinces.push(f.toProvince);
        }
      }
    });

    const readyDivs: Array<{ id: number; prevProvince: number }> = [];
    state.divisions.forEach((div) => {
      if (div.ownerId !== countryId) return;
      if (div.status !== 'ready') return;
      if (div.inOffensive) return;
      readyDivs.push({ id: div.id, prevProvince: div.currentProvinceId });
    });

    if (attackedProvinces.length === 0 || readyDivs.length === 0) {
      if (decision) {
        this.operationLog.push({
          id: this.nextOpId(),
          type: 'defend_front',
          tickId: state.tickId,
          details: {
            provinceIds: decision.provinceIds ? decision.provinceIds.slice() : [],
            reason: decision.reason,
          },
          rollback: undefined,
        });
      }
      return;
    }

    const divisionRollback: DefendFrontRollback['divisionRollback'] = [];
    const movedDivIds: number[] = [];
    const assignedProvinces: number[] = [];

    const assignCount = Math.min(attackedProvinces.length, readyDivs.length);
    for (let i = 0; i < assignCount; i++) {
      const targetProvince = attackedProvinces[i];
      const divInfo = readyDivs[i];
      const div = state.divisions.get(divInfo.id);
      if (!div) continue;
      divisionRollback.push({
        divisionId: divInfo.id,
        prevProvinceId: divInfo.prevProvince,
      });
      div.currentProvinceId = targetProvince;
      div.targetProvinceId = null;
      movedDivIds.push(divInfo.id);
      assignedProvinces.push(targetProvince);
    }

    if (divisionRollback.length === 0) return;

    const rollback: DefendFrontRollback = {
      kind: 'defend_front',
      divisionRollback,
    };
    this.operationLog.push({
      id: this.nextOpId(),
      type: 'defend_front',
      tickId: state.tickId,
      details: {
        provinceIds: assignedProvinces.slice(),
        reason: decision ? decision.reason : 'auto_defend_front',
      },
      rollback,
    });
  }

  /**
   * 自动分配空闲民用工厂到建造队列最高优先级项
   *
   * 注意：优先使用 tickAndApply() 以避免重复 tree.tick()。
   * 本方法保留向后兼容：确保本 tick 已执行 tree.tick()，然后应用 factory 决策。
   */
  autoAssignFactories(state: WorldState, countryId: string): void {
    this.cachedState = state;
    if (!this.isEnabled(countryId)) return;
    if (state.tickId !== this.lastTickId || countryId !== this.lastCountryId) {
      this.tree.tick(state, countryId);
      this.currentDecisions = this.tree.getDecisions();
      this.lastTickId = state.tickId;
      this.lastCountryId = countryId;
    }
    this.applyFactoryDecision(state, countryId);
  }

  /**
   * 自动调度补给到前线部队（最小实现）
   *
   * 注意：优先使用 tickAndApply()。本方法保留向后兼容。
   */
  autoScheduleSupply(state: WorldState, countryId: string): void {
    this.cachedState = state;
    if (!this.isEnabled(countryId)) return;
    this.factorySystem.autoTrade(state, countryId);
    if (state.tickId !== this.lastTickId || countryId !== this.lastCountryId) {
      this.tree.tick(state, countryId);
      this.currentDecisions = this.tree.getDecisions();
      this.lastTickId = state.tickId;
      this.lastCountryId = countryId;
    }
    this.applySupplyDecision(state, countryId);
  }

  /**
   * 自动布防前线省份（最小实现）
   *
   * 注意：优先使用 tickAndApply()。本方法保留向后兼容。
   */
  autoDefendFront(state: WorldState, countryId: string): void {
    this.cachedState = state;
    if (!this.isEnabled(countryId)) return;
    if (state.tickId !== this.lastTickId || countryId !== this.lastCountryId) {
      this.tree.tick(state, countryId);
      this.currentDecisions = this.tree.getDecisions();
      this.lastTickId = state.tickId;
      this.lastCountryId = countryId;
    }
    this.applyDefenseDecision(state, countryId);
  }

  /** 查询助理操作日志（返回拷贝，避免外部直接修改内部日志） */
  getOperationLog(): AssistantOperation[] {
    return this.operationLog.slice();
  }

  /**
   * 撤销单个助理操作
   *
   * - assign_factory：根据 rollback 反向应用（还原工厂状态与队列项分配），再移除日志
   * - defend_front：根据 rollback 还原师团位置，再移除日志
   * - schedule_supply：log-only，直接移除日志
   * 若无 cachedState 可用于反向应用，则不执行撤销（保留日志）。
   */
  undo(operationId: string): void {
    const idx = this.operationLog.findIndex((op) => op.id === operationId);
    if (idx < 0) return;
    const op = this.operationLog[idx];

    if (op.type === 'assign_factory' && op.rollback) {
      if (!this.cachedState) return; // 无状态引用，无法安全撤销
      this.applyFactoryRollback(op.rollback as FactoryAssignRollback, this.cachedState);
    }
    if (op.type === 'defend_front' && op.rollback) {
      if (!this.cachedState) return;
      this.applyDefendRollback(op.rollback as DefendFrontRollback, this.cachedState);
    }
    // log-only 操作（schedule_supply）直接移除日志
    this.operationLog.splice(idx, 1);
  }

  /** 从指定决策列表中取指定类型的首条决策 */
  private pickDecisionFromList(type: AssistantDecisionType, decisions: AssistantDecision[]): AssistantDecision | null {
    for (const d of decisions) {
      if (d.type === type) return d;
    }
    return null;
  }

  /** 生成下一个 operation ID（单调计数器，确定性，禁止 Math.random） */
  private nextOpId(): string {
    this.opCounter += 1;
    return `asst-op-${this.opCounter}`;
  }

  /** 反向应用 Factory 分配的 rollback（还原工厂状态与队列项 assignedFactoryIds） */
  private applyFactoryRollback(rb: FactoryAssignRollback, state: WorldState): void {
    // 还原工厂 state / taskId
    for (const fr of rb.factoryRollback) {
      const factory = state.factories.get(fr.factoryId);
      if (!factory) continue;
      factory.state = fr.prevState;
      factory.taskId = fr.prevTaskId;
    }
    // 还原队列项的 assignedFactoryIds
    const queue = state.constructionQueues.get(rb.countryId);
    if (!queue) return;
    const item = queue.items.find((it) => it.id === rb.itemId);
    if (!item) return;
    item.assignedFactoryIds = rb.prevAssigned.slice();
  }

  /** 反向应用布防 rollback（还原师团驻防位置） */
  private applyDefendRollback(rb: DefendFrontRollback, state: WorldState): void {
    for (const dr of rb.divisionRollback) {
      const div = state.divisions.get(dr.divisionId);
      if (!div) continue;
      div.currentProvinceId = dr.prevProvinceId;
      div.targetProvinceId = null;
    }
  }
}
