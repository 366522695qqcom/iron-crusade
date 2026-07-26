/**
 * 联机奖励回流系统（spec B 级 - B.3）
 *
 * 实现依据：
 * - spec B.3 联机奖励回流
 * - PROJECT.md 5.3 联机存档章节：联机胜负可给单机主存档发奖励（如联机赢一场，单机+500 政治点）
 * - PROJECT.md 8.3 变现闭环：联机赢一场 → 单机主存档 +500 政治点 → 引导回单机 → 触发广告变现
 *
 * 设计说明：
 * - 本类在 core/simulation 层定义，联机模块（C 级）在结算时调用 applyResultReward 将奖励发放到单机存档
 * - 联机无广告：广告模块 AdsManager 在联机期间 setEnabled(false)（已在 B.2 实现）
 * - 奖励数量沿用 PROJECT.md 5.3 的 +500 政治点设计，额外补充钢铁/石油资源奖励
 * - 幂等保护：同一局游戏（matchId）只发一次奖励，防止重复发放
 * - 确定性约束：不使用 Math.random，固定奖励表；数值计算全部使用 Fixed
 *
 * B.3.1 校验修复：
 * - 政治点仅写 stockpile.political（与 simulation 政治点每日产出 / focus pickFocus 扣点保持一致），
 *   不再双写 country.politicalPower——后者在游戏中不被 simulation/focus 更新，双写会导致两字段不一致
 * - 所有奖励资源 clamp 到 stockpile.caps.*（PROJECT.md 3.2.2：储备上限受仓储建筑限制，超出上限的产出被丢弃）
 */
import { Fixed } from '../determinism/fixed';
import { WorldState, ResourceStockpile } from '../state/world_state';
import { ResourceType } from '../types';

/** 联机胜利政治点奖励（PROJECT.md 5.3 / 8.3 明确：+500 政治点） */
export const MP_VICTORY_PP_REWARD = 500;
/** 联机胜利额外钢铁奖励 */
export const MP_VICTORY_STEEL_REWARD = 200;
/** 联机胜利额外石油奖励 */
export const MP_VICTORY_OIL_REWARD = 100;
/** 联机平局政治点奖励 */
export const MP_DRAW_PP_REWARD = 100;
/** 联机失败政治点奖励（参与奖励，鼓励联机） */
export const MP_DEFEAT_PP_REWARD = 20;

/** 联机结果类型 */
export type MultiplayerResult = 'victory' | 'defeat' | 'draw';

/** 联机奖励详情 */
export interface MultiplayerRewardDetail {
  /** 政治点奖励数量 */
  politicalPower: Fixed;
  /** 资源奖励列表（仅包含非零奖励） */
  resources: { type: ResourceType; amount: Fixed }[];
}

/** 已发放的联机奖励记录 */
export interface MultiplayerRewardGranted extends MultiplayerRewardDetail {
  /** 奖励发放到的国家 ID */
  countryId: string;
  /** 联机结果 */
  result: MultiplayerResult;
  /** 联机对局 ID（幂等键） */
  matchId: string;
  /** 奖励发放时间戳（ms，平台层时间） */
  grantedAt: number;
}

/**
 * 联机奖励系统接口
 *
 * 供联机模块（C 级）在对局结算时调用，将奖励回流到玩家的单机存档。
 */
export interface MultiplayerRewardSystem {
  /**
   * 根据联机结果发放奖励到单机存档
   *
   * 幂等：同一 matchId 只发一次，重复调用返回零奖励。
   *
   * @param state 单机存档的 WorldState
   * @param countryId 奖励发放到的国家 ID（对应 state.countries 中的玩家国家）
   * @param result 联机结果（victory/defeat/draw）
   * @param matchId 联机对局 ID（用于幂等去重）
   * @returns 实际发放的奖励详情
   */
  applyResultReward(
    state: WorldState,
    countryId: string,
    result: MultiplayerResult,
    matchId: string,
  ): MultiplayerRewardGranted;

  /**
   * 查询指定联机结果的预期奖励（不修改 state）
   * @param result 联机结果
   * @returns 预期奖励详情
   */
  getExpectedReward(result: MultiplayerResult): MultiplayerRewardDetail;
}

interface RewardTableEntry {
  politicalPower: number;
  resources: { type: ResourceType; amount: number }[];
}

