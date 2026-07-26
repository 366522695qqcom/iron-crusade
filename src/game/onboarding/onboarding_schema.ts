/**
 * 阶梯式新手引导配置 Schema（spec A 级 - A.3.1）
 *
 * 实现依据：PROJECT.md 3.13 阶梯式新手引导 + spec Requirement: 阶梯式新手引导
 *
 * 设计要点：
 * - 按日拆解系统，避免一次性信息过载（Day1 资源与工厂 → Day2 生产与部署 → Day3 作战与外交）
 * - 玩法重心倾斜（S.4.1）：Day1 工业资源优先教学，Day3 才教学作战
 * - 任务式引导：每阶段以任务形式推进，完成全部任务后解锁下一日
 * - 脱敏（S.2）：任务类型用 initiate_dispute / control_province（非 declare_war / occupy），
 *   guideText 文案用「区域争端」「管控」等脱敏术语
 *
 * 本文件为纯类型定义，不依赖 Cocos 运行时，可单测。
 */
import type { BuildingType, ResourceType } from '../../core/types';

/**
 * 新手引导任务类型（A.3.1）
 *
 * 脱敏说明（S.2）：
 * - 'initiate_dispute'  发起区域争端（原"宣战" declare_war）
 * - 'control_province'  管控省份（原"占领" occupy）
 */
export type OnboardingTaskType =
  | 'build_building' // 建造建筑（Day1）
  | 'gather_resource' // 采集资源（Day1）
  | 'produce_equipment' // 生产装备（Day2）
  | 'deploy_division' // 部署部队（Day2）
  | 'initiate_dispute' // 发起区域争端（Day3，S.2 脱敏）
  | 'control_province'; // 管控省份（Day3，S.2 脱敏）

/**
 * 任务参数（A.3.1）
 *
 * 按任务类型取用对应字段，未用到的字段省略。
 * 采用扁平结构以兼容 JSON 配置导入（避免联合类型在 JSON 中的判别开销）。
 */
export interface OnboardingTaskParams {
  /** 建筑类型（build_building 任务用） */
  buildingType?: BuildingType;
  /** 资源类型（gather_resource 任务用） */
  resourceType?: ResourceType;
  /** 装备类型标识（produce_equipment 任务用，如 'infantry_kit'） */
  equipmentType?: string;
  /** 目标省份 ID（control_province / initiate_dispute 任务可选） */
  targetProvinceId?: number;
  /** 部队编制标识（deploy_division 任务可选） */
  templateId?: string;
}

/**
 * 任务完成奖励（A.3.1）
 *
 * 数值为 plain number（配置层），应用到 WorldState 时由调用方转为 Fixed。
 */
export interface OnboardingReward {
  /** 政治点奖励 */
  politicalPower: number;
  /** 资源奖励列表 */
  resources: { type: ResourceType; amount: number }[];
}

/**
 * 单个新手引导任务（A.3.1）
 */
export interface OnboardingTask {
  /** 任务 ID（全日唯一，如 'day1_build_civ_factory'） */
  id: string;
  /** 任务类型 */
  type: OnboardingTaskType;
  /** 目标值（如建造 1 座、采集 100 钢铁） */
  target: number;
  /** 任务参数 */
  params: OnboardingTaskParams;
  /** 完成奖励 */
  reward: OnboardingReward;
  /** 引导文案（UI 高亮/气泡用，A.3.4 由 UI 层渲染） */
  guideText: string;
}

/**
 * 配置元信息（人读，不参与运行时逻辑，参考 configs/quick_battle_presets.json 风格）
 */
export interface OnboardingConfigMeta {
  /** 配置版本 */
  version: string;
  /** 配置说明 */
  comment: string;
  /** 参考文档 */
  referenceDoc: string;
  /** 设计目标 */
  designGoal: string;
}

/**
 * 单日引导配置（A.3.1）
 *
 * 对应 configs/onboarding_day{N}.json 的结构。
 */
export interface OnboardingDayConfig {
  /** 配置元信息（人读，可选） */
  _meta?: OnboardingConfigMeta;
  /** 日编号（1 / 2 / 3） */
  day: number;
  /** 日标题（如「资源与工厂」） */
  title: string;
  /** 日描述 */
  description: string;
  /**
   * 解锁触发条件：
   * - 'first_quick_battle_completed'：首局快速对局完成（Day1）
   * - 'day1_completed'：Day1 全部任务完成（Day2）
   * - 'day2_completed'：Day2 全部任务完成（Day3）
   *
   * 实际解锁判定由 OnboardingController.unlockDay 内部规则驱动，
   * 此字段为配置层描述，便于人工核对与平台层校验。
   */
  triggerCondition: 'first_quick_battle_completed' | 'day1_completed' | 'day2_completed';
  /** 本日任务列表 */
  tasks: OnboardingTask[];
  /** 完成本日全部任务后解锁的功能 key 列表（A.3.3） */
  unlocks: string[];
}

/**
 * 新手引导进度（A.3.1）
 *
 * 由 OnboardingController.getProgress 返回，供 UI 渲染与持久化。
 */
export interface OnboardingProgress {
  /** 当前激活日（0 = 未开始，1/2/3 = 对应日已激活） */
  currentDay: 0 | 1 | 2 | 3;
  /** 当前日编号（与 currentDay 同值，plain number 便于序列化持久化） */
  dayNumber: number;
  /** 已完成的任务 ID 列表 */
  completedTaskIds: string[];
  /** 已解锁的功能 key 列表（A.3.3） */
  unlockedFeatures: string[];
}
