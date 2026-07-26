/**
 * 阶梯式新手引导流程控制器（spec A 级 - A.3.2 / A.3.3）
 *
 * 实现依据：PROJECT.md 3.13 阶梯式新手引导 + spec Requirement: 阶梯式新手引导
 *
 * 职责：
 * - 加载 Day1/Day2/Day3 任务配置（A.3.2 loadDayConfig）
 * - 维护引导进度（已完成任务、已解锁功能、当前日）（A.3.2 getProgress）
 * - 解锁指定日（仅可由前一日完成触发，未到 Day 不解锁）（A.3.2 unlockDay / A.3.3）
 * - 标记任务完成并检查是否解锁下一日（A.3.2 completeTask）
 * - 功能锁定/解锁查询（A.3.3 isFeatureUnlocked，UI 据此控制按钮可点击性）
 * - 首局快速对局完成时触发 Day1 解锁（A.3.2 onQuickBattleFinished）
 *
 * 解锁规则（spec Scenario: 新手 Day1 解锁）：
 * - Day1：首局快速对局完成（onQuickBattleFinished）后由 unlockDay(1) 解锁
 * - Day2：Day1 全部任务完成后自动解锁（completeTask 触发 tryAutoUnlockNextDay）
 * - Day3：Day2 全部任务完成后自动解锁（completeTask 触发 tryAutoUnlockNextDay）
 * - 未到对应日 → 该日功能锁定（isFeatureUnlocked 返回 false）
 *
 * 功能 key 列表（A.3.3，与 configs/onboarding_day{N}.json 的 unlocks 字段一致）：
 * - Day1 解锁：factory_assignment（工厂分配）、resource_trade（资源贸易）
 * - Day2 解锁：equipment_production（装备生产）、division_deploy（部队部署）
 * - Day3 解锁：initiate_dispute（发起区域争端）、draw_front（拉线攻势）
 *
 * 本类为纯逻辑层，不依赖 Cocos 运行时，可单测。
 */
import type {
  OnboardingDayConfig,
  OnboardingProgress,
  OnboardingTask,
} from './onboarding_schema';
// 配置 stub：直接 import JSON 作为默认数据源。生产环境应由 platform 层 fetch 远程配置后注入，
// 保持 configs/onboarding_day{N}.json 为单一数据源（A.3.2 注：此处 stub 返回导入的 JSON）。
import day1Json from '../../../configs/onboarding_day1.json';
import day2Json from '../../../configs/onboarding_day2.json';
import day3Json from '../../../configs/onboarding_day3.json';

/**
 * 新手引导控制器接口（A.3.2）
 */
export interface OnboardingController {
  /** 加载指定日的任务配置 */
  loadDayConfig(day: 1 | 2 | 3): OnboardingDayConfig;
  /** 查询当前引导进度 */
  getProgress(): OnboardingProgress;
  /**
   * 解锁指定日（仅可由前一日完成触发）
   * @returns 是否解锁成功（前置条件未满足则返回 false，spec Scenario: 新手 Day1 解锁）
   */
  unlockDay(day: 1 | 2 | 3): boolean;
  /**
   * 标记任务完成，并检查是否自动解锁下一日
   * @returns 是否标记成功（任务不存在或所属日未激活则返回 false）
   */
  completeTask(taskId: string): boolean;
  /** 功能是否已解锁（A.3.3，UI 据此控制按钮可点击性） */
  isFeatureUnlocked(feature: string): boolean;
  /** 取当前激活日的任务列表（无激活日返回空数组） */
  getActiveDayTasks(): OnboardingTask[];
  /** 首局快速对局完成时触发 Day1 解锁（spec Scenario: 新手 Day1 解锁） */
  onQuickBattleFinished(): void;
  /** 获取任务引导文案（供 A.3.4 UI 层渲染高亮/气泡/遮罩） */
  getGuideText(taskId: string): string;
}

/**
 * 默认新手引导控制器实现（A.3.2 / A.3.3）
 *
 * 配置加载说明：
 * - 默认实现直接 import configs/onboarding_day{N}.json 作为 stub（A.3.2）
 * - 生产环境应由 platform 层 fetch 远程配置后注入，保持 JSON 为单一数据源
 * - 子类可覆盖 loadDayConfig 以替换加载策略（如远程 fetch + 校验）
 */
export class DefaultOnboardingController implements OnboardingController {
  /** 当前激活日（0 = 未开始，1/2/3 = 对应日） */
  private currentDay: 0 | 1 | 2 | 3 = 0;
  /** 已完成的任务 ID 集合 */
  private readonly completedTaskIds: Set<string> = new Set();
  /** 已解锁的功能 key 集合（A.3.3） */
  private readonly unlockedFeatures: Set<string> = new Set();
  /** 首局快速对局是否已完成（Day1 解锁前置条件） */
  private quickBattleFinished = false;
  /** 日配置缓存（按 day 索引，避免重复加载） */
  private readonly configCache: Map<number, OnboardingDayConfig> = new Map();

