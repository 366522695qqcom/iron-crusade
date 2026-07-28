/**
 * 战斗系统默认实现（feature-combat-skeleton T2 + M1）
 *
 * 职责：
 * - 发起争端（initiateDispute）
 * - 绘制前线（drawFront）
 * - 下达攻势（issueOffensive）
 * - 骰子战斗推进（advanceTick）：省份易主、VP扣分、师团损耗
 */
import { Fixed } from '../determinism/fixed';
import { PRNG } from '../determinism/prng';
import { WorldState, Dispute } from '../state/world_state';
import { GameEvent } from './types';
import { CombatSystem } from './interfaces';

const BASE_DEFENSE = Fixed.fromInt(5);
const FORT_DEFENSE_PER_LEVEL = Fixed.fromInt(5);
const ORG_LOSS_PER_DEFEAT = Fixed.fromNumber(0.2);
const STRENGTH_LOSS_PER_DEFEAT = Fixed.fromNumber(0.15);
const DICE_ROLL_LOW = Fixed.fromNumber(0.8);
const DICE_ROLL_RANGE = Fixed.fromNumber(0.4);
const ATTACKER_ORG_LOSS_SUCCESS = Fixed.fromNumber(0.1);
const ATTACKER_ORG_MIN = Fixed.fromNumber(0.2);

const SUPPLY_ATTACK_MOD_OK = Fixed.ONE;
const SUPPLY_ATTACK_MOD_LOW = Fixed.fromNumber(0.8);
const SUPPLY_ATTACK_MOD_CRITICAL = Fixed.fromNumber(0.5);
const SUPPLY_ATTACK_MOD_NONE = Fixed.fromNumber(0.2);

export class DefaultCombatSystem implements CombatSystem {
  initiateDispute(state: WorldState, attackerId: string, targetId: string): string | null {
    const attacker = state.countries.get(attackerId);
    const target = state.countries.get(targetId);
    if (!attacker || !target) return null;
    if (attackerId === targetId) return null;

    const id = 'd_' + attackerId + '_' + targetId + '_' + state.tickId;
    const dispute: Dispute = {
      id,
      participants: [attackerId, targetId],
      participantSet: new Set([attackerId, targetId]),
      disputeResolve: {
        [attackerId]: Fixed.fromNumber(0.5),
        [targetId]: Fixed.fromNumber(0.5),
      },
      disputeGoals: [],
      controlledVPs: {
        [attackerId]: 0,
        [targetId]: 0,
      },
      surrenderProgress: {},
      surrenderThreshold: {},
      startTick: state.tickId,
      totalVPs: 0,
    };
    state.disputes.set(id, dispute);
    return id;
  }

  drawFront(state: WorldState, attackerId: string, fromProvince: number, toProvince: number): void {
    const fromProv = state.provinces.get(fromProvince);
    const toProv = state.provinces.get(toProvince);
    if (!fromProv || !toProv) return;
    const defenderId = toProv.controllerId;
    if (defenderId === attackerId) return;

    let fronts = state.fronts.get(attackerId);
    if (!fronts) {
      fronts = [];
    } else {
      for (const f of fronts) {
        if (f.fromProvince === fromProvince && f.toProvince === toProvince) return;
      }
    }
    fronts.push({
      attackerId,
      defenderId,
      fromProvince,
      toProvince,
    });
    state.fronts.set(attackerId, fronts);
  }

  issueOffensive(state: WorldState, countryId: string, divisionIds: number[], targetProvince: number): void {
    for (const divId of divisionIds) {
      const div = state.divisions.get(divId);
      if (!div) continue;
      if (div.ownerId !== countryId) continue;
      if (div.status !== 'ready') continue;
      if (div.supplyStatus === 'critical' || div.supplyStatus === 'none') continue;
      div.inOffensive = true;
      div.status = 'fighting';
      div.targetProvinceId = targetProvince;
    }
  }

