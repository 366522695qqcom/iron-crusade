/**
 * 登陆作战系统默认实现（spec feature-grand-war M5）
 */
import { Fixed } from '../determinism/fixed';
import {
  WorldState,
  InvasionPlan,
  Province,
  Division,
} from '../state/world_state';
import { GameEvent } from './types';
import {
  InvasionSystem,
  InvasionConditions,
  NavalSystem,
  AirSystem,
  SupplySystem,
  SurrenderSystem,
} from './interfaces';

const PREPARATION_TICKS = 700;
const CONVOYS_PER_DIVISION = 10;

const SEA_CONTROL_REQUIRED = Fixed.fromNumber(0.6);
const AIR_SUPERIORITY_RECOMMENDED = Fixed.fromNumber(0.4);

const BASE_DEFENSE = Fixed.fromInt(10);
const FORT_DEFENSE_PER_LEVEL = Fixed.fromInt(8);
const LANDING_ORG_AFTER_SUCCESS = Fixed.fromNumber(0.3);

const INVASION_COMBAT_TICKS = 60;

export class DefaultInvasionSystem implements InvasionSystem {
  private navalSystem: NavalSystem | null = null;
  private airSystem: AirSystem | null = null;
  private supplySystem: SupplySystem | null = null;
  private surrenderSystem: SurrenderSystem | null = null;

  private nextPlanSerial = 1;

  setCombatSystem(_c: import('./interfaces').CombatSystem): void { /* reserved for future */ }
  setNavalSystem(n: NavalSystem): void { this.navalSystem = n; }
  setAirSystem(a: AirSystem): void { this.airSystem = a; }
  setSupplySystem(s: SupplySystem): void { this.supplySystem = s; }
  setSurrenderSystem(s: SurrenderSystem): void { this.surrenderSystem = s; }

  prepareInvasion(
    state: WorldState,
    ownerId: string,
    fromProvinceId: number,
    toProvinceId: number,
    divisionIds: number[],
    escortFleetIds: number[],
    supportWingIds: number[],
  ): string | null {
    const fromP = state.provinces.get(fromProvinceId);
    const toP = state.provinces.get(toProvinceId);
    if (!fromP || !toP) return null;
    if (fromP.controllerId !== ownerId) return null;
    if (toP.controllerId === ownerId) return null;
    if (!fromP.isCoastal || fromP.portLevel < 1) return null;
    if (!toP.isCoastal) return null;
    if (fromProvinceId === toProvinceId) return null;
    if (divisionIds.length === 0) return null;

    for (const did of divisionIds) {
      const d = state.divisions.get(did);
      if (!d || d.ownerId !== ownerId) return null;
      if (d.currentProvinceId !== fromProvinceId) return null;
      if (d.status === 'landing' || d.status === 'training') return null;
    }

    const requiredConvoys = divisionIds.length * CONVOYS_PER_DIVISION;
    const avail = this.navalSystem ? this.navalSystem.getConvoyCount(state, ownerId) : 0;
    if (avail < requiredConvoys) return null;

    const pathSeaZoneIds = this.computePathSeaZones(fromP);
    const targetAirZoneId = this.findAirZoneForProvince(state, toP);

    if (this.navalSystem) {
      const consumed = this.navalSystem.consumeConvoys(state, ownerId, requiredConvoys);
      if (consumed < requiredConvoys) {
        this.navalSystem.refundConvoys(state, ownerId, consumed);
        return null;
      }
    }

    const id = `inv_${ownerId}_${this.nextPlanSerial++}`;
    const plan: InvasionPlan = {
      id,
      ownerId,
      fromProvinceId,
      toProvinceId,
      divisionIds: [...divisionIds],
      requiredConvoys,
      preparationProgress: Fixed.ZERO,
      status: 'preparing',
      escortFleetIds: [...escortFleetIds],
      supportWingIds: [...supportWingIds],
      launchedTick: -1,
      pathSeaZoneIds,
      targetAirZoneId,
    };

    for (const did of divisionIds) {
      const d = state.divisions.get(did);
      if (d) {
        const nd: Division = { ...d, targetProvinceId: toProvinceId, inOffensive: false };
        state.divisions.set(did, nd);
      }
    }

    state.invasions.set(id, plan);
    return id;
  }

  launchInvasion(state: WorldState, planId: string): boolean {
    const plan = state.invasions.get(planId);
    if (!plan) return false;
    if (plan.status !== 'ready') return false;
    const cond = this.checkConditions(state, planId);
    if (!cond.fromPortOk || !cond.toCoastalOk || !cond.convoysAvailable) return false;
    if (cond.pathSeaControl.lessThan(SEA_CONTROL_REQUIRED)) return false;

    plan.status = 'launched';
    plan.launchedTick = state.tickId;

    for (const did of plan.divisionIds) {
      const d = state.divisions.get(did);
      if (d && d.ownerId === plan.ownerId) {
        const nd: Division = { ...d, status: 'landing', targetProvinceId: plan.toProvinceId, inOffensive: true };
        state.divisions.set(did, nd);
      }
    }
    return true;
  }

