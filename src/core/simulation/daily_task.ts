/**
 * 每日任务接口（spec B 级 - B.1）
 *
 * 仅定义接口契约，实现由 B.1.x 任务完成。
 *
 * 设计要点（spec Requirement: 每日任务体系）：
 * - 每日 3 个小任务：建造类 / 生产类 / 作战类各 1
 * - 完成奖励：政治点 / 资源 / 临时 buff
 * - 任务每日北京时间 0:00 刷新，未完成不累计
 * - 主界面显示任务进度条
 */
import { Fixed } from '../determinism/fixed';
import { PRNG } from '../determinism/prng';
import { WorldState } from '../state/world_state';
import { ResourceType } from '../types';
import { applyReward } from '../../game/session/reward_applier';

/** 每日任务类型 */
export type DailyTaskType =
  | 'build'    // 建造类（如：建造 1 座民厂）
  | 'produce'  // 生产类（如：完成 50 单位装备生产）
  | 'combat';  // 作战类（如：管控 1 个省份 / 撤离 1 个敌方单位，S.2 脱敏）

/** 每日任务池条目 */
export interface DailyTaskPoolEntry {
  /** 任务池内 ID */
  id: string;
  /** 任务标题 */
  title: string;
  /** 目标值 */
  target: number;
  /** 任务参数（具体参数由调用方解析） */
  params: Record<string, unknown>;
  /** 奖励 */
  reward: {
    politicalPower: number;
    resources: { type: ResourceType; amount: number }[];
    buffId?: string;
  };
}

/** 每日任务池配置 */
export interface DailyTaskPoolConfig {
  build: DailyTaskPoolEntry[];
  produce: DailyTaskPoolEntry[];
  combat: DailyTaskPoolEntry[];
}

/** 每日任务奖励 */
export interface DailyTaskReward {
  /** 政治点奖励 */
  politicalPower: Fixed;
  /** 资源奖励（资源类型 → 数量） */
  resources: { type: ResourceType; amount: Fixed }[];
  /** 临时 buff ID（可选，由实现细化效果） */
  buffId?: string;
}

/** 每日任务状态 */
export interface DailyTask {
  /** 任务 ID */
  id: string;
  /** 任务类型 */
  type: DailyTaskType;
  /** 任务标题（如「今日建造 - 民用工厂」） */
  title: string;
  /** 目标进度 */
  target: Fixed;
  /** 当前进度 */
  progress: Fixed;
  /** 完成奖励 */
  reward: DailyTaskReward;
  /** 是否已完成（已领取奖励） */
  completed: boolean;
  /** 日期 key（如 '2026-07-23'，北京时间） */
  dateKey: string;
}

/**
 * 每日任务系统接口
 *
 * 注：本接口仅描述能力契约，刷新 / 进度 / 完成 / 奖励发放由实现细化。
 * 北京时间 0:00 刷新由平台调度触发（platform 层负责时区判定）。
 *
 * 关键规则：
 * - 每日 3 任务（建造 / 生产 / 作战各 1）
 * - 未完成不累计，次日刷新时清空
 */
export interface DailyTaskSystem {
  /**
   * 刷新指定日期的每日任务
   * @param state 全局状态
   * @param dateKey 日期 key（如 '2026-07-23'，北京时间）
   * @returns 当日 3 个任务（建造 / 生产 / 作战各 1）
   */
  refresh(state: WorldState, dateKey: string): DailyTask[];

  /**
   * 更新任务进度
   * @param state 全局状态
   * @param taskId 任务 ID
   * @param progress 新进度值
   */
  updateProgress(state: WorldState, taskId: string, progress: Fixed): void;

  /**
   * 完成任务并发放奖励
   * @param state 全局状态
   * @param taskId 任务 ID
   * @returns 奖励详情
   */
  complete(state: WorldState, taskId: string): DailyTaskReward;

  /** 查询当前激活的每日任务（未完成且未过期） */
  getActiveTasks(): DailyTask[];
}

/** 北京时区偏移（UTC+8，单位 ms） */
const BEIJING_OFFSET_MS = 8 * 60 * 60 * 1000;

