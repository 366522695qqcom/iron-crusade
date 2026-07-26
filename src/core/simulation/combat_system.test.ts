/**
 * CombatSystem 单元测试
 *
 * 覆盖：
 * - initiateDispute 创建 Dispute
 * - drawFront 创建 Front 记录
 * - issueOffensive 将师团标记为 fighting 状态
 * - 进攻成功省份易主
 * - 争端决心下降后结算（disputeResolved）
 * - 骰子确定性（同 seed 同结果）
 */
import { describe, it, expect } from 'vitest';
import { Fixed } from '../determinism/fixed';
import { SortedMap } from '../determinism/sorted_map';
import { DefaultCombatSystem } from './combat_system';
import { DefaultDivisionSystem } from './division_system';
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
  provinces.set(1, { id: 1, ownerId: 'p1', controllerId: 'p1', name: '首都', terrain: 'plains', isCoastal: false, infrastructure: 3, buildingSlots: 4, combatWidth: 10, supplyHubLevel: 1, fortLevel: 0, VP: 10 });
  provinces.set(2, { id: 2, ownerId: 'p1', controllerId: 'p1', name: '边境', terrain: 'plains', isCoastal: false, infrastructure: 2, buildingSlots: 3, combatWidth: 8, supplyHubLevel: 0, fortLevel: 0, VP: 0 });
  provinces.set(3, { id: 3, ownerId: 'e1', controllerId: 'e1', name: '敌首都', terrain: 'plains', isCoastal: false, infrastructure: 3, buildingSlots: 4, combatWidth: 10, supplyHubLevel: 1, fortLevel: 0, VP: 10 });
  provinces.set(4, { id: 4, ownerId: 'e1', controllerId: 'e1', name: '敌边境', terrain: 'plains', isCoastal: false, infrastructure: 2, buildingSlots: 3, combatWidth: 8, supplyHubLevel: 0, fortLevel: 1, VP: 0 });

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
  function makePool(cid: string, inf: number) {
    return {
      countryId: cid,
      stocks: [
        { type: 'infantry_equipment', count: inf },
        { type: 'artillery', count: 0 },
        { type: 'light_tank', count: 0 },
      ],
    };
  }
  equipmentPools.set('p1', makePool('p1', 1000));
  equipmentPools.set('e1', makePool('e1', 1000));

  return {
    version: '1.0.0', seed: 42, tickId: 0, tickElapsed: Fixed.ZERO, speed: 1,
    countries, provinces, resourceNodes: new SortedMap(), stockpiles,
    buildings: new SortedMap(), factories: new SortedMap(), constructionQueues: new SortedMap(),
    productionTasks: new SortedMap(), equipmentPools, divisions: new SortedMap(),
    focusTrees: new SortedMap(), research: new SortedMap(), disputes: new SortedMap(),
    fronts: new SortedMap(), nextEntityId: 100, seedMap: { 'p1': 100, 'e1': 200 },
  } as WorldState;
}

function makeReadyDivision(id: number, ownerId: string, provinceId: number, strength = 1.0): Division {
  return {
    id, ownerId,
    template: [
      { slot: 0, equipmentType: 'infantry_equipment' },
      { slot: 1, equipmentType: 'infantry_equipment' },
      { slot: 2, equipmentType: 'infantry_equipment' },
      { slot: 3, equipmentType: 'infantry_equipment' },
    ],
    organization: Fixed.fromNumber(0.8),
    hardness: Fixed.fromNumber(0.1),
    softAttack: Fixed.fromInt(30),
    hardAttack: Fixed.fromInt(5),
    currentProvinceId: provinceId,
    targetProvinceId: null,
    supply: Fixed.ONE,
    strength: Fixed.fromNumber(strength),
    trainingProgress: Fixed.ONE,
    status: 'ready',
    inOffensive: false,
  };
}

