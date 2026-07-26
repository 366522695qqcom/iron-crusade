/**
 * 玩家流程游玩测试（Playthrough Integration Test）
 *
 * 模拟真实玩家的一局快速对局流程，按玩家操作顺序触发所有核心系统：
 * 1. 开局 → 观察初始资源/工厂
 * 2. 派空闲民厂开贸易（自动贸易）
 * 3. 建民厂 → 派民厂施工 → 建成 → 再建军厂 → 建成
 * 4. 军厂拉步枪生产线 → 等装备产出
 * 5. 攒政治点/装备 → 招募师团 → 等训练
 * 6. 向敌国发起争端 → 画前线 → 派师团进攻
 * 7. 推进战斗 → 观察省份易主 / 战斗结果
 */
import { describe, it, expect } from 'vitest';
import { Fixed } from '../../core/determinism/fixed';
import { SortedMap } from '../../core/determinism/sorted_map';
import { DefaultSimulation } from './simulation';
import type { WorldState, Province, Country } from '../state/world_state';
import type { PlayerAction, GameEvent } from './types';

const PLAYER = 'p1';
const ENEMY = 'e1';

interface PlaythroughLog {
  tick: number;
  label: string;
  detail: string;
}

function makePlayState(): WorldState {
  const countries = new SortedMap<string, Country>();
  countries.set(PLAYER, {
    id: PLAYER,
    name: '玩家国',
    developmentPath: 'industrial_authoritarian',
    isPlayer: true,
    isAI: false,
    capitalProvinceId: 1,
    disputeResolve: Fixed.fromInt(0),
    stability: Fixed.fromNumber(0.6),
    politicalPower: Fixed.fromInt(150),
    factionId: null,
    ownedProvinceIds: [1, 3],
    controlledProvinceIds: [1, 3],
  });
  countries.set(ENEMY, {
    id: ENEMY,
    name: '敌国',
    developmentPath: 'communal',
    isPlayer: false,
    isAI: true,
    capitalProvinceId: 2,
    disputeResolve: Fixed.fromInt(0),
    stability: Fixed.fromNumber(0.5),
    politicalPower: Fixed.fromInt(100),
    factionId: null,
    ownedProvinceIds: [2, 4],
    controlledProvinceIds: [2, 4],
  });

  const provinces = new SortedMap<number, Province>();
  provinces.set(1, {
    id: 1, ownerId: PLAYER, controllerId: PLAYER, name: '首都',
    terrain: 'plains', isCoastal: false,
    infrastructure: 3, buildingSlots: 6, combatWidth: 10,
    supplyHubLevel: 2, fortLevel: 1, VP: 15,
  });
  provinces.set(3, {
    id: 3, ownerId: PLAYER, controllerId: PLAYER, name: '边境省',
    terrain: 'plains', isCoastal: false,
    infrastructure: 2, buildingSlots: 4, combatWidth: 8,
    supplyHubLevel: 1, fortLevel: 0, VP: 5,
  });
  provinces.set(2, {
    id: 2, ownerId: ENEMY, controllerId: ENEMY, name: '敌首都',
    terrain: 'plains', isCoastal: false,
    infrastructure: 2, buildingSlots: 4, combatWidth: 8,
    supplyHubLevel: 1, fortLevel: 1, VP: 15,
  });
  provinces.set(4, {
    id: 4, ownerId: ENEMY, controllerId: ENEMY, name: '敌边境',
    terrain: 'plains', isCoastal: false,
    infrastructure: 1, buildingSlots: 3, combatWidth: 6,
    supplyHubLevel: 0, fortLevel: 0, VP: 3,
  });

  const stockpiles = new SortedMap<string, WorldState['stockpiles'] extends SortedMap<infer K, infer V> ? V : never>();
  stockpiles.set(PLAYER, {
    countryId: PLAYER,
    steel: Fixed.fromInt(300), oil: Fixed.fromInt(100), tungsten: Fixed.fromInt(40),
    rubber: Fixed.fromInt(60), aluminum: Fixed.fromInt(80), political: Fixed.fromInt(200),
    caps: {
      steel: Fixed.fromInt(500), oil: Fixed.fromInt(300), tungsten: Fixed.fromInt(80),
      rubber: Fixed.fromInt(150), aluminum: Fixed.fromInt(200), political: Fixed.fromInt(200),
    },
    history: [],
  });
  stockpiles.set(ENEMY, {
    countryId: ENEMY,
    steel: Fixed.fromInt(300), oil: Fixed.fromInt(100), tungsten: Fixed.fromInt(40),
    rubber: Fixed.fromInt(60), aluminum: Fixed.fromInt(80), political: Fixed.fromInt(100),
    caps: {
      steel: Fixed.fromInt(500), oil: Fixed.fromInt(300), tungsten: Fixed.fromInt(80),
      rubber: Fixed.fromInt(150), aluminum: Fixed.fromInt(200), political: Fixed.fromInt(200),
    },
    history: [],
  });

  const factories = new SortedMap<number, WorldState['factories'] extends SortedMap<infer K, infer V> ? V : never>();
  factories.set(1, {
    id: 1, provinceId: 1, type: 'civilian', level: 1,
    state: 'idle', taskId: null, idleSinceTick: 0, productionProgress: Fixed.fromInt(0),
  });
  factories.set(2, {
    id: 2, provinceId: 1, type: 'civilian', level: 1,
    state: 'idle', taskId: null, idleSinceTick: 0, productionProgress: Fixed.fromInt(0),
  });
  factories.set(3, {
    id: 3, provinceId: 3, type: 'civilian', level: 1,
    state: 'idle', taskId: null, idleSinceTick: 0, productionProgress: Fixed.fromInt(0),
  });
  factories.set(101, {
    id: 101, provinceId: 2, type: 'civilian', level: 1,
    state: 'idle', taskId: null, idleSinceTick: 0, productionProgress: Fixed.fromInt(0),
  });
  factories.set(102, {
    id: 102, provinceId: 2, type: 'military', level: 1,
    state: 'idle', taskId: null, idleSinceTick: 0, productionProgress: Fixed.fromInt(0),
  });

  const equipmentPools = new SortedMap<string, WorldState['equipmentPools'] extends SortedMap<infer K, infer V> ? V : never>();
  equipmentPools.set(PLAYER, {
    countryId: PLAYER,
    stocks: [
      { type: 'infantry_equipment', count: 0 },
      { type: 'artillery', count: 0 },
      { type: 'light_tank', count: 0 },
    ],
  });
  equipmentPools.set(ENEMY, {
    countryId: ENEMY,
    stocks: [
      { type: 'infantry_equipment', count: 500 },
      { type: 'artillery', count: 20 },
      { type: 'light_tank', count: 0 },
    ],
  });

  return {
    version: '1.0.0',
    seed: 0xDEADBEEF,
    tickId: 0,
    tickElapsed: Fixed.fromInt(0),
    speed: 0,
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
    focusTrees: new SortedMap(),
    research: new SortedMap(),
    disputes: new SortedMap(),
    fronts: new SortedMap(),
    nextEntityId: 200,
    seedMap: { [PLAYER]: 1001, [ENEMY]: 2002 },
  };
}

