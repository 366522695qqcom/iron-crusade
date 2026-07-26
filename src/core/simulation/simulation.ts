/**
 * Simulation 主循环实现（spec implement-core-simulation T6）
 *
 * 固定 tick 100ms×speed，应用玩家输入→资源/建筑/工厂 advanceTick→收集事件→每16帧算哈希；
 * 焦点/科研/战斗/dispute 推进不在本范围（由后续系统 spec 处理）。
 *
 * 实现约定：
 * - 不 import cc，core/ 层独立
 * - 不调用 Math（ESLint），全部数值用 Fixed（frameId/tickId/speed 等整数除外）
 * - 确定性：遍历 SortedMap 用 forEach（key 升序）；PlayerAction 按数组顺序处理（联机一致）
 * - 固定 tick 步长 100ms（10Hz），speed 倍率乘进去
 * - 每 16 帧（1.6s）计算一次 WorldState 哈希，首次（lastHash===''）也算
 */
import type { Simulation, TickResult } from './index';
import { Fixed } from '../determinism/fixed';
import { hashWorld } from '../state/hash';
import { WorldState, ResourceStockpile } from '../state/world_state';
import { ResourceType } from '../types';
import { PlayerAction, GameEvent } from './types';
import {
  StateManager,
  ResourceSystem,
  BuildingSystem,
  FactorySystem,
  FocusSystem,
  ResearchSystem,
  DivisionSystem,
  CombatSystem,
} from './interfaces';
import { DefaultStateManager } from './state_manager';
import { DefaultResourceSystem } from './resource_system';
import { DefaultBuildingSystem } from './building_system';
import { DefaultFactorySystem } from './factory_system';
import { DefaultFocusSystem } from './focus_system';
import { DefaultResearchSystem } from './research_system';
import { DefaultDivisionSystem } from './division_system';
import { DefaultCombatSystem } from './combat_system';

const FIXED_100 = Fixed.fromInt(100);
const FIXED_864000 = Fixed.fromInt(864000);

/** 预计算每个 speed 值对应的 dtMs（100 * speed），避免每 tick Fixed.fromInt + mul */
const SPEED_DT_MS: readonly Fixed[] = [
  Fixed.fromInt(0),
  FIXED_100,
  Fixed.fromInt(200),
  Fixed.fromInt(300),
  Fixed.fromInt(400),
  Fixed.fromInt(500),
];

/** 预计算政治点每日产出每 tick 系数：speed / 864000（= speed*100/86400000） */
const POLITICAL_RATE_PER_SPEED: readonly Fixed[] = [
  Fixed.fromInt(0),
  FIXED_100.div(FIXED_864000),
  Fixed.fromInt(200).div(FIXED_864000),
  Fixed.fromInt(300).div(FIXED_864000),
  Fixed.fromInt(400).div(FIXED_864000),
  Fixed.fromInt(500).div(FIXED_864000),
];

/**
 * StateManager 扩展类型：Simulation 需要直接读写当前 WorldState，
 * 故要求实现额外提供 getState()（DefaultStateManager 已具备）。
 */
type StateManagerWithState = StateManager & { getState(): WorldState };

/**
 * 默认 Simulation 实现
 *
 * 串联 ResourceSystem / BuildingSystem / FactorySystem + StateManager，
 * 固定 tick 推演主循环。提供静态工厂 create() 一行创建，也可直接构造注入自定义实现。
 */
export class DefaultSimulation implements Simulation {
  /** 上一次计算的 WorldState 哈希（每 16 帧刷新） */
  private lastHash: string = '';
  /** 玩家国家 ID（placeBuilding / trade / scanIdle 使用） */
  private playerCountryId: string = '';

  constructor(
    private stateManager: StateManagerWithState,
    private resourceSystem: ResourceSystem,
    private buildingSystem: BuildingSystem,
    private factorySystem: FactorySystem,
    private focusSystem: FocusSystem,
    private researchSystem: ResearchSystem,
    private divisionSystem: DivisionSystem,
    private combatSystem: CombatSystem | null,
  ) {}

  /**
   * 静态工厂：用默认子系统实现创建 Simulation。
   * 自动从 state.countries 中找 isPlayer===true 的国家设为玩家国家。
   */
  static create(state: WorldState): DefaultSimulation {
    const sm = new DefaultStateManager(state);
    const rs = new DefaultResourceSystem();
    const bs = new DefaultBuildingSystem();
    const fs = new DefaultFactorySystem();
    const focusSys = new DefaultFocusSystem();
    const researchSys = new DefaultResearchSystem();
    const divSys = new DefaultDivisionSystem();
    const combatSys = new DefaultCombatSystem();
    const sim = new DefaultSimulation(sm, rs, bs, fs, focusSys, researchSys, divSys, combatSys);
    // 从 state.countries 找 isPlayer === true 的国家作为玩家国家
    state.countries.forEach((c) => {
      if (c.isPlayer && sim.playerCountryId === '') {
        sim.playerCountryId = c.id;
      }
    });
    return sim;
  }

