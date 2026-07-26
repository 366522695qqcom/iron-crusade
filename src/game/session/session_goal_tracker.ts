/**
 * 会话目标追踪器（spec A 级 - A.4.2）
 *
 * 实现依据：PROJECT.md 3.14 单次会话目标 + spec Requirement: 单次会话目标
 *
 * 职责：
 * - 监听玩家动作（PlayerAction）更新 action 驱动目标的进度
 * - 检查 state 驱动目标的完成状态（焦点完成 / 工厂升级）
 * - 领取完成目标的奖励（政治点 / 资源）
 *
 * 进度模型：
 * - action 驱动目标（build_building / gather_resource）：由 updateProgress 增量更新
 * - state 驱动目标（complete_focus / upgrade_factory）：由 checkCompletion 比对基线快照更新
 * - 基线在 setGoals 时快照，保证「本次会话内新增」的进度才算数
 */
import type { PlayerAction } from '../../core/simulation/types';
import type { WorldState } from '../../core/state/world_state';
import type { ResourceType } from '../../core/types';
import { Fixed } from '../../core/determinism/fixed';
import type { SessionGoal, SessionGoalReward, SessionGoalType } from './session_goal';
import { applyReward } from './reward_applier';

/**
 * 会话目标追踪器接口
 */
export interface SessionGoalTracker {
  /** 设置当前追踪的目标列表（通常由 SessionGoalGenerator.generateGoals 生成） */
  setGoals(goals: SessionGoal[]): void;
  /** 获取当前追踪的目标 */
  getGoals(): SessionGoal[];
  /** 监听玩家动作更新进度（action 驱动目标） */
  updateProgress(action: PlayerAction): void;
  /** 检查完成的目标（state 驱动目标为主），返回本次新完成的目标 */
  checkCompletion(): SessionGoal[];
  /** 领取奖励；未完成或已领取返回 null */
  claimReward(goalId: string, state: WorldState): SessionGoalReward | null;
}

/**
 * 默认 SessionGoalTracker 实现
 *
 * 持有 WorldState 引用以读取最新状态（simulation 推演时原地更新 state），
 * checkCompletion 比对 setGoals 时的基线快照计算「本次会话增量」。
 */
export class DefaultSessionGoalTracker implements SessionGoalTracker {
  /** 当前追踪的目标列表 */
  private goals: SessionGoal[] = [];
  /** 基线快照：setGoals 时刻已完成的焦点数 / 已升级工厂数 */
  private baselines: { completedFocuses: number; upgradedFactories: number } = {
    completedFocuses: 0,
    upgradedFactories: 0,
  };

  constructor(
    private readonly state: WorldState,
    private readonly countryId: string,
  ) {}

  setGoals(goals: SessionGoal[]): void {
    this.goals = goals;
    this.baselines = this.snapshotBaselines();
  }

  getGoals(): SessionGoal[] {
    return this.goals;
  }

  /**
   * 监听玩家动作更新 action 驱动目标进度
   * - placeBuilding → build_building 目标 current++
   * - trade → gather_resource 目标 current += action.amount.toInt()
   */
  updateProgress(action: PlayerAction): void {
    switch (action.kind) {
      case 'placeBuilding': {
        const goal = this.findGoal('build_building');
        if (goal && !goal.completed) goal.current += 1;
        break;
      }
      case 'trade': {
        const goal = this.findGoal('gather_resource');
        if (goal && !goal.completed && action.amount) {
          goal.current += action.amount.toInt();
        }
        break;
      }
      default:
        break;
    }
  }

  /**
   * 检查目标完成状态，返回本次新完成的目标
   * - state 驱动：complete_focus / upgrade_factory 比对基线快照
   * - action 驱动：build_building / gather_resource 仅做完成判定（进度由 updateProgress 维护）
   */
  checkCompletion(): SessionGoal[] {
    const newlyCompleted: SessionGoal[] = [];

    const focusGoal = this.findGoal('complete_focus');
    if (focusGoal && !focusGoal.completed) {
      const focusState = this.state.focusTrees.get(this.countryId);
      const completed = focusState?.completedFocusIds.length ?? 0;
      focusGoal.current = Math.max(0, completed - this.baselines.completedFocuses);
      if (focusGoal.current >= focusGoal.target) {
        focusGoal.completed = true;
        newlyCompleted.push(focusGoal);
      }
    }

    const factoryGoal = this.findGoal('upgrade_factory');
    if (factoryGoal && !factoryGoal.completed) {
      let upgraded = 0;
      this.state.factories.forEach((f) => {
        const prov = this.state.provinces.get(f.provinceId);
        if (prov?.ownerId === this.countryId && f.level > 1) upgraded++;
      });
      factoryGoal.current = Math.max(0, upgraded - this.baselines.upgradedFactories);
      if (factoryGoal.current >= factoryGoal.target) {
        factoryGoal.completed = true;
        newlyCompleted.push(factoryGoal);
      }
    }

    const buildGoal = this.findGoal('build_building');
    if (buildGoal && !buildGoal.completed && buildGoal.current >= buildGoal.target) {
      buildGoal.completed = true;
      newlyCompleted.push(buildGoal);
    }
    const gatherGoal = this.findGoal('gather_resource');
    if (gatherGoal && !gatherGoal.completed && gatherGoal.current >= gatherGoal.target) {
      gatherGoal.completed = true;
      newlyCompleted.push(gatherGoal);
    }

    return newlyCompleted;
  }

  /**
   * 领取目标奖励，奖励通过 RewardApplier 直接应用到 WorldState
   * @returns 奖励详情；目标未完成或奖励已领取返回 null
   */
  claimReward(goalId: string, state: WorldState): SessionGoalReward | null {
    const goal = this.goals.find((g) => g.goalId === goalId);
    if (!goal || !goal.completed || goal.rewardClaimed) return null;
    goal.rewardClaimed = true;

    const resourcesMap: Partial<Record<ResourceType, Fixed>> = {};
    for (const r of goal.reward.resources) {
      resourcesMap[r.type] = r.amount;
    }
    applyReward(state, this.countryId, {
      political: goal.reward.politicalPower,
      resources: resourcesMap,
    });

    return goal.reward;
  }

  /** 快照基线：setGoals 时刻已完成的焦点数与已升级工厂数 */
  private snapshotBaselines(): { completedFocuses: number; upgradedFactories: number } {
    const focusState = this.state.focusTrees.get(this.countryId);
    const completedFocuses = focusState?.completedFocusIds.length ?? 0;

    let upgradedFactories = 0;
    this.state.factories.forEach((f) => {
      const prov = this.state.provinces.get(f.provinceId);
      if (prov?.ownerId === this.countryId && f.level > 1) upgradedFactories++;
    });

    return { completedFocuses, upgradedFactories };
  }

  /** 按类型查找目标（每种类型至多一个） */
  private findGoal(type: SessionGoalType): SessionGoal | undefined {
    return this.goals.find((g) => g.type === type);
  }
}