/** 默认任务池（与 configs/daily_tasks.json 保持一致） */
const DEFAULT_POOLS: DailyTaskPoolConfig = {
  build: [
    {
      id: 'build_civ_factory_1',
      title: '今日建造 - 民用工厂',
      target: 1,
      params: { buildingType: 'civilian_factory' },
      reward: { politicalPower: 15, resources: [{ type: 'steel', amount: 30 }] },
    },
    {
      id: 'build_mil_factory_1',
      title: '今日建造 - 军用工厂',
      target: 1,
      params: { buildingType: 'military_factory' },
      reward: { politicalPower: 20, resources: [{ type: 'steel', amount: 40 }, { type: 'tungsten', amount: 15 }] },
    },
    {
      id: 'upgrade_factory_2',
      title: '今日建造 - 升级工厂',
      target: 2,
      params: { action: 'upgrade_factory' },
      reward: { politicalPower: 25, resources: [{ type: 'oil', amount: 50 }] },
    },
  ],
  produce: [
    {
      id: 'produce_equipment_50',
      title: '今日生产 - 装备制造',
      target: 50,
      params: { action: 'produce_equipment' },
      reward: { politicalPower: 15, resources: [{ type: 'steel', amount: 25 }, { type: 'tungsten', amount: 10 }] },
    },
    {
      id: 'assign_factory_3',
      title: '今日生产 - 工厂分配',
      target: 3,
      params: { action: 'assign_factory' },
      reward: { politicalPower: 10, resources: [{ type: 'oil', amount: 30 }] },
    },
    {
      id: 'trade_steel_100',
      title: '今日生产 - 资源贸易',
      target: 100,
      params: { resourceType: 'steel', action: 'trade' },
      reward: { politicalPower: 20, resources: [{ type: 'rubber', amount: 20 }, { type: 'aluminum', amount: 20 }] },
    },
  ],
  combat: [
    {
      id: 'control_province_1',
      title: '今日争端 - 省份管控',
      target: 1,
      params: { eventType: 'provinceControlled', action: 'control_province' },
      reward: { politicalPower: 30, resources: [{ type: 'steel', amount: 50 }, { type: 'oil', amount: 40 }] },
    },
    {
      id: 'initiate_dispute_1',
      title: '今日争端 - 发起区域争端',
      target: 1,
      params: { actionType: 'initiateDispute', action: 'initiate_dispute' },
      reward: { politicalPower: 25, resources: [{ type: 'tungsten', amount: 30 }] },
    },
    {
      id: 'dispute_resolved_1',
      title: '今日争端 - 争端结算',
      target: 1,
      params: { eventType: 'disputeResolved', action: 'dispute_resolved' },
      reward: { politicalPower: 40, resources: [{ type: 'steel', amount: 60 }, { type: 'oil', amount: 50 }, { type: 'aluminum', amount: 25 }] },
    },
  ],
};

/**
 * 从 dateKey 字符串和全局 seed 派生确定性 PRNG 种子
 *
 * 算法：将 dateKey 每个字符的 charCode 进行累加和异或混合，再与 state.seed 组合。
 * 保证同一 (dateKey, state.seed) 始终产生相同种子，禁止 Math.random。
 */
function seedFromDate(dateKey: string, globalSeed: number): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < dateKey.length; i++) {
    h ^= dateKey.charCodeAt(i);
    h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) | 0;
  }
  h = (h ^ globalSeed) | 0;
  return h >>> 0;
}

/**
 * 默认每日任务系统实现（spec B.1.2 / B.1.3）
 *
 * 实现要点：
 * - 每日北京时间 0:00 刷新 3 个任务（建造/生产/作战各 1），从任务池随机选取
 * - 随机使用 PRNG（从 state.seed + dateKey 派生确定性种子），禁止 Math.random
 * - 数值计算全部使用 Fixed，禁止裸 number 数学
 * - updateProgress 达到 target 时标记 completed=true（可领奖），complete() 才真正发放奖励
 * - 未完成任务不累计，refresh 时直接替换 tasks 数组
 * - getActiveTasks() 日期不匹配时返回空数组，提示调用方需要 refresh
 */
export class DefaultDailyTaskSystem implements DailyTaskSystem {
  /** 玩家国家 ID（发放奖励时定位玩家国家） */
  private readonly countryId: string;
  /** 任务池配置 */
  private readonly pools: DailyTaskPoolConfig;
  /** 当前激活的任务列表 */
  private tasks: DailyTask[] = [];
  /** 最近一次 refresh 的日期 key */
  private lastDateKey: string | null = null;
  /** 已领取奖励的任务 ID 集合 */
  private readonly claimedTaskIds = new Set<string>();

