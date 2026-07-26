/**
 * FactorySystem 单元测试
 *
 * 覆盖：
 * - autoTrade 在资源不足时分配民厂
 * - autoTrade 在资源充足时不分配
 * - produceTick trade task 60s 后资源增加 50
 * - applyTemplate 创建 production task
 * - produceTick production task 完成后装备池 +output
 * - 多工厂生产进度更快
 */
import { describe, it, expect } from 'vitest';
import { Fixed } from '../determinism/fixed';
import { SortedMap } from '../determinism/sorted_map';
import { DefaultFactorySystem } from './factory_system';
import type { WorldState } from '../state/world_state';
import type { ResourceType } from '../types';

function makeBaseState(
  steel = 100,
  oil = 50,
  tungsten = 10,
  rubber = 20,
  aluminum = 30,
): WorldState {
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
    politicalPower: Fixed.fromInt(10),
    factionId: null,
    ownedProvinceIds: [1],
    controlledProvinceIds: [1],
  });

  const provinces = new SortedMap<number, any>();
  provinces.set(1, {
    id: 1, ownerId: 'p1', controllerId: 'p1', name: 'A',
    terrain: 'plains', isCoastal: false,
    infrastructure: 3, buildingSlots: 4, combatWidth: 10,
    supplyHubLevel: 1, fortLevel: 0, VP: 10,
  });

  const stockpiles = new SortedMap<string, any>();
  stockpiles.set('p1', {
    countryId: 'p1',
    steel: Fixed.fromInt(steel),
    oil: Fixed.fromInt(oil),
    tungsten: Fixed.fromInt(tungsten),
    rubber: Fixed.fromInt(rubber),
    aluminum: Fixed.fromInt(aluminum),
    political: Fixed.fromInt(10),
    caps: {
      steel: Fixed.fromInt(500),
      oil: Fixed.fromInt(300),
      tungsten: Fixed.fromInt(50),
      rubber: Fixed.fromInt(100),
      aluminum: Fixed.fromInt(150),
      political: Fixed.fromInt(100),
    },
    history: [],
  });

  const equipmentPools = new SortedMap<string, any>();
  equipmentPools.set('p1', {
    countryId: 'p1',
    stocks: [
      { type: 'infantry_equipment', count: 0 },
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
    focusTrees: new SortedMap(),
    research: new SortedMap(),
    disputes: new SortedMap(),
    nextEntityId: 100,
    seedMap: { 'p1': 100 },
  } as WorldState;
}

function addIdleCivilianFactory(state: WorldState, id: number, provinceId = 1): void {
  state.factories.set(id, {
    id,
    provinceId,
    type: 'civilian',
    level: 1,
    state: 'idle',
    taskId: null,
    idleSinceTick: 0,
    productionProgress: Fixed.ZERO,
  });
}

function addIdleMilitaryFactory(state: WorldState, id: number, provinceId = 1): void {
  state.factories.set(id, {
    id,
    provinceId,
    type: 'military',
    level: 1,
    state: 'idle',
    taskId: null,
    idleSinceTick: 0,
    productionProgress: Fixed.ZERO,
  });
}

describe('FactorySystem', () => {
  it('autoTrade 在资源不足时分配民厂', () => {
    const state = makeBaseState(100);
    addIdleCivilianFactory(state, 1);
    addIdleCivilianFactory(state, 2);
    addIdleCivilianFactory(state, 3);

    const fs = new DefaultFactorySystem();
    fs.autoTrade(state, 'p1');

    const tradeTask = state.productionTasks.get('trade_p1');
    expect(tradeTask).toBeTruthy();
    expect(tradeTask?.type).toBe('trade');
    expect(tradeTask?.assignedFactoryIds.length).toBeGreaterThan(0);
    expect(tradeTask?.assignedFactoryIds.length).toBeLessThanOrEqual(2);

    for (const fid of tradeTask!.assignedFactoryIds) {
      const f = state.factories.get(fid);
      expect(f?.state).toBe('working');
      expect(f?.taskId).toBe('trade_p1');
    }
  });

  it('autoTrade 在资源充足时不分配', () => {
    const state = makeBaseState(400, 200, 30, 60, 90);
    addIdleCivilianFactory(state, 1);

    const fs = new DefaultFactorySystem();
    fs.autoTrade(state, 'p1');

    const tradeTask = state.productionTasks.get('trade_p1');
    expect(tradeTask).toBeFalsy();

    const factory = state.factories.get(1);
    expect(factory?.state).toBe('idle');
  });

  it('produceTick trade task 完成后资源增加 50', () => {
    const state = makeBaseState(100);
    addIdleCivilianFactory(state, 1);

    const fs = new DefaultFactorySystem();
    fs.autoTrade(state, 'p1');

    const tradeTask = state.productionTasks.get('trade_p1')!;
    const tradedResource = tradeTask.target as ResourceType;
    const stockBefore = (state.stockpiles.get('p1')! as any)[tradedResource].toNumber();
    const dtMs = Fixed.fromInt(100);

    let tradeCompletedEvent = null;
    for (let tick = 0; tick < 2000; tick++) {
      state.tickId = tick;
      const events = fs.produceTick(state, 'p1', dtMs);
      for (const ev of events) {
        if (ev.kind === 'tradeCompleted') {
          tradeCompletedEvent = ev;
        }
      }
      if (tradeCompletedEvent) break;
    }

    const stockAfter = (state.stockpiles.get('p1')! as any)[tradedResource].toNumber();
    expect(stockAfter).toBe(stockBefore + 50);
    expect(tradeCompletedEvent).toBeTruthy();
    if (tradeCompletedEvent && tradeCompletedEvent.kind === 'tradeCompleted') {
      expect(tradeCompletedEvent.countryId).toBe('p1');
      expect(tradeCompletedEvent.resourceType).toBe(tradedResource);
      expect(tradeCompletedEvent.amount.toNumber()).toBe(50);
    }
  });

  it('applyTemplate 创建 production task', () => {
    const state = makeBaseState(400, 200, 30, 60, 90);
    addIdleMilitaryFactory(state, 10);
    addIdleMilitaryFactory(state, 11);

    const fs = new DefaultFactorySystem();
    fs.applyTemplate(state, [10, 11], 'infantry_equipment');

    const taskKey = 'tpl_infantry_equipment';
    const task = state.productionTasks.get(taskKey);
    expect(task).toBeTruthy();
    expect(task?.type).toBe('production');
    expect(task?.target).toBe('infantry_equipment');
    expect(task?.countryId).toBe('p1');
    expect(task?.assignedFactoryIds.length).toBe(2);

    const f1 = state.factories.get(10);
    expect(f1?.state).toBe('working');
    expect(f1?.taskId).toBe(taskKey);
  });

  it('produceTick production task 完成后装备池 +output', () => {
    const state = makeBaseState(400, 200, 30, 60, 90);
    addIdleMilitaryFactory(state, 10);

    const fs = new DefaultFactorySystem();
    fs.applyTemplate(state, [10], 'infantry_equipment');

    const pool = state.equipmentPools.get('p1')!;
    const stockBefore = pool.stocks.find(s => s.type === 'infantry_equipment')!.count;
    const dtMs = Fixed.fromInt(100);

    let productionCompletedEvent = null;
    for (let tick = 0; tick < 3000; tick++) {
      state.tickId = tick;
      const events = fs.produceTick(state, 'p1', dtMs);
      for (const ev of events) {
        if (ev.kind === 'productionCompleted') {
          productionCompletedEvent = ev;
        }
      }
      if (productionCompletedEvent) break;
    }

    const stockAfter = pool.stocks.find(s => s.type === 'infantry_equipment')!.count;
    expect(stockAfter).toBe(stockBefore + 10);
    expect(productionCompletedEvent).toBeTruthy();
    if (productionCompletedEvent && productionCompletedEvent.kind === 'productionCompleted') {
      expect(productionCompletedEvent.countryId).toBe('p1');
      expect(productionCompletedEvent.equipmentType).toBe('infantry_equipment');
      expect(productionCompletedEvent.count).toBe(10);
    }
  });

  it('多工厂生产进度更快', () => {
    function runWithFactories(numFactories: number): number {
      const state = makeBaseState(400, 200, 30, 60, 90);
      for (let i = 0; i < numFactories; i++) {
        addIdleMilitaryFactory(state, 100 + i);
      }
      const fs = new DefaultFactorySystem();
      const ids: number[] = [];
      for (let i = 0; i < numFactories; i++) ids.push(100 + i);
      fs.applyTemplate(state, ids, 'artillery');

      let completedTick = -1;
      const dtMs = Fixed.fromInt(100);
      for (let tick = 0; tick < 4000; tick++) {
        state.tickId = tick;
        const events = fs.produceTick(state, 'p1', dtMs);
        for (const ev of events) {
          if (ev.kind === 'productionCompleted' && ev.equipmentType === 'artillery') {
            completedTick = tick;
            return completedTick;
          }
        }
      }
      return completedTick;
    }

    const ticksWith1 = runWithFactories(1);
    const ticksWith2 = runWithFactories(2);

    expect(ticksWith1).toBeGreaterThan(0);
    expect(ticksWith2).toBeGreaterThan(0);
    expect(ticksWith2).toBeLessThan(ticksWith1);
  });
});