  advanceTick(state: WorldState, _dtMs: Fixed): GameEvent[] {
    const events: GameEvent[] = [];

    state.disputes.forEach((dispute) => {
      const fightingDivs: number[] = [];
      state.divisions.forEach((div) => {
        if (div.status !== 'fighting') return;
        if (!dispute.participantSet.has(div.ownerId)) return;
        fightingDivs.push(div.id);
      });
      if (fightingDivs.length === 0) return;

      const prng = this.getOrCreatePRNG(state, 'combat_' + dispute.id);

      for (const divId of fightingDivs) {
        const div = state.divisions.get(divId);
        if (!div) continue;
        if (div.status !== 'fighting') continue;
        if (div.targetProvinceId === null) continue;

        const targetProv = state.provinces.get(div.targetProvinceId);
        if (!targetProv) continue;

        if (targetProv.controllerId === div.ownerId) {
          div.inOffensive = false;
          div.status = 'ready';
          div.targetProvinceId = null;
          continue;
        }

        const attackerStats = div.softAttack.mul(div.strength).mul(div.organization);

        let bombardMod = Fixed.ONE;
        if (targetProv.isCoastal) {
          let bombardStrength = Fixed.ZERO;
          state.fleets.forEach((f) => {
            if (f.ownerId !== div.ownerId) return;
            if (f.mission !== 'shore_bombard') return;
            if (f.bombardTargetProvinceId !== targetProv.id) return;
            for (const sid of f.shipIds) {
              const s = state.ships.get(sid);
              if (s) bombardStrength = bombardStrength.add(s.shoreBombardment);
            }
          });
          if (bombardStrength.greaterThan(Fixed.ZERO)) {
            bombardMod = Fixed.ONE.add(bombardStrength.div(Fixed.fromInt(100)).min(Fixed.fromNumber(0.3)));
          }
        }

        let casMod = Fixed.ONE;
        let totalCAS = Fixed.ZERO;
        state.wings.forEach((w) => {
          if (w.ownerId !== div.ownerId) return;
          if (w.mission !== 'cas') return;
          if (w.status !== 'on_mission') return;
          const covers = w.targetProvinceId === targetProv.id
            || (w.assignedAirZoneId !== null && this.wingCoversProvince(state, w, targetProv.id));
          if (!covers) return;
          let atk = Fixed.ZERO;
          let total = 0;
          for (const [t, c] of Object.entries(w.aircraft)) {
            if (t === 'cas' || t === 'tactical_bomber') {
              atk = atk.add(Fixed.fromInt(c));
              total += c;
            }
          }
          if (total > 0) {
            totalCAS = totalCAS.add(atk.div(Fixed.fromInt(100)).mul(w.organization).mul(w.strength));
          }
        });
        if (totalCAS.greaterThan(Fixed.ZERO)) {
          casMod = Fixed.ONE.add(totalCAS.min(Fixed.fromNumber(0.3)));
        }

        let fortDef = BASE_DEFENSE;
        if (targetProv.fortLevel > 0) {
          fortDef = fortDef.add(FORT_DEFENSE_PER_LEVEL.mul(Fixed.fromInt(targetProv.fortLevel)));
        }

        let supplyMod = SUPPLY_ATTACK_MOD_OK;
        if (div.supplyStatus === 'low') supplyMod = SUPPLY_ATTACK_MOD_LOW;
        else if (div.supplyStatus === 'critical') supplyMod = SUPPLY_ATTACK_MOD_CRITICAL;
        else if (div.supplyStatus === 'none') supplyMod = SUPPLY_ATTACK_MOD_NONE;

        const dice01 = prng.next();
        const diceRoll = DICE_ROLL_LOW.add(DICE_ROLL_RANGE.mul(dice01));
        const attackerRolled = attackerStats.mul(diceRoll).mul(supplyMod).mul(bombardMod).mul(casMod);

        if (attackerRolled.greaterThan(fortDef)) {
          const prevController = targetProv.controllerId;
          targetProv.controllerId = div.ownerId;
          events.push({
            kind: 'provinceControlled',
            provinceId: targetProv.id,
            byCountryId: div.ownerId,
            fromCountryId: prevController,
          });

          if (targetProv.VP > 0) {
            dispute.controlledVPs[div.ownerId] = (dispute.controlledVPs[div.ownerId] || 0) + targetProv.VP;
          }

          div.currentProvinceId = div.targetProvinceId;
          div.organization = div.organization.sub(ATTACKER_ORG_LOSS_SUCCESS).max(ATTACKER_ORG_MIN);
          state.provinces.set(targetProv.id, targetProv);
        } else {
          div.strength = div.strength.sub(STRENGTH_LOSS_PER_DEFEAT).max(Fixed.ZERO);
          div.organization = div.organization.sub(ORG_LOSS_PER_DEFEAT).max(Fixed.ZERO);
          if (div.strength.lessOrEqual(Fixed.ZERO)) {
            events.push({
              kind: 'divisionDestroyed',
              divisionId: div.id,
              ownerId: div.ownerId,
              provinceId: div.currentProvinceId,
            });
            state.divisions.delete(div.id);
          }
        }
      }
    });

    return events;
  }

  private getOrCreatePRNG(state: WorldState, key: string): PRNG {
    let seed = state.seedMap[key];
    if (seed === undefined) {
      seed = state.seed;
      for (let i = 0; i < key.length; i++) {
        seed = ((seed * 31) + key.charCodeAt(i)) | 0;
      }
      state.seedMap[key] = seed;
    }
    return new PRNG(seed);
  }

  private wingCoversProvince(state: WorldState, w: { assignedAirZoneId: number | null }, provinceId: number): boolean {
    if (w.assignedAirZoneId === null) return false;
    const z = state.airZones.get(w.assignedAirZoneId);
    return !!z && z.provinceIds.includes(provinceId);
  }
}