  /**
   * @param countryId 玩家国家 ID
   * @param pools 可选自定义任务池配置，不传则使用默认任务池
   */
  constructor(countryId: string, pools?: DailyTaskPoolConfig) {
    this.countryId = countryId;
    this.pools = pools || DEFAULT_POOLS;
  }

  /**
   * 计算北京时间日期 key（如 '2026-07-24'）
   *
   * 算法与 platform/notify/notify_scheduler.ts 保持一致：
   * 加上 UTC+8 偏移后取 UTC 年月日，不受运行设备本地时区影响。
   */
  static beijingDateKey(ms: number): string {
    const beijing = new Date(ms + BEIJING_OFFSET_MS);
    const y = beijing.getUTCFullYear();
    const m = String(beijing.getUTCMonth() + 1).padStart(2, '0');
    const d = String(beijing.getUTCDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  /**
   * 检查是否需要刷新，若日期已变则自动 refresh
   * @param state 全局状态
   * @param nowMs 当前时间戳（ms）
   * @returns 当前激活的任务列表
   */
  checkRefresh(state: WorldState, nowMs: number): DailyTask[] {
    const currentDateKey = DefaultDailyTaskSystem.beijingDateKey(nowMs);
    if (this.lastDateKey !== currentDateKey) {
      return this.refresh(state, currentDateKey);
    }
    return this.getActiveTasks();
  }

  refresh(state: WorldState, dateKey: string): DailyTask[] {
    if (this.lastDateKey === dateKey && this.tasks.length > 0) {
      return this.tasks.slice();
    }

    this.lastDateKey = dateKey;
    this.tasks = [];
    this.claimedTaskIds.clear();

    const seed = seedFromDate(dateKey, state.seed);
    const prng = new PRNG(seed);

    const types: DailyTaskType[] = ['build', 'produce', 'combat'];
    for (const type of types) {
      const pool = this.pools[type];
      if (pool.length === 0) continue;
      const idx = prng.nextInt(pool.length);
      const entry = pool[idx];

      const rewardResources = entry.reward.resources.map((r) => ({
        type: r.type,
        amount: Fixed.fromInt(r.amount),
      }));

      const task: DailyTask = {
        id: `daily_${dateKey}_${type}`,
        type,
        title: entry.title,
        target: Fixed.fromInt(entry.target),
        progress: Fixed.ZERO,
        reward: {
          politicalPower: Fixed.fromInt(entry.reward.politicalPower),
          resources: rewardResources,
          buffId: entry.reward.buffId,
        },
        completed: false,
        dateKey,
      };
      this.tasks.push(task);
    }

    return this.tasks.slice();
  }

  updateProgress(_state: WorldState, taskId: string, progress: Fixed): void {
    const task = this.tasks.find((t) => t.id === taskId);
    if (!task) return;
    if (task.dateKey !== this.lastDateKey) return;

    task.progress = progress.min(task.target);
    if (task.progress.greaterOrEqual(task.target) && !task.completed) {
      task.completed = true;
    }
  }

  complete(state: WorldState, taskId: string): DailyTaskReward {
    const zeroReward: DailyTaskReward = {
      politicalPower: Fixed.ZERO,
      resources: [],
    };

    const task = this.tasks.find((t) => t.id === taskId);
    if (!task) return zeroReward;
    if (task.dateKey !== this.lastDateKey) return zeroReward;
    if (!task.completed) return zeroReward;
    if (this.claimedTaskIds.has(taskId)) return zeroReward;

    this.claimedTaskIds.add(taskId);

    const resourcesMap: Partial<Record<ResourceType, Fixed>> = {};
    for (const r of task.reward.resources) {
      resourcesMap[r.type] = r.amount;
    }
    applyReward(state, this.countryId, {
      political: task.reward.politicalPower,
      resources: resourcesMap,
    });

    const country = state.countries.get(this.countryId);
    if (country) {
      country.politicalPower = country.politicalPower.add(task.reward.politicalPower);
    }

    if (task.reward.buffId) {
      // buff 效果留给后续系统实现，本版本仅记录
    }

    return {
      politicalPower: task.reward.politicalPower,
      resources: task.reward.resources.slice(),
      buffId: task.reward.buffId,
    };
  }

  getActiveTasks(): DailyTask[] {
    if (!this.lastDateKey) return [];
    return this.tasks.slice();
  }
}