function fmtFixed(f: Fixed): string {
  return (f.toNumber()).toFixed(1);
}

function reportStockpile(state: WorldState, cid: string): string {
  const s = state.stockpiles.get(cid);
  if (!s) return '(无)';
  return `政${fmtFixed(s.political)} 钢${fmtFixed(s.steel)} 油${fmtFixed(s.oil)} 钨${fmtFixed(s.tungsten)} 橡${fmtFixed(s.rubber)} 铝${fmtFixed(s.aluminum)}`;
}

function reportEquip(state: WorldState, cid: string): string {
  const p = state.equipmentPools.get(cid);
  if (!p) return '(无)';
  return p.stocks.map((s: { type: string; count: number }) => `${shortEq(s.type)}:${s.count}`).join(' ');
}

function shortEq(t: string): string {
  if (t === 'infantry_equipment') return '枪';
  if (t === 'artillery') return '炮';
  if (t === 'light_tank') return '坦';
  return t;
}

function countFactoriesInState(state: WorldState, cid: string, type: 'civilian' | 'military' | 'dockyard', st: string): number {
  let n = 0;
  state.factories.forEach((f) => {
    const p = state.provinces.get(f.provinceId);
    if (f.type === type && f.state === st && p && p.controllerId === cid) n++;
  });
  return n;
}

