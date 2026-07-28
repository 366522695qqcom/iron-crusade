/**
 * 空军系统默认实现（spec feature-grand-war M4）
 *
 * 职责：
 * - initDefaultAirZones：按省/海域聚合默认空域
 * - recruitWing：从军厂装备池招募空军联队（消耗战机+政点）
 * - assignMission/recallToBase：任务派遣与召回
 * - advanceTick：训练推进、空战结算、制空权计算、CAS/炸港/对海打击
 */
import { Fixed } from '../determinism/fixed';
import {
  WorldState,
  AirWing,
  AirMission,
  AirZone,
  EquipmentPool,
} from '../state/world_state';
import { GameEvent } from './types';
import { AirSystem, SurrenderSystem, NavalSystem, SupplySystem } from './interfaces';

const RECALC_AIR_SUPERIORITY_EVERY = 60;
const AIR_COMBAT_INTERVAL = 90;
const STRIKE_INTERVAL = 120;
const PORT_BOMB_DURATION_TICKS = 300;

const TRAINING_PER_TICK = Fixed.fromNumber(0.001);
const ORG_REGEN_PER_TICK = Fixed.fromNumber(0.0006);
const WING_ORG_ON_RECRUIT = Fixed.fromNumber(0.3);
const WING_STR_ON_RECRUIT = Fixed.fromNumber(0.7);
const TRAINING_DONE = Fixed.ONE;

const POLITICAL_COST_PER_WING = 40;

const AIRCRAFT_STATS: Record<string, { atk: Fixed; def: Fixed; isFighter: boolean; isBomber: boolean }> = {
  fighter:         { atk: Fixed.fromNumber(8),  def: Fixed.fromNumber(6),  isFighter: true,  isBomber: false },
  cas:             { atk: Fixed.fromNumber(4),  def: Fixed.fromNumber(2),  isFighter: false, isBomber: true },
  tactical_bomber: { atk: Fixed.fromNumber(5),  def: Fixed.fromNumber(3),  isFighter: false, isBomber: true },
  naval_fighter:   { atk: Fixed.fromNumber(7),  def: Fixed.fromNumber(5),  isFighter: true,  isBomber: false },
};

const WING_SIZE_FULL = 100;

export class DefaultAirSystem implements AirSystem {
  private surrenderSystem: SurrenderSystem | null = null;
  private navalSystem: NavalSystem | null = null;
  private supplySystem: SupplySystem | null = null;

  setSurrenderSystem(s: SurrenderSystem): void { this.surrenderSystem = s; }
  setNavalSystem(n: NavalSystem): void { this.navalSystem = n; }
  setSupplySystem(s: SupplySystem): void { this.supplySystem = s; }

  initDefaultAirZones(state: WorldState): void {
    if (state.airZones.size() > 0) return;
    const allProvs: number[] = [];
    state.provinces.forEach((p) => allProvs.push(p.id));
    const allSeas: number[] = [];
    state.seaZones.forEach((sz) => allSeas.push(sz.id));
    const zone: AirZone = { id: 1, name: '主战区', provinceIds: allProvs, seaZoneIds: allSeas };
    state.airZones.set(1, zone);
  }

  recruitWing(
    state: WorldState, countryId: string, baseProvinceId: number,
    aircraft: Record<string, number>, name: string,
  ): number {
    const base = state.provinces.get(baseProvinceId);
    if (!base || base.controllerId !== countryId || base.airBaseLevel < 1) return -1;

    const country = state.countries.get(countryId);
    if (!country) return -1;
    if (country.politicalPower.lessThan(Fixed.fromInt(POLITICAL_COST_PER_WING))) return -1;

    const pool = this.ensureAircraftPool(state, countryId);

    let total = 0;
    for (const [t, c] of Object.entries(aircraft)) {
      if (!AIRCRAFT_STATS[t]) return -1;
      if (c <= 0) return -1;
      total += c;
      if (this.getStock(pool, t) < c) return -1;
    }
    if (total === 0) return -1;

    for (const [t, c] of Object.entries(aircraft)) {
      this.consumeStock(pool, t, c);
    }
    country.politicalPower = country.politicalPower.sub(Fixed.fromInt(POLITICAL_COST_PER_WING));

    const wingId = state.nextEntityId++;
    const wing: AirWing = {
      id: wingId,
      ownerId: countryId,
      name,
      aircraft: { ...aircraft },
      organization: WING_ORG_ON_RECRUIT,
      strength: WING_STR_ON_RECRUIT,
      trainingProgress: Fixed.ZERO,
      status: 'training',
      homeBaseId: baseProvinceId,
      carrierFleetId: null,
      mission: 'idle',
      assignedAirZoneId: null,
      targetProvinceId: null,
      targetSeaZoneId: null,
    };
    state.wings.set(wingId, wing);
    return wingId;
  }