  loadDayConfig(day: 1 | 2 | 3): OnboardingDayConfig {
    const cached = this.configCache.get(day);
    if (cached) return cached;
    // JSON 导入推断为宽类型（如 triggerCondition: string），此处断言为 schema 类型。
    // 断言集中于一点，schema 类型在控制器逻辑与消费侧全程生效。
    const raw = day === 1 ? day1Json : day === 2 ? day2Json : day3Json;
    const config = raw as unknown as OnboardingDayConfig;
    this.configCache.set(day, config);
    return config;
  }

  getProgress(): OnboardingProgress {
    return {
      currentDay: this.currentDay,
      dayNumber: this.currentDay,
      completedTaskIds: Array.from(this.completedTaskIds),
      unlockedFeatures: Array.from(this.unlockedFeatures),
    };
  }

  unlockDay(day: 1 | 2 | 3): boolean {
    // 前置条件校验：未到对应日不解锁（spec Scenario: 新手 Day1 解锁）
    if (!this.canUnlock(day)) return false;
    // 已解锁则幂等返回 true
    if (this.currentDay >= day) return true;

    this.currentDay = day;
    // 解锁本日对应的功能 key（A.3.3）
    const config = this.loadDayConfig(day);
    for (const feature of config.unlocks) {
      this.unlockedFeatures.add(feature);
    }
    return true;
  }

  completeTask(taskId: string): boolean {
    // 定位任务所属日
    const day = this.findTaskDay(taskId);
    if (day === null) return false;
    // 任务所属日必须已激活（未到 Day 不接受完成）
    if (this.currentDay < day) return false;

    this.completedTaskIds.add(taskId);

    // 当前日全部任务完成 → 自动解锁下一日
    this.tryAutoUnlockNextDay();
    return true;
  }

  isFeatureUnlocked(feature: string): boolean {
    return this.unlockedFeatures.has(feature);
  }

  getActiveDayTasks(): OnboardingTask[] {
    if (this.currentDay === 0) return [];
    return this.loadDayConfig(this.currentDay).tasks;
  }

  onQuickBattleFinished(): void {
    this.quickBattleFinished = true;
    // 首局快速对局完成 → 解锁 Day1（spec Scenario: 新手 Day1 解锁）
    if (this.currentDay < 1) {
      this.unlockDay(1);
    }
  }

  getGuideText(taskId: string): string {
    const day = this.findTaskDay(taskId);
    if (day === null) return '';
    const config = this.loadDayConfig(day);
    const task = config.tasks.find((t) => t.id === taskId);
    return task ? task.guideText : '';
  }

  /**
   * 校验指定日是否满足解锁前置条件
   * - Day1：首局快速对局已完成
   * - Day2：Day1 全部任务已完成
   * - Day3：Day2 全部任务已完成
   */
  private canUnlock(day: 1 | 2 | 3): boolean {
    if (day === 1) {
      return this.quickBattleFinished;
    }
    // Day2 / Day3：前一日必须已激活且任务全部完成
    const prevDay = (day - 1) as 1 | 2;
    if (this.currentDay < prevDay) return false;
    return this.isDayAllTasksCompleted(prevDay);
  }

  /** 检查指定日的全部任务是否已完成 */
  private isDayAllTasksCompleted(day: 1 | 2 | 3): boolean {
    const config = this.loadDayConfig(day);
    return config.tasks.every((t) => this.completedTaskIds.has(t.id));
  }

  /**
   * 当前日全部任务完成后自动解锁下一日
   * - Day1 完成 → unlockDay(2)
   * - Day2 完成 → unlockDay(3)
   * - Day3 完成 → 引导结束（无下一日）
   */
  private tryAutoUnlockNextDay(): void {
    if (this.currentDay === 0 || this.currentDay === 3) return;
    if (!this.isDayAllTasksCompleted(this.currentDay)) return;
    const nextDay = (this.currentDay + 1) as 1 | 2 | 3;
    this.unlockDay(nextDay);
  }

  /** 定位任务所属日编号，不存在返回 null */
  private findTaskDay(taskId: string): 1 | 2 | 3 | null {
    for (const day of [1, 2, 3] as const) {
      const config = this.loadDayConfig(day);
      if (config.tasks.some((t) => t.id === taskId)) {
        return day;
      }
    }
    return null;
  }
}
