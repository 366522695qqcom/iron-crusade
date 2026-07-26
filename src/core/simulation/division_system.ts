/**
 * 师团系统默认实现（feature-combat-skeleton T1）
 *
 * 职责：
 * - 招募师团（扣政治点 + 200步兵装备）
 * - 训练tick推进（固定600 tick训练完成）
 */
import { Fixed } from '../determinism/fixed';
import { WorldState, Division } from '../state/world_state';
import { GameEvent } from './types';
import { DivisionSystem } from './interfaces';

const RECRUIT_POLITICAL_COST = Fixed.fromInt(100);
const RECRUIT_INFANTRY_COST = 200;
const TRAINING_TICKS = 600;
const TRAINING_PROGRESS_PER_TICK = Fixed.ONE.div(Fixed.fromInt(TRAINING_TICKS));

export class DefaultDivisionSystem implements DivisionSystem {
  recruit(state: WorldState, countryId: string, provinceId: number): boolean {
    const stockpile = state.stockpiles.get(countryId);
    if (!stockpile) return false;
    if (stockpile.political.lessThan(RECRUIT_POLITICAL_COST)) return false;

    const equipmentPool = state.equipmentPools.get(countryId);
    if (!equipmentPool) return false;
    const infantryStock = equipmentPool.stocks.find((s) => s.type === 'infantry_equipment');
    if (!infantryStock || infantryStock.count < RECRUIT_INFANTRY_COST) return false;

    const province = state.provinces.get(provinceId);
    if (!province) return false;
    if (province.controllerId !== countryId) return false;

    stockpile.political = stockpile.political.sub(RECRUIT_POLITICAL_COST);
    infantryStock.count -= RECRUIT_INFANTRY_COST;

    const id = state.nextEntityId++;
    const division: Division = {
      id,
      ownerId: countryId,
      template: [
        { slot: 0, equipmentType: 'infantry_equipment' },
        { slot: 1, equipmentType: 'infantry_equipment' },
        { slot: 2, equipmentType: 'infantry_equipment' },
        { slot: 3, equipmentType: 'infantry_equipment' },
      ],
      organization: Fixed.fromNumber(0.6),
      hardness: Fixed.fromNumber(0.1),
      softAttack: Fixed.fromInt(10),
      hardAttack: Fixed.fromInt(2),
      currentProvinceId: provinceId,
      targetProvinceId: null,
      supply: Fixed.ONE,
      strength: Fixed.fromNumber(0.3),
      trainingProgress: Fixed.ZERO,
      status: 'training',
      inOffensive: false,
    };
    state.divisions.set(id, division);
    return true;
  }

  advanceTick(state: WorldState, countryId: string, _dtMs: Fixed): GameEvent[] {
    const events: GameEvent[] = [];
    state.divisions.forEach((div) => {
      if (div.ownerId !== countryId) return;
      if (div.status !== 'training') return;

      div.trainingProgress = div.trainingProgress.add(TRAINING_PROGRESS_PER_TICK);
      if (div.trainingProgress.greaterOrEqual(Fixed.ONE)) {
        div.trainingProgress = Fixed.ONE;
        div.status = 'ready';
        div.strength = Fixed.ONE;
        events.push({
          kind: 'divisionRecruited',
          divisionId: div.id,
          provinceId: div.currentProvinceId,
        });
      }
    });
    return events;
  }
}