  assignMission(
    state: WorldState, wingId: number, mission: AirMission,
    airZoneId?: number, targetProvinceId?: number, targetSeaZoneId?: number,
  ): boolean {
    const w = state.wings.get(wingId);
    if (!w) return false;
    if (w.status === 'training') return false;
    w.mission = mission;
    w.status = mission === 'idle' ? 'idle' : 'on_mission';
    w.assignedAirZoneId = airZoneId ?? null;
    w.targetProvinceId = targetProvinceId ?? null;
    w.targetSeaZoneId = targetSeaZoneId ?? null;
    state.wings.set(wingId, w);
    return true;
  }

  recallToBase(state: WorldState, wingId: number): void {
    const w = state.wings.get(wingId);
    if (!w) return;
    w.mission = 'idle';
    w.status = 'idle';
    w.assignedAirZoneId = null;
    w.targetProvinceId = null;
    w.targetSeaZoneId = null;
    state.wings.set(wingId, w);
  }

  advanceTick(state: WorldState, dtMs: Fixed): GameEvent[] {
    const events: GameEvent[] = [];
    const dtRatio = dtMs.mul(Fixed.fromInt(10)).div(Fixed.fromInt(1000));

    this.advanceWingState(state, dtRatio, events);

    if (state.tickId % RECALC_AIR_SUPERIORITY_EVERY === 0) {
      this.recalcAirSuperiority(state);
    }

    if (state.tickId % AIR_COMBAT_INTERVAL === 0) {
      this.resolveAirCombat(state, events);
    }

    if (state.tickId % STRIKE_INTERVAL === 0) {
      this.applyCASAndStrikes(state, events);
    }

    return events;
  }

  getAirSuperiority(state: WorldState, airZoneId: number, countryId: string): Fixed {
    const sup = state.airSuperiority.get(airZoneId);
    if (!sup) return Fixed.ZERO;
    const e = sup.control.find(c => c.countryId === countryId);
    return e ? e.ratio : Fixed.ZERO;
  }

  getCASModifier(state: WorldState, provinceId: number, attackerCountryId: string): Fixed {
    let bonus = Fixed.ZERO;
    state.wings.forEach((w) => {
      if (w.ownerId !== attackerCountryId) return;
      if (w.mission !== 'cas') return;
      if (w.status !== 'on_mission') return;
      if (w.targetProvinceId !== provinceId && !this.wingCoversProvince(state, w, provinceId)) return;
      const pow = this.wingPower(w, 'cas');
      bonus = bonus.add(pow.mul(Fixed.fromNumber(0.3)));
    });
    const maxBonus = Fixed.fromNumber(0.3);
    return bonus.greaterThan(maxBonus) ? maxBonus : bonus;
  }

  private advanceWingState(state: WorldState, dtRatio: Fixed, events: GameEvent[]): void {
    state.wings.forEach((w) => {
      if (w.status === 'training') {
        w.trainingProgress = w.trainingProgress.add(TRAINING_PER_TICK.mul(dtRatio));
        if (w.trainingProgress.greaterOrEqual(TRAINING_DONE)) {
          w.status = 'idle'; w.mission = 'idle';
          w.trainingProgress = TRAINING_DONE;
          w.organization = Fixed.ONE; w.strength = Fixed.ONE;
          events.push({ kind: 'wingCreated', wingId: w.id, ownerId: w.ownerId });
        }
      } else {
        w.organization = w.organization.add(ORG_REGEN_PER_TICK.mul(dtRatio)).min(Fixed.ONE);
      }
      state.wings.set(w.id, w);
    });
  }

  private wingCoversProvince(state: WorldState, w: AirWing, provinceId: number): boolean {
    if (w.assignedAirZoneId === null) return false;
    const z = state.airZones.get(w.assignedAirZoneId);
    return !!z && z.provinceIds.includes(provinceId);
  }

  private wingPower(w: AirWing, _mission: AirMission): Fixed {
    let atk = Fixed.ZERO;
    let totalCount = 0;
    const orgMul = w.organization.mul(w.strength);
    for (const [t, c] of Object.entries(w.aircraft)) {
      const s = AIRCRAFT_STATS[t];
      if (!s) continue;
      totalCount += c;
      atk = atk.add(s.atk.mul(Fixed.fromInt(c)).div(Fixed.fromInt(WING_SIZE_FULL)));
    }
    if (totalCount === 0) return Fixed.ZERO;
    return atk.mul(orgMul);
  }

