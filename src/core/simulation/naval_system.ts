import { Fixed } from '../determinism/fixed';
import {
  WorldState,
  Ship,
  Fleet,
  FleetMission,
  SeaZone,
  SeaControlState,
  ShipTemplate,
  EquipmentPool,
} from '../state/world_state';
import { GameEvent } from './types';
import { NavalSystem, SurrenderSystem } from './interfaces';

const RECALC_SEA_CONTROL_EVERY = 60;
const NAVAL_COMBAT_INTERVAL = 120;
const BOMBARD_INTERVAL = 30;
const CONVOY_INTERDICTION_INTERVAL = 90;
const ORG_REGEN_PER_TICK = Fixed.fromNumber(0.0008);
const TRAINING_PER_TICK = Fixed.fromNumber(0.0012);
const FLEET_ORG_ON_RECRUIT = Fixed.fromNumber(0.3);
const FLEET_STRENGTH_ON_RECRUIT = Fixed.fromNumber(0.8);
const TRAINING_DONE = Fixed.ONE;
const CONVOY_LOSS_RATE_LOW_CONTROL = Fixed.fromNumber(0.05);
const CONVOY_LOSS_RATE_HIGH_CONTROL = Fixed.fromNumber(0.005);

const SHIP_EQUIP_COST: Record<string, Record<string, number>> = {
  destroyer:  { destroyer: 1 },
  cruiser:    { cruiser: 1 },
  battleship: { battleship: 1 },
  carrier:    { carrier: 1 },
  submarine:  { submarine: 1 },
};

const DEFAULT_SHIP_TEMPLATES: Omit<ShipTemplate, 'id'>[] = [
  {
    name: '驱逐舰', type: 'destroyer',
    hp: Fixed.fromInt(20), navalAttack: Fixed.fromInt(8), subAttack: Fixed.fromInt(2),
    antiSub: Fixed.fromInt(10), shoreBombardment: Fixed.fromInt(3), antiAir: Fixed.fromInt(5),
    armor: Fixed.fromInt(2), speed: Fixed.fromInt(30),
    steelCost: Fixed.fromInt(20), buildTicks: 400,
  },
  {
    name: '巡洋舰', type: 'cruiser',
    hp: Fixed.fromInt(40), navalAttack: Fixed.fromInt(18), subAttack: Fixed.fromInt(4),
    antiSub: Fixed.fromInt(5), shoreBombardment: Fixed.fromInt(8), antiAir: Fixed.fromInt(8),
    armor: Fixed.fromInt(6), speed: Fixed.fromInt(25),
    steelCost: Fixed.fromInt(45), buildTicks: 700,
  },
  {
    name: '战列舰', type: 'battleship',
    hp: Fixed.fromInt(100), navalAttack: Fixed.fromInt(40), subAttack: Fixed.fromInt(0),
    antiSub: Fixed.fromInt(2), shoreBombardment: Fixed.fromInt(25), antiAir: Fixed.fromInt(10),
    armor: Fixed.fromInt(20), speed: Fixed.fromInt(20),
    steelCost: Fixed.fromInt(100), buildTicks: 1200,
  },
  {
    name: '航母', type: 'carrier',
    hp: Fixed.fromInt(60), navalAttack: Fixed.fromInt(30), subAttack: Fixed.fromInt(8),
    antiSub: Fixed.fromInt(3), shoreBombardment: Fixed.fromInt(5), antiAir: Fixed.fromInt(20),
    armor: Fixed.fromInt(8), speed: Fixed.fromInt(25),
    steelCost: Fixed.fromInt(120), buildTicks: 1500,
  },
  {
    name: '潜艇', type: 'submarine',
    hp: Fixed.fromInt(15), navalAttack: Fixed.fromInt(15), subAttack: Fixed.fromInt(25),
    antiSub: Fixed.fromInt(0), shoreBombardment: Fixed.fromInt(1), antiAir: Fixed.fromInt(0),
    armor: Fixed.fromInt(1), speed: Fixed.fromInt(15),
    steelCost: Fixed.fromInt(25), buildTicks: 500,
  },
];

function isScreenShip(t: string): boolean { return t === 'destroyer' || t === 'cruiser'; }
function isCapitalShip(t: string): boolean { return t === 'battleship' || t === 'cruiser'; }
function isCarrier(t: string): boolean { return t === 'carrier'; }

