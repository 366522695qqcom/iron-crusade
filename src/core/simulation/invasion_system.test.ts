/**
 * InvasionSystem 单元测试（M5 登陆作战）
 *
 * 覆盖：
 * - prepareInvasion 校验条件（港口、沿海、运输船、师团归属）
 * - 准备进度推进到 ready
 * - cancelInvasion 返还运输船
 * - launchInvasion 前置条件检查
 * - 登陆成功/失败结算
 */
import { describe, it, expect } from 'vitest';
import { Fixed } from '../determinism/fixed';
import { SortedMap } from '../determinism/sorted_map';
import { DefaultInvasionSystem } from './invasion_system';
import { DefaultNavalSystem } from './naval_system';
import { DefaultAirSystem } from './air_system';
import { DefaultSupplySystem } from './supply_system';
import { DefaultSurrenderSystem } from './surrender_system';
import type { WorldState, Division } from '../state/world_state';

function makeBaseState(): WorldState {
  const countries = new SortedMap<string, any>();
  countries.set('p1', {
    id: 'p1', name: '玩家国', developmentPath: 'ind',
    isPlayer: true, isAI: false, capitalProvinceId: 1,
    disputeResolve: Fixed.fromNumber(0.5), stability: Fixed.HALF,
    politicalPower: Fixed.fromInt(500), factionId: null,
    ownedProvinceIds: [1, 2], controlledProvinceIds: [1, 2],
  });
  countries.set('e1', {
    id: 'e1', name: '敌国', developmentPath: 'mil',
    isPlayer: false, isAI: true, capitalProvinceId: 3,
    disputeResolve: Fixed.fromNumber(0.5), stability: Fixed.HALF,
    politicalPower: Fixed.fromInt(500), factionId: null,
    ownedProvinceIds: [3, 4], controlledProvinceIds: [3, 4],
  });

  const provinces = new SortedMap<number, any>();
  provinces.set(1, { id: 1, ownerId: 'p1', controllerId: 'p1', name: '首都', terrain: 'plains', isCoastal: false, adjacentProvinceIds: [2], infrastructure: 3, buildingSlots: 4, combatWidth: 10, supplyHubLevel: 1, fortLevel: 0, portLevel: 0, airBaseLevel: 1, adjacentSeaZoneIds: [], VP: 10 });
  provinces.set(2, { id: 2, ownerId: 'p1', controllerId: 'p1', name: '港口省', terrain: 'plains', isCoastal: true, adjacentProvinceIds: [1], infrastructure: 2, buildingSlots: 3, combatWidth: 8, supplyHubLevel: 0, fortLevel: 0, portLevel: 2, airBaseLevel: 0, adjacentSeaZoneIds: [10], VP: 0 });
  provinces.set(3, { id: 3, ownerId: 'e1', controllerId: 'e1', name: '敌首都', terrain: 'plains', isCoastal: false, adjacentProvinceIds: [4], infrastructure: 3, buildingSlots: 4, combatWidth: 10, supplyHubLevel: 1, fortLevel: 0, portLevel: 0, airBaseLevel: 1, adjacentSeaZoneIds: [], VP: 10 });
  provinces.set(4, { id: 4, ownerId: 'e1', controllerId: 'e1', name: '敌海岸', terrain: 'plains', isCoastal: true, adjacentProvinceIds: [3], infrastructure: 2, buildingSlots: 3, combatWidth: 8, supplyHubLevel: 0, fortLevel: 1, portLevel: 1, airBaseLevel: 0, adjacentSeaZoneIds: [10], VP: 3 });

  const seaZones = new SortedMap<number, any>();
  seaZones.set(10, { id: 10, name: '近海', provinceIds: [2, 4], adjacentSeaZoneIds: [] });

  const airZones = new SortedMap<number, any>();
  airZones.set(20, { id: 20, name: '空域', provinceIds: [2, 4], adjacentAirZoneIds: [] });

  const stockpiles = new SortedMap<string, any>();
  function makeStockpile(pol: number) {
    return {
      countryId: '',
      steel: Fixed.fromInt(100), oil: Fixed.fromInt(50), tungsten: Fixed.fromInt(10),
      rubber: Fixed.fromInt(20), aluminum: Fixed.fromInt(30), political: Fixed.fromInt(pol),
      caps: {
        steel: Fixed.fromInt(500), oil: Fixed.fromInt(300), tungsten: Fixed.fromInt(50),
        rubber: Fixed.fromInt(100), aluminum: Fixed.fromInt(150), political: Fixed.fromInt(2000),
      },
      history: [],
    };
  }
  const sp1 = makeStockpile(500); sp1.countryId = 'p1';
  const sp2 = makeStockpile(500); sp2.countryId = 'e1';
  stockpiles.set('p1', sp1);
  stockpiles.set('e1', sp2);

  const equipmentPools = new SortedMap<string, any>();
  function makePool(cid: string, inf: number, convoy: number) {
    return {
      countryId: cid,
      stocks: [
        { type: 'infantry_equipment', count: inf },
        { type: 'artillery_equipment', count: 0 },
        { type: 'convoy', count: convoy },
      ],
    };
  }
  equipmentPools.set('p1', makePool('p1', 1000, 100));
  equipmentPools.set('e1', makePool('e1', 1000, 0));

  return {
    version: '1.0.0', seed: 42, tickId: 0, tickElapsed: Fixed.ZERO, speed: 1,
    countries, provinces, resourceNodes: new SortedMap(), stockpiles,
    buildings: new SortedMap(), factories: new SortedMap(), constructionQueues: new SortedMap(),
    productionTasks: new SortedMap(), equipmentPools, divisions: new SortedMap(),
    divisionTemplates: new SortedMap(),
    supplyNetwork: { provinceSupply: new SortedMap(), seaSupplyRoutes: [], lastRecalcTick: 0 },
    focusTrees: new SortedMap(), research: new SortedMap(), disputes: new SortedMap(),
    fronts: new SortedMap(), warLosses: new SortedMap(), warLog: [], selectedUnitIds: [],
    nextEntityId: 100, seedMap: { 'p1': 100, 'e1': 200 }, gameOver: null,
    shipTemplates: new SortedMap(),
    ships: new SortedMap(),
    fleets: new SortedMap(),
    seaZones,
    seaControl: new SortedMap(),
    convoyRoutes: [],
    airZones,
    wings: new SortedMap(),
    airSuperiority: new SortedMap(),
    invasions: new SortedMap(),
  } as WorldState;
}

