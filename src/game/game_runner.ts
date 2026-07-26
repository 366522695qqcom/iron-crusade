/**
 * 游戏运行时桥接层（game/game_runner.ts）
 *
 * 实现依据：
 * - 技术设计文档 1.4 单 tick 数据流：core → 影子 → 渲染
 * - 技术设计文档 1.5 目录结构：game/ 层负责装配 core/ 与 render/
 *
 * 职责：
 * - 持有 Simulation + AssistantSystem + DailyTaskSystem + SessionGoalTracker
 * - 提供 stepFrame(dtMs)：累积时间 → 触发 N 个 tick → 推送影子到 MainScene
 * - 桥接 UI 回调到 core/ 系统：
 *   - 助理开关 / 撤销（assistant_panel）
 *   - 每日任务领奖（daily_task_panel）
 *   - 会话目标领奖（session_goal_card）
 * - 每日任务自动刷新检测（北京时间 0:00 切日）
 *
 * 不在本范围：
 * - 存档加载 / 新建存档（由 game/modes/ 负责，runner 接收已就绪的 WorldState）
 * - 联机（C 级，单机 runner 不含联机逻辑）
 */
import type { Simulation } from '../core/simulation';
import type { WorldState } from '../core/state/world_state';
import type { PlayerAction } from '../core/simulation/types';
import {
  AssistantSystem,
  DefaultAssistantSystem,
} from '../core/simulation/assistant';
import {
  DailyTaskSystem,
  DailyTask,
  DefaultDailyTaskSystem,
} from '../core/simulation/daily_task';
import {
  SessionGoalTracker,
  DefaultSessionGoalTracker,
} from './session/session_goal_tracker';
import {
  DefaultSessionGoalGenerator,
} from './session/session_goal';
import type { MainScene } from '../render/main_scene';
import {
  readMainUiShadow,
  readCombatPanelShadow,
  getPlayerCountryId,
  pooledMainUiShadow,
  pooledCombatPanel,
} from '../render/core/shadow_reader';
import type { FactoryPanelShadow } from '../render/core/shadow_reader';
import type {
  AssistantPanelShadow,
  AssistantOpView,
} from '../render/ui/panels/assistant_panel';
import type { DailyTaskCardView } from '../render/ui/panels/daily_task_panel';
import type { SessionGoalCardView } from '../render/ui/panels/session_goal_card';

/** 固定 tick 步长（ms，10Hz） */
const TICK_MS = 100;
/** 单帧最多追 5 tick（防卡顿） */
const MAX_CATCHUP_TICKS = 5;
/** 北京时区偏移（UTC+8，单位 ms） */
const BEIJING_OFFSET_MS = 8 * 60 * 60 * 1000;

/**
 * 游戏运行时
 *
 * 单机模式下由 main.ts 持有一个实例，每帧调用 stepFrame(dtMs)。
 */
export class GameRunner {
  private readonly simulation: Simulation;
  private readonly state: WorldState;
  private readonly assistant: AssistantSystem;
  private readonly dailyTask: DailyTaskSystem;
  private readonly sessionTracker: SessionGoalTracker;
  private readonly scene: MainScene;
  private readonly countryId: string;

  /** 当前游戏速度（0=暂停 / 1 / 2 / 5） */
  private speed: 0 | 1 | 2 | 5 = 1;
  /** 累积时间（ms） */
  private accumulator = 0;
  /** 当前帧 ID */
  private currentFrameId = 0;
  /** 上一次每日任务 dateKey（用于切日检测） */
  private lastDateKey = '';
  /** 助理是否已开启（与 assistant_panel 双向同步） */
  private assistantEnabled = false;
  /** 复用 pendingActions 数组，避免每帧分配 */
  private readonly pendingActions: PlayerAction[] = [];

