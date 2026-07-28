/**
 * 确定性哈希测试
 *
 * 实现依据：附录 C.3.7 + spec T.2.2
 * - 同一 WorldState 多次哈希结果必须完全相等
 * - 字段顺序无关（SortedMap 保证遍历顺序）
 * - 改变任何字段，哈希必变
 * - 序列化字节长度稳定（无随机性）
 *
 * 这是联机帧同步的核心：所有客户端独立模拟后对 state 哈希，
 * 一致即视为同步，不一致触发回滚。
 */
import { describe, it, expect } from 'vitest';
import { Fixed } from '../../core/determinism/fixed';
import { SortedMap } from '../../core/determinism/sorted_map';
import { serializeWorld, hashWorld } from './hash';
import type { WorldState } from './world_state';

/** 构造最小可哈希的 WorldState */
function makeMinimalState(): WorldState {
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
    ownedProvinceIds: [1, 2],
    controlledProvinceIds: [1, 2],
  });
  countries.set('e1', {
    id: 'e1',
    name: '敌国',
    developmentPath: 'communal',
    isPlayer: false,
    isAI: true,
    capitalProvinceId: 3,
    disputeResolve: Fixed.fromInt(0),
    stability: Fixed.fromInt(0.5),
    politicalPower: Fixed.fromInt(5),
    factionId: null,
    ownedProvinceIds: [3],
    controlledProvinceIds: [3],
  });

  const provinces = new SortedMap<number, WorldState['provinces'] extends SortedMap<infer K, infer V> ? V : never>();
  provinces.set(1, {
    id: 1,
    ownerId: 'p1',
    controllerId: 'p1',
    name: '省份A',
    terrain: 'plains',
    isCoastal: false,
    adjacentProvinceIds: [],
    infrastructure: 3,
    buildingSlots: 4,
    combatWidth: 10,
    supplyHubLevel: 1,
    fortLevel: 0,
    portLevel: 0,
    airBaseLevel: 1,
    adjacentSeaZoneIds: [],
    VP: 10,
  });
  provinces.set(2, {
    id: 2,
    ownerId: 'p1',
    controllerId: 'p1',
    name: '省份B',
    terrain: 'forest',
    isCoastal: true,
    adjacentProvinceIds: [],
    infrastructure: 2,
    buildingSlots: 3,
    combatWidth: 8,
    supplyHubLevel: 0,
    fortLevel: 1,
    portLevel: 0,
    airBaseLevel: 0,
    adjacentSeaZoneIds: [],
    VP: 5,
  });
  provinces.set(3, {
    id: 3,
    ownerId: 'e1',
    controllerId: 'e1',
    name: '省份C',
    terrain: 'mountain',
    isCoastal: false,
    adjacentProvinceIds: [],
    infrastructure: 1,
    buildingSlots: 2,
    combatWidth: 6,
    supplyHubLevel: 0,
    fortLevel: 2,
    portLevel: 0,
    airBaseLevel: 0,
    adjacentSeaZoneIds: [],
    VP: 8,
  });

  const stockpiles = new SortedMap<string, WorldState['stockpiles'] extends SortedMap<infer K, infer V> ? V : never>();
  stockpiles.set('p1', {
    countryId: 'p1',
    steel: Fixed.fromInt(100),
    oil: Fixed.fromInt(50),
    tungsten: Fixed.fromInt(10),
    rubber: Fixed.fromInt(20),
    aluminum: Fixed.fromInt(30),
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
  stockpiles.set('e1', {
    countryId: 'e1',
    steel: Fixed.fromInt(80),
    oil: Fixed.fromInt(40),
    tungsten: Fixed.fromInt(5),
    rubber: Fixed.fromInt(15),
    aluminum: Fixed.fromInt(25),
    political: Fixed.fromInt(5),
    caps: {
      steel: Fixed.fromInt(400),
      oil: Fixed.fromInt(250),
      tungsten: Fixed.fromInt(40),
      rubber: Fixed.fromInt(80),
      aluminum: Fixed.fromInt(120),
      political: Fixed.fromInt(80),
    },
    history: [],
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
    nextEntityId: 1,
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

describe('hashWorld 确定性', () => {
  it('同一 state 多次哈希结果完全相等', () => {
    const s = makeMinimalState();
    const h1 = hashWorld(s);
    const h2 = hashWorld(s);
    const h3 = hashWorld(s);
    expect(h1).toBe(h2);
    expect(h2).toBe(h3);
  });

  it('哈希是 8 位 hex 字符串', () => {
    const s = makeMinimalState();
    const h = hashWorld(s);
    expect(h).toMatch(/^[0-9a-f]{8}$/);
  });

  it('两个独立构造但内容相同的 state 哈希相等（跨客户端一致）', () => {
    const s1 = makeMinimalState();
    const s2 = makeMinimalState();
    expect(hashWorld(s1)).toBe(hashWorld(s2));
  });

  it('改变任何字段，哈希必变', () => {
    const base = makeMinimalState();
    const baseHash = hashWorld(base);

    // 改 tickId
    const s1 = makeMinimalState();
    s1.tickId = 1;
    expect(hashWorld(s1)).not.toBe(baseHash);

    // 改 seed
    const s2 = makeMinimalState();
    s2.seed = 99;
    expect(hashWorld(s2)).not.toBe(baseHash);

    // 改 speed
    const s3 = makeMinimalState();
    s3.speed = 2;
    expect(hashWorld(s3)).not.toBe(baseHash);

    // 改国家政治点
    const s4 = makeMinimalState();
    const p1 = s4.countries.get('p1')!;
    p1.politicalPower = Fixed.fromInt(999);
    s4.countries.set('p1', p1);
    expect(hashWorld(s4)).not.toBe(baseHash);

    // 改储备
    const s5 = makeMinimalState();
    const stk = s5.stockpiles.get('p1')!;
    stk.steel = Fixed.fromInt(999);
    s5.stockpiles.set('p1', stk);
    expect(hashWorld(s5)).not.toBe(baseHash);

    // 改省份控制方（管控变更）
    const s6 = makeMinimalState();
    const prov = s6.provinces.get(1)!;
    prov.controllerId = 'e1';
    s6.provinces.set(1, prov);
    expect(hashWorld(s6)).not.toBe(baseHash);
  });

  it('SortedMap 插入顺序不影响哈希（联机关键）', () => {
    // 客户端 A：按 p1, e1 顺序插入
    const sA = makeMinimalState();

    // 客户端 B：故意按 e1, p1 反序插入相同数据
    const sB = makeMinimalState();
    // 重新构造 countries，反序插入
    const newCountries = new SortedMap<string, typeof sB.countries extends SortedMap<infer K, infer V> ? V : never>();
    const e1 = sB.countries.get('e1')!;
    const p1 = sB.countries.get('p1')!;
    newCountries.set('e1', e1);
    newCountries.set('p1', p1);
    sB.countries = newCountries;

    expect(hashWorld(sA)).toBe(hashWorld(sB));
  });

  it('序列化字节长度稳定（多次调用相同）', () => {
    const s = makeMinimalState();
    const b1 = serializeWorld(s);
    const b2 = serializeWorld(s);
    expect(b1.length).toBe(b2.length);
    expect(Array.from(b1)).toEqual(Array.from(b2));
  });
});