  /** 设置玩家国家 ID */
  setPlayerCountry(id: string): void {
    this.playerCountryId = id;
  }

  /** 获取玩家国家 ID */
  getPlayerCountry(): string {
    return this.playerCountryId;
  }

  /**
   * 推进一帧
   *
   * 流程：
   * 1. 取当前 state
   * 2. 按数组顺序应用玩家输入（setSpeed / placeBuilding / cancelBuilding /
   *    assignFactory / unassignFactory / reorderConstruction / trade；其余 action noop）
   * 3. 若 speed > 0：计算 dtMs = 100ms × speed，tickId++，tickElapsed += dtMs，
   *    遍历所有国家执行 resourceSystem.yieldTick → buildingSystem.advanceTick → factorySystem.produceTick
   * 4. 收集事件：建筑完成（id > prevMaxBuildingId）、工厂空闲（scanIdle level>=1）
   * 5. 每 16 帧（或首次 lastHash===''）算一次 hashWorld(state)
   * 6. 返回 { frameId, events, hash }
   */
  tick(frameId: number, inputs: PlayerAction[]): TickResult {
    const state = this.stateManager.getState();
    const events: GameEvent[] = [];

    // 1. 应用玩家输入（按数组顺序，保证联机一致）
    for (const action of inputs) {
      this.applyAction(state, action);
    }

    // 2. 系统推进（仅当非暂停）
    if (state.speed > 0) {
      const dtMs = SPEED_DT_MS[state.speed];
      state.tickId += 1;
      state.tickElapsed = state.tickElapsed.add(dtMs);

      // 记录推进前的 nextEntityId，用于检测本帧新增建筑（id >= prevNextEntityId 即新增）
      const prevNextEntityId = state.nextEntityId;
      const politicalRate = POLITICAL_RATE_PER_SPEED[state.speed];

      // 合并 6 次国家遍历为单次：资源→建筑→工厂→焦点→科研→政治点→师团
      state.countries.forEach((c) => {
        this.resourceSystem.yieldTick(state, c.id, dtMs);
        this.buildingSystem.advanceTick(state, c.id, dtMs);

        const factoryEvents = this.factorySystem.produceTick(state, c.id, dtMs);
        for (const ev of factoryEvents) events.push(ev);

        const focusEvents = this.focusSystem.advanceTick(state, c.id, dtMs);
        for (const ev of focusEvents) events.push(ev);

        const researchEvents = this.researchSystem.advanceTick(state, c.id, dtMs);
        for (const ev of researchEvents) events.push(ev);

        const divEvents = this.divisionSystem.advanceTick(state, c.id, dtMs);
        for (const ev of divEvents) events.push(ev);

        // 政治点每日产出：baseRate × rate（rate 预计算 = speed*100/86400000）
        const stockpile = state.stockpiles.get(c.id);
        if (stockpile) {
          const baseRate = this.focusSystem.getPoliticalPowerPerDay(c.id);
          if (!baseRate.equals(Fixed.ZERO)) {
            const delta = baseRate.mul(politicalRate);
            const nextPol = stockpile.political.add(delta);
            const cap = stockpile.caps.political;
            stockpile.political = nextPol.greaterThan(cap) ? cap : nextPol;
          }
        }
      });

      // 战斗系统独立推进（不按国家遍历）
      if (this.combatSystem) {
        const combatEvents = this.combatSystem.advanceTick(state, dtMs);
        for (const ev of combatEvents) events.push(ev);
      }

      // 3. 收集事件

      // 建筑完成事件：仅当本 tick 有新增建筑时才遍历（id 单调递增）
      if (state.nextEntityId > prevNextEntityId) {
        state.buildings.forEach((b) => {
          if (b.id >= prevNextEntityId) {
            events.push({
              kind: 'buildingCompleted',
              buildingId: b.id,
              provinceId: b.provinceId,
            });
          }
        });
      }

      // 工厂空闲事件：scanIdle 已遍历该国工厂，复用其结果直接取第一个空闲工厂
      if (this.playerCountryId !== '') {
        const idleAlert = this.factorySystem.scanIdle(state, this.playerCountryId);
        if (idleAlert.level >= 1 && idleAlert.idleFactoryCount > 0 && idleAlert.firstIdleFactoryId > 0) {
          events.push({
            kind: 'factoryIdle',
            factoryId: idleAlert.firstIdleFactoryId,
            durationTicks: idleAlert.longestIdleTicks,
          });
        }
      }
    }

    // 4. 哈希：每 16 帧算一次，首次（lastHash === ''）也算
    if (frameId % 16 === 0 || this.lastHash === '') {
      this.lastHash = hashWorld(state);
    }

    return { frameId, events, hash: this.lastHash };
  }