export class DefaultNavalSystem implements NavalSystem {
  private surrenderSystem: SurrenderSystem | null = null;

  setSurrenderSystem(s: SurrenderSystem): void { this.surrenderSystem = s; }

  applyAirStrikeToZone(state: WorldState, seaZoneId: number, attackerCountryId: string, power: Fixed): number[] {
    const sunkIds: number[] = [];
    const enemyFleets: Fleet[] = [];
    state.fleets.forEach((f) => {
      if (f.assignedSeaZoneId === seaZoneId && f.ownerId !== attackerCountryId) {
        enemyFleets.push(f);
      }
    });
    if (enemyFleets.length === 0 || power.lessOrEqual(Fixed.ZERO)) return sunkIds;
    const events: GameEvent[] = [];
    const lost = this.applyDamage(state, enemyFleets, power, seaZoneId, events);
    for (const ev of events) {
      if (ev.kind === 'shipSunk') sunkIds.push(ev.shipId);
    }
    if (lost > 0) {
      const loserId = enemyFleets[0].ownerId;
      this.recordSunkContribution(state, attackerCountryId, loserId, lost);
    }
    return sunkIds;
  }

  initDefaultShipTemplates(state: WorldState): void {
    for (const tpl of DEFAULT_SHIP_TEMPLATES) {
      state.shipTemplates.set(tpl.type, { id: tpl.type, ...tpl });
    }
  }

  initDefaultSeaZones(state: WorldState): void {
    const playerId = findPlayerCountryId(state);
    const playerPortIds: number[] = [];
    const enemyPortIds: number[] = [];
    state.provinces.forEach((p) => {
      if (p.isCoastal && p.portLevel > 0) {
        if (playerId && p.controllerId === playerId) playerPortIds.push(p.id);
        else enemyPortIds.push(p.id);
      }
    });

    if (playerPortIds.length > 0 && enemyPortIds.length > 0) {
      const sz: SeaZone = {
        id: 1, name: '近海',
        adjacentProvinceIds: [...playerPortIds, ...enemyPortIds],
        adjacentSeaZoneIds: [],
      };
      state.seaZones.set(sz.id, sz);
      for (const pid of sz.adjacentProvinceIds) {
        const p = state.provinces.get(pid);
        if (p) { p.adjacentSeaZoneIds = [sz.id]; state.provinces.set(pid, p); }
      }
      const sc: SeaControlState = { seaZoneId: sz.id, control: [] };
      const countries = new Set<string>();
      for (const pid of sz.adjacentProvinceIds) {
        const p = state.provinces.get(pid);
        if (p) countries.add(p.controllerId);
      }
      const ratio = countries.size > 0 ? Fixed.ONE.div(Fixed.fromInt(countries.size)) : Fixed.ZERO;
      for (const cid of countries) sc.control.push({ countryId: cid, ratio });
      state.seaControl.set(sz.id, sc);
    }
  }

  /**
   * 建造单艘舰船（从装备池消耗），返回舰船 ID；失败返回 0
   * 兼容旧接口：templateId 如 "ship_destroyer" 或 "destroyer" 均可
   */
  buildShip(state: WorldState, countryId: string, portProvinceId: number, templateId: string): number {
    const province = state.provinces.get(portProvinceId);
    if (!province || province.controllerId !== countryId || province.portLevel < 1) return 0;
    const tplId = templateId.startsWith('ship_') ? templateId.slice(5) : templateId;
    const tpl = state.shipTemplates.get(tplId);
    if (!tpl) return 0;

    const pool = this.ensurePool(state, countryId);
    const cost = SHIP_EQUIP_COST[tpl.type];
    if (!cost) return 0;
    for (const [k, v] of Object.entries(cost)) {
      if (this.getStock(pool, k) < v) return 0;
    }
    for (const [k, v] of Object.entries(cost)) this.consumeStock(pool, k, v);

    const shipId = state.nextEntityId++;
    const ship: Ship = {
      id: shipId, ownerId: countryId, templateId: tplId, type: tpl.type,
      hp: tpl.hp, maxHp: tpl.hp,
      navalAttack: tpl.navalAttack, subAttack: tpl.subAttack, antiSub: tpl.antiSub,
      shoreBombardment: tpl.shoreBombardment, antiAir: tpl.antiAir, armor: tpl.armor, speed: tpl.speed,
      fleetId: 0,
    };
    state.ships.set(shipId, ship);
    return shipId;
  }