  constructor(
    simulation: Simulation,
    state: WorldState,
    scene: MainScene,
    assistant?: AssistantSystem,
    dailyTask?: DailyTaskSystem,
  ) {
    this.simulation = simulation;
    this.state = state;
    this.scene = scene;

    const countryId = getPlayerCountryId(state);
    if (!countryId) {
      throw new Error('GameRunner: WorldState 中未找到 isPlayer=true 的国家');
    }
    this.countryId = countryId;

    this.assistant = assistant ?? new DefaultAssistantSystem();
    this.dailyTask = dailyTask ?? new DefaultDailyTaskSystem(this.countryId);

    // 会话目标追踪器：用 SessionGoalGenerator 生成 3 个目标
    this.sessionTracker = new DefaultSessionGoalTracker(state, countryId);
    const generator = new DefaultSessionGoalGenerator();
    this.sessionTracker.setGoals(generator.generateGoals(state, countryId));

    // 首次刷新每日任务（按当前北京时间）
    const todayKey = beijingDateKey(Date.now());
    this.dailyTask.refresh(state, todayKey);
    this.lastDateKey = todayKey;

    this.bindUiCallbacks();
  }

  /**
   * 每帧推进（由 main.ts RAF 调用）
   *
   * 流程：
   * 1. 累积时间（按 speed 倍率）
   * 2. 触发 N 个 tick（单帧上限 5）
   * 3. 检测北京时间切日 → 刷新每日任务
   * 4. 检查会话目标完成
   * 5. 推送影子到 MainScene
   */
  stepFrame(dtMs: number): void {
    if (this.speed === 0) {
      this.pushShadows();
      return;
    }

    this.accumulator += dtMs * this.speed;
    let processed = 0;
    this.pendingActions.length = 0;
    while (this.accumulator >= TICK_MS && processed < MAX_CATCHUP_TICKS) {
      const result = this.simulation.tick(this.currentFrameId++, this.pendingActions);
      this.pendingActions.length = 0;
      this.accumulator -= TICK_MS;
      processed++;

      // 助理自动操作（单次 tickAndApply 替代三次 auto 调用，避免行为树重复执行）
      if (this.assistantEnabled) {
        this.assistant.tickAndApply(this.state, this.countryId);
      }

      // 会话目标进度（基于 tick 事件；action 驱动的目标由 UI 回调直接触发）
      for (const ev of result.events) {
        this.sessionTracker.updateProgress(ev as unknown as PlayerAction);
      }
      this.sessionTracker.checkCompletion();
    }
    if (this.accumulator > TICK_MS * MAX_CATCHUP_TICKS) {
      this.accumulator = 0;
    }

    // 切日检测
    const todayKey = beijingDateKey(Date.now());
    if (todayKey !== this.lastDateKey) {
      this.lastDateKey = todayKey;
      this.dailyTask.refresh(this.state, todayKey);
    }

    this.pushShadows();
  }

  /** 设置游戏速度 */
  setSpeed(speed: 0 | 1 | 2 | 5): void {
    this.speed = speed;
  }

  /** 获取当前速度 */
  getSpeed(): 0 | 1 | 2 | 5 {
    return this.speed;
  }

  /** 获取玩家国家 ID */
  getCountryId(): string {
    return this.countryId;
  }

  // ----- 内部方法 -----

  /** 绑定 UI 回调到 MainScene 的子组件 */
  private bindUiCallbacks(): void {
    const mainUi = this.scene.mainUi;

    // 助理开关 / 撤销
    mainUi?.assistantPanel?.onToggle((action) => {
      if (action === 'enable') {
        this.assistant.enable(this.state, this.countryId);
        this.assistantEnabled = true;
      } else {
        this.assistant.disable(this.state, this.countryId);
        this.assistantEnabled = false;
      }
    });
    mainUi?.assistantPanel?.onUndo((operationId) => {
      this.assistant.undo(operationId);
    });

    // 每日任务领奖
    mainUi?.dailyTaskPanel?.onClaim((taskId) => {
      this.dailyTask.complete(this.state, taskId);
    });

    // 会话目标领奖
    mainUi?.sessionGoalCard?.onClaim((goalId) => {
      this.sessionTracker.claimReward(goalId, this.state);
    });
  }

  /** 推送所有影子到 MainScene */
  private pushShadows(): void {
    readMainUiShadow(this.state, this.countryId, pooledMainUiShadow);
    this.scene.update(pooledMainUiShadow);

    this.scene.mainUi?.updateAssistant(this.buildAssistantShadow(pooledMainUiShadow.factory));

    this.scene.mainUi?.updateDailyTasks(
      this.lastDateKey,
      this.buildDailyTaskViews(),
    );

    this.scene.mainUi?.sessionGoalCard?.updateGoals(this.buildSessionGoalViews());

    readCombatPanelShadow(this.state, this.countryId, pooledCombatPanel);
    this.scene.mainUi?.updateCombat(pooledCombatPanel);
  }

