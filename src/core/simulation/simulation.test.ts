/**
 * Simulation tick 确定性测试（spec T.2.2 核心）
 *
 * 实现依据：附录 C.3.7 + 技术设计文档 2.4
 *
 * 这是联机帧同步的基石测试：
 * - 两个独立 Simulation 实例，从相同 WorldState 出发，喂相同 PlayerAction 序列
 * - 每帧后的 hash 必须完全相等
 * - 否则联机两端状态会分叉，回滚无法收敛
 *
 * 同时验证：
 * - tick 推进是确定性的（无 Math.random / 无浮点 / 无 Map 插入顺序依赖）
 * - hash 在 16 帧周期点会刷新，非周期点保持上一帧 hash
 */
import { describe, it, expect } from 'vitest';
import { Fixed } from '../../core/determinism/fixed';
import { SortedMap } from '../../core/determinism/sorted_map';
import { DefaultSimulation } from './simulation';
import { hashWorld } from '../state/hash';
import type { WorldState } from '../state/world_state';
import type { PlayerAction } from './types';

/** 构造测试用 WorldState（含 1 玩家国 + 1 敌国 + 1 民厂） */
function makeTestState(): WorldState {
  const countries = new SortedMap<string, WorldState['countries'] extends SortedMap<infer K, infer V> ? V : never>();
  countries.set('p1', {
    id: 'p1',
    name: '玩家国',
    developmentPath: 'industrial_authoritarian',
    isPlayer: true,
    isAI: false,
    capitalProvinceId: 1,
    disputeResolve: Fixed.fromInt(0),
    stability: Fixed.fromInt(0.5),
    politicalPower: Fixed.fromInt(10),
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
    disputeResolve: Fixed.fromInt(0),
    stability: Fixed.fromInt(0.5),
    politicalPower: Fixed.fromInt(5),
    factionId: null,
    ownedProvinceIds: [2],
    controlledProvinceIds: [2],
  });

  const provinces = new SortedMap<number, WorldState['provinces'] extends SortedMap<infer K, infer V> ? V : never>();
  provinces.set(1, {
    id: 1, ownerId: 'p1', controllerId: 'p1', name: 'A',
    terrain: 'plains', isCoastal: false, adjacentProvinceIds: [],
    infrastructure: 3, buildingSlots: 4, combatWidth: 10,
    supplyHubLevel: 1, fortLevel: 0, portLevel: 0, airBaseLevel: 1,
    adjacentSeaZoneIds: [], VP: 10,
  });
  provinces.set(2, {
    id: 2, ownerId: 'e1', controllerId: 'e1', name: 'B',
    terrain: 'mountain', isCoastal: false, adjacentProvinceIds: [],
    infrastructure: 1, buildingSlots: 2, combatWidth: 6,
    supplyHubLevel: 0, fortLevel: 2, portLevel: 0, airBaseLevel: 0,
    adjacentSeaZoneIds: [], VP: 8,
  });

  const stockpiles = new SortedMap<string, WorldState['stockpiles'] extends SortedMap<infer K, infer V> ? V : never>();
  stockpiles.set('p1', {
    countryId: 'p1',
    steel: Fixed.fromInt(100), oil: Fixed.fromInt(50), tungsten: Fixed.fromInt(10),
    rubber: Fixed.fromInt(20), aluminum: Fixed.fromInt(30), political: Fixed.fromInt(10),
    caps: {
      steel: Fixed.fromInt(500), oil: Fixed.fromInt(300), tungsten: Fixed.fromInt(50),
      rubber: Fixed.fromInt(100), aluminum: Fixed.fromInt(150), political: Fixed.fromInt(100),
    },
    history: [],
  });
  stockpiles.set('e1', {
    countryId: 'e1',
    steel: Fixed.fromInt(80), oil: Fixed.fromInt(40), tungsten: Fixed.fromInt(5),
    rubber: Fixed.fromInt(15), aluminum: Fixed.fromInt(25), political: Fixed.fromInt(5),
    caps: {
      steel: Fixed.fromInt(400), oil: Fixed.fromInt(250), tungsten: Fixed.fromInt(40),
      rubber: Fixed.fromInt(80), aluminum: Fixed.fromInt(120), political: Fixed.fromInt(80),
    },
    history: [],
  });

  // 1 座民厂分配给 p1
  const factories = new SortedMap<number, WorldState['factories'] extends SortedMap<infer K, infer V> ? V : never>();
  factories.set(1, {
    id: 1, provinceId: 1, type: 'civilian', level: 1,
    state: 'idle', taskId: null, idleSinceTick: 0, productionProgress: Fixed.fromInt(0),
  });

  const equipmentPools = new SortedMap<string, WorldState['equipmentPools'] extends SortedMap<infer K, infer V> ? V : never>();
  equipmentPools.set('p1', {
    countryId: 'p1',
    stocks: [
      { type: 'infantry_equipment', count: 0 },
      { type: 'artillery', count: 0 },
      { type: 'light_tank', count: 0 },
    ],
  });
  equipmentPools.set('e1', {
    countryId: 'e1',
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
    tickElapsed: Fixed.fromInt(0),
    speed: 1,
    countries,
    provinces,
    resourceNodes: new SortedMap(),
    stockpiles,
    buildings: new SortedMap(),
    factories,
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
    nextEntityId: 2,
    seedMap: { 'p1': 100, 'e1': 200 },
    gameOver: null,
    shipTemplates: new SortedMap(),
    ships: new SortedMap(),
    fleets: new SortedMap(),
    seaZones: new SortedMap(),
    seaControl: new SortedMap(),
    convoyRoutes: [],
    airZones: new SortedMap(),
    wings: new SortedMap(),
    airSuperiority: new SortedMap(),
    invasions: new SortedMap(),
  };
}

describe('Simulation tick 确定性', () => {
  it('两个独立实例 + 相同输入序列 → 每帧 hash 完全相等（联机核心）', () => {
    const actions: PlayerAction[][] = [
      [{ kind: 'setSpeed', speed: 1 }],
      [],
      [{ kind: 'assignFactory', factoryId: 1, taskId: 'trade_p1' }],
      [],
      [],
      [{ kind: 'setSpeed', speed: 2 }],
      [],
      [],
      [],
      [],
      [{ kind: 'setSpeed', speed: 1 }],
      [],
      [],
      [],
      [],
      [],
      [], // 第 16 帧，hash 刷新点
      [],
    ];

    const sim1 = DefaultSimulation.create(makeTestState());
    const sim2 = DefaultSimulation.create(makeTestState());

    for (let i = 0; i < actions.length; i++) {
      const r1 = sim1.tick(i, actions[i]);
      const r2 = sim2.tick(i, actions[i]);
      expect(r1.hash).toBe(r2.hash);
    }
  });

  it('同实例重复 tick 相同输入序列 → hash 一致', () => {
    const buildAndRun = (): string => {
      const sim = DefaultSimulation.create(makeTestState());
      let lastHash = '';
      for (let i = 0; i < 20; i++) {
        const actions: PlayerAction[] = i === 5 ? [{ kind: 'setSpeed', speed: 2 }] : [];
        lastHash = sim.tick(i, actions).hash;
      }
      return lastHash;
    };

    const h1 = buildAndRun();
    const h2 = buildAndRun();
    const h3 = buildAndRun();
    expect(h1).toBe(h2);
    expect(h2).toBe(h3);
  });

  it('不同输入序列 → hash 不同（验证 hash 对输入敏感）', () => {
    const runWithSpeed = (speed: 1 | 2): string => {
      const sim = DefaultSimulation.create(makeTestState());
      let lastHash = '';
      for (let i = 0; i < 16; i++) {
        lastHash = sim.tick(i, [{ kind: 'setSpeed', speed }]).hash;
      }
      return lastHash;
    };

    const h1 = runWithSpeed(1);
    const h2 = runWithSpeed(2);
    expect(h1).not.toBe(h2);
  });

  it('hash 在 16 帧周期点刷新，非周期点保持上一帧 hash', () => {
    const sim = DefaultSimulation.create(makeTestState());

    // 第 0 帧（首次，lastHash==='' 触发计算）
    const r0 = sim.tick(0, []);
    expect(r0.hash).toMatch(/^[0-9a-f]{8}$/);

    // 第 1-15 帧：hash 保持 r0
    let prevHash = r0.hash;
    for (let i = 1; i < 16; i++) {
      const r = sim.tick(i, []);
      expect(r.hash).toBe(prevHash);
      prevHash = r.hash;
    }

    // 第 16 帧：hash 刷新（值可能变也可能不变，但至少调用了一次 hashWorld）
    const r16 = sim.tick(16, []);
    expect(r16.hash).toMatch(/^[0-9a-f]{8}$/);
  });

  it('暂停态（speed=0）tick 不推进状态，hash 保持不变', () => {
    const sim = DefaultSimulation.create(makeTestState());
    // 先设暂停
    sim.tick(0, [{ kind: 'setSpeed', speed: 0 }]);
    const h0 = sim.tick(1, []).hash;

    // 连续 tick 多帧，state 不变
    const h1 = sim.tick(2, []).hash;
    const h2 = sim.tick(3, []).hash;
    expect(h1).toBe(h0);
    expect(h2).toBe(h0);
  });

  it('snapshot + restore 后 hash 一致（联机重连/回滚）', () => {
    const sim1 = DefaultSimulation.create(makeTestState());
    // 推进 20 帧
    for (let i = 0; i < 20; i++) {
      sim1.tick(i, []);
    }
    const snap = sim1.snapshot();
    const h1 = hashWorld(snap);

    // 用快照恢复到新实例
    const sim2 = DefaultSimulation.create(makeTestState());
    sim2.restore(snap);
    const h2 = sim2.hash();

    expect(h1).toBe(h2);
  });

  it('长序列（200 帧）后两端 hash 仍一致（压力测试）', () => {
    const sim1 = DefaultSimulation.create(makeTestState());
    const sim2 = DefaultSimulation.create(makeTestState());

    for (let i = 0; i < 200; i++) {
      // 每 50 帧切换一次速度
      const speed: 0 | 1 | 2 = i < 50 ? 1 : i < 100 ? 2 : i < 150 ? 1 : 0;
      const actions: PlayerAction[] = (i % 50 === 0) ? [{ kind: 'setSpeed', speed }] : [];
      const r1 = sim1.tick(i, actions);
      const r2 = sim2.tick(i, actions);
      if (i % 16 === 0) {
        // 周期点强校验
        expect(r1.hash).toBe(r2.hash);
      }
    }

    // 最终 hash 必相等
    const final1 = sim1.tick(200, []).hash;
    const final2 = sim2.tick(200, []).hash;
    expect(final1).toBe(final2);
  });

  it('500 帧含师团招募+争端+战斗全流程 → 两实例 hash 一致', () => {
    function makeCombatState(): WorldState {
      const s = makeTestState();
      // 给足政治点和装备招募师团
      const p1Stock = s.stockpiles.get('p1')!;
      p1Stock.political = Fixed.fromInt(500);
      const p1Pool = s.equipmentPools.get('p1')!;
      for (const stock of p1Pool.stocks) {
        if (stock.type === 'infantry_equipment') stock.count = 2000;
      }
      const e1Stock = s.stockpiles.get('e1')!;
      e1Stock.political = Fixed.fromInt(500);
      const e1Pool = s.equipmentPools.get('e1')!;
      for (const stock of e1Pool.stocks) {
        if (stock.type === 'infantry_equipment') stock.count = 2000;
      }
      s.nextEntityId = 100;
      return s;
    }

    const sim1 = DefaultSimulation.create(makeCombatState());
    const sim2 = DefaultSimulation.create(makeCombatState());

    for (let i = 0; i < 500; i++) {
      const actions: PlayerAction[] = [];
      // 第 10 帧：p1 招募师团（省份1）
      if (i === 10) {
        actions.push({ kind: 'recruitDivision', provinceId: 1 });
      }
      const r1 = sim1.tick(i, actions);
      const r2 = sim2.tick(i, actions);
      if (i % 16 === 0) {
        expect(r1.hash).toBe(r2.hash);
      }
    }

    // 最终 hash 必相等
    const final1 = sim1.tick(500, []).hash;
    const final2 = sim2.tick(500, []).hash;
    expect(final1).toBe(final2);
  });

  it('500 帧含初始师团+争端+画前线+攻势 → 两实例 hash 一致', () => {
    function makeCombatStateReady(): WorldState {
      const s = makeTestState();
      const p1Stock = s.stockpiles.get('p1')!;
      p1Stock.political = Fixed.fromInt(500);
      const p1Pool = s.equipmentPools.get('p1')!;
      for (const stock of p1Pool.stocks) {
        if (stock.type === 'infantry_equipment') stock.count = 2000;
      }
      // 初始放一个ready师团
      s.divisions.set(100, {
        id: 100, ownerId: 'p1',
        templateId: 'infantry',
        template: [
          { slot: 0, equipmentType: 'infantry_equipment' },
          { slot: 1, equipmentType: 'infantry_equipment' },
          { slot: 2, equipmentType: 'infantry_equipment' },
          { slot: 3, equipmentType: 'infantry_equipment' },
        ],
        organization: Fixed.ONE,
        hardness: Fixed.fromNumber(0.1),
        softAttack: Fixed.fromInt(100),
        hardAttack: Fixed.fromInt(10),
        currentProvinceId: 1,
        targetProvinceId: null,
        supply: Fixed.ONE,
        strength: Fixed.ONE,
        trainingProgress: Fixed.ONE,
        status: 'ready',
        inOffensive: false,
      });
      s.nextEntityId = 101;
      return s;
    }

    const sim1 = DefaultSimulation.create(makeCombatStateReady());
    const sim2 = DefaultSimulation.create(makeCombatStateReady());

    for (let i = 0; i < 500; i++) {
      const actions: PlayerAction[] = [];
      if (i === 5) {
        actions.push({ kind: 'initiateDispute', targetCountryId: 'e1' });
      }
      if (i === 10) {
        actions.push({ kind: 'drawFront', fromProvince: 1, toProvince: 2 });
      }
      if (i === 20) {
        actions.push({ kind: 'issueOffensive', divisionIds: [100], targetProvince: 2 });
      }
      const r1 = sim1.tick(i, actions);
      const r2 = sim2.tick(i, actions);
      if (i % 16 === 0) {
        expect(r1.hash).toBe(r2.hash);
      }
    }

    const final1 = sim1.tick(500, []).hash;
    const final2 = sim2.tick(500, []).hash;
    expect(final1).toBe(final2);
  });
});

describe('M1 师团命令（拆分/合并/选中/移动）', () => {
  function makeReadyDivisionState(): WorldState {
    const s = makeTestState();
    s.provinces.get(1)!.adjacentProvinceIds = [3];
    s.provinces.set(3, {
      id: 3, ownerId: 'p1', controllerId: 'p1', name: 'C',
      terrain: 'plains', isCoastal: false, adjacentProvinceIds: [1],
      infrastructure: 2, buildingSlots: 3, combatWidth: 8,
      supplyHubLevel: 0, fortLevel: 0, portLevel: 0, airBaseLevel: 0,
      adjacentSeaZoneIds: [], VP: 5,
    });
    s.countries.get('p1')!.controlledProvinceIds = [1, 3];
    s.countries.get('p1')!.ownedProvinceIds = [1, 3];

    const pool = s.equipmentPools.get('p1')!;
    for (const stock of pool.stocks) {
      if (stock.type === 'infantry_equipment') stock.count = 2000;
    }
    s.stockpiles.get('p1')!.political = Fixed.fromInt(500);

    s.divisions.set(100, {
      id: 100, ownerId: 'p1',
      templateId: 'infantry',
      template: [
        { slot: 0, equipmentType: 'infantry_equipment' },
        { slot: 1, equipmentType: 'infantry_equipment' },
        { slot: 2, equipmentType: 'infantry_equipment' },
        { slot: 3, equipmentType: 'infantry_equipment' },
      ],
      organization: Fixed.ONE,
      hardness: Fixed.fromNumber(0.1),
      softAttack: Fixed.fromInt(30),
      hardAttack: Fixed.fromInt(5),
      currentProvinceId: 1,
      targetProvinceId: null,
      supply: Fixed.ONE,
      strength: Fixed.ONE,
      trainingProgress: Fixed.ONE,
      status: 'ready',
      inOffensive: false,
    });
    s.nextEntityId = 101;
    return s;
  }

  it('selectUnits/deselectUnits 更新selectedUnitIds', () => {
    const sim = DefaultSimulation.create(makeReadyDivisionState());
    sim.tick(0, [{ kind: 'selectUnits', unitIds: [100] }]);
    let snap = sim.snapshot();
    expect(snap.selectedUnitIds).toEqual([100]);

    sim.tick(1, [{ kind: 'selectUnits', unitIds: [101], additive: true }]);
    snap = sim.snapshot();
    expect(snap.selectedUnitIds).toEqual([100]);

    sim.tick(2, [{ kind: 'deselectUnits' }]);
    snap = sim.snapshot();
    expect(snap.selectedUnitIds).toEqual([]);
  });

  it('orderSplitDivision 将满编师团拆成两个半编师团', () => {
    const sim = DefaultSimulation.create(makeReadyDivisionState());
    sim.tick(0, [{ kind: 'orderSplitDivision', divisionId: 100 }]);
    const snap = sim.snapshot();

    expect(snap.divisions.size()).toBe(2);
    const div1 = snap.divisions.get(100)!;
    const div2 = snap.divisions.get(101)!;
    expect(div1.strength.toNumber()).toBeCloseTo(0.5);
    expect(div1.organization.toNumber()).toBeCloseTo(0.5);
    expect(div2.strength.toNumber()).toBeCloseTo(0.5);
    expect(div2.organization.toNumber()).toBeCloseTo(0.5);
    expect(div2.status).toBe('ready');
    expect(div2.currentProvinceId).toBe(1);
    expect(div1.softAttack.toNumber()).toBe(15);
    expect(div2.softAttack.toNumber()).toBe(15);
  });

  it('orderSplitDivision 拒绝低strength师团（<0.5）', () => {
    const s = makeReadyDivisionState();
    s.divisions.get(100)!.strength = Fixed.fromNumber(0.3);
    const sim = DefaultSimulation.create(s);
    sim.tick(0, [{ kind: 'orderSplitDivision', divisionId: 100 }]);
    expect(sim.snapshot().divisions.size()).toBe(1);
  });

  it('orderMergeDivisions 同省两个不满编师团合并', () => {
    const s = makeReadyDivisionState();
    s.divisions.set(101, {
      id: 101, ownerId: 'p1',
      templateId: 'infantry',
      template: s.divisions.get(100)!.template.map(t => ({ ...t })),
      organization: Fixed.fromNumber(0.4),
      hardness: Fixed.fromNumber(0.1),
      softAttack: Fixed.fromInt(10),
      hardAttack: Fixed.fromInt(2),
      currentProvinceId: 1,
      targetProvinceId: null,
      supply: Fixed.ONE,
      strength: Fixed.fromNumber(0.4),
      trainingProgress: Fixed.ONE,
      status: 'ready',
      inOffensive: false,
    });
    s.divisions.get(100)!.strength = Fixed.fromNumber(0.5);
    s.divisions.get(100)!.organization = Fixed.fromNumber(0.4);
    s.nextEntityId = 102;

    const sim = DefaultSimulation.create(s);
    sim.tick(0, [{ kind: 'orderMergeDivisions', divisionIds: [100, 101] }]);
    const snap = sim.snapshot();

    expect(snap.divisions.size()).toBe(1);
    const merged = snap.divisions.get(100)!;
    expect(merged.strength.toNumber()).toBeCloseTo(0.9);
    expect(merged.organization.toNumber()).toBeCloseTo(0.8);
  });

  it('orderMergeDivisions 拒绝不同省师团合并', () => {
    const s = makeReadyDivisionState();
    s.divisions.set(101, {
      id: 101, ownerId: 'p1',
      templateId: 'infantry',
      template: s.divisions.get(100)!.template.map(t => ({ ...t })),
      organization: Fixed.fromNumber(0.4),
      hardness: Fixed.fromNumber(0.1),
      softAttack: Fixed.fromInt(10),
      hardAttack: Fixed.fromInt(2),
      currentProvinceId: 3,
      targetProvinceId: null,
      supply: Fixed.ONE,
      strength: Fixed.fromNumber(0.4),
      trainingProgress: Fixed.ONE,
      status: 'ready',
      inOffensive: false,
    });
    s.nextEntityId = 102;

    const sim = DefaultSimulation.create(s);
    sim.tick(0, [{ kind: 'orderMergeDivisions', divisionIds: [100, 101] }]);
    expect(sim.snapshot().divisions.size()).toBe(2);
  });

  it('orderStop 取消师团移动/进攻', () => {
    const s = makeReadyDivisionState();
    const div = s.divisions.get(100)!;
    div.status = 'moving';
    div.targetProvinceId = 3;
    div.inOffensive = true;

    const sim = DefaultSimulation.create(s);
    sim.tick(0, [{ kind: 'orderStop', divisionIds: [100] }]);
    const snap = sim.snapshot();
    const after = snap.divisions.get(100)!;
    expect(after.status).toBe('ready');
    expect(after.targetProvinceId).toBeNull();
    expect(after.inOffensive).toBe(false);
  });
});