  /**
   * M3 招募舰队：自动消耗装备池中的舰船装备，组建新舰队
   * composition: { destroyer:4, cruiser:2, battleship:1 } 等
   */
  recruitFleet(
    state: WorldState,
    countryId: string,
    portProvinceId: number,
    composition: Record<string, number>,
    name: string,
  ): number {
    const port = state.provinces.get(portProvinceId);
    if (!port || port.controllerId !== countryId || port.portLevel < 1) return 0;

    const pool = this.ensurePool(state, countryId);
    for (const [k, v] of Object.entries(composition)) {
      if (v <= 0) continue;
      if (!state.shipTemplates.has(k)) return 0;
      if (this.getStock(pool, k) < v) return 0;
    }
    const political = state.stockpiles.get(countryId);
    const POLITICAL_COST = Fixed.fromInt(50);
    if (!political || political.political.lessThan(POLITICAL_COST)) return 0;

    const shipIds: number[] = [];
    for (const [shipType, cnt] of Object.entries(composition)) {
      if (cnt <= 0) continue;
      this.consumeStock(pool, shipType, cnt);
      const tpl = state.shipTemplates.get(shipType)!;
      for (let i = 0; i < cnt; i++) {
        const sid = state.nextEntityId++;
        state.ships.set(sid, {
          id: sid, ownerId: countryId, templateId: shipType, type: tpl.type,
          hp: tpl.hp, maxHp: tpl.hp,
          navalAttack: tpl.navalAttack, subAttack: tpl.subAttack, antiSub: tpl.antiSub,
          shoreBombardment: tpl.shoreBombardment, antiAir: tpl.antiAir, armor: tpl.armor, speed: tpl.speed,
          fleetId: 0,
        });
        shipIds.push(sid);
      }
    }
    if (shipIds.length === 0) return 0;

    political.political = political.political.sub(POLITICAL_COST);

    const fleetId = state.nextEntityId++;
    const fleet: Fleet = {
      id: fleetId, ownerId: countryId, name,
      homePortId: portProvinceId,
      status: 'training',
      organization: FLEET_ORG_ON_RECRUIT,
      strength: FLEET_STRENGTH_ON_RECRUIT,
      trainingProgress: FLEET_ORG_ON_RECRUIT,
      mission: 'idle',
      assignedSeaZoneId: null,
      bombardTargetProvinceId: null,
      shipIds,
    };
    for (const sid of shipIds) {
      const s = state.ships.get(sid);
      if (s) { s.fleetId = fleetId; state.ships.set(sid, s); }
    }
    state.fleets.set(fleetId, fleet);
    return fleetId;
  }

  createFleet(state: WorldState, countryId: string, name: string, homePortId: number, shipIds: number[]): number {
    const port = state.provinces.get(homePortId);
    if (!port || port.controllerId !== countryId || port.portLevel < 1) return 0;
    const validIds: number[] = [];
    for (const sid of shipIds) {
      const s = state.ships.get(sid);
      if (s && s.ownerId === countryId && s.fleetId === 0) validIds.push(sid);
    }
    if (validIds.length === 0) return 0;
    const fleetId = state.nextEntityId++;
    const fleet: Fleet = {
      id: fleetId, ownerId: countryId, name, homePortId,
      status: 'idle', organization: Fixed.ONE, strength: Fixed.ONE, trainingProgress: TRAINING_DONE,
      mission: 'idle', assignedSeaZoneId: null, bombardTargetProvinceId: null,
      shipIds: validIds,
    };
    for (const sid of validIds) {
      const s = state.ships.get(sid);
      if (s) { s.fleetId = fleetId; state.ships.set(sid, s); }
    }
    state.fleets.set(fleetId, fleet);
    return fleetId;
  }

  assignMission(
    state: WorldState,
    fleetId: number,
    mission: FleetMission,
    seaZoneId?: number,
    targetProvinceId?: number,
  ): boolean {
    const fleet = state.fleets.get(fleetId);
    if (!fleet) return false;
    if (fleet.status === 'training' && mission !== 'idle') return false;
    if (fleet.organization.lessThan(Fixed.fromNumber(0.2)) && mission !== 'idle') return false;

    if (mission === 'shore_bombard') {
      if (!targetProvinceId) return false;
      const target = state.provinces.get(targetProvinceId);
      if (!target || !target.isCoastal) return false;
      fleet.bombardTargetProvinceId = targetProvinceId;
      fleet.assignedSeaZoneId = this.findSeaZoneAdjacent(state, targetProvinceId);
      fleet.status = 'on_mission';
    } else if (mission !== 'idle') {
      if (!seaZoneId) return false;
      const sz = state.seaZones.get(seaZoneId);
      if (!sz) return false;
      fleet.assignedSeaZoneId = seaZoneId;
      fleet.bombardTargetProvinceId = null;
      fleet.status = 'on_mission';
    } else {
      fleet.assignedSeaZoneId = null;
      fleet.bombardTargetProvinceId = null;
      fleet.status = 'idle';
    }
    fleet.mission = mission;
    state.fleets.set(fleetId, fleet);
    return true;
  }