  /** 构造助理面板影子（复用 FactoryPanelShadow 消除重复遍历） */
  private buildAssistantShadow(factoryShadow: FactoryPanelShadow): AssistantPanelShadow {
    const ops = this.assistant.getOperationLog();
    const recentOps: AssistantOpView[] = ops.slice(-4).reverse().map((op) => ({
      operationId: op.id,
      typeLabel: ASSISTANT_OP_LABELS[op.type] ?? op.type,
      summary: op.details.reason,
      canUndo: op.rollback !== undefined,
    }));

    const idleCount = factoryShadow.idleCount;
    const pendingSupply = 0;
    const pendingDefense = 0;

    return {
      enabled: this.assistantEnabled,
      assignedFactoryCount: this.countAssignedFactories(),
      idleFactoryCount: idleCount,
      pendingSupplyCount: pendingSupply,
      pendingDefenseCount: pendingDefense,
      recentOps,
    };
  }

  /** 统计已分配到建造队列的工厂数 */
  private countAssignedFactories(): number {
    const queue = this.state.constructionQueues.get(this.countryId);
    if (!queue) return 0;
    let count = 0;
    for (const item of queue.items) {
      count += item.assignedFactoryIds.length;
    }
    return count;
  }

  /** 构造每日任务卡视图 */
  private buildDailyTaskViews(): DailyTaskCardView[] {
    const tasks = this.dailyTask.getActiveTasks();
    return tasks.map((t) => this.dailyTaskToView(t));
  }

  /** DailyTask → DailyTaskCardView */
  private dailyTaskToView(t: DailyTask): DailyTaskCardView {
    const target = t.target.toNumber();
    const current = t.progress.toNumber();
    const ratio = target > 0 ? Math.min(1, current / target) : 0;
    const completed = current >= target;
    const rewardSummary = formatReward(t);
    return {
      taskId: t.id,
      type: t.type,
      title: t.title,
      current: Math.round(current),
      target: Math.round(target),
      ratio,
      completed,
      claimed: t.completed,
      rewardSummary,
    };
  }

  /** 构造会话目标卡视图 */
  private buildSessionGoalViews(): SessionGoalCardView[] {
    const goals = this.sessionTracker.getGoals();
    return goals.map((g) => ({
      goalId: g.goalId,
      description: g.description,
      current: g.current,
      target: g.target,
      rewardSummary: formatSessionReward(g.reward),
      completed: g.completed,
      rewardClaimed: g.rewardClaimed,
    }));
  }
}

/** 格式化会话目标奖励摘要（SessionGoalReward 字段为 Fixed） */
function formatSessionReward(reward: {
  politicalPower: { toNumber(): number };
  resources: { type: string; amount: { toNumber(): number } }[];
}): string {
  const parts: string[] = [];
  const pp = reward.politicalPower.toNumber();
  if (pp > 0) parts.push(`+${Math.round(pp)} 政治`);
  for (const r of reward.resources) {
    parts.push(`+${Math.round(r.amount.toNumber())} ${r.type}`);
  }
  return parts.join(' / ');
}

// ----- 工具函数 -----

/** 计算北京时间日期 key（YYYY-MM-DD） */
function beijingDateKey(timestampMs: number): string {
  const beijing = new Date(timestampMs + BEIJING_OFFSET_MS);
  const y = beijing.getUTCFullYear();
  const m = String(beijing.getUTCMonth() + 1).padStart(2, '0');
  const d = String(beijing.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** 助理操作类型显示名 */
const ASSISTANT_OP_LABELS: Record<string, string> = {
  assign_factory: '分配工厂',
  schedule_supply: '调度补给',
  defend_front: '布防前线',
  trade: '贸易',
  reorder_construction: '重排建造',
};

/** 格式化每日任务奖励摘要 */
function formatReward(t: DailyTask): string {
  const parts: string[] = [];
  const pp = t.reward.politicalPower.toNumber();
  if (pp > 0) parts.push(`+${Math.round(pp)} 政治`);
  for (const r of t.reward.resources) {
    parts.push(`+${Math.round(r.amount.toNumber())} ${r.type}`);
  }
  return parts.join(' / ');
}