  private wingFighterPower(w: AirWing): Fixed {
    let atk = Fixed.ZERO;
    let totalFighters = 0;
    const orgMul = w.organization.mul(w.strength);
    for (const [t, c] of Object.entries(w.aircraft)) {
      const s = AIRCRAFT_STATS[t];
      if (!s || !s.isFighter) continue;
      totalFighters += c;
      atk = atk.add(s.atk.mul(Fixed.fromInt(c)).div(Fixed.fromInt(WING_SIZE_FULL)));
    }
    if (totalFighters === 0) return Fixed.ZERO;
    return atk.mul(orgMul);
  }

  private recalcAirSuperiority(state: WorldState): void {
    state.airZones.forEach((zone) => {
      const powerByCountry = new Map<string, Fixed>();
      state.wings.forEach((w) => {
        if (w.assignedAirZoneId !== zone.id) return;
        if (w.status !== 'on_mission') return;
        const fp = this.wingFighterPower(w);
        if (fp.lessOrEqual(Fixed.ZERO)) return;
        const cur = powerByCountry.get(w.ownerId) || Fixed.ZERO;
        powerByCountry.set(w.ownerId, cur.add(fp));
      });
      let total = Fixed.ZERO;
      powerByCountry.forEach((v) => { total = total.add(v); });
      const control: { countryId: string; ratio: Fixed }[] = [];
      if (total.greaterThan(Fixed.ZERO)) {
        powerByCountry.forEach((v, cid) => {
          control.push({ countryId: cid, ratio: v.div(total) });
        });
      }
      state.airSuperiority.set(zone.id, { airZoneId: zone.id, control });
    });
  }

  private resolveAirCombat(state: WorldState, events: GameEvent[]): void {
    state.airZones.forEach((zone) => {
      const byCountry = new Map<string, AirWing[]>();
      state.wings.forEach((w) => {
        if (w.assignedAirZoneId !== zone.id) return;
        if (w.status !== 'on_mission') return;
        const arr = byCountry.get(w.ownerId) || [];
        arr.push(w);
        byCountry.set(w.ownerId, arr);
      });
      const cids = Array.from(byCountry.keys());
      if (cids.length < 2) return;
      const aId = cids[0], dId = cids[1];
      const a = byCountry.get(aId)!;
      const d = byCountry.get(dId)!;

      let aPower = Fixed.ZERO, dPower = Fixed.ZERO;
      for (const w of a) aPower = aPower.add(this.wingFighterPower(w));
      for (const w of d) dPower = dPower.add(this.wingFighterPower(w));
      if (aPower.lessOrEqual(Fixed.ZERO) && dPower.lessOrEqual(Fixed.ZERO)) return;

      const aLossRate = dPower.div(aPower.add(dPower).add(Fixed.fromNumber(0.1)));
      const dLossRate = aPower.div(aPower.add(dPower).add(Fixed.fromNumber(0.1)));
      const aLost = this.applyAircraftLosses(state, a, aLossRate.mul(Fixed.fromNumber(0.1)), events, zone.id);
      const dLost = this.applyAircraftLosses(state, d, dLossRate.mul(Fixed.fromNumber(0.1)), events, zone.id);

      events.push({
        kind: 'airBattle', airZoneId: zone.id,
        attackerCountryId: aId, defenderCountryId: dId,
        attackerAircraftLost: aLost, defenderAircraftLost: dLost,
      });
      this.recordLostContribution(state, aId, dId, dLost);
      this.recordLostContribution(state, dId, aId, aLost);
    });
  }

  private applyAircraftLosses(
    state: WorldState, wings: AirWing[], rate: Fixed, events: GameEvent[], zoneId: number,
  ): number {
    let lostTotal = 0;
    for (const w of wings) {
      const types = Object.keys(w.aircraft);
      if (types.length === 0) continue;
      for (const t of types) {
        const c = w.aircraft[t];
        const lost = Math.floor(c * rate.toNumber());
        if (lost <= 0) continue;
        w.aircraft[t] = Math.max(0, c - lost);
        lostTotal += lost;
        w.strength = w.strength.mul(Fixed.fromNumber(0.95)).max(Fixed.fromNumber(0.2));
        w.organization = w.organization.sub(Fixed.fromNumber(0.1)).max(Fixed.ZERO);
        events.push({ kind: 'aircraftLost', wingId: w.id, ownerId: w.ownerId, aircraftType: t, count: lost, airZoneId: zoneId });
      }
      if (this.wingTotal(w) === 0) {
        state.wings.delete(w.id);
      } else {
        state.wings.set(w.id, w);
      }
    }
    return lostTotal;
  }