  recallToPort(state: WorldState, fleetId: number): void {
    const fleet = state.fleets.get(fleetId);
    if (!fleet) return;
    fleet.mission = 'idle';
    fleet.status = 'retreating';
    fleet.assignedSeaZoneId = null;
    fleet.bombardTargetProvinceId = null;
    state.fleets.set(fleetId, fleet);
  }

  advanceTick(state: WorldState, dtMs: Fixed): GameEvent[] {
    const events: GameEvent[] = [];
    const dtSec = dtMs.div(Fixed.fromInt(1000));

    this.advanceFleetState(state, dtSec, events);

    if (state.tickId % RECALC_SEA_CONTROL_EVERY === 0) this.recalcSeaControl(state);
    if (state.tickId % NAVAL_COMBAT_INTERVAL === 0) {
      for (const ev of this.resolveNavalCombat(state)) events.push(ev);
    }
    if (state.tickId % BOMBARD_INTERVAL === 0) {
      for (const ev of this.applyShoreBombardment(state)) events.push(ev);
    }
    if (state.tickId % CONVOY_INTERDICTION_INTERVAL === 0) {
      for (const ev of this.applyConvoyInterdiction(state)) events.push(ev);
    }

    return events;
  }

  getShoreBombardmentModifier(state: WorldState, provinceId: number, attackerCountryId: string): Fixed {
    let total = Fixed.ZERO;
    state.fleets.forEach((fleet) => {
      if (fleet.ownerId !== attackerCountryId) return;
      if (fleet.mission !== 'shore_bombard') return;
      if (fleet.bombardTargetProvinceId !== provinceId) return;
      if (fleet.status !== 'on_mission') return;
      for (const sid of fleet.shipIds) {
        const s = state.ships.get(sid);
        if (s) total = total.add(s.shoreBombardment);
      }
    });
    if (total.equals(Fixed.ZERO)) return Fixed.ONE;
    const bonus = total.div(Fixed.fromInt(100)).min(Fixed.fromNumber(0.3));
    return Fixed.ONE.add(bonus);
  }

  getSeaControl(state: WorldState, seaZoneId: number, countryId: string): Fixed {
    const sc = state.seaControl.get(seaZoneId);
    if (!sc) return Fixed.ZERO;
    for (const c of sc.control) if (c.countryId === countryId) return c.ratio;
    return Fixed.ZERO;
  }

  /**
   * 查询某国可用运输船数量
   */
  getConvoyCount(state: WorldState, countryId: string): number {
    const pool = state.equipmentPools.get(countryId);
    if (!pool) return 0;
    return this.getStock(pool, 'convoy');
  }

  /**
   * 从运输船池消耗/归还
   */
  consumeConvoys(state: WorldState, countryId: string, n: number): number {
    const pool = this.ensurePool(state, countryId);
    const have = this.getStock(pool, 'convoy');
    const take = Math.min(have, n);
    this.consumeStock(pool, 'convoy', take);
    return take;
  }
  refundConvoys(state: WorldState, countryId: string, n: number): void {
    const pool = this.ensurePool(state, countryId);
    this.addStock(pool, 'convoy', n);
  }

