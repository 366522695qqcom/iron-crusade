/**
 * 单次会话目标生成器（spec A 级 - A.4）
 *
 * 实现依据：PROJECT.md 3.14 单次会话目标 + spec Requirement: 单次会话目标
 *
 * 设计要点：
 * - 每次打开游戏提示本次会话可完成的目标（如「今日可完成 1 个焦点 + 升级 2 座工厂」）
 * - 目标基于玩家当前存档进度动态生成（焦点进度 / 工厂等级 / 资源储备等）
 * - 完成目标给予额外奖励（政治点 / 资源）
 * - 展示位置：主界面顶部目标卡片，全部完成后卡片变绿并发奖
 */
import type { WorldState } from '../../core/state/world_state';
import type { ResourceType } from '../../core/types';
import { Fixed } from '../../core/determinism/fixed';

/** 会话目标奖励 */
export interface SessionGoalReward {
  /** 政治点奖励 */
  politicalPower: Fixed;
  /** 资源奖励（资源类型 → 数量） */
  resources: { type: ResourceType; amount: Fixed }[];
}

/** 会话目标类型 */
export type SessionGoalType =
  | 'complete_focus'   // 完成焦点
  | 'upgrade_factory'  // 升级工厂
  | 'build_building'   // 建造建筑
  | 'gather_resource'; // 采集资源

/**
 * 单次会话目标（PROJECT.md 3.14）
 *
 * 每次打开游戏生成，目标基于存档进度动态生成。
 * current 由 SessionGoalTracker 在会话中持续更新。
 */
export interface SessionGoal {
  /** 目标 ID（单次会话内唯一） */
  goalId: string;
  /** 目标类型 */
  type: SessionGoalType;
  /** 描述文案（如「升级 2 座工厂」） */
  description: string;
  /** 目标值 */
  target: number;
  /** 当前进度 */
  current: number;
  /** 完成奖励 */
  reward: SessionGoalReward;
  /** 是否已完成 */
  completed: boolean;
  /** 奖励是否已领取 */
  rewardClaimed: boolean;
}

/**
 * 会话目标生成器接口（A.4.1）
 *
 * 基于存档进度动态生成会话目标。
 */
export interface SessionGoalGenerator {
  /**
   * 基于当前存档进度生成会话目标
   * @param state 全局状态
   * @param countryId 玩家国家 ID
   * @returns 本次会话的目标列表（通常 2-3 个）
   */
  generateGoals(state: WorldState, countryId: string): SessionGoal[];
}

/**
 * 默认会话目标生成器实现
 *
 * 生成策略（最小实现）：
 * - 若玩家有焦点树 → 生成「完成 1 个焦点」目标
 * - 若玩家有工厂 → 生成「升级 2 座工厂」目标
 * - 始终生成「建造 2 座建筑」目标（鼓励经营）
 *
 * TODO: 更精细的动态生成——根据焦点进度、工厂等级分布、资源缺口调整 target 与 reward。
 */
export class DefaultSessionGoalGenerator implements SessionGoalGenerator {
  generateGoals(state: WorldState, countryId: string): SessionGoal[] {
    const goals: SessionGoal[] = [];

    // 目标 1：完成 1 个焦点（仅当玩家有焦点树时生成）
    const focusState = state.focusTrees.get(countryId);
    if (focusState) {
      goals.push({
        goalId: 'session_focus',
        type: 'complete_focus',
        description: '完成 1 个焦点',
        target: 1,
        current: 0,
        reward: {
          politicalPower: Fixed.fromInt(20),
          resources: [{ type: 'steel', amount: Fixed.fromInt(50) }],
        },
        completed: false,
        rewardClaimed: false,
      });
    }

    // 目标 2：升级 2 座工厂（仅当玩家拥有工厂时生成）
    let hasFactory = false;
    state.factories.forEach((f) => {
      const prov = state.provinces.get(f.provinceId);
      if (prov?.ownerId === countryId) hasFactory = true;
    });
    if (hasFactory) {
      goals.push({
        goalId: 'session_upgrade_factory',
        type: 'upgrade_factory',
        description: '升级 2 座工厂',
        target: 2,
        current: 0,
        reward: {
          politicalPower: Fixed.fromInt(15),
          resources: [{ type: 'steel', amount: Fixed.fromInt(30) }],
        },
        completed: false,
        rewardClaimed: false,
      });
    }

    // 目标 3：建造 2 座建筑（始终提供，鼓励工业经营）
    goals.push({
      goalId: 'session_build',
      type: 'build_building',
      description: '建造 2 座建筑',
      target: 2,
      current: 0,
      reward: {
        politicalPower: Fixed.fromInt(10),
        resources: [],
      },
      completed: false,
      rewardClaimed: false,
    });

    return goals;
  }
}