function makeReadyDivision(id: number, ownerId: string, provinceId: number): Division {
  return {
    id, ownerId,
    templateId: 'infantry',
    template: [
      { slot: 0, equipmentType: 'infantry_equipment' },
      { slot: 1, equipmentType: 'infantry_equipment' },
      { slot: 2, equipmentType: 'infantry_equipment' },
      { slot: 3, equipmentType: 'infantry_equipment' },
    ],
    organization: Fixed.fromNumber(0.9),
    hardness: Fixed.fromNumber(0.1),
    softAttack: Fixed.fromInt(30),
    hardAttack: Fixed.fromInt(5),
    currentProvinceId: provinceId,
    targetProvinceId: null,
    supply: Fixed.ONE,
    supplyStatus: 'ok',
    strength: Fixed.ONE,
    trainingProgress: Fixed.ONE,
    status: 'ready',
    inOffensive: false,
  };
}

function createInvasionSystem() {
  const isys = new DefaultInvasionSystem();
  const nsys = new DefaultNavalSystem();
  const asys = new DefaultAirSystem();
  const ssys = new DefaultSupplySystem();
  const surrsys = new DefaultSurrenderSystem();
  isys.setNavalSystem(nsys);
  isys.setAirSystem(asys);
  isys.setSupplySystem(ssys);
  isys.setSurrenderSystem(surrsys);
  return { isys, nsys, asys, ssys, surrsys };
}

function setSeaControl(state: WorldState, seaZoneId: number, countryId: string, value: number): void {
  let sc = state.seaControl.get(seaZoneId);
  if (!sc) {
    sc = { seaZoneId, control: [] };
    state.seaControl.set(seaZoneId, sc);
  }
  let entry = sc.control.find(c => c.countryId === countryId);
  if (!entry) {
    entry = { countryId, ratio: Fixed.ZERO };
    sc.control.push(entry);
  }
  entry.ratio = Fixed.fromNumber(value);
}