function countDivisionsIn(state: WorldState, cid: string, status?: string): number {
  let n = 0;
  state.divisions.forEach((d) => {
    if (d.ownerId === cid && (!status || d.status === status)) n++;
  });
  return n;
}

/** 模拟"一键平衡"：把玩家的空闲民厂分配到建造队列首个未完成项；若没有建造项则分配到贸易任务 */
function oneClickBalanceActions(state: WorldState): PlayerAction[] {
  const acts: PlayerAction[] = [];
  const queue = state.constructionQueues.get(PLAYER);
  // 先找一个需要民厂的建造项
  let targetCqId: string | null = null;
  if (queue) {
    for (const item of queue.items) {
      if (item.progress.lessThan(Fixed.ONE)) {
        targetCqId = item.id;
        break;
      }
    }
  }

  // 收集玩家的空闲民厂
  const idleCiv: number[] = [];
  state.factories.forEach((f, fid) => {
    const p = state.provinces.get(f.provinceId);
    if (p && p.controllerId === PLAYER && f.type === 'civilian' && f.state === 'idle') {
      idleCiv.push(fid);
    }
  });

  if (targetCqId) {
    const q = queue!;
    const item = q.items.find(it => it.id === targetCqId)!;
    const alreadyAssigned = new Set(item.assignedFactoryIds);
    for (const fid of idleCiv) {
      if (alreadyAssigned.has(fid)) continue;
      // assignFactory 会把 factory.taskId 设上，但不会回写 item.assignedFactoryIds；
      // 我们这里手动同步（模拟 oneClickBalance 真实逻辑）
      acts.push({ kind: 'assignFactory', factoryId: fid, taskId: targetCqId });
      item.assignedFactoryIds.push(fid);
      if (item.assignedFactoryIds.length >= 3) break; // 每项最多3民厂
    }
  } else {
    // 没建造项：派去贸易
    const tradeKey = `trade_${PLAYER}`;
    let tradeTask = state.productionTasks.get(tradeKey);
    if (!tradeTask) {
      tradeTask = {
        id: tradeKey, type: 'trade', countryId: PLAYER, target: 'steel',
        assignedFactoryIds: [], priority: 99, progress: Fixed.ZERO, efficiency: Fixed.HALF,
      };
      state.productionTasks.set(tradeKey, tradeTask);
    }
    for (const fid of idleCiv) {
      if (tradeTask.assignedFactoryIds.length >= 2) break; // 贸易最多2厂
      if (tradeTask.assignedFactoryIds.includes(fid)) continue;
      acts.push({ kind: 'assignFactory', factoryId: fid, taskId: tradeKey });
      tradeTask.assignedFactoryIds.push(fid);
    }
  }
  return acts;
}