  cancelInvasion(state: WorldState, planId: string): void {
    const plan = state.invasions.get(planId);
    if (!plan) return;
    if (plan.status === 'launched' || plan.status === 'success' || plan.status === 'repelled') return;

    if (this.navalSystem) {
      this.navalSystem.refundConvoys(state, plan.ownerId, plan.requiredConvoys);
    }
    for (const did of plan.divisionIds) {
      const d = state.divisions.get(did);
      if (d && d.ownerId === plan.ownerId && d.status !== 'landing') {
        const nd: Division = { ...d, targetProvinceId: null, inOffensive: false };
        state.divisions.set(did, nd);
      }
    }
    state.invasions.delete(planId);
  }

  checkConditions(state: WorldState, planId: string): InvasionConditions {
    const plan = state.invasions.get(planId);
    const cond: InvasionConditions = {
      fromPortOk: false,
      toCoastalOk: false,
      pathSeaControl: Fixed.ZERO,
      targetAirSuperiority: Fixed.ZERO,
      convoysAvailable: false,
      escortFleetOk: false,
      preparationReady: false,
      allSatisfied: false,
    };
    if (!plan) return cond;

    const fromP = state.provinces.get(plan.fromProvinceId);
    const toP = state.provinces.get(plan.toProvinceId);
    cond.fromPortOk = !!(fromP && fromP.controllerId === plan.ownerId && fromP.isCoastal && fromP.portLevel >= 1);
    cond.toCoastalOk = !!(toP && toP.controllerId !== plan.ownerId && toP.isCoastal);

    let minSea = Fixed.ONE;
    if (this.navalSystem) {
      for (const szId of plan.pathSeaZoneIds) {
        const ctrl = this.navalSystem.getSeaControl(state, szId, plan.ownerId);
        if (ctrl.lessThan(minSea)) minSea = ctrl;
      }
    }
    cond.pathSeaControl = minSea;

    if (plan.targetAirZoneId !== null && this.airSystem) {
      cond.targetAirSuperiority = this.airSystem.getAirSuperiority(state, plan.targetAirZoneId, plan.ownerId);
    }

    cond.convoysAvailable = true;
    cond.escortFleetOk = plan.escortFleetIds.length > 0;
    cond.preparationReady = plan.preparationProgress.greaterOrEqual(Fixed.ONE);

    cond.allSatisfied =
      cond.fromPortOk &&
      cond.toCoastalOk &&
      cond.pathSeaControl.greaterOrEqual(SEA_CONTROL_REQUIRED) &&
      cond.convoysAvailable &&
      cond.preparationReady;
    return cond;
  }

  advanceTick(state: WorldState, dtMs: Fixed): GameEvent[] {
    const events: GameEvent[] = [];
    const dtRatio = dtMs.div(Fixed.fromInt(100));
    const toRemove: string[] = [];

    state.invasions.forEach((plan) => {
      if (plan.status === 'preparing') {
        plan.preparationProgress = plan.preparationProgress.add(
          Fixed.fromNumber(1 / PREPARATION_TICKS).mul(dtRatio)
        );
        if (plan.preparationProgress.greaterOrEqual(Fixed.ONE)) {
          plan.preparationProgress = Fixed.ONE;
          plan.status = 'ready';
        }
      } else if (plan.status === 'launched') {
        if (state.tickId - plan.launchedTick >= INVASION_COMBAT_TICKS) {
          this.resolveInvasionCombat(state, plan, events);
          toRemove.push(plan.id);
        }
      }
    });

    for (const id of toRemove) state.invasions.delete(id);
    return events;
  }