describe('InvasionSystem', () => {
  it('prepareInvasion 失败：出发省无港口/非沿海', () => {
    const state = makeBaseState();
    const { isys } = createInvasionSystem();
    const div = makeReadyDivision(200, 'p1', 1);
    state.divisions.set(200, div);
    const planId = isys.prepareInvasion(state, 'p1', 1, 4, [200], [], []);
    expect(planId).toBeNull();
  });

  it('prepareInvasion 失败：目标省非沿海', () => {
    const state = makeBaseState();
    const { isys } = createInvasionSystem();
    const div = makeReadyDivision(200, 'p1', 2);
    state.divisions.set(200, div);
    const planId = isys.prepareInvasion(state, 'p1', 2, 3, [200], [], []);
    expect(planId).toBeNull();
  });

  it('prepareInvasion 失败：运输船不足', () => {
    const state = makeBaseState();
    const pool = state.equipmentPools.get('p1');
    if (pool) {
      const convoyStock = pool.stocks.find(s => s.type === 'convoy');
      if (convoyStock) convoyStock.count = 0;
    }
    const { isys } = createInvasionSystem();
    const div = makeReadyDivision(200, 'p1', 2);
    state.divisions.set(200, div);
    const planId = isys.prepareInvasion(state, 'p1', 2, 4, [200], [], []);
    expect(planId).toBeNull();
  });

  it('prepareInvasion 成功：创建计划、扣除运输船', () => {
    const state = makeBaseState();
    const { isys, nsys } = createInvasionSystem();
    const div = makeReadyDivision(200, 'p1', 2);
    state.divisions.set(200, div);

    const convoysBefore = nsys.getConvoyCount(state, 'p1');
    const planId = isys.prepareInvasion(state, 'p1', 2, 4, [200], [], []);
    expect(planId).toBeTruthy();

    const plan = state.invasions.get(planId!);
    expect(plan).toBeTruthy();
    expect(plan!.status).toBe('preparing');
    expect(plan!.requiredConvoys).toBe(10);

    const convoysAfter = nsys.getConvoyCount(state, 'p1');
    expect(convoysAfter).toBe(convoysBefore - 10);
  });

  it('cancelInvasion 返还运输船、重置师团', () => {
    const state = makeBaseState();
    const { isys, nsys } = createInvasionSystem();
    const div = makeReadyDivision(200, 'p1', 2);
    state.divisions.set(200, div);

    const planId = isys.prepareInvasion(state, 'p1', 2, 4, [200], [], []);
    expect(planId).toBeTruthy();
    const convoysAfterPrepare = nsys.getConvoyCount(state, 'p1');

    isys.cancelInvasion(state, planId!);
    expect(state.invasions.has(planId!)).toBe(false);
    const convoysAfterCancel = nsys.getConvoyCount(state, 'p1');
    expect(convoysAfterCancel).toBe(convoysAfterPrepare + 10);

    const d = state.divisions.get(200);
    expect(d).toBeTruthy();
    expect(d!.targetProvinceId).toBeNull();
  });

  it('准备进度推进：preparing → ready', () => {
    const state = makeBaseState();
    const { isys } = createInvasionSystem();
    const div = makeReadyDivision(200, 'p1', 2);
    state.divisions.set(200, div);

    const planId = isys.prepareInvasion(state, 'p1', 2, 4, [200], [], []);
    expect(planId).toBeTruthy();

    const dtMs = Fixed.fromInt(100);
    let becameReady = false;
    for (let i = 0; i < 2000; i++) {
      state.tickId = i;
      isys.advanceTick(state, dtMs);
      const plan = state.invasions.get(planId!);
      if (plan && plan.status === 'ready') {
        becameReady = true;
        break;
      }
    }
    expect(becameReady).toBe(true);

    const cond = isys.checkConditions(state, planId!);
    expect(cond.preparationReady).toBe(true);
  });

  it('launchInvasion 需要海控≥60%', () => {
    const state = makeBaseState();
    const { isys } = createInvasionSystem();
    const div = makeReadyDivision(200, 'p1', 2);
    state.divisions.set(200, div);

    const planId = isys.prepareInvasion(state, 'p1', 2, 4, [200], [], []);
    expect(planId).toBeTruthy();

    const plan = state.invasions.get(planId!);
    plan!.status = 'ready';
    plan!.preparationProgress = Fixed.ONE;

    setSeaControl(state, 10, 'p1', 0.3);
    const ok = isys.launchInvasion(state, planId!);
    expect(ok).toBe(false);

    setSeaControl(state, 10, 'p1', 0.8);
    const ok2 = isys.launchInvasion(state, planId!);
    expect(ok2).toBe(true);

    const d = state.divisions.get(200);
    expect(d!.status).toBe('landing');
  });

  it('登陆成功：占领目标省、师团状态为fighting、返还一半运输船', () => {
    const state = makeBaseState();
    const { isys, nsys } = createInvasionSystem();
    const div = makeReadyDivision(200, 'p1', 2);
    div.softAttack = Fixed.fromInt(200);
    div.strength = Fixed.ONE;
    div.organization = Fixed.ONE;
    state.divisions.set(200, div);
    setSeaControl(state, 10, 'p1', 1.0);

    const convoysBefore = nsys.getConvoyCount(state, 'p1');
    const planId = isys.prepareInvasion(state, 'p1', 2, 4, [200], [], []);
    expect(planId).toBeTruthy();
    const plan = state.invasions.get(planId!);
    plan!.status = 'ready';
    plan!.preparationProgress = Fixed.ONE;
    const launched = isys.launchInvasion(state, planId!);
    expect(launched).toBe(true);

    const dtMs = Fixed.fromInt(100);
    let successEvent = false;
    for (let i = 0; i < 200; i++) {
      state.tickId = plan!.launchedTick + i;
      const events = isys.advanceTick(state, dtMs);
      for (const ev of events) {
        if (ev.kind === 'invasionSuccess') {
          successEvent = true;
          expect(ev.provinceId).toBe(4);
        }
      }
      if (successEvent) break;
    }
    expect(successEvent).toBe(true);
    expect(state.provinces.get(4)!.controllerId).toBe('p1');
    expect(state.divisions.get(200)!.status).toBe('fighting');
    expect(state.divisions.get(200)!.currentProvinceId).toBe(4);

    const convoysAfter = nsys.getConvoyCount(state, 'p1');
    expect(convoysAfter).toBe(convoysBefore - 5);
  });
});