const REWARD_TABLE: Record<MultiplayerResult, RewardTableEntry> = {
  victory: {
    politicalPower: MP_VICTORY_PP_REWARD,
    resources: [
      { type: 'steel', amount: MP_VICTORY_STEEL_REWARD },
      { type: 'oil', amount: MP_VICTORY_OIL_REWARD },
    ],
  },
  draw: {
    politicalPower: MP_DRAW_PP_REWARD,
    resources: [],
  },
  defeat: {
    politicalPower: MP_DEFEAT_PP_REWARD,
    resources: [],
  },
};

function createZeroRewardDetail(): MultiplayerRewardDetail {
  return {
    politicalPower: Fixed.ZERO,
    resources: [],
  };
}

function buildRewardDetail(result: MultiplayerResult): MultiplayerRewardDetail {
  const entry = REWARD_TABLE[result];
  return {
    politicalPower: Fixed.fromInt(entry.politicalPower),
    resources: entry.resources.map((r) => ({
      type: r.type,
      amount: Fixed.fromInt(r.amount),
    })),
  };
}

function getOrCreateStockpile(
  state: WorldState,
  countryId: string,
): ResourceStockpile {
  const existing = state.stockpiles.get(countryId);
  if (existing) {
    return existing;
  }
  const newStockpile: ResourceStockpile = {
    countryId,
    steel: Fixed.ZERO,
    oil: Fixed.ZERO,
    tungsten: Fixed.ZERO,
    rubber: Fixed.ZERO,
    aluminum: Fixed.ZERO,
    political: Fixed.ZERO,
    caps: {
      steel: Fixed.fromInt(10000),
      oil: Fixed.fromInt(10000),
      tungsten: Fixed.fromInt(5000),
      rubber: Fixed.fromInt(5000),
      aluminum: Fixed.fromInt(5000),
      political: Fixed.fromInt(10000),
    },
    history: [],
  };
  state.stockpiles.set(countryId, newStockpile);
  return newStockpile;
}

/**
 * 默认联机奖励系统实现
 *
 * 幂等机制：内部维护 claimedMatchIds: Set<string>，记录已发放奖励的 matchId。
 */
export class DefaultMultiplayerRewardSystem implements MultiplayerRewardSystem {
  private claimedMatchIds: Set<string> = new Set();

  applyResultReward(
    state: WorldState,
    countryId: string,
    result: MultiplayerResult,
    matchId: string,
  ): MultiplayerRewardGranted {
    if (this.claimedMatchIds.has(matchId)) {
      return {
        ...createZeroRewardDetail(),
        countryId,
        result,
        matchId,
        grantedAt: Date.now(),
      };
    }

    const country = state.countries.get(countryId);
    if (!country) {
      throw new Error(`MultiplayerReward: country ${countryId} not found in state`);
    }

    const reward = buildRewardDetail(result);
    const stockpile = getOrCreateStockpile(state, countryId);

    // 政治点：仅写 stockpile.political（与 simulation 政治点每日产出 / focus pickFocus 扣点一致），
    // clamp 到 caps.political（PROJECT.md 3.2.2 储备上限）
    stockpile.political = stockpile.political.add(reward.politicalPower);
    if (stockpile.political.greaterThan(stockpile.caps.political)) {
      stockpile.political = stockpile.caps.political;
    }

    for (const resourceReward of reward.resources) {
      switch (resourceReward.type) {
        case 'steel':
          stockpile.steel = stockpile.steel.add(resourceReward.amount);
          // clamp 到 caps.steel（储备上限，超出被丢弃）
          if (stockpile.steel.greaterThan(stockpile.caps.steel)) {
            stockpile.steel = stockpile.caps.steel;
          }
          break;
        case 'oil':
          stockpile.oil = stockpile.oil.add(resourceReward.amount);
          if (stockpile.oil.greaterThan(stockpile.caps.oil)) {
            stockpile.oil = stockpile.caps.oil;
          }
          break;
        default:
          break;
      }
    }

    this.claimedMatchIds.add(matchId);

    return {
      ...reward,
      countryId,
      result,
      matchId,
      grantedAt: Date.now(),
    };
  }

  getExpectedReward(result: MultiplayerResult): MultiplayerRewardDetail {
    return buildRewardDetail(result);
  }

  /**
   * 重置已发放记录（测试用，生产环境一般不调用）
   */
  resetClaimed(): void {
    this.claimedMatchIds.clear();
  }
}
