/**
 * reward_applier 单元测试
 *
 * 覆盖：
 * - political 奖励正确累加
 * - political 奖励 clamp 到 cap
 * - 资源奖励正确累加
 * - 资源奖励 clamp 到 cap
 * - 多资源同时奖励
 * - 国家不存在时 noop
 */
import { describe, it, expect } from 'vitest';
import { Fixed } from '../../core/determinism/fixed';
import { SortedMap } from '../../core/determinism/sorted_map';
import { applyReward } from './reward_applier';
import type { WorldState } from '../../core/state/world_state';

function makeState(
  political = 10,
  steel = 100,
  oil = 50,
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

  const stockpiles = new SortedMap<string, any>();
  stockpiles.set('p1', {
    countryId: 'p1',
    steel: Fixed.fromInt(steel),
    oil: Fixed.fromInt(oil),
    tungsten: Fixed.ZERO,
    rubber: Fixed.ZERO,
    aluminum: Fixed.ZERO,
    political: Fixed.fromInt(political),
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

  return {
    version: '1.0.0',
    seed: 42,
    tickId: 0,
    tickElapsed: Fixed.ZERO,
    speed: 1,
    countries,
    provinces: new SortedMap(),
    resourceNodes: new SortedMap(),
    stockpiles,
    buildings: new SortedMap(),
    factories: new SortedMap(),
    constructionQueues: new SortedMap(),
    productionTasks: new SortedMap(),
    equipmentPools: new SortedMap(),
    divisions: new SortedMap(),
    focusTrees: new SortedMap(),
    research: new SortedMap(),
    disputes: new SortedMap(),
    nextEntityId: 100,
    seedMap: {},
  } as WorldState;
}

describe('applyReward', () => {
  it('political 奖励正确累加', () => {
    const state = makeState(10);
    applyReward(state, 'p1', { political: Fixed.fromInt(20) });
    const sp = state.stockpiles.get('p1')!;
    expect(sp.political.toNumber()).toBe(30);
  });

  it('political 奖励 clamp 到 cap', () => {
    const state = makeState(90);
    applyReward(state, 'p1', { political: Fixed.fromInt(30) });
    const sp = state.stockpiles.get('p1')!;
    expect(sp.political.toNumber()).toBe(100);
  });

  it('steel 资源奖励正确累加', () => {
    const state = makeState(10, 100);
    applyReward(state, 'p1', { resources: { steel: Fixed.fromInt(50) } });
    const sp = state.stockpiles.get('p1')!;
    expect(sp.steel.toNumber()).toBe(150);
  });

  it('steel 资源奖励 clamp 到 cap', () => {
    const state = makeState(10, 480);
    applyReward(state, 'p1', { resources: { steel: Fixed.fromInt(50) } });
    const sp = state.stockpiles.get('p1')!;
    expect(sp.steel.toNumber()).toBe(500);
  });

  it('多资源同时奖励', () => {
    const state = makeState(10, 100, 50);
    applyReward(state, 'p1', {
      political: Fixed.fromInt(15),
      resources: {
        steel: Fixed.fromInt(30),
        oil: Fixed.fromInt(20),
      },
    });
    const sp = state.stockpiles.get('p1')!;
    expect(sp.political.toNumber()).toBe(25);
    expect(sp.steel.toNumber()).toBe(130);
    expect(sp.oil.toNumber()).toBe(70);
  });

  it('国家不存在时 noop', () => {
    const state = makeState(10);
    applyReward(state, 'nonexistent', { political: Fixed.fromInt(100) });
    const sp = state.stockpiles.get('p1')!;
    expect(sp.political.toNumber()).toBe(10);
  });
});
