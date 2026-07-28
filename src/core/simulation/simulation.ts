/**
 * Simulation 主循环实现（spec implement-core-simulation T6 + M1）
 *
 * 固定 tick 100ms×speed，应用玩家输入→资源/建筑/工厂 advanceTick→收集事件→每16帧算哈希；
 * 焦点/科研/战斗/dispute/投降 推进集成。
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
import { WorldState, ResourceStockpile, Division } from '../state/world_state';
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
  SurrenderSystem,
  DiplomacySystem,
  SupplySystem,
  NavalSystem,
  AirSystem,
  InvasionSystem,
} from './interfaces';
import { DefaultStateManager } from './state_manager';
import { DefaultResourceSystem } from './resource_system';
import { DefaultBuildingSystem } from './building_system';
import { DefaultFactorySystem } from './factory_system';
import { DefaultFocusSystem } from './focus_system';
import { DefaultResearchSystem } from './research_system';
import { DefaultDivisionSystem } from './division_system';
import { DefaultCombatSystem } from './combat_system';
import { DefaultSurrenderSystem } from './surrender_system';
import { DefaultDiplomacySystem } from './diplomacy_system';
import { DefaultSupplySystem } from './supply_system';
import { DefaultNavalSystem } from './naval_system';
import { DefaultAirSystem } from './air_system';
import { DefaultInvasionSystem } from './invasion_system';

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
 * 串联 ResourceSystem / BuildingSystem / FactorySystem / CombatSystem / SurrenderSystem + StateManager，
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
    private surrenderSystem: SurrenderSystem,
    private diplomacySystem: DiplomacySystem = new DefaultDiplomacySystem(),
    private supplySystem: SupplySystem = new DefaultSupplySystem(),
    private navalSystem: NavalSystem = new DefaultNavalSystem(),
    private airSystem: AirSystem = new DefaultAirSystem(),
    private invasionSystem: InvasionSystem = new DefaultInvasionSystem(),
  ) {
    this.navalSystem.setSurrenderSystem(this.surrenderSystem);
    this.supplySystem.setNavalSystem(this.navalSystem);
    this.airSystem.setSurrenderSystem(this.surrenderSystem);
    this.airSystem.setNavalSystem(this.navalSystem);
    this.airSystem.setSupplySystem(this.supplySystem);
    this.invasionSystem.setCombatSystem(this.combatSystem || new DefaultCombatSystem());
    this.invasionSystem.setNavalSystem(this.navalSystem);
    this.invasionSystem.setAirSystem(this.airSystem);
    this.invasionSystem.setSupplySystem(this.supplySystem);
    this.invasionSystem.setSurrenderSystem(this.surrenderSystem);
  }

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
    const surrenderSys = new DefaultSurrenderSystem();
    const supplySys = new DefaultSupplySystem();
    const navalSys = new DefaultNavalSystem();
    const airSys = new DefaultAirSystem();
    const invasionSys = new DefaultInvasionSystem();
    const sim = new DefaultSimulation(sm, rs, bs, fs, focusSys, researchSys, divSys, combatSys, surrenderSys, new DefaultDiplomacySystem(), supplySys, navalSys, airSys, invasionSys);
    state.countries.forEach((c) => {
      if (c.isPlayer && sim.playerCountryId === '') {
        sim.playerCountryId = c.id;
      }
    });
    state.countries.forEach((c) => {
      surrenderSys.ensureWarLossesInitialized(state, c.id);
    });
    divSys.initDefaultTemplates(state);
    navalSys.initDefaultShipTemplates(state);
    navalSys.initDefaultSeaZones(state);
    airSys.initDefaultAirZones(state);
    invasionSys.setCombatSystem(combatSys);
    invasionSys.setNavalSystem(navalSys);
    invasionSys.setAirSystem(airSys);
    invasionSys.setSupplySystem(supplySys);
    invasionSys.setSurrenderSystem(surrenderSys);
    supplySys.recalc(state);
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
   * 2. 按数组顺序应用玩家输入
   * 3. 若 speed > 0：计算 dtMs = 100ms × speed，tickId++，tickElapsed += dtMs，
   *    遍历所有国家执行 resourceSystem.yieldTick → buildingSystem.advanceTick → factorySystem.produceTick
   * 4. 战斗系统推进，收集战斗事件
   * 5. 投降系统推进，处理投降事件
   * 6. 收集事件：建筑完成、工厂空闲
   * 7. 每 16 帧（或首次 lastHash===''）算一次 hashWorld(state)
   * 8. 返回 { frameId, events, hash }
   */
  tick(frameId: number, inputs: PlayerAction[]): TickResult {
    const state = this.stateManager.getState();
    const events: GameEvent[] = [];

    for (const action of inputs) {
      const actionEvents = this.applyAction(state, action);
      for (const ev of actionEvents) events.push(ev);
    }

    if (state.speed > 0) {
      const dtMs = SPEED_DT_MS[state.speed];
      state.tickId += 1;
      state.tickElapsed = state.tickElapsed.add(dtMs);

      const prevNextEntityId = state.nextEntityId;
      const politicalRate = POLITICAL_RATE_PER_SPEED[state.speed];

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

      this.advanceDivisionMovement(state, dtMs);

      const supplyEvents = this.supplySystem.advanceTick(state, dtMs);
      for (const ev of supplyEvents) events.push(ev);

      const navalEvents = this.navalSystem.advanceTick(state, dtMs);
      for (const ev of navalEvents) events.push(ev);

      const airEvents = this.airSystem.advanceTick(state, dtMs);
      for (const ev of airEvents) events.push(ev);

      const invasionEvents = this.invasionSystem.advanceTick(state, dtMs);
      for (const ev of invasionEvents) events.push(ev);

      if (this.combatSystem) {
        const combatEvents = this.combatSystem.advanceTick(state, dtMs);
        for (const ev of combatEvents) {
          events.push(ev);
          if (ev.kind === 'provinceControlled') {
            this.surrenderSystem.onProvinceControlled(state, ev.provinceId, ev.byCountryId, ev.fromCountryId);
            this.supplySystem.recalc(state);
          } else if (ev.kind === 'divisionDestroyed') {
            this.surrenderSystem.onDivisionDestroyed(state, ev.divisionId, ev.ownerId, ev.provinceId);
          }
        }
      }

      const surrenderEvents = this.surrenderSystem.advanceTick(state, dtMs);
      for (const ev of surrenderEvents) events.push(ev);

      if (state.nextEntityId > prevNextEntityId) {
        let needSupplyRecalc = false;
        state.buildings.forEach((b) => {
          if (b.id >= prevNextEntityId) {
            events.push({
              kind: 'buildingCompleted',
              buildingId: b.id,
              provinceId: b.provinceId,
            });
            const prov = state.provinces.get(b.provinceId);
            if (prov) {
              if (b.type === 'dockyard' && prov.portLevel < 1) {
                prov.portLevel = 1;
                needSupplyRecalc = true;
              } else if (b.type === 'supply_hub' && prov.supplyHubLevel < 1) {
                prov.supplyHubLevel = 1;
                needSupplyRecalc = true;
              } else if (b.type === 'air_base') {
                prov.airBaseLevel = Math.min(10, prov.airBaseLevel + 1);
              }
              state.provinces.set(b.provinceId, prov);
            }
          }
        });
        if (needSupplyRecalc) {
          this.supplySystem.recalc(state);
        }
      }

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

    if (frameId % 16 === 0 || this.lastHash === '') {
      this.lastHash = hashWorld(state);
    }

    return { frameId, events, hash: this.lastHash };
  }

  /**
   * 推进师团移动（M1简化版：相邻省份瞬移，不考虑移动时间）
   */
  private advanceDivisionMovement(state: WorldState, _dtMs: Fixed): void {
    const MOVE_TICKS_PER_PROVINCE = 5;
    state.divisions.forEach((div) => {
      if (div.status !== 'moving' && div.status !== 'retreating') return;
      if (div.targetProvinceId === null) {
        div.status = 'ready';
        return;
      }
      const targetProv = state.provinces.get(div.targetProvinceId);
      const curProv = state.provinces.get(div.currentProvinceId);
      if (!targetProv || !curProv) {
        div.status = 'ready';
        div.targetProvinceId = null;
        return;
      }

      if (state.tickId % MOVE_TICKS_PER_PROVINCE !== 0) return;

      if (div.status === 'moving') {
        if (targetProv.controllerId === div.ownerId && curProv.adjacentProvinceIds.includes(div.targetProvinceId)) {
          div.currentProvinceId = div.targetProvinceId;
          div.status = 'ready';
          div.targetProvinceId = null;
        } else {
          div.status = 'ready';
          div.targetProvinceId = null;
        }
      } else if (div.status === 'retreating') {
        if (targetProv.controllerId === div.ownerId && curProv.adjacentProvinceIds.includes(div.targetProvinceId)) {
          div.currentProvinceId = div.targetProvinceId;
          div.status = 'ready';
          div.targetProvinceId = null;
        } else {
          let foundRetreat = false;
          for (const adjId of curProv.adjacentProvinceIds) {
            const adjProv = state.provinces.get(adjId);
            if (adjProv && adjProv.controllerId === div.ownerId) {
              div.currentProvinceId = adjId;
              foundRetreat = true;
              break;
            }
          }
          if (!foundRetreat) {
            div.status = 'ready';
          }
          div.targetProvinceId = null;
        }
      }
    });
  }

  /**
   * 应用单个玩家动作到 state
   * @returns 该动作产生的事件列表
   */
  private applyAction(state: WorldState, action: PlayerAction): GameEvent[] {
    let actionEvents: GameEvent[] = [];
    switch (action.kind) {
      case 'setSpeed':
        state.speed = action.speed;
        break;

      case 'placeBuilding':
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
        this.researchSystem.assignSlot(state, this.playerCountryId, action.lineId, 0);
        break;

      case 'recruitDivision':
        this.divisionSystem.recruit(state, this.playerCountryId, action.provinceId, action.templateId);
        break;

      case 'recruitFleet':
        this.navalSystem.recruitFleet(state, this.playerCountryId, action.portProvinceId, action.composition, action.name);
        break;
      case 'assignFleetMission':
        this.navalSystem.assignMission(state, action.fleetId, action.mission, action.seaZoneId, action.targetProvinceId);
        break;
      case 'recallFleet':
        this.navalSystem.recallToPort(state, action.fleetId);
        break;

      case 'recruitWing':
        this.airSystem.recruitWing(state, this.playerCountryId, action.baseProvinceId, action.aircraft, action.name);
        break;
      case 'assignWingMission':
        this.airSystem.assignMission(state, action.wingId, action.mission, action.airZoneId, action.targetProvinceId, action.targetSeaZoneId);
        break;
      case 'recallWing':
        this.airSystem.recallToBase(state, action.wingId);
        break;

      case 'prepareInvasion': {
        const planId = this.invasionSystem.prepareInvasion(
          state, this.playerCountryId,
          action.fromProvinceId, action.toProvinceId,
          action.divisionIds, action.escortFleetIds, action.supportWingIds,
        );
        if (planId) {
          actionEvents.push({
            kind: 'invasionPrepared',
            planId,
            ownerId: this.playerCountryId,
            fromProvinceId: action.fromProvinceId,
            toProvinceId: action.toProvinceId,
          });
        }
        break;
      }
      case 'launchInvasion': {
        const ok = this.invasionSystem.launchInvasion(state, action.planId);
        if (ok) {
          actionEvents.push({
            kind: 'invasionLaunched',
            planId: action.planId,
            ownerId: this.playerCountryId,
          });
        }
        break;
      }
      case 'cancelInvasion': {
        const plan = state.invasions.get(action.planId);
        this.invasionSystem.cancelInvasion(state, action.planId);
        if (plan && plan.ownerId === this.playerCountryId) {
          actionEvents.push({
            kind: 'invasionCancelled',
            planId: action.planId,
            ownerId: this.playerCountryId,
          });
        }
        break;
      }

      case 'initiateDispute': {
        const dipEvents = this.diplomacySystem.declareWar(
          state,
          this.playerCountryId,
          action.targetCountryId,
          this.surrenderSystem
        );
        actionEvents = dipEvents;
        break;
      }

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

      case 'selectUnits': {
        if (action.additive) {
          const set = new Set(state.selectedUnitIds);
          for (const id of action.unitIds) {
            if (state.divisions.has(id)) {
              set.add(id);
            }
          }
          state.selectedUnitIds = Array.from(set);
        } else {
          const valid = action.unitIds.filter(id => state.divisions.has(id));
          state.selectedUnitIds = valid.slice();
        }
        break;
      }

      case 'deselectUnits':
        state.selectedUnitIds = [];
        break;

      case 'orderMove': {
        for (const divId of action.divisionIds) {
          const div = state.divisions.get(divId);
          if (!div || div.ownerId !== this.playerCountryId) continue;
          if (div.status === 'fighting' || div.status === 'training' || div.status === 'landing') continue;
          const targetProv = state.provinces.get(action.targetProvinceId);
          const curProv = state.provinces.get(div.currentProvinceId);
          if (!targetProv || !curProv) continue;
          if (!curProv.adjacentProvinceIds.includes(action.targetProvinceId)) continue;
          if (targetProv.controllerId === this.playerCountryId) {
            div.status = 'moving';
            div.inOffensive = false;
            div.targetProvinceId = action.targetProvinceId;
          } else {
            if (this.combatSystem) {
              this.combatSystem.issueOffensive(state, this.playerCountryId, [divId], action.targetProvinceId);
            }
          }
        }
        break;
      }

      case 'orderStop': {
        for (const divId of action.divisionIds) {
          const div = state.divisions.get(divId);
          if (!div || div.ownerId !== this.playerCountryId) continue;
          if (div.status === 'landing') continue;
          div.inOffensive = false;
          div.targetProvinceId = null;
          if (div.status === 'fighting' || div.status === 'moving' || div.status === 'retreating') {
            div.status = 'ready';
          }
        }
        break;
      }

      case 'orderRetreat': {
        for (const divId of action.divisionIds) {
          const div = state.divisions.get(divId);
          if (!div || div.ownerId !== this.playerCountryId) continue;
          if (div.status === 'landing') continue;
          div.inOffensive = false;
          div.status = 'retreating';
          div.targetProvinceId = action.targetProvinceId;
        }
        break;
      }

      case 'orderSplitDivision': {
        const div = state.divisions.get(action.divisionId);
        if (!div || div.ownerId !== this.playerCountryId) break;
        if (div.status === 'fighting' || div.status === 'training' || div.status === 'moving' || div.status === 'retreating' || div.status === 'landing') break;
        if (div.strength.lessThan(Fixed.fromNumber(0.5))) break;

        const newId = state.nextEntityId++;
        const halfStrength = div.strength.mul(Fixed.fromNumber(0.5));
        const halfOrg = div.organization.mul(Fixed.fromNumber(0.5));
        const newDiv: Division = {
          id: newId,
          ownerId: div.ownerId,
          templateId: div.templateId,
          template: div.template.map(t => ({ ...t })),
          organization: halfOrg,
          hardness: div.hardness,
          softAttack: div.softAttack.mul(Fixed.fromNumber(0.5)),
          hardAttack: div.hardAttack.mul(Fixed.fromNumber(0.5)),
          currentProvinceId: div.currentProvinceId,
          targetProvinceId: null,
          supply: div.supply,
          supplyStatus: div.supplyStatus,
          strength: halfStrength,
          trainingProgress: Fixed.ONE,
          status: 'ready',
          inOffensive: false,
        };
        div.strength = halfStrength;
        div.organization = halfOrg;
        div.softAttack = div.softAttack.mul(Fixed.fromNumber(0.5));
        div.hardAttack = div.hardAttack.mul(Fixed.fromNumber(0.5));
        state.divisions.set(newId, newDiv);
        break;
      }

      case 'orderMergeDivisions': {
        if (action.divisionIds.length !== 2) break;
        const div1 = state.divisions.get(action.divisionIds[0]);
        const div2 = state.divisions.get(action.divisionIds[1]);
        if (!div1 || !div2) break;
        if (div1.ownerId !== this.playerCountryId || div2.ownerId !== this.playerCountryId) break;
        if (div1.currentProvinceId !== div2.currentProvinceId) break;
        if (div1.status === 'fighting' || div1.status === 'training' || div1.status === 'moving' || div1.status === 'retreating' || div1.status === 'landing') break;
        if (div2.status === 'fighting' || div2.status === 'training' || div2.status === 'moving' || div2.status === 'retreating' || div2.status === 'landing') break;

        const newStrength = div1.strength.add(div2.strength);
        div1.strength = newStrength.greaterThan(Fixed.ONE) ? Fixed.ONE : newStrength;
        const newOrg = div1.organization.add(div2.organization);
        div1.organization = newOrg.greaterThan(Fixed.ONE) ? Fixed.ONE : newOrg;
        const maxSoftAtk = Fixed.fromInt(30);
        const newSoftAtk = div1.softAttack.add(div2.softAttack);
        div1.softAttack = newSoftAtk.greaterThan(maxSoftAtk) ? maxSoftAtk : newSoftAtk;
        const maxHardAtk = Fixed.fromInt(10);
        const newHardAtk = div1.hardAttack.add(div2.hardAttack);
        div1.hardAttack = newHardAtk.greaterThan(maxHardAtk) ? maxHardAtk : newHardAtk;
        state.divisions.delete(div2.id);
        break;
      }

      default:
        break;
    }
    return actionEvents;
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