  /**
   * 应用单个玩家动作到 state
   *
   * 按动作 kind 分发到对应子系统。本 spec 范围外的 action（drawFront /
   * issueOffensive / initiateDispute / joinFaction）走 default 分支 noop，
   * 由后续系统 spec 处理。
   */
  private applyAction(state: WorldState, action: PlayerAction): void {
    switch (action.kind) {
      case 'setSpeed':
        state.speed = action.speed;
        break;

      case 'placeBuilding':
        // priority 默认 0（后续由 reorderConstruction 调整）
        this.buildingSystem.enqueue(state, this.playerCountryId, {
          type: action.type,
          provinceId: action.provinceId,
          factoryCount: action.factoryCount,
          priority: 0,
        });
        break;

      case 'cancelBuilding':
        this.buildingSystem.cancel(state, action.itemId, this.playerCountryId);
        break;

      case 'assignFactory':
        this.factorySystem.assignTask(state, action.factoryId, action.taskId);
        break;

      case 'unassignFactory':
        this.factorySystem.unassign(state, action.factoryId);
        break;

      case 'reorderConstruction': {
        const queue = state.constructionQueues.get(this.playerCountryId);
        if (queue) {
          const item = queue.items.find((it) => it.id === action.itemId);
          if (item) {
            item.priority = action.newPriority;
            queue.items.sort((a, b) => a.priority - b.priority);
            state.constructionQueues.set(this.playerCountryId, queue);
          }
        }
        break;
      }

      case 'trade': {
        const stockpile = state.stockpiles.get(this.playerCountryId);
        if (!stockpile) break;
        const actionWithAmount = action as Extract<PlayerAction, { kind: 'trade' }>;
        if (!actionWithAmount.amount) {
          actionWithAmount.amount = Fixed.fromInt(50);
        }
        const cost = Fixed.fromInt(action.factoryCount * 10);
        const amount = actionWithAmount.amount;
        if (stockpile.political.lessThan(cost)) break;
        stockpile.political = stockpile.political.sub(cost);
        if (action.resourceType !== 'political') {
          this.addResourceToStockpile(stockpile, action.resourceType, amount);
        }
        state.stockpiles.set(this.playerCountryId, stockpile);
        break;
      }

      case 'pickFocus':
        this.focusSystem.pickFocus(state, this.playerCountryId, action.focusId);
        break;

      case 'pickResearch':
        // M1 简化：slot 取第一个空闲槽（0 或 1），默认用 0
        this.researchSystem.assignSlot(state, this.playerCountryId, action.lineId, 0);
        break;

      case 'recruitDivision':
        this.divisionSystem.recruit(state, this.playerCountryId, action.provinceId);
        break;

      case 'initiateDispute':
        if (this.combatSystem) {
          this.combatSystem.initiateDispute(state, this.playerCountryId, action.targetCountryId);
        }
        break;

      case 'drawFront':
        if (this.combatSystem) {
          this.combatSystem.drawFront(state, this.playerCountryId, action.fromProvince, action.toProvince);
        }
        break;

      case 'issueOffensive':
        if (this.combatSystem) {
          this.combatSystem.issueOffensive(state, this.playerCountryId, action.divisionIds, action.targetProvince);
        }
        break;

      default:
        // 该 action 由后续系统 spec 处理（joinFaction），本 spec 范围外 noop
        break;
    }
  }

  /** 按资源类型累加到储备对应字段 */
  private addResourceToStockpile(
    stockpile: ResourceStockpile,
    type: ResourceType,
    amount: Fixed,
  ): void {
    switch (type) {
      case 'steel':
        stockpile.steel = stockpile.steel.add(amount);
        break;
      case 'oil':
        stockpile.oil = stockpile.oil.add(amount);
        break;
      case 'tungsten':
        stockpile.tungsten = stockpile.tungsten.add(amount);
        break;
      case 'rubber':
        stockpile.rubber = stockpile.rubber.add(amount);
        break;
      case 'aluminum':
        stockpile.aluminum = stockpile.aluminum.add(amount);
        break;
      case 'political':
        stockpile.political = stockpile.political.add(amount);
        break;
    }
  }

  /** 全量快照（委托 StateManager） */
  snapshot(): WorldState {
    return this.stateManager.snapshot();
  }

  /** 从快照恢复（委托 StateManager） */
  restore(s: WorldState): void {
    this.stateManager.restore(s);
  }

  /** 计算 WorldState 哈希（委托 StateManager） */
  hash(): string {
    return this.stateManager.hash();
  }
}
