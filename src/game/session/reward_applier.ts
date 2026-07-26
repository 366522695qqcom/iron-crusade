/**
 * 统一奖励发放工具（feature-meta-save B4）
 *
 * 职责：将 political / 资源奖励安全地应用到 WorldState 的对应 stockpile，
 *       超过 cap 的部分自动 clamp，避免超发。
 *
 * 所有奖励发放（SessionGoal / DailyTask）统一走本工具，避免重复 clamp 逻辑。
 */
import type { WorldState, ResourceStockpile } from '../../core/state/world_state';
import type { ResourceType } from '../../core/types';
import { Fixed } from '../../core/determinism/fixed';

export interface RewardInput {
  political?: Fixed;
  resources?: Partial<Record<ResourceType, Fixed>>;
}

/**
 * 将奖励应用到指定国家的 stockpile，clamp 到 caps 上限
 * @param state 全局状态
 * @param countryId 国家 ID
 * @param reward 奖励内容（political + resources）
 */
export function applyReward(
  state: WorldState,
  countryId: string,
  reward: RewardInput,
): void {
  const stockpile = state.stockpiles.get(countryId);
  if (!stockpile) return;

  if (reward.political) {
    const next = stockpile.political.add(reward.political);
    const cap = stockpile.caps.political;
    stockpile.political = next.greaterThan(cap) ? cap : next;
  }

  if (reward.resources) {
    addResourceClamped(stockpile, 'steel', reward.resources.steel);
    addResourceClamped(stockpile, 'oil', reward.resources.oil);
    addResourceClamped(stockpile, 'tungsten', reward.resources.tungsten);
    addResourceClamped(stockpile, 'rubber', reward.resources.rubber);
    addResourceClamped(stockpile, 'aluminum', reward.resources.aluminum);
  }

  state.stockpiles.set(countryId, stockpile);
}

function addResourceClamped(
  stockpile: ResourceStockpile,
  type: 'steel' | 'oil' | 'tungsten' | 'rubber' | 'aluminum',
  amount: Fixed | undefined,
): void {
  if (!amount) return;
  const current = stockpile[type];
  const cap = stockpile.caps[type];
  const next = current.add(amount);
  stockpile[type] = next.greaterThan(cap) ? cap : next;
}
