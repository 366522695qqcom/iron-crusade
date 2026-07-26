/**
 * 阶梯式新手引导模块入口（spec A 级 - A.3）
 *
 * re-export 公开类型与默认控制器实现。
 * 引导 UI（高亮/气泡/遮罩，A.3.4）不在本模块范围，由 UI 阶段基于本模块暴露的
 * getActiveDayTasks / getGuideText / isFeatureUnlocked 接口渲染。
 */
export type {
  OnboardingConfigMeta,
  OnboardingDayConfig,
  OnboardingProgress,
  OnboardingReward,
  OnboardingTask,
  OnboardingTaskParams,
  OnboardingTaskType,
} from './onboarding_schema';
export { DefaultOnboardingController } from './onboarding_controller';
export type { OnboardingController } from './onboarding_controller';