  private resolveInvasionCombat(state: WorldState, plan: InvasionPlan, events: GameEvent[]): void {
    const toP = state.provinces.get(plan.toProvinceId);
    const fromP = state.provinces.get(plan.fromProvinceId);
    if (!toP || !fromP) {
      plan.status = 'repelled';
      return;
    }

    const defenderId = toP.controllerId;
    const attackerId = plan.ownerId;

    let attackerPower = Fixed.ZERO;
    let attackerDivCount = 0;
    let divisionsLost = 0;
    const survivingDivs: Division[] = [];
    for (const did of plan.divisionIds) {
      const d = state.divisions.get(did);
      if (!d || d.ownerId !== attackerId) { divisionsLost++; continue; }
      let power = d.softAttack.mul(d.strength).mul(d.organization);
      if (this.airSystem) {
        const cas = this.airSystem.getCASModifier(state, plan.toProvinceId, attackerId);
        power = power.mul(Fixed.ONE.add(cas));
      }
      if (this.navalSystem) {
        const bombard = this.navalSystem.getShoreBombardmentModifier(state, plan.toProvinceId, attackerId);
        power = power.mul(Fixed.ONE.add(bombard));
      }
      if (this.supplySystem) {
        const sup = this.supplySystem.getDivisionSupplyModifier(state, did);
        power = power.mul(sup);
      }
      attackerPower = attackerPower.add(power);
      attackerDivCount++;
      survivingDivs.push(d);
    }

    let defenderPower = BASE_DEFENSE;
    const fortLevel = toP.fortLevel;
    defenderPower = defenderPower.add(FORT_DEFENSE_PER_LEVEL.mul(Fixed.fromInt(fortLevel)));
    let defenderDivCount = 0;
    state.divisions.forEach((d) => {
      if (d.ownerId === defenderId && d.currentProvinceId === plan.toProvinceId && d.status !== 'training') {
        defenderPower = defenderPower.add(d.softAttack.mul(d.strength).mul(d.organization).mul(Fixed.fromNumber(0.7)));
        defenderDivCount++;
      }
    });

    const cond = this.checkConditions(state, plan.id);
    let defenseMult = Fixed.ONE;
    if (cond.targetAirSuperiority.lessThan(AIR_SUPERIORITY_RECOMMENDED)) {
      const deficit = AIR_SUPERIORITY_RECOMMENDED.sub(cond.targetAirSuperiority);
      defenseMult = defenseMult.add(deficit.mul(Fixed.fromNumber(0.75)));
    }
    if (!cond.escortFleetOk) {
      defenseMult = defenseMult.mul(Fixed.fromNumber(1.2));
    }
    defenderPower = defenderPower.mul(defenseMult);

    const seed = state.seedMap[attackerId] || 1;
    const dice = this.diceRoll(state.tickId, plan.toProvinceId, seed);

    const attackerRolled = attackerPower.mul(dice);
    const success = attackerRolled.greaterThan(defenderPower);

    if (success) {
      const newProvince: Province = { ...toP, controllerId: attackerId };
      state.provinces.set(toP.id, newProvince);

      const attacker = state.countries.get(attackerId);
      const defender = state.countries.get(defenderId);
      if (attacker && !attacker.controlledProvinceIds.includes(toP.id)) {
        attacker.controlledProvinceIds.push(toP.id);
        state.countries.set(attackerId, attacker);
      }
      if (defender) {
        defender.controlledProvinceIds = defender.controlledProvinceIds.filter((x) => x !== toP.id);
        state.countries.set(defenderId, defender);
      }

      for (const d of survivingDivs) {
        const landed: Division = {
          ...d,
          currentProvinceId: toP.id,
          status: 'fighting',
          organization: LANDING_ORG_AFTER_SUCCESS,
          targetProvinceId: null,
          inOffensive: false,
        };
        state.divisions.set(d.id, landed);
      }

      if (this.navalSystem) {
        this.navalSystem.refundConvoys(state, attackerId, Math.floor(plan.requiredConvoys / 2));
      }

      if (this.supplySystem) this.supplySystem.recalc(state);
      if (this.surrenderSystem) {
        this.surrenderSystem.onProvinceControlled(state, toP.id, attackerId, defenderId);
      }

      events.push({
        kind: 'invasionSuccess', planId: plan.id, ownerId: attackerId, provinceId: toP.id,
      });
      if (this.surrenderSystem) {
        this.surrenderSystem.appendWarLog(state, {
          kind: 'invasion',
          countryId: attackerId,
          text: `登陆成功，占领「${toP.name}」`,
          relatedIds: { provinceId: toP.id },
        });
      }
      plan.status = 'success';
    } else {
      const convoysLost = Math.floor(plan.requiredConvoys / 2);
      let lostNow = 0;
      for (const d of survivingDivs) {
        const newStr = d.strength.mul(Fixed.fromNumber(0.7));
        const retreated: Division = {
          ...d,
          strength: newStr,
          currentProvinceId: fromP.id,
          status: 'retreating',
          organization: d.organization.mul(Fixed.fromNumber(0.5)),
          targetProvinceId: null,
          inOffensive: false,
        };
        state.divisions.set(d.id, retreated);
        if (newStr.lessOrEqual(Fixed.fromNumber(0.1))) {
          state.divisions.delete(d.id);
          lostNow++;
          if (this.surrenderSystem) {
            this.surrenderSystem.onDivisionDestroyed(state, d.id, d.ownerId, fromP.id);
          }
        }
      }
      divisionsLost += lostNow;

      if (this.navalSystem) {
        this.navalSystem.refundConvoys(state, attackerId, plan.requiredConvoys - convoysLost);
      }

      events.push({
        kind: 'invasionRepelled',
        planId: plan.id, ownerId: attackerId,
        divisionsLost, convoysLost,
      });
      if (this.surrenderSystem) {
        this.surrenderSystem.appendWarLog(state, {
          kind: 'invasion',
          countryId: defenderId,
          text: `击退来自「${fromP.name}」的登陆`,
          relatedIds: { provinceId: toP.id },
        });
      }
      plan.status = 'repelled';
    }
  }

  private computePathSeaZones(fromP: Province): number[] {
    return [...fromP.adjacentSeaZoneIds];
  }

  private findAirZoneForProvince(state: WorldState, p: Province): number | null {
    let found: number | null = null;
    state.airZones.forEach((z) => {
      if (found !== null) return;
      if (z.provinceIds.includes(p.id)) found = z.id;
    });
    return found;
  }

  private diceRoll(tick: number, provinceId: number, seed: number): Fixed {
    const n = (tick * 131 + provinceId * 17 + seed * 7) % 1000;
    return Fixed.fromNumber(0.7 + (n / 1000) * 0.6);
  }
}