  private advanceFleetState(state: WorldState, dtSec: Fixed, _events: GameEvent[]): void {
    state.fleets.forEach((fleet) => {
      if (fleet.status === 'training') {
        fleet.trainingProgress = fleet.trainingProgress.add(TRAINING_PER_TICK.mul(dtSec)).min(TRAINING_DONE);
        fleet.organization = fleet.organization.add(ORG_REGEN_PER_TICK.mul(dtSec)).min(TRAINING_DONE);
        if (fleet.trainingProgress.greaterOrEqual(TRAINING_DONE)) {
          fleet.status = 'idle';
        }
      } else if (fleet.status === 'retreating') {
        fleet.organization = fleet.organization.add(ORG_REGEN_PER_TICK.mul(dtSec).mul(Fixed.fromInt(2))).min(TRAINING_DONE);
        if (fleet.organization.greaterOrEqual(Fixed.fromNumber(0.6))) {
          fleet.status = 'idle';
          fleet.mission = 'idle';
        }
      } else if (fleet.status === 'on_mission' || fleet.status === 'combat') {
        const atSea = fleet.assignedSeaZoneId !== null;
        if (atSea) {
          fleet.organization = fleet.organization.sub(Fixed.fromNumber(0.0001).mul(dtSec)).max(Fixed.ZERO);
          this.repairFleetShips(state, fleet, Fixed.fromNumber(0.0002).mul(dtSec));
        } else {
          fleet.organization = fleet.organization.add(ORG_REGEN_PER_TICK.mul(dtSec)).min(TRAINING_DONE);
          this.repairFleetShips(state, fleet, Fixed.fromNumber(0.001).mul(dtSec));
        }
        if (fleet.shipIds.length === 0) {
          state.fleets.delete(fleet.id);
          return;
        }
        fleet.strength = this.calcFleetStrength(state, fleet);
      } else {
        fleet.organization = fleet.organization.add(ORG_REGEN_PER_TICK.mul(dtSec)).min(TRAINING_DONE);
        this.repairFleetShips(state, fleet, Fixed.fromNumber(0.001).mul(dtSec));
        fleet.strength = this.calcFleetStrength(state, fleet);
      }
      state.fleets.set(fleet.id, fleet);
    });
  }

  private repairFleetShips(state: WorldState, fleet: Fleet, rate: Fixed): void {
    for (const sid of fleet.shipIds) {
      const s = state.ships.get(sid);
      if (!s) continue;
      if (s.hp.lessThan(s.maxHp)) {
        s.hp = s.hp.add(s.maxHp.mul(rate)).min(s.maxHp);
        state.ships.set(sid, s);
      }
    }
  }

  private calcFleetStrength(state: WorldState, fleet: Fleet): Fixed {
    let curHp = Fixed.ZERO;
    let maxHp = Fixed.ZERO;
    for (const sid of fleet.shipIds) {
      const s = state.ships.get(sid);
      if (!s) continue;
      curHp = curHp.add(s.hp);
      maxHp = maxHp.add(s.maxHp);
    }
    if (maxHp.equals(Fixed.ZERO)) return Fixed.ZERO;
    return curHp.div(maxHp);
  }

  private recalcSeaControl(state: WorldState): void {
    state.seaZones.forEach((sz) => {
      const powerByCountry = new Map<string, Fixed>();
      let totalPower = Fixed.ZERO;
      state.fleets.forEach((fleet) => {
        if (fleet.status === 'training' || fleet.status === 'retreating') return;
        if (fleet.assignedSeaZoneId !== sz.id) return;
        let power = Fixed.ZERO;
        for (const sid of fleet.shipIds) {
          const s = state.ships.get(sid);
          if (!s) continue;
          power = power.add(s.navalAttack).add(s.hp.div(Fixed.fromInt(5)));
        }
        power = power.mul(fleet.organization).mul(fleet.strength);
        const prev = powerByCountry.get(fleet.ownerId) || Fixed.ZERO;
        powerByCountry.set(fleet.ownerId, prev.add(power));
        totalPower = totalPower.add(power);
      });
      const sc: SeaControlState = { seaZoneId: sz.id, control: [] };
      if (totalPower.greaterThan(Fixed.ZERO)) {
        powerByCountry.forEach((p, cid) => sc.control.push({ countryId: cid, ratio: p.div(totalPower) }));
      } else {
        const adjCountries = new Set<string>();
        for (const pid of sz.adjacentProvinceIds) {
          const p = state.provinces.get(pid);
          if (p && p.portLevel > 0) adjCountries.add(p.controllerId);
        }
        if (adjCountries.size === 0) state.countries.forEach((_, cid) => adjCountries.add(cid));
        const ratio = Fixed.ONE.div(Fixed.fromInt(adjCountries.size));
        for (const cid of adjCountries) sc.control.push({ countryId: cid, ratio });
      }
      state.seaControl.set(sz.id, sc);
    });
  }

