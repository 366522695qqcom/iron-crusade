/**
 * 战斗系统默认实现（feature-combat-skeleton T2）
 *
 * 职责：
 * - 发起争端（initiateDispute）
 * - 绘制前线（drawFront）
 * - 下达攻势（issueOffensive）
 * - 骰子战斗推进（advanceTick）：省份易主、VP扣分、决心结算
 */
import { Fixed } from '../determinism/fixed';
import { PRNG } from '../determinism/prng';
import { WorldState, Dispute } from '../state/world_state';
import { GameEvent } from './types';
import { CombatSystem } from './interfaces';

const BASE_DEFENSE = Fixed.fromInt(20);
const FORT_DEFENSE_PER_LEVEL = Fixed.fromInt(5);
const DISPUTE_RESOLVE_INIT = Fixed.fromNumber(0.5);
const DISPUTE_RESOLVE_LOSS_PER_VP = Fixed.fromNumber(0.1);
const DISPUTE_RESOLVE_SURRENDER = Fixed.fromNumber(0.1);
const ORG_LOSS_PER_DEFEAT = Fixed.fromNumber(0.2);
const STRENGTH_LOSS_PER_DEFEAT = Fixed.fromNumber(0.15);
const DICE_ROLL_LOW = Fixed.fromNumber(0.8);
const DICE_ROLL_RANGE = Fixed.fromNumber(0.4);
const ATTACKER_ORG_LOSS_SUCCESS = Fixed.fromNumber(0.1);
const ATTACKER_ORG_MIN = Fixed.fromNumber(0.2);

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
        [attackerId]: DISPUTE_RESOLVE_INIT,
        [targetId]: DISPUTE_RESOLVE_INIT,
      },
      disputeGoals: [],
      controlledVPs: {
        [attackerId]: 0,
        [targetId]: 0,
      },
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
      div.inOffensive = true;
      div.status = 'fighting';
      div.targetProvinceId = targetProvince;
    }
  }

  advanceTick(state: WorldState, _dtMs: Fixed): GameEvent[] {
    const events: GameEvent[] = [];
    const resolvedDisputeIds: string[] = [];

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

        let fortDef = BASE_DEFENSE;
        if (targetProv.fortLevel > 0) {
          fortDef = fortDef.add(FORT_DEFENSE_PER_LEVEL.mul(Fixed.fromInt(targetProv.fortLevel)));
        }

        const dice01 = prng.next();
        const diceRoll = DICE_ROLL_LOW.add(DICE_ROLL_RANGE.mul(dice01));
        const attackerRolled = attackerStats.mul(diceRoll);

        if (attackerRolled.greaterThan(fortDef)) {
          const prevController = targetProv.controllerId;
          targetProv.controllerId = div.ownerId;
          events.push({
            kind: 'provinceControlled',
            provinceId: targetProv.id,
            byCountryId: div.ownerId,
          });

          if (targetProv.VP > 0) {
            dispute.controlledVPs[div.ownerId] = (dispute.controlledVPs[div.ownerId] || 0) + targetProv.VP;
            if (dispute.disputeResolve[prevController]) {
              const loss = DISPUTE_RESOLVE_LOSS_PER_VP.mul(Fixed.fromInt(targetProv.VP));
              dispute.disputeResolve[prevController] = dispute.disputeResolve[prevController].sub(loss);
              if (dispute.disputeResolve[prevController].lessThan(Fixed.ZERO)) {
                dispute.disputeResolve[prevController] = Fixed.ZERO;
              }
            }
          }

          div.currentProvinceId = div.targetProvinceId;
          div.organization = div.organization.sub(ATTACKER_ORG_LOSS_SUCCESS).max(ATTACKER_ORG_MIN);
          state.provinces.set(targetProv.id, targetProv);
        } else {
          div.strength = div.strength.sub(STRENGTH_LOSS_PER_DEFEAT).max(Fixed.ZERO);
          div.organization = div.organization.sub(ORG_LOSS_PER_DEFEAT).max(Fixed.ZERO);
          if (div.strength.lessOrEqual(Fixed.ZERO)) {
            state.divisions.delete(div.id);
          }
        }
      }

      for (const pid of dispute.participants) {
        const resolve = dispute.disputeResolve[pid];
        if (resolve && resolve.lessThan(DISPUTE_RESOLVE_SURRENDER)) {
          const winnerId = dispute.participants.find((p) => p !== pid);
          if (winnerId) {
            resolvedDisputeIds.push(dispute.id);
            events.push({
              kind: 'disputeResolved',
              disputeId: dispute.id,
              winnerCountryId: winnerId,
              loserCountryId: pid,
            });
          }
          break;
        }
      }
    });

    for (const disputeId of resolvedDisputeIds) {
      const dispute = state.disputes.get(disputeId);
      if (!dispute) continue;

      state.divisions.forEach((div) => {
        if (!dispute.participantSet.has(div.ownerId)) return;
        if (div.inOffensive) {
          div.inOffensive = false;
          div.targetProvinceId = null;
          if (div.status === 'fighting') {
            div.status = 'ready';
          }
        }
      });

      for (const pid of dispute.participants) {
        state.fronts.delete(pid);
      }

      state.disputes.delete(disputeId);
    }

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
}
