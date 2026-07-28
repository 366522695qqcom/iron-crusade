import { Fixed } from '../determinism/fixed';
import { WorldState, Dispute, WarLogEntry } from '../state/world_state';
import { GameEvent } from './types';
import { SurrenderSystem } from './interfaces';

const SURRENDER_THRESHOLD = Fixed.fromNumber(0.8);
const SURRENDER_INITIAL = Fixed.ZERO;
const WAR_LOG_MAX = 50;

const VP_CONTROL_CONTRIB = Fixed.fromNumber(0.08);
const CAPITAL_CONTROL_CONTRIB = Fixed.fromNumber(0.35);
const DIVISION_DESTROYED_CONTRIB = Fixed.fromNumber(0.05);
const BASE_SURRENDER_TICK = Fixed.fromNumber(0.001);

export class DefaultSurrenderSystem implements SurrenderSystem {
  initDisputeSurrender(state: WorldState, disputeId: string): void {
    const dispute = state.disputes.get(disputeId);
    if (!dispute) return;

    let totalVPs = 0;
    state.provinces.forEach((p) => {
      if (dispute.participantSet.has(p.controllerId)) {
        totalVPs += p.VP;
      }
    });

    dispute.surrenderProgress = {};
    dispute.surrenderThreshold = {};
    dispute.startTick = state.tickId;
    dispute.totalVPs = totalVPs;

    for (const cid of dispute.participants) {
      dispute.surrenderProgress[cid] = SURRENDER_INITIAL;
      dispute.surrenderThreshold[cid] = SURRENDER_THRESHOLD;
      this.ensureWarLossesInitialized(state, cid);
    }

    this.appendWarLog(state, {
      kind: 'dispute_started',
      countryId: dispute.participants[0],
      text: '区域争端开始',
      relatedIds: { disputeId },
    });
  }

  ensureWarLossesInitialized(state: WorldState, countryId: string): void {
    let losses = state.warLosses.get(countryId);
    if (!losses) {
      losses = {
        countryId,
        divisionsLost: 0,
        shipsLost: {},
        aircraftLost: {},
        convoysLost: 0,
        provincesLost: 0,
        majorCitiesLost: 0,
        capitalLost: false,
      };
      state.warLosses.set(countryId, losses);
    }
  }

  advanceTick(state: WorldState, _dtMs: Fixed): GameEvent[] {
    const events: GameEvent[] = [];
    const surrendered: { disputeId: string; countryId: string; winnerId: string }[] = [];

    state.disputes.forEach((dispute) => {
      if (!dispute.surrenderProgress) return;

      for (const cid of dispute.participants) {
        const country = state.countries.get(cid);
        if (!country) continue;

        let delta = BASE_SURRENDER_TICK;

        const opponentId = this.getOpponent(dispute, cid);
        const lostVPs = opponentId ? (dispute.controlledVPs[opponentId] || 0) : 0;
        if (dispute.totalVPs > 0 && lostVPs > 0) {
          const vpRatio = Fixed.fromNumber(lostVPs / dispute.totalVPs);
          delta = delta.add(BASE_SURRENDER_TICK.mul(vpRatio).mul(Fixed.fromInt(20)));
        }

        const losses = state.warLosses.get(cid);
        if (losses) {
          if (losses.capitalLost) {
            delta = delta.add(Fixed.fromNumber(0.01));
          }
          if (losses.majorCitiesLost > 0) {
            delta = delta.add(Fixed.fromNumber(0.002).mul(Fixed.fromInt(losses.majorCitiesLost)));
          }
          if (losses.divisionsLost > 0) {
            delta = delta.add(Fixed.fromNumber(0.001).mul(Fixed.fromInt(Math.min(losses.divisionsLost, 10))));
          }
        }

        if (delta.greaterThan(Fixed.ZERO)) {
          dispute.surrenderProgress[cid] = dispute.surrenderProgress[cid].add(delta).min(Fixed.ONE);
        }

        if (dispute.surrenderProgress[cid].greaterOrEqual(dispute.surrenderThreshold[cid])) {
          const winnerId = this.getOpponent(dispute, cid);
          if (winnerId) {
            surrendered.push({ disputeId: dispute.id, countryId: cid, winnerId });
          }
        }
      }
    });

    for (const s of surrendered) {
      events.push({
        kind: 'surrendered',
        countryId: s.countryId,
        disputeId: s.disputeId,
      });
      this.onCountrySurrendered(state, s.disputeId, s.countryId, s.winnerId);
    }

    return events;
  }

  addContribution(state: WorldState, disputeId: string, countryId: string, delta: Fixed, _reason: string): void {
    const dispute = state.disputes.get(disputeId);
    if (!dispute || !dispute.surrenderProgress) return;
    if (!dispute.surrenderProgress[countryId]) return;
    dispute.surrenderProgress[countryId] = dispute.surrenderProgress[countryId].add(delta).min(Fixed.ONE);
  }