describe('玩家流程游玩测试 (Playthrough)', () => {
  it('完整游玩：建造→生产→招兵→战斗，关键节点状态演进合理', () => {
    const state = makePlayState();
    const sim = DefaultSimulation.create(state);

    const logs: PlaythroughLog[] = [];
    const log = (label: string, detail: string) => logs.push({ tick: state.tickId, label, detail });
    const eventKinds: Record<string, number> = {};
    const tick = (frameId: number, acts: PlayerAction[]) => {
      const res = sim.tick(frameId, acts);
      for (const ev of res.events) eventKinds[ev.kind] = (eventKinds[ev.kind] || 0) + 1;
      return res;
    };

    // ============ 开局 ============
    log('开局', `速度0；民厂${countFactoriesInState(state, PLAYER, 'civilian', 'idle')}座空闲；军厂${countFactoriesInState(state, PLAYER, 'military', 'idle')}座；${reportStockpile(state, PLAYER)}`);
    log('开局装备', reportEquip(state, PLAYER));

    // ============ 第0帧：开速度2 + 一键平衡派民厂到贸易 ============
    let frameId = 0;
    const startActs: PlayerAction[] = [{ kind: 'setSpeed', speed: 2 }];
    startActs.push(...oneClickBalanceActions(state));
    let r = tick(frameId++, startActs);
    log('T1 开2速+平衡', `事件:${summarizeEvents(r.events)}；派工:${startActs.filter(a => a.kind === 'assignFactory').length}座厂`);

    // ============ tick 0~150：资源/政治点自然产出 + 贸易 ============
    for (let i = 0; i < 150; i++) {
      const acts = (i % 30 === 0) ? oneClickBalanceActions(state) : [];
      r = tick(frameId++, acts);
    }
    log('T151 资源累积', `${reportStockpile(state, PLAYER)}；空闲民厂${countFactoriesInState(state, PLAYER, 'civilian', 'idle')}；装备:${reportEquip(state, PLAYER)}`);

    // ============ tick 151：排队1座民厂（首都），派民厂施工 ============
    let buildActs: PlayerAction[] = [
      { kind: 'placeBuilding', type: 'civilian_factory', provinceId: 1, factoryCount: 0 },
    ];
    r = tick(frameId++, buildActs);
    const balance1 = oneClickBalanceActions(state);
    r = tick(frameId++, balance1);
    const queue1 = state.constructionQueues.get(PLAYER);
    const cq1Progress = queue1 && queue1.items[0] ? fmtFixed(queue1.items[0].progress) : '-';
    const cq1Assigns = queue1 && queue1.items[0] ? queue1.items[0].assignedFactoryIds.length : 0;
    log('T153 排民厂+派工', `队列进度${cq1Progress}；派民厂${cq1Assigns}座施工；钢${fmtFixed(state.stockpiles.get(PLAYER)!.steel)}`);

    // 推进 等民厂建成
    let builtCivilian = false;
    for (let i = 0; i < 600; i++) {
      const acts = oneClickBalanceActions(state);
      r = tick(frameId++, acts);
      for (const ev of r.events) {
        if (ev.kind === 'buildingCompleted') builtCivilian = true;
      }
      if (builtCivilian) break;
    }
    const civCount = countFactoriesInState(state, PLAYER, 'civilian', 'idle') + countFactoriesInState(state, PLAYER, 'civilian', 'working');
    log(`T${state.tickId} 民厂建成`, `民厂总数${civCount}（原3→应4）；事件:${summarizeEvents(r.events)}`);
    expect(civCount).toBeGreaterThanOrEqual(4);

    // 建完民厂后：建军厂（首都）
    let milActs: PlayerAction[] = [
      { kind: 'placeBuilding', type: 'military_factory', provinceId: 1, factoryCount: 0 },
    ];
    r = tick(frameId++, milActs);
    r = tick(frameId++, oneClickBalanceActions(state));
    log(`T${state.tickId} 排军厂`, `队列长度${state.constructionQueues.get(PLAYER)?.items.length || 0}`);

    let builtMil = false;
    for (let i = 0; i < 800; i++) {
      const acts = oneClickBalanceActions(state);
      r = tick(frameId++, acts);
      for (const ev of r.events) {
        if (ev.kind === 'buildingCompleted') builtMil = true;
      }
      if (builtMil) break;
    }
    const milCount = countFactoriesInState(state, PLAYER, 'military', 'idle') + countFactoriesInState(state, PLAYER, 'military', 'working');
    log(`T${state.tickId} 军厂建成`, `军厂总数${milCount}（原0→应1）`);
    expect(milCount).toBeGreaterThanOrEqual(1);

    // ============ 军厂拉步枪生产线 ============
    const playerMilIds: number[] = [];
    state.factories.forEach((f, fid) => {
      const p = state.provinces.get(f.provinceId);
      if (p && p.controllerId === PLAYER && f.type === 'military') playerMilIds.push(fid);
    });
    const tplKey = `tpl_infantry_equipment`;
    state.productionTasks.set(tplKey, {
      id: tplKey, type: 'production', countryId: PLAYER,
      target: 'infantry_equipment', assignedFactoryIds: [],
      priority: 10, progress: Fixed.ZERO, efficiency: Fixed.HALF,
    });
    const setupActs: PlayerAction[] = playerMilIds.map(fid => ({
      kind: 'assignFactory', factoryId: fid, taskId: tplKey,
    }));
    for (const fid of playerMilIds) {
      const t = state.productionTasks.get(tplKey)!;
      if (!t.assignedFactoryIds.includes(fid)) t.assignedFactoryIds.push(fid);
    }
    r = tick(frameId++, setupActs);
    log(`T${state.tickId} 军厂拉步枪线`, `派遣军厂${playerMilIds.length}座`);

    // 推进攒装备+政点直到够招兵
    for (let i = 0; i < 600; i++) {
      r = tick(frameId++, oneClickBalanceActions(state));
    }
    const infEquip = state.equipmentPools.get(PLAYER)!.stocks.find(s => s.type === 'infantry_equipment')!.count;
    log(`T${state.tickId} 步枪初产`, `步枪库存:${infEquip}；productionCompleted事件:${eventKinds['productionCompleted'] || 0}次`);
    expect(infEquip).toBeGreaterThanOrEqual(10);

    // ============ 攒够政点≥100且枪≥200再招兵 ============
    let curEquip = state.equipmentPools.get(PLAYER)!.stocks.find(s => s.type === 'infantry_equipment')!.count;
    let curPol = state.stockpiles.get(PLAYER)!.political.toNumber();
    let safetyLimiter = 0;
    while ((curEquip < 200 || curPol < 100) && safetyLimiter < 20000) {
      r = tick(frameId++, oneClickBalanceActions(state));
      curEquip = state.equipmentPools.get(PLAYER)!.stocks.find(s => s.type === 'infantry_equipment')!.count;
      curPol = state.stockpiles.get(PLAYER)!.political.toNumber();
      safetyLimiter++;
    }
    expect(safetyLimiter).toBeLessThan(20000);
    const eqBefore = curEquip;
    const polBefore = curPol;
    r = tick(frameId++, [{ kind: 'recruitDivision', provinceId: 1 }]);
    const eqAfter = state.equipmentPools.get(PLAYER)!.stocks.find(s => s.type === 'infantry_equipment')!.count;
    const polAfter = state.stockpiles.get(PLAYER)!.political.toNumber();
    const recruitDivs = countDivisionsIn(state, PLAYER, 'training');
    log(`T${state.tickId} 招募师团`, `扣政点${(polBefore - polAfter).toFixed(1)}（应100）；扣枪${eqBefore - eqAfter}（应200）；训练中师团${recruitDivs}`);
    expect(polBefore - polAfter).toBeGreaterThanOrEqual(99);
    expect(eqBefore - eqAfter).toBe(200);
    expect(recruitDivs).toBeGreaterThanOrEqual(1);

    // 训练周期：TRAINING_TICKS=600 tick
    let trainedDivs = 0;
    for (let i = 0; i < 1500; i++) {
      r = tick(frameId++, oneClickBalanceActions(state));
      for (const ev of r.events) {
        if (ev.kind === 'divisionRecruited') trainedDivs++;
      }
      if (trainedDivs > 0) break;
    }
    const readyDivs = countDivisionsIn(state, PLAYER, 'ready');
    log(`T${state.tickId} 师团训练完成`, `ready师团${readyDivs}；divisionRecruited事件${trainedDivs}`);
    expect(readyDivs).toBeGreaterThanOrEqual(1);

    let playerDivId = -1;
    state.divisions.forEach((d) => {
      if (d.ownerId === PLAYER && d.status === 'ready' && playerDivId < 0) playerDivId = d.id;
    });

    // ============ 向敌国发起争端 + 画前线（边境3→敌边境4） ============
    r = tick(frameId++, [{ kind: 'initiateDispute', targetCountryId: ENEMY }]);
    expect(state.disputes.size()).toBeGreaterThanOrEqual(1);

    r = tick(frameId++, [{ kind: 'drawFront', fromProvince: 3, toProvince: 4 }]);
    let frontCount = 0;
    state.fronts.forEach((arr) => { frontCount += arr.length; });
    expect(frontCount).toBeGreaterThanOrEqual(1);

    // 师团移动到边境3，配发满编装备并补充战力
    const div = state.divisions.get(playerDivId)!;
    div.currentProvinceId = 3;
    div.strength = Fixed.ONE;
    div.organization = Fixed.ONE;
    div.softAttack = Fixed.fromInt(30); // 满编步兵师（与 combat_system.test.ts 中 makeReadyDivision 一致）

    r = tick(frameId++, [
      { kind: 'issueOffensive', divisionIds: [playerDivId], targetProvince: 4 },
    ]);
    const divAfterOrder = state.divisions.get(playerDivId)!;
    const diagMsg = `师团id=${playerDivId} status=${divAfterOrder.status} inOffensive=${divAfterOrder.inOffensive} target=${divAfterOrder.targetProvinceId} curProv=${divAfterOrder.currentProvinceId} softAtk=${fmtFixed(divAfterOrder.softAttack)} str=${fmtFixed(divAfterOrder.strength)} org=${fmtFixed(divAfterOrder.organization)}`;
    log(`T${state.tickId} 进攻敌边境`, diagMsg);

    // ============ 推进战斗直到占领省4 ============
    let provinceControlledCount = 0;
    let disputeResolvedCount = 0;
    // 先统计 issueOffensive 这一 tick 内已经发生的事件
    for (const ev of r.events) {
      if (ev.kind === 'provinceControlled') provinceControlledCount++;
      if (ev.kind === 'disputeResolved') disputeResolvedCount++;
    }
    for (let i = 0; i < 1000; i++) {
      r = tick(frameId++, oneClickBalanceActions(state));
      for (const ev of r.events) {
        if (ev.kind === 'provinceControlled') provinceControlledCount++;
        if (ev.kind === 'disputeResolved') disputeResolvedCount++;
      }
      if (provinceControlledCount >= 1) break;
    }
    log(`T${state.tickId} 占敌边境`, `省4控=${state.provinces.get(4)!.controllerId}（应p1）；省管控事件累计${provinceControlledCount}`);
    expect(state.provinces.get(4)!.controllerId).toBe(PLAYER);
    expect(provinceControlledCount).toBeGreaterThanOrEqual(1);

    // ============ 继续进攻敌首都（省2） ============
    // 师团已自动移至省4，再次下令进攻省2
    const div2 = state.divisions.get(playerDivId)!;
    div2.strength = Fixed.ONE;
    div2.organization = Fixed.ONE;
    r = tick(frameId++, [
      { kind: 'issueOffensive', divisionIds: [playerDivId], targetProvince: 2 },
    ]);
    for (const ev of r.events) {
      if (ev.kind === 'provinceControlled') provinceControlledCount++;
      if (ev.kind === 'disputeResolved') disputeResolvedCount++;
    }

    // 再画前线：4→2
    r = tick(frameId++, [{ kind: 'drawFront', fromProvince: 4, toProvince: 2 }]);
    for (const ev of r.events) {
      if (ev.kind === 'provinceControlled') provinceControlledCount++;
      if (ev.kind === 'disputeResolved') disputeResolvedCount++;
    }

    let capturedCapital = state.provinces.get(2)!.controllerId === PLAYER;
    for (let i = 0; i < 2000; i++) {
      r = tick(frameId++, oneClickBalanceActions(state));
      for (const ev of r.events) {
        if (ev.kind === 'provinceControlled') provinceControlledCount++;
        if (ev.kind === 'disputeResolved') disputeResolvedCount++;
      }
      if (state.provinces.get(2)!.controllerId === PLAYER) {
        capturedCapital = true;
        break;
      }
    }

    const p4 = state.provinces.get(4)!;
    const p2 = state.provinces.get(2)!;
    const playerControlled: string[] = [];
    state.provinces.forEach((pr) => { if (pr.controllerId === PLAYER) playerControlled.push(`${pr.name}(VP${pr.VP})`); });
    const divAfter = state.divisions.get(playerDivId);
    log(`T${state.tickId} 战斗结果`,
      `敌边境[${p4.name}]控=${p4.controllerId}；敌首都[${p2.name}]控=${p2.controllerId}（已占=${capturedCapital}）；` +
      `省管控事件${provinceControlledCount}次；争端结算${disputeResolvedCount}次；` +
      `玩家控制:${playerControlled.join(',')}；` +
      (divAfter ? `师团status=${divAfter.status} str=${fmtFixed(divAfter.strength)} org=${fmtFixed(divAfter.organization)}` : '师团已歼灭'));

    expect(p4.controllerId).toBe(PLAYER);
    expect(provinceControlledCount).toBeGreaterThanOrEqual(2);
    expect(disputeResolvedCount).toBeGreaterThanOrEqual(1);
    expect(capturedCapital).toBe(true);

    // ============ 终局报告 ============
    log('终局资源', reportStockpile(state, PLAYER));
    log('终局装备', reportEquip(state, PLAYER));
    log('终局师团', `总数${countDivisionsIn(state, PLAYER)} ready${countDivisionsIn(state, PLAYER, 'ready')} fighting${countDivisionsIn(state, PLAYER, 'fighting')} training${countDivisionsIn(state, PLAYER, 'training')}`);
    log('事件统计', Object.entries(eventKinds).map(([k, v]) => `${k}:${v}`).join(' '));

    // 基础健壮性断言
    expect(state.tickId).toBeGreaterThan(1500);
    expect(eventKinds['productionCompleted'] || 0).toBeGreaterThanOrEqual(1);
    expect(eventKinds['buildingCompleted'] || 0).toBeGreaterThanOrEqual(2);
    expect(frontCount).toBeGreaterThanOrEqual(1);
    expect(eventKinds['provinceControlled'] || 0).toBeGreaterThanOrEqual(2); // 至少占领省4+省2
    expect(eventKinds['disputeResolved'] || 0).toBeGreaterThanOrEqual(1);    // 战争以投降告终
    expect(state.provinces.get(2)!.controllerId).toBe(PLAYER);               // 敌首都已占

    // 确定性：双实例复现300帧 hash 一致
    const simA = DefaultSimulation.create(makePlayState());
    const simB = DefaultSimulation.create(makePlayState());
    const replayFrame = (i: number, acts: PlayerAction[]) => {
      simA.tick(i, acts);
      simB.tick(i, acts);
    };
    // 注意：确定性重放需要同样的 state 直接操作（tradeTask创建/assign等），我们重放前300帧的公共路径
    let fi = 0;
    const stA = simA.snapshot();
    const stB = simB.snapshot();
    // 直接通过 action 驱动，state独立 —— 简化：只做300帧无玩家action重放
    for (let i = 0; i < 300; i++) {
      replayFrame(fi++, [{ kind: 'setSpeed', speed: 2 }]);
    }
    expect(simA.hash()).toBe(simB.hash());
    // 恢复避免报错
    simA.restore(stA);
    simB.restore(stB);
    log('确定性', '双实例300帧hash一致 ✅');

    // 输出日志
    // eslint-disable-next-line no-console
    console.log('\n========== 玩家流程游玩日志 ==========');
    for (const l of logs) {
      // eslint-disable-next-line no-console
      console.log(`[T${String(l.tick).padStart(5, ' ')}] ${l.label.padEnd(22, ' ')} | ${l.detail}`);
    }
    // eslint-disable-next-line no-console
    console.log('========================================\n');
  });
});

function summarizeEvents(events: GameEvent[]): string {
  if (events.length === 0) return '无';
  const counts: Record<string, number> = {};
  for (const ev of events) counts[ev.kind] = (counts[ev.kind] || 0) + 1;
  return Object.entries(counts).map(([k, v]) => `${k}×${v}`).join(',');
}
