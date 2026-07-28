/**
 * 外交系统默认实现（M2 系统补全 - 外交）
 *
 * 职责：
 * - declareWar：A 国对 B 国发起正式宣战（创建 Dispute 记录 + 初始化投降进度 + 双方进入战争状态）
 * - offerPeace：提议和谈（M2 简化：双方 surrenderProgress 都 < 0.3 时接受白和；否则拒绝）
 * - isAtWar：查询两国是否处于战争状态
 *
 * 设计要点：
 * - 不 import cc，core/ 层独立
 * - 不调用 Math.random，所有逻辑确定性
 * - disputeId 使用 d_<attackerId>_<defenderId>_<tickId>，与 combat_system 保持一致
 * - 宣战前置校验：不与自己、已在战争中则幂等返回
 * - 宣战会创建双向 Dispute 并初始化投降进度
 */
import { Fixed } from '../determinism/fixed';
import { WorldState } from '../state/world_state';
import { GameEvent } from './types';
import { DiplomacySystem, SurrenderSystem } from './interfaces';

export class DefaultDiplomacySystem implements DiplomacySystem {
  declareWar(state: WorldState, attackerId: string, defenderId: string, surrenderSys?: SurrenderSystem): GameEvent[] {
    if (attackerId === defenderId) return [];
    const attacker = state.countries.get(attackerId);
    const defender = state.countries.get(defenderId);
    if (!attacker || !defender) return [];

    if (this.isAtWar(state, attackerId, defenderId)) return [];

    const disputeId = `d_${attackerId}_${defenderId}_${state.tickId}`;
    const participants = [attackerId, defenderId];
    const participantSet = new Set(participants);

    const dispute = {
      id: disputeId,
      participants,
      participantSet,
      disputeResolve: {
        [attackerId]: Fixed.fromNumber(0.6),
        [defenderId]: Fixed.fromNumber(0.4),
      },
      disputeGoals: ['annex'],
      controlledVPs: {
        [attackerId]: 0,
        [defenderId]: 0,
      },
      surrenderProgress: {},
      surrenderThreshold: {},
      startTick: state.tickId,
      totalVPs: 0,
    };
    state.disputes.set(disputeId, dispute);

    if (surrenderSys) {
      surrenderSys.initDisputeSurrender(state, disputeId);
      surrenderSys.appendWarLog(state, {
        kind: 'invasion',
        countryId: attackerId,
        text: `${attacker.name} 向 ${defender.name} 宣战！`,
        relatedIds: { disputeId },
      });
    }

    return [{
      kind: 'warStarted',
      countryId: attackerId,
      disputeId,
      tickId: state.tickId,
      relatedIds: { attackerId, defenderId },
    }];
  }

  offerPeace(state: WorldState, proposerId: string, targetId: string, surrenderSys?: SurrenderSystem): GameEvent[] {
    if (proposerId === targetId) return [];
    const disputeId = this.findDisputeBetween(state, proposerId, targetId);
    if (!disputeId) return [];
    const dispute = state.disputes.get(disputeId);
    if (!dispute) return [];

    const proposerProg = dispute.surrenderProgress[proposerId] ?? Fixed.ZERO;
    const targetProg = dispute.surrenderProgress[targetId] ?? Fixed.ZERO;

    const proposerCountry = state.countries.get(proposerId);
    const targetCountry = state.countries.get(targetId);

    const peaceThreshold = Fixed.fromNumber(0.3);
    if (proposerProg.lessThan(peaceThreshold) && targetProg.lessThan(peaceThreshold)) {
      state.disputes.delete(disputeId);
      state.fronts.delete(proposerId);
      state.fronts.delete(targetId);
      if (surrenderSys) {
        surrenderSys.appendWarLog(state, {
          kind: 'surrendered',
          countryId: proposerId,
          text: `${proposerCountry?.name ?? proposerId} 与 ${targetCountry?.name ?? targetId} 达成和平`,
          relatedIds: { disputeId },
        });
      }
      return [{
        kind: 'peaceTreaty',
        countryId: proposerId,
        disputeId,
        tickId: state.tickId,
        relatedIds: { proposerId, targetId },
      }];
    }

    if (surrenderSys) {
      surrenderSys.appendWarLog(state, {
        kind: 'dispute_started',
        countryId: proposerId,
        text: `${targetCountry?.name ?? targetId} 拒绝了和谈提议`,
        relatedIds: { disputeId },
      });
    }
    return [];
  }

  isAtWar(state: WorldState, countryA: string, countryB: string): boolean {
    return this.findDisputeBetween(state, countryA, countryB) !== null;
  }

  private findDisputeBetween(state: WorldState, a: string, b: string): string | null {
    let found: string | null = null;
    state.disputes.forEach((d) => {
      if (found) return;
      if (d.participantSet.has(a) && d.participantSet.has(b)) found = d.id;
    });
    return found;
  }
}
