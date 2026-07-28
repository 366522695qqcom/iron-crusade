/**
 * Simulation 总入口接口（技术设计文档 4.1）
 *
 * 定义接口契约 + 导出实现类（spec implement-core-simulation）。
 *
 * 确定性约束（技术设计文档 2.4 / 2.5）：
 * - tick 步长固定 100ms（10Hz）
 * - 每 16 帧（1.6s）计算一次 WorldState 哈希
 * - 联机时 hash 不一致触发回滚（≤4 帧前快照重放）
 */
import { WorldState } from '../state/world_state';
import { PlayerAction, GameEvent } from './types';

export type {
  DailyTaskSystem,
  DailyTask,
  DailyTaskReward,
  DailyTaskType,
  DailyTaskPoolEntry,
  DailyTaskPoolConfig,
} from './daily_task';
export { DefaultDailyTaskSystem } from './daily_task';

// spec B.3 联机奖励回流（供联机模块 C 级结算时调用）
export type {
  MultiplayerRewardSystem,
  MultiplayerRewardDetail,
  MultiplayerRewardGranted,
  MultiplayerResult,
} from './multiplayer_reward';
export {
  DefaultMultiplayerRewardSystem,
  MP_VICTORY_PP_REWARD,
  MP_VICTORY_STEEL_REWARD,
  MP_VICTORY_OIL_REWARD,
  MP_DRAW_PP_REWARD,
  MP_DEFEAT_PP_REWARD,
} from './multiplayer_reward';

// 子系统接口契约
export type {
  ResourceSystem,
  BuildingSystem,
  FactorySystem,
  StateManager,
  NewBuildingRequest,
  WorldDiff,
  // spec implement-focus-research T3.1：新增焦点/科研接口与配置类型
  FocusSystem,
  ResearchSystem,
  Focus,
  FocusEffect,
  ResearchLine,
  ResearchNode,
  ResearchBonus,
  DiplomacySystem,
  SupplySystem,
} from './interfaces';

// 子系统实现（spec implement-core-simulation）
export { DefaultResourceSystem } from './resource_system';
export { DefaultBuildingSystem } from './building_system';
export { DefaultFactorySystem } from './factory_system';
export { DefaultStateManager } from './state_manager';
export { DefaultSimulation } from './simulation';
// spec implement-focus-research T1/T2：新增焦点/科研系统实现
export { DefaultFocusSystem } from './focus_system';
export { DefaultResearchSystem } from './research_system';
// M2 外交系统
export { DefaultDiplomacySystem } from './diplomacy_system';
// M2 补给系统
export { DefaultSupplySystem } from './supply_system';

// 确定性哈希（core/state/hash.ts，技术设计文档 C.3）
export type { Encoder } from '../state/hash';
export { serializeWorld, hashWorld } from '../state/hash';

/**
 * 单 tick 推进结果
 */
export interface TickResult {
  /** 当前帧 ID */
  frameId: number;
  /** 该 tick 产生的完成 / 警告 / 失败事件 */
  events: GameEvent[];
  /** 该帧结束时 WorldState 的哈希（FNV-1a 32 位） */
  hash: string;
}

/**
 * 模拟主入口：固定 tick 推演 + 快照 + 哈希
 *
 * - 单机：渲染层 requestAnimationFrame 累积时间触发 N 个 tick（速度 1x/2x/5x）
 * - 联机：Host 每 100ms commit 一帧，所有客户端按 CommittedFrame 触发
 */
export interface Simulation {
  /**
   * 推进一帧
   * @param frameId 当前帧编号
   * @param inputs 该帧的所有玩家动作（已合并）
   * @returns 该帧事件 + 哈希
   */
  tick(frameId: number, inputs: PlayerAction[]): TickResult;

  /** 全量快照（用于联机存档 / drop in） */
  snapshot(): WorldState;

  /** 从快照恢复（用于回滚 / 重连追帧） */
  restore(s: WorldState): void;

  /** 计算 WorldState 哈希（FNV-1a 32 位） */
  hash(): string;
}