  appendWarLog(state: WorldState, entry: Omit<WarLogEntry, 'tickId'>): void {
    const full: WarLogEntry = {
      ...entry,
      tickId: state.tickId,
    };
    state.warLog.push(full);
    if (state.warLog.length > WAR_LOG_MAX) {
      state.warLog = state.warLog.slice(-WAR_LOG_MAX);
    }
  }

  getSurrenderProgress(state: WorldState, disputeId: string, countryId: string): Fixed {
    const dispute = state.disputes.get(disputeId);
    if (!dispute || !dispute.surrenderProgress) return Fixed.ZERO;
    return dispute.surrenderProgress[countryId] || Fixed.ZERO;
  }

  onProvinceControlled(state: WorldState, provinceId: number, byCountryId: string, loserId: string): void {
    const province = state.provinces.get(provinceId);
    if (!province) return;
    if (loserId === byCountryId) return;

    this.ensureWarLossesInitialized(state, loserId);
    const losses = state.warLosses.get(loserId);
    if (!losses) return;

    losses.provincesLost += 1;

    state.disputes.forEach((dispute) => {
      if (!dispute.participantSet.has(byCountryId)) return;
      if (!dispute.participantSet.has(loserId)) return;

      if (province.VP > 0) {
        losses.majorCitiesLost += 1;
        this.addContribution(state, dispute.id, loserId, VP_CONTROL_CONTRIB, 'vp_controlled');
        this.appendWarLog(state, {
          kind: 'province_controlled',
          countryId: byCountryId,
          text: `我方管控「${province.name}」(+${province.VP}VP)`,
          relatedIds: { provinceId, disputeId: dispute.id },
        });
      } else {
        this.appendWarLog(state, {
          kind: 'province_controlled',
          countryId: byCountryId,
          text: `我方管控「${province.name}」`,
          relatedIds: { provinceId, disputeId: dispute.id },
        });
      }

      const loserCountry = state.countries.get(loserId);
      if (loserCountry && loserCountry.capitalProvinceId === provinceId) {
        losses.capitalLost = true;
        this.addContribution(state, dispute.id, loserId, CAPITAL_CONTROL_CONTRIB, 'capital_lost');
        this.appendWarLog(state, {
          kind: 'province_controlled',
          countryId: byCountryId,
          text: `我方管控敌方首都「${province.name}」！敌方士气崩溃`,
          relatedIds: { provinceId, disputeId: dispute.id },
        });
      }
    });
  }

  onDivisionDestroyed(state: WorldState, divisionId: number, ownerId: string, provinceId: number): void {
    this.ensureWarLossesInitialized(state, ownerId);
    const losses = state.warLosses.get(ownerId);
    if (losses) {
      losses.divisionsLost += 1;
    }

    state.disputes.forEach((dispute) => {
      if (!dispute.participantSet.has(ownerId)) return;
      this.addContribution(state, dispute.id, ownerId, DIVISION_DESTROYED_CONTRIB, 'division_destroyed');
      const province = state.provinces.get(provinceId);
      this.appendWarLog(state, {
        kind: 'division_destroyed',
        countryId: ownerId,
        text: `${province ? province.name : '前线'}：我方师团被歼灭`,
        relatedIds: { divisionId, provinceId, disputeId: dispute.id },
      });
    });
  }

  private onCountrySurrendered(state: WorldState, disputeId: string, loserId: string, winnerId: string): void {
    const dispute = state.disputes.get(disputeId);
    if (!dispute) return;

    state.provinces.forEach((p) => {
      if (p.controllerId === loserId) {
        p.controllerId = winnerId;
        state.provinces.set(p.id, p);
      }
    });

    const toRemove: number[] = [];
    state.divisions.forEach((div) => {
      if (div.ownerId === loserId) {
        toRemove.push(div.id);
      }
    });
    for (const id of toRemove) {
      state.divisions.delete(id);
    }

    state.fronts.delete(loserId);
    state.fronts.delete(winnerId);

    this.appendWarLog(state, {
      kind: 'surrendered',
      countryId: winnerId,
      text: `敌方投降，我方全面胜利！`,
      relatedIds: { disputeId },
    });

    eventsDisputeResolved(state, disputeId, winnerId, loserId);

    state.disputes.delete(disputeId);

    state.gameOver = { winnerId, loserId, tickId: state.tickId };
    state.speed = 0;
  }

  private getOpponent(dispute: Dispute, countryId: string): string | null {
    for (const p of dispute.participants) {
      if (p !== countryId) return p;
    }
    return null;
  }
}

function eventsDisputeResolved(_state: WorldState, _disputeId: string, _winnerId: string, _loserId: string): void {
}