  private wingTotal(w: AirWing): number {
    let n = 0;
    for (const c of Object.values(w.aircraft)) n += c;
    return n;
  }

  private applyCASAndStrikes(state: WorldState, events: GameEvent[]): void {
    state.wings.forEach((w) => {
      if (w.status !== 'on_mission') return;
      switch (w.mission) {
      case 'cas': {
        const provId = w.targetProvinceId ?? (w.assignedAirZoneId !== null ? this.findFrontlineProvince(state, w) : null);
        if (provId !== null) {
          const power = this.wingPower(w, 'cas');
          events.push({ kind: 'casSupport', wingId: w.id, provinceId: provId, supportStrength: power });
        }
        break;
      }
      case 'ground_attack': {
        if (w.targetProvinceId !== null) {
          this.groundAttackProvince(state, w, w.targetProvinceId);
        }
        break;
      }
      case 'port_strike': {
        if (w.targetProvinceId !== null) {
          const prov = state.provinces.get(w.targetProvinceId);
          if (prov && prov.portLevel > 0) {
            const ps = state.supplyNetwork.provinceSupply.get(w.targetProvinceId);
            if (ps) ps.bombedUntilTick = state.tickId + PORT_BOMB_DURATION_TICKS;
            if (this.supplySystem) this.supplySystem;
            events.push({ kind: 'portStruck', provinceId: w.targetProvinceId, attackerCountryId: w.ownerId });
          }
        }
        break;
      }
      case 'naval_strike': {
        const zoneId = w.targetSeaZoneId ?? w.assignedAirZoneId;
        if (zoneId !== null && this.navalSystem) {
          const sup = this.getAirSuperiority(state, zoneId, w.ownerId);
          if (sup.greaterOrEqual(Fixed.fromNumber(0.3))) {
            const power = this.wingPower(w, 'naval_strike').mul(Fixed.fromNumber(10));
            const sunk = this.navalSystem.applyAirStrikeToZone(state, zoneId, w.ownerId, power);
            if (sunk.length > 0) {
              events.push({ kind: 'navalStrike', wingId: w.id, seaZoneId: zoneId, shipsSunk: sunk.length });
            }
          }
        }
        break;
      }
      default: break;
      }
    });
  }

  private findFrontlineProvince(state: WorldState, w: AirWing): number | null {
    if (w.assignedAirZoneId === null) return null;
    const zone = state.airZones.get(w.assignedAirZoneId);
    if (!zone) return null;
    for (const pid of zone.provinceIds) {
      const prov = state.provinces.get(pid);
      if (!prov) continue;
      if (prov.controllerId === w.ownerId) continue;
      return pid;
    }
    return null;
  }

  private groundAttackProvince(state: WorldState, w: AirWing, provinceId: number): void {
    const orgLoss = this.wingPower(w, 'ground_attack').mul(Fixed.fromNumber(0.02));
    state.divisions.forEach((div) => {
      if (div.currentProvinceId !== provinceId) return;
      if (div.ownerId === w.ownerId) return;
      div.organization = div.organization.sub(orgLoss).max(Fixed.ZERO);
      state.divisions.set(div.id, div);
    });
  }

  private recordLostContribution(state: WorldState, attackerId: string, loserId: string, lostCount: number): void {
    if (lostCount <= 0 || !this.surrenderSystem) return;
    state.disputes.forEach((d) => {
      if (!d.participants.includes(loserId)) return;
      if (!d.participants.includes(attackerId)) return;
      this.surrenderSystem!.addContribution(
        state, d.id, loserId,
        Fixed.fromNumber(0.0001).mul(Fixed.fromInt(lostCount)),
        'aircraft_lost',
      );
      const losses = state.warLosses.get(loserId);
      if (losses) losses.aircraftLost.total = (losses.aircraftLost.total ?? 0) + lostCount;
    });
  }

  private ensureAircraftPool(state: WorldState, countryId: string): EquipmentPool {
    let pool = state.equipmentPools.get(countryId);
    const required = ['fighter', 'cas', 'tactical_bomber', 'naval_fighter'];
    if (!pool) {
      pool = { countryId, stocks: required.map((t) => ({ type: t, count: 0 })) };
      state.equipmentPools.set(countryId, pool);
    } else {
      for (const t of required) {
        if (!pool.stocks.find(s => s.type === t)) pool.stocks.push({ type: t, count: 0 });
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
}