  private resolveNavalCombat(state: WorldState): GameEvent[] {
    const events: GameEvent[] = [];
    const fleetsByZone = new Map<number, Fleet[]>();
    state.fleets.forEach((fleet) => {
      if (fleet.status !== 'on_mission') return;
      if (!fleet.assignedSeaZoneId) return;
      const list = fleetsByZone.get(fleet.assignedSeaZoneId) || [];
      list.push(fleet);
      fleetsByZone.set(fleet.assignedSeaZoneId, list);
    });

    fleetsByZone.forEach((fleets, zoneId) => {
      if (fleets.length < 2) return;
      const byCountry = new Map<string, Fleet[]>();
      for (const f of fleets) {
        const list = byCountry.get(f.ownerId) || [];
        list.push(f);
        byCountry.set(f.ownerId, list);
      }
      if (byCountry.size < 2) return;

      const countries = Array.from(byCountry.keys());
      const aId = countries[0];
      const dId = countries[1];

      const aStats = this.calcSideStats(state, byCountry.get(aId) || []);
      const dStats = this.calcSideStats(state, byCountry.get(dId) || []);

      const screenEffA = this.screenEfficiency(aStats);
      const screenEffD = this.screenEfficiency(dStats);

      const aPower = aStats.capitalPower
        .add(aStats.carrierPower)
        .add(aStats.screenPower.mul(Fixed.fromNumber(0.3)))
        .mul(screenEffA);
      const dPower = dStats.capitalPower
        .add(dStats.carrierPower)
        .add(dStats.screenPower.mul(Fixed.fromNumber(0.3)))
        .mul(screenEffD);

      if (aPower.equals(Fixed.ZERO) && dPower.equals(Fixed.ZERO)) return;

      const aDice = Fixed.fromNumber(0.7 + seededRoll(state.tickId, zoneId, aId) * 0.6);
      const dDice = Fixed.fromNumber(0.7 + seededRoll(state.tickId, zoneId, dId) * 0.6);

      const aFinal = aPower.mul(aDice);
      const dFinal = dPower.mul(dDice);

      const aHits = aFinal.div(Fixed.fromInt(25)).min(Fixed.fromInt(50));
      const dHits = dFinal.div(Fixed.fromInt(25)).min(Fixed.fromInt(50));

      const aLost = this.applyDamage(state, byCountry.get(dId) || [], dHits, zoneId, events);
      const dLost = this.applyDamage(state, byCountry.get(aId) || [], aHits, zoneId, events);

      for (const f of byCountry.get(aId) || []) {
        f.status = 'combat';
        state.fleets.set(f.id, f);
      }
      for (const f of byCountry.get(dId) || []) {
        f.status = 'combat';
        state.fleets.set(f.id, f);
      }

      events.push({
        kind: 'navalBattle',
        seaZoneId: zoneId,
        attackerCountryId: aId, defenderCountryId: dId,
        attackerShipsLost: dLost, defenderShipsLost: aLost,
      });

      this.recordSunkContribution(state, dId, aId, dLost);
      this.recordSunkContribution(state, aId, dId, aLost);
    });

    state.fleets.forEach((f) => {
      if (f.status === 'combat') {
        if (f.shipIds.length === 0) { state.fleets.delete(f.id); return; }
        if (f.organization.lessThan(Fixed.fromNumber(0.2))) {
          f.status = 'retreating';
          f.mission = 'idle';
          f.assignedSeaZoneId = null;
          f.bombardTargetProvinceId = null;
        } else {
          f.status = 'on_mission';
        }
        state.fleets.set(f.id, f);
      }
    });

    return events;
  }

  private calcSideStats(state: WorldState, fleets: Fleet[]): {
    screenPower: Fixed; capitalPower: Fixed; carrierPower: Fixed; subPower: Fixed;
    screenCount: number; capitalCount: number; carrierCount: number;
  } {
    let screenPower = Fixed.ZERO, capitalPower = Fixed.ZERO, carrierPower = Fixed.ZERO, subPower = Fixed.ZERO;
    let screenCount = 0, capitalCount = 0, carrierCount = 0;
    for (const fleet of fleets) {
      const orgMul = fleet.organization.mul(fleet.strength);
      for (const sid of fleet.shipIds) {
        const s = state.ships.get(sid);
        if (!s) continue;
        const hpPct = s.hp.div(s.maxHp);
        const atk = s.navalAttack.add(s.subAttack).mul(hpPct).mul(orgMul);
        if (isScreenShip(s.type)) { screenPower = screenPower.add(atk); screenCount++; }
        else if (isCapitalShip(s.type)) { capitalPower = capitalPower.add(atk); capitalCount++; }
        else if (isCarrier(s.type)) { carrierPower = carrierPower.add(atk); carrierCount++; }
        else if (s.type === 'submarine') { subPower = subPower.add(s.subAttack.mul(hpPct).mul(orgMul)); }
      }
    }
    return { screenPower, capitalPower, carrierPower, subPower, screenCount, capitalCount, carrierCount };
  }

