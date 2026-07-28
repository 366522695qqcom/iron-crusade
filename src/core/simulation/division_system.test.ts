/**
 * DivisionSystem 单元测试
 *
 * 覆盖：
 * - 招募扣政治点和装备
 * - 资源不足招募失败
 * - 训练进度递增
 * - 训练完成后 status='ready' 且发 divisionRecruited 事件
 */
import { describe, it, expect } from 'vitest';
import { Fixed } from '../determinism/fixed';
import { SortedMap } from '../determinism/sorted_map';
import { DefaultDivisionSystem } from './division_system';
import type { WorldState } from '../state/world_state';

function makeBaseState(political = 200, infantryCount = 500): WorldState {
  const countries = new SortedMap<string, any>();
  countries.set('p1', {
    id: 'p1',
    name: '玩家国',
    developmentPath: 'industrial_authoritarian',
    isPlayer: true,
    isAI: false,
    capitalProvinceId: 1,
    disputeResolve: Fixed.ZERO,
    stability: Fixed.HALF,
    politicalPower: Fixed.fromInt(political),
    factionId: null,
    ownedProvinceIds: [1],
    controlledProvinceIds: [1],
  });

  const provinces = new SortedMap<number, any>();
  provinces.set(1, {
    id: 1, ownerId: 'p1', controllerId: 'p1', name: 'A',
    terrain: 'plains', isCoastal: false, adjacentProvinceIds: [],
    infrastructure: 3, buildingSlots: 4, combatWidth: 10,
    supplyHubLevel: 1, fortLevel: 0, portLevel: 0,
    adjacentSeaZoneIds: [], VP: 10,
  });

  const stockpiles = new SortedMap<string, any>();
  stockpiles.set('p1', {
    countryId: 'p1',
    steel: Fixed.fromInt(100),
    oil: Fixed.fromInt(50),
    tungsten: Fixed.fromInt(10),
    rubber: Fixed.fromInt(20),
    aluminum: Fixed.fromInt(30),
    political: Fixed.fromInt(political),
    caps: {
      steel: Fixed.fromInt(500),
      oil: Fixed.fromInt(300),
      tungsten: Fixed.fromInt(50),
      rubber: Fixed.fromInt(100),
      aluminum: Fixed.fromInt(150),
      political: Fixed.fromInt(2000),
    },
    history: [],
  });

  const equipmentPools = new SortedMap<string, any>();
  equipmentPools.set('p1', {
    countryId: 'p1',
    stocks: [
      { type: 'infantry_equipment', count: infantryCount },
      { type: 'artillery', count: 0 },
      { type: 'light_tank', count: 0 },
    ],
  });

  return {
    version: '1.0.0',
    seed: 42,
    tickId: 0,
    tickElapsed: Fixed.ZERO,
    speed: 1,
    countries,
    provinces,
    resourceNodes: new SortedMap(),
    stockpiles,
    buildings: new SortedMap(),
    factories: new SortedMap(),
    constructionQueues: new SortedMap(),
    productionTasks: new SortedMap(),
    equipmentPools,
    divisions: new SortedMap(),
    divisionTemplates: new SortedMap(),
    supplyNetwork: { provinceSupply: new SortedMap(), seaSupplyRoutes: [], lastRecalcTick: 0 },
    focusTrees: new SortedMap(),
    research: new SortedMap(),
    disputes: new SortedMap(),
    fronts: new SortedMap(),
    warLosses: new SortedMap(),
    warLog: [],
    selectedUnitIds: [],
    nextEntityId: 100,
    seedMap: { 'p1': 100 },
    gameOver: null,
    shipTemplates: new SortedMap(),
    ships: new SortedMap(),
    fleets: new SortedMap(),
    seaZones: new SortedMap(),
    seaControl: new SortedMap(),
    convoyRoutes: [],
  } as WorldState;
}

describe('DivisionSystem', () => {
  it('招募扣政治点和装备', () => {
    const state = makeBaseState(200, 500);
    const ds = new DefaultDivisionSystem();

    const polBefore = state.stockpiles.get('p1')!.political;
    const equipBefore = state.equipmentPools.get('p1')!.stocks.find(s => s.type === 'infantry_equipment')!.count;

    const ok = ds.recruit(state, 'p1', 1);
    expect(ok).toBe(true);

    const polAfter = state.stockpiles.get('p1')!.political;
    const equipAfter = state.equipmentPools.get('p1')!.stocks.find(s => s.type === 'infantry_equipment')!.count;

    expect(polBefore.sub(polAfter).toNumber()).toBeCloseTo(100, 0);
    expect(equipBefore - equipAfter).toBe(200);

    const div = state.divisions.get(100);
    expect(div).toBeTruthy();
    expect(div!.ownerId).toBe('p1');
    expect(div!.status).toBe('training');
    expect(div!.currentProvinceId).toBe(1);
    expect(div!.inOffensive).toBe(false);
    expect(state.nextEntityId).toBe(101);
  });

  it('政治点不足招募失败', () => {
    const state = makeBaseState(50, 500);
    const ds = new DefaultDivisionSystem();

    const divCountBefore = state.divisions.size();
    const ok = ds.recruit(state, 'p1', 1);
    expect(ok).toBe(false);
    expect(state.divisions.size()).toBe(divCountBefore);
    expect(state.nextEntityId).toBe(100);
  });

  it('装备不足招募失败', () => {
    const state = makeBaseState(200, 50);
    const ds = new DefaultDivisionSystem();

    const divCountBefore = state.divisions.size();
    const ok = ds.recruit(state, 'p1', 1);
    expect(ok).toBe(false);
    expect(state.divisions.size()).toBe(divCountBefore);
    expect(state.nextEntityId).toBe(100);
  });

  it('训练进度递增且完成后 status=ready 并发事件', () => {
    const state = makeBaseState(200, 500);
    const ds = new DefaultDivisionSystem();
    ds.recruit(state, 'p1', 1);
    const div = state.divisions.get(100)!;
    expect(div.status).toBe('training');
    expect(div.trainingProgress.equals(Fixed.ZERO)).toBe(true);

    const dtMs = Fixed.fromInt(100);
    let recruitedEvent: any = null;
    for (let tick = 0; tick < 700; tick++) {
      state.tickId = tick;
      const events = ds.advanceTick(state, 'p1', dtMs);
      for (const ev of events) {
        if (ev.kind === 'divisionRecruited') {
          recruitedEvent = ev;
        }
      }
    }

    expect(div.status).toBe('ready');
    expect(div.trainingProgress.greaterOrEqual(Fixed.ONE)).toBe(true);
    expect(div.strength.equals(Fixed.ONE)).toBe(true);
    expect(recruitedEvent).toBeTruthy();
    if (recruitedEvent && recruitedEvent.kind === 'divisionRecruited') {
      expect(recruitedEvent.divisionId).toBe(100);
      expect(recruitedEvent.provinceId).toBe(1);
    }
  });
});
