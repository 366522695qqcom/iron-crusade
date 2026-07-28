/**
 * 师团系统默认实现（feature-combat-skeleton T1 + M2 师团模板）
 *
 * 职责：
 * - initDefaultTemplates：注册预设师团模板（步兵/装甲/山地/炮兵）
 * - recruit：按模板招募师团（扣对应政治点+装备）
 * - getAvailableTemplates：列出可用模板
 * - advanceTick：训练推进
 *
 * M2 师团模板预设：
 * - infantry（默认）：纯步兵，低成本，均衡属性
 * - armor：装甲师，高硬攻高硬度，需要中型坦克装备
 * - mountain：山地师，高组织度，低硬攻，适合山地
 * - artillery：炮兵师，高软攻，低硬度
 */
import { Fixed } from '../determinism/fixed';
import { WorldState, Division, DivisionTemplate } from '../state/world_state';
import { GameEvent } from './types';
import { DivisionSystem } from './interfaces';

const DEFAULT_TRAINING_TICKS = 600;

export class DefaultDivisionSystem implements DivisionSystem {
  initDefaultTemplates(state: WorldState): void {
    if (state.divisionTemplates.size() > 0) return;

    const templates: DivisionTemplate[] = [
      {
        id: 'infantry',
        name: '步兵师',
        slots: [
          { slot: 0, equipmentType: 'infantry_equipment' },
          { slot: 1, equipmentType: 'infantry_equipment' },
          { slot: 2, equipmentType: 'infantry_equipment' },
          { slot: 3, equipmentType: 'infantry_equipment' },
        ],
        organization: Fixed.fromNumber(0.6),
        hardness: Fixed.fromNumber(0.1),
        softAttack: Fixed.fromInt(10),
        hardAttack: Fixed.fromInt(2),
        politicalCost: Fixed.fromInt(100),
        equipmentCost: { infantry_equipment: 200 },
        trainingTicks: 600,
      },
      {
        id: 'artillery',
        name: '炮兵师',
        slots: [
          { slot: 0, equipmentType: 'infantry_equipment' },
          { slot: 1, equipmentType: 'infantry_equipment' },
          { slot: 2, equipmentType: 'artillery_equipment' },
          { slot: 3, equipmentType: 'artillery_equipment' },
        ],
        organization: Fixed.fromNumber(0.5),
        hardness: Fixed.fromNumber(0.05),
        softAttack: Fixed.fromInt(18),
        hardAttack: Fixed.fromInt(3),
        politicalCost: Fixed.fromInt(150),
        equipmentCost: { infantry_equipment: 100, artillery_equipment: 100 },
        trainingTicks: 800,
      },
      {
        id: 'armor',
        name: '装甲师',
        slots: [
          { slot: 0, equipmentType: 'infantry_equipment' },
          { slot: 1, equipmentType: 'medium_tank' },
          { slot: 2, equipmentType: 'medium_tank' },
          { slot: 3, equipmentType: 'motorized_equipment' },
        ],
        organization: Fixed.fromNumber(0.45),
        hardness: Fixed.fromNumber(0.7),
        softAttack: Fixed.fromInt(12),
        hardAttack: Fixed.fromInt(16),
        politicalCost: Fixed.fromInt(250),
        equipmentCost: { infantry_equipment: 50, medium_tank: 80, motorized_equipment: 80 },
        trainingTicks: 1000,
      },
      {
        id: 'mountain',
        name: '山地师',
        slots: [
          { slot: 0, equipmentType: 'infantry_equipment' },
          { slot: 1, equipmentType: 'infantry_equipment' },
          { slot: 2, equipmentType: 'infantry_equipment' },
          { slot: 3, equipmentType: 'mountain_equipment' },
        ],
        organization: Fixed.fromNumber(0.75),
        hardness: Fixed.fromNumber(0.05),
        softAttack: Fixed.fromInt(11),
        hardAttack: Fixed.fromInt(2),
        politicalCost: Fixed.fromInt(120),
        equipmentCost: { infantry_equipment: 150, mountain_equipment: 80 },
        trainingTicks: 700,
      },
    ];

    for (const tpl of templates) {
      state.divisionTemplates.set(tpl.id, tpl);
    }
  }

  getAvailableTemplates(state: WorldState, _countryId: string): { id: string; name: string }[] {
    const list: { id: string; name: string }[] = [];
    state.divisionTemplates.forEach((tpl) => {
      list.push({ id: tpl.id, name: tpl.name });
    });
    return list;
  }

  recruit(state: WorldState, countryId: string, provinceId: number, templateId?: string): boolean {
    this.initDefaultTemplates(state);

    const tplId = templateId || 'infantry';
    const template = state.divisionTemplates.get(tplId);
    if (!template) return false;

    const stockpile = state.stockpiles.get(countryId);
    if (!stockpile) return false;
    if (stockpile.political.lessThan(template.politicalCost)) return false;

    const equipmentPool = state.equipmentPools.get(countryId);
    if (!equipmentPool) return false;

    for (const [eqType, count] of Object.entries(template.equipmentCost)) {
      const stock = equipmentPool.stocks.find((s) => s.type === eqType);
      if (!stock || stock.count < count) return false;
    }

    const province = state.provinces.get(provinceId);
    if (!province) return false;
    if (province.controllerId !== countryId) return false;

    stockpile.political = stockpile.political.sub(template.politicalCost);

    for (const [eqType, count] of Object.entries(template.equipmentCost)) {
      const stock = equipmentPool.stocks.find((s) => s.type === eqType);
      if (stock) stock.count -= count;
    }

    const id = state.nextEntityId++;
    const division: Division = {
      id,
      ownerId: countryId,
      templateId: tplId,
      template: template.slots.map((s) => ({ slot: s.slot, equipmentType: s.equipmentType })),
      organization: template.organization,
      hardness: template.hardness,
      softAttack: template.softAttack,
      hardAttack: template.hardAttack,
      currentProvinceId: provinceId,
      targetProvinceId: null,
      supply: Fixed.ONE,
      supplyStatus: 'ok',
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

      const tpl = state.divisionTemplates.get(div.templateId);
      const trainTicks = tpl ? tpl.trainingTicks : DEFAULT_TRAINING_TICKS;
      const progressPerTick = Fixed.ONE.div(Fixed.fromInt(trainTicks));

      div.trainingProgress = div.trainingProgress.add(progressPerTick);
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