  private screenEfficiency(stats: { screenCount: number; capitalCount: number; carrierCount: number }): Fixed {
    const bigShips = stats.capitalCount + stats.carrierCount;
    if (bigShips === 0) return Fixed.ONE;
    const neededScreens = bigShips * 4;
    const ratio = Fixed.fromInt(Math.min(stats.screenCount, neededScreens)).div(Fixed.fromInt(neededScreens));
    return Fixed.fromNumber(0.3).add(ratio.mul(Fixed.fromNumber(0.7)));
  }

  private applyDamage(
    state: WorldState, defenders: Fleet[], damage: Fixed, zoneId: number, events: GameEvent[],
  ): number {
    let remaining = damage;
    let lostCount = 0;
    for (const fleet of defenders) {
      const toRemove: number[] = [];
      let fleetDmgTaken = Fixed.ZERO;
      for (const sid of fleet.shipIds) {
        if (remaining.lessOrEqual(Fixed.ZERO)) break;
        const s = state.ships.get(sid);
        if (!s) continue;
        const armorReduc = s.armor.div(s.armor.add(Fixed.fromInt(20))).mul(Fixed.fromNumber(0.3));
        const effective = Fixed.ONE.sub(armorReduc);
        const dmg = remaining.min(Fixed.fromInt(12)).mul(effective);
        s.hp = s.hp.sub(dmg);
        fleetDmgTaken = fleetDmgTaken.add(dmg);
        remaining = remaining.sub(dmg.min(remaining));
        if (s.hp.lessOrEqual(Fixed.ZERO)) {
          toRemove.push(sid); lostCount++;
          events.push({ kind: 'shipSunk', shipId: sid, ownerId: s.ownerId, seaZoneId: zoneId });
        } else {
          state.ships.set(sid, s);
        }
      }
      if (toRemove.length > 0) {
        for (const sid of toRemove) state.ships.delete(sid);
        fleet.shipIds = fleet.shipIds.filter((id) => !toRemove.includes(id));
        state.fleets.set(fleet.id, fleet);
      }
      if (fleetDmgTaken.greaterThan(Fixed.ZERO)) {
        fleet.organization = fleet.organization.sub(fleetDmgTaken.div(Fixed.fromInt(100))).max(Fixed.ZERO);
        state.fleets.set(fleet.id, fleet);
      }
    }
    return lostCount;
  }

  private recordSunkContribution(state: WorldState, attackerId: string, loserId: string, lostCount: number): void {
    if (lostCount <= 0) return;
    state.disputes.forEach((d) => {
      if (!d.participants.includes(loserId)) return;
      if (!d.participants.includes(attackerId)) return;
      if (this.surrenderSystem) {
        this.surrenderSystem.addContribution(
          state, d.id, loserId,
          Fixed.fromNumber(0.005).mul(Fixed.fromInt(lostCount)),
          'ships_lost',
        );
      }
      const losses = state.warLosses.get(loserId);
      if (losses) {
        const prevTotal = losses.shipsLost.total ?? 0;
        losses.shipsLost.total = prevTotal + lostCount;
      }
    });
  }

  private applyShoreBombardment(state: WorldState): GameEvent[] {
    const events: GameEvent[] = [];
    state.fleets.forEach((fleet) => {
      if (fleet.mission !== 'shore_bombard') return;
      if (fleet.status !== 'on_mission') return;
      if (!fleet.bombardTargetProvinceId) return;
      const target = state.provinces.get(fleet.bombardTargetProvinceId);
      if (!target || !target.isCoastal) return;
      if (target.controllerId === fleet.ownerId) return;
      let strength = Fixed.ZERO;
      for (const sid of fleet.shipIds) {
        const s = state.ships.get(sid);
        if (s) strength = strength.add(s.shoreBombardment);
      }
      if (strength.greaterThan(Fixed.ZERO)) {
        events.push({
          kind: 'shoreBombardment',
          fleetId: fleet.id, provinceId: fleet.bombardTargetProvinceId, bombardStrength: strength,
        });
      }
    });
    return events;
  }

