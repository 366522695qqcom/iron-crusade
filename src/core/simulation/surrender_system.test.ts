/**
 * SurrenderSystem 单元测试（M1 feature-grand-war）
 *
 * 覆盖：
 * - initDisputeSurrender 初始化投降状态
 * - onProvinceControlled 增加投降倾向和战争日志
 * - onDivisionDestroyed 增加投降倾向
 * - advanceTick 推进投降进度，触发投降事件
 * - 首都被占贡献大于普通VP
 * - 战争日志记录上限50条
 */
import { describe, it, expect } from 'vitest';
import { Fixed } from '../determinism/fixed';
import { SortedMap } from '../determinism/sorted_map';
import { DefaultSurrenderSystem } from './surrender_system';
import type { WorldState, Province, Country, Dispute } from '../state/world_state';

function makeTestState(): WorldState {
  const countries = new SortedMap<string, Country>();
  countries.set('p1', {
    id: 'p1',
    name: '玩家国',
    developmentPath: 'industrial_authoritarian',
    isPlayer: true,
    isAI: false,
    capitalProvinceId: 1,
    disputeResolve: Fixed.fromNumber(0.5),
    stability: Fixed.fromNumber(0.6),
    politicalPower: Fixed.fromInt(200),
    factionId: null,
    ownedProvinceIds: [1],
    controlledProvinceIds: [1],
  });
  countries.set('e1', {
    id: 'e1',
    name: '敌国',
    developmentPath: 'communal',
    isPlayer: false,
    isAI: true,
    capitalProvinceId: 2,
    disputeResolve: Fixed.fromNumber(0.5),
    stability: Fixed.fromNumber(0.5),
    politicalPower: Fixed.fromInt(100),
    factionId: null,
    ownedProvinceIds: [2, 3],
    controlledProvinceIds: [2, 3],
  });

  const provinces = new SortedMap<number, Province>();
  provinces.set(1, {
    id: 1, ownerId: 'p1', controllerId: 'p1', name: '首都',
    terrain: 'plains', isCoastal: false, adjacentProvinceIds: [], infrastructure: 3, buildingSlots: 6,
    combatWidth: 10, supplyHubLevel: 2, fortLevel: 0, portLevel: 0,
    adjacentSeaZoneIds: [], VP: 10,
  });
  provinces.set(2, {
    id: 2, ownerId: 'e1', controllerId: 'e1', name: '敌首都',
    terrain: 'plains', isCoastal: false, adjacentProvinceIds: [], infrastructure: 3, buildingSlots: 4,
    combatWidth: 8, supplyHubLevel: 1, fortLevel: 1, portLevel: 0,
    adjacentSeaZoneIds: [], VP: 10,
  });
  provinces.set(3, {
    id: 3, ownerId: 'e1', controllerId: 'e1', name: '敌城市',
    terrain: 'plains', isCoastal: false, adjacentProvinceIds: [], infrastructure: 2, buildingSlots: 3,
    combatWidth: 6, supplyHubLevel: 0, fortLevel: 0, portLevel: 0,
    adjacentSeaZoneIds: [], VP: 5,
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
    stockpiles: new SortedMap(),
    buildings: new SortedMap(),
    factories: new SortedMap(),
    constructionQueues: new SortedMap(),
    productionTasks: new SortedMap(),
    equipmentPools: new SortedMap(),
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
    seedMap: {},
    gameOver: null,
    shipTemplates: new SortedMap(),
    ships: new SortedMap(),
    fleets: new SortedMap(),
    seaZones: new SortedMap(),
    seaControl: new SortedMap(),
    convoyRoutes: [],
  };
}

function createDispute(state: WorldState, sys: DefaultSurrenderSystem): string {
  const dispute: Dispute = {
    id: 'd_test',
    participants: ['p1', 'e1'],
    participantSet: new Set(['p1', 'e1']),
    disputeResolve: { p1: Fixed.fromNumber(0.5), e1: Fixed.fromNumber(0.5) },
    disputeGoals: [],
    controlledVPs: { p1: 0, e1: 0 },
    surrenderProgress: {},
    surrenderThreshold: {},
    startTick: 0,
    totalVPs: 0,
  };
  state.disputes.set('d_test', dispute);
  sys.initDisputeSurrender(state, 'd_test');
  return 'd_test';
}

describe('SurrenderSystem', () => {
  it('initDisputeSurrender 正确初始化投降状态和阈值', () => {
    const state = makeTestState();
    const sys = new DefaultSurrenderSystem();
    const disputeId = createDispute(state, sys);

    const dispute = state.disputes.get(disputeId)!;
    expect(dispute.surrenderProgress['p1']).toBeDefined();
    expect(dispute.surrenderProgress['e1']).toBeDefined();
    expect(dispute.surrenderThreshold['p1'].toNumber()).toBeCloseTo(0.8);
    expect(dispute.surrenderThreshold['e1'].toNumber()).toBeCloseTo(0.8);
    expect(dispute.totalVPs).toBe(25);
    expect(dispute.startTick).toBe(0);
    expect(state.warLosses.get('p1')).toBeDefined();
    expect(state.warLosses.get('e1')).toBeDefined();
    expect(state.warLog.length).toBe(1);
    expect(state.warLog[0].kind).toBe('dispute_started');
  });

  it('onProvinceControlled 增加战败方投降倾向', () => {
    const state = makeTestState();
    const sys = new DefaultSurrenderSystem();
    const disputeId = createDispute(state, sys);

    const progressBefore = sys.getSurrenderProgress(state, disputeId, 'e1').toNumber();
    sys.onProvinceControlled(state, 3, 'p1', 'e1');
    const progressAfter = sys.getSurrenderProgress(state, disputeId, 'e1').toNumber();

    expect(progressAfter).toBeGreaterThan(progressBefore);
    const losses = state.warLosses.get('e1')!;
    expect(losses.provincesLost).toBe(1);
    expect(losses.majorCitiesLost).toBe(1);
    expect(state.warLog.length).toBeGreaterThanOrEqual(2);
  });

  it('占领首都产生大量投降贡献', () => {
    const state = makeTestState();
    const sys = new DefaultSurrenderSystem();
    const disputeId = createDispute(state, sys);

    sys.onProvinceControlled(state, 3, 'p1', 'e1');
    const progAfterCity = sys.getSurrenderProgress(state, disputeId, 'e1').toNumber();

    sys.onProvinceControlled(state, 2, 'p1', 'e1');
    const progAfterCapital = sys.getSurrenderProgress(state, disputeId, 'e1').toNumber();

    expect(progAfterCapital).toBeGreaterThan(progAfterCity);
    const losses = state.warLosses.get('e1')!;
    expect(losses.capitalLost).toBe(true);

    const capitalLog = state.warLog.find(e => e.text.includes('首都'));
    expect(capitalLog).toBeDefined();
  });

  it('onDivisionDestroyed 增加投降倾向', () => {
    const state = makeTestState();
    const sys = new DefaultSurrenderSystem();
    const disputeId = createDispute(state, sys);

    const before = sys.getSurrenderProgress(state, disputeId, 'e1').toNumber();
    sys.onDivisionDestroyed(state, 999, 'e1', 3);
    const after = sys.getSurrenderProgress(state, disputeId, 'e1').toNumber();

    expect(after).toBeGreaterThan(before);
    const losses = state.warLosses.get('e1')!;
    expect(losses.divisionsLost).toBe(1);
  });

  it('advanceTick 累积投降倾向，达到阈值时触发surrendered事件', () => {
    const state = makeTestState();
    const sys = new DefaultSurrenderSystem();
    const disputeId = createDispute(state, sys);

    sys.onProvinceControlled(state, 3, 'p1', 'e1');
    sys.onProvinceControlled(state, 2, 'p1', 'e1');

    let surrenderedEvent = false;
    for (let i = 0; i < 500; i++) {
      state.tickId = i;
      const events = sys.advanceTick(state, Fixed.fromInt(100));
      for (const ev of events) {
        if (ev.kind === 'surrendered' && ev.countryId === 'e1') {
          surrenderedEvent = true;
        }
      }
      if (surrenderedEvent) break;
    }

    expect(surrenderedEvent).toBe(true);
    expect(state.disputes.get(disputeId)).toBeUndefined();
    expect(state.provinces.get(2)!.controllerId).toBe('p1');
    expect(state.provinces.get(3)!.controllerId).toBe('p1');
  });

  it('战争日志自动裁剪到最近50条', () => {
    const state = makeTestState();
    const sys = new DefaultSurrenderSystem();
    createDispute(state, sys);

    for (let i = 0; i < 60; i++) {
      sys.appendWarLog(state, { kind: 'province_controlled', countryId: 'p1', text: `测试${i}` });
    }

    expect(state.warLog.length).toBeLessThanOrEqual(50);
  });

  it('addContribution 累加投降倾向不超过1.0', () => {
    const state = makeTestState();
    const sys = new DefaultSurrenderSystem();
    const disputeId = createDispute(state, sys);

    for (let i = 0; i < 100; i++) {
      sys.addContribution(state, disputeId, 'e1', Fixed.fromNumber(0.1), 'test');
    }

    const progress = sys.getSurrenderProgress(state, disputeId, 'e1');
    expect(progress.toNumber()).toBeLessThanOrEqual(1.0);
  });

  it('getSurrenderProgress 对不存在的争端返回0', () => {
    const state = makeTestState();
    const sys = new DefaultSurrenderSystem();

    const prog = sys.getSurrenderProgress(state, 'nonexistent', 'p1');
    expect(prog.equals(Fixed.ZERO)).toBe(true);
  });

  it('ensureWarLossesInitialized 幂等（重复调用不丢失数据）', () => {
    const state = makeTestState();
    const sys = new DefaultSurrenderSystem();

    sys.ensureWarLossesInitialized(state, 'p1');
    const losses1 = state.warLosses.get('p1')!;
    losses1.divisionsLost = 5;

    sys.ensureWarLossesInitialized(state, 'p1');
    const losses2 = state.warLosses.get('p1')!;
    expect(losses2.divisionsLost).toBe(5);
  });
});