describe('CombatSystem', () => {
  it('initiateDispute 创建 Dispute', () => {
    const state = makeBaseState();
    const cs = new DefaultCombatSystem();
    const id = cs.initiateDispute(state, 'p1', 'e1');
    expect(id).toBeTruthy();
    const disp = state.disputes.get(id!);
    expect(disp).toBeTruthy();
    expect(disp!.participants).toContain('p1');
    expect(disp!.participants).toContain('e1');
    expect(disp!.participantSet.has('p1')).toBe(true);
    expect(disp!.participantSet.has('e1')).toBe(true);
  });

  it('drawFront 创建 Front 记录并防重复', () => {
    const state = makeBaseState();
    const cs = new DefaultCombatSystem();
    cs.initiateDispute(state, 'p1', 'e1');

    cs.drawFront(state, 'p1', 2, 4);
    let fronts = state.fronts.get('p1');
    expect(fronts).toBeTruthy();
    expect(fronts!.length).toBe(1);
    expect(fronts![0].fromProvince).toBe(2);
    expect(fronts![0].toProvince).toBe(4);
    expect(fronts![0].defenderId).toBe('e1');

    cs.drawFront(state, 'p1', 2, 4);
    fronts = state.fronts.get('p1');
    expect(fronts!.length).toBe(1);
  });

  it('issueOffensive 将师团标记为 fighting 状态', () => {
    const state = makeBaseState();
    const cs = new DefaultCombatSystem();
    cs.initiateDispute(state, 'p1', 'e1');

    const div = makeReadyDivision(200, 'p1', 2);
    state.divisions.set(200, div);

    cs.issueOffensive(state, 'p1', [200], 4);
    expect(div.status).toBe('fighting');
    expect(div.inOffensive).toBe(true);
    expect(div.targetProvinceId).toBe(4);
  });

  it('进攻成功省份易主并发 provinceControlled 事件', () => {
    const state = makeBaseState();
    state.seed = 999;
    state.seedMap = {};
    const cs = new DefaultCombatSystem();
    cs.initiateDispute(state, 'p1', 'e1');
    cs.drawFront(state, 'p1', 2, 4);

    const strongDiv = makeReadyDivision(200, 'p1', 2, 1.0);
    strongDiv.softAttack = Fixed.fromInt(100);
    strongDiv.organization = Fixed.fromNumber(1.0);
    state.divisions.set(200, strongDiv);
    cs.issueOffensive(state, 'p1', [200], 4);

    const dtMs = Fixed.fromInt(100);
    let provinceChanged = false;
    for (let tick = 0; tick < 100; tick++) {
      state.tickId = tick;
      const events = cs.advanceTick(state, dtMs);
      for (const ev of events) {
        if (ev.kind === 'provinceControlled') {
          provinceChanged = true;
          expect(ev.provinceId).toBe(4);
          expect(ev.byCountryId).toBe('p1');
        }
      }
      if (provinceChanged) break;
    }

    expect(provinceChanged).toBe(true);
    expect(state.provinces.get(4)!.controllerId).toBe('p1');
    expect(strongDiv.currentProvinceId).toBe(4);
  });

  it('骰子确定性：同 seed 同结果', () => {
    function runOnce(seed: number): { controllerId: string; resolveP1: number; resolveE1: number } {
      const state = makeBaseState();
      state.seed = seed;
      state.seedMap = {};
      const cs = new DefaultCombatSystem();
      const dispId = cs.initiateDispute(state, 'p1', 'e1');
      cs.drawFront(state, 'p1', 2, 4);

      const div = makeReadyDivision(200, 'p1', 2, 1.0);
      div.softAttack = Fixed.fromInt(50);
      div.organization = Fixed.fromNumber(0.8);
      state.divisions.set(200, div);
      cs.issueOffensive(state, 'p1', [200], 4);

      const dtMs = Fixed.fromInt(100);
      for (let tick = 0; tick < 50; tick++) {
        state.tickId = tick;
        cs.advanceTick(state, dtMs);
      }

      const disp = state.disputes.get(dispId!);
      return {
        controllerId: state.provinces.get(4)!.controllerId,
        resolveP1: disp ? disp.disputeResolve['p1'].toNumber() : -1,
        resolveE1: disp ? disp.disputeResolve['e1'].toNumber() : -1,
      };
    }

    const r1 = runOnce(42);
    const r2 = runOnce(42);
    expect(r1.controllerId).toBe(r2.controllerId);
    expect(r1.resolveP1).toBe(r2.resolveP1);
    expect(r1.resolveE1).toBe(r2.resolveE1);
  });
});