  private applyConvoyInterdiction(state: WorldState): GameEvent[] {
    const events: GameEvent[] = [];
    const net = state.supplyNetwork;
    for (const route of net.seaSupplyRoutes) {
      if (route.pathSeaZoneIds.length === 0) continue;
      let lowestControl = Fixed.ONE;
      let enemySubs = false;
      for (const zid of route.pathSeaZoneIds) {
        const enemyRatio = Fixed.ONE.sub(this.getSeaControl(state, zid, route.ownerId));
        if (enemyRatio.lessThan(lowestControl)) lowestControl = enemyRatio;
        state.fleets.forEach((f) => {
          if (f.ownerId === route.ownerId) return;
          if (f.assignedSeaZoneId !== zid) return;
          if (f.mission === 'interdiction') enemySubs = true;
        });
      }
      const ourControl = Fixed.ONE.sub(lowestControl);
      let lossRate = CONVOY_LOSS_RATE_HIGH_CONTROL;
      if (ourControl.lessThan(Fixed.fromNumber(0.3))) lossRate = CONVOY_LOSS_RATE_LOW_CONTROL;
      else if (ourControl.lessThan(Fixed.fromNumber(0.6))) lossRate = Fixed.fromNumber(0.02);
      if (enemySubs) lossRate = lossRate.mul(Fixed.fromInt(2));
      const convoysAtRisk = Math.max(1, Math.floor(route.convoysAssigned * 0.2));
      const lost = Math.max(1, Math.floor(convoysAtRisk * lossRate.toNumber()));
      if (lost > 0) {
        const taken = this.consumeConvoys(state, route.ownerId, lost);
        if (taken > 0) {
          route.efficiency = route.efficiency.mul(Fixed.fromNumber(0.9)).max(Fixed.fromNumber(0.3));
          events.push({ kind: 'convoySunk', countryId: route.ownerId, count: taken, seaZoneId: route.pathSeaZoneIds[0] });
        }
      } else {
        route.efficiency = route.efficiency.add(Fixed.fromNumber(0.01)).min(Fixed.ONE);
      }
    }
    return events;
  }

  private findSeaZoneAdjacent(state: WorldState, provinceId: number): number | null {
    let found: number | null = null;
    state.seaZones.forEach((sz) => {
      if (found !== null) return;
      if (sz.adjacentProvinceIds.includes(provinceId)) found = sz.id;
    });
    return found;
  }

  private ensurePool(state: WorldState, countryId: string): EquipmentPool {
    let pool = state.equipmentPools.get(countryId);
    const required = [
      'infantry_equipment', 'artillery', 'light_tank',
      'convoy', 'destroyer', 'cruiser', 'battleship', 'carrier', 'submarine',
    ];
    if (!pool) {
      pool = { countryId, stocks: required.map((t) => ({ type: t, count: 0 })) };
      state.equipmentPools.set(countryId, pool);
    } else {
      for (const t of required) {
        if (!pool.stocks.find((s) => s.type === t)) pool.stocks.push({ type: t, count: 0 });
      }
    }
    return pool;
  }

  private getStock(pool: EquipmentPool, type: string): number {
    const s = pool.stocks.find((x) => x.type === type);
    return s ? s.count : 0;
  }
  private consumeStock(pool: EquipmentPool, type: string, n: number): void {
    let s = pool.stocks.find((x) => x.type === type);
    if (!s) { s = { type, count: 0 }; pool.stocks.push(s); }
    s.count = Math.max(0, s.count - n);
  }
  private addStock(pool: EquipmentPool, type: string, n: number): void {
    let s = pool.stocks.find((x) => x.type === type);
    if (!s) { s = { type, count: 0 }; pool.stocks.push(s); }
    s.count += n;
  }
}

function seededRoll(tick: number, zone: number, country: string): number {
  let h = tick * 31 + zone * 7;
  for (let i = 0; i < country.length; i++) h = (h * 131 + country.charCodeAt(i)) >>> 0;
  return (h % 1000) / 1000;
}

function findPlayerCountryId(state: WorldState): string | null {
  let pid: string | null = null;
  state.countries.forEach((c) => { if (pid === null && c.isPlayer) pid = c.id; });
  return pid;
}
