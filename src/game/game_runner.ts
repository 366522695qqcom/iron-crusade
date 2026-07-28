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
import type { PlayerAction, GameEvent } from '../core/simulation/types';
import type { BuildingType } from '../core/types';
import type { UserInfo } from '../platform/auth';
import { Fixed } from '../core/determinism/fixed';
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
  readWarOverviewShadow,
  readUnitCommandShadow,
  readMapDivisionViews,
  readCombatBubbles,
  getPlayerCountryId,
  pooledMainUiShadow,
  pooledCombatPanel,
  pooledWarOverview,
  pooledUnitCommand,
} from '../render/core/shadow_reader';
import type { FactoryPanelShadow } from '../render/core/shadow_reader';
import type {
  AssistantPanelShadow,
  AssistantOpView,
} from '../render/ui/panels/assistant_panel';
import type { DailyTaskCardView } from '../render/ui/panels/daily_task_panel';
import type { SessionGoalCardView } from '../render/ui/panels/session_goal_card';
import type { UnitCommandAction } from '../render/ui/unit_command_bar';

/** 固定 tick 步长（ms，10Hz） */
const TICK_MS = 100;
/** 单帧最多追 5 tick（防卡顿） */
const MAX_CATCHUP_TICKS = 5;
/** 北京时区偏移（UTC+8，单位 ms） */
const BEIJING_OFFSET_MS = 8 * 60 * 60 * 1000;

/** 建筑类型 → 中文显示名（与 BuildingPanel.BUILDING_TYPES 保持一致） */
const BUILDING_TYPE_LABELS: Record<string, string> = {
  civilian_factory: '民厂',
  military_factory: '军厂',
  dockyard: '船坞',
  infrastructure: '基建',
  mine: '开采井',
  storage: '仓储',
  supply_hub: '补给枢纽',
  fort: '防御工事',
};

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
  private readonly user?: UserInfo;

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
  /** UI触发的待在下一tick执行的动作 */
  private readonly queuedActions: PlayerAction[] = [];
  /** 移动命令模式：true 表示等待玩家点选目标省份 */
  private _moveArmed = false;
  /** 撤退命令模式 */
  private _retreatArmed = false;
  /** 建造放置模式：当前待放置的建筑类型，null 表示非建造模式 */
  private _pendingBuildingType: string | null = null;
  /** 结算弹窗已显示（避免重复弹出） */
  private _gameOverShown = false;

  constructor(
    simulation: Simulation,
    state: WorldState,
    scene: MainScene,
    user?: UserInfo,
    assistant?: AssistantSystem,
    dailyTask?: DailyTaskSystem,
  ) {
    this.simulation = simulation;
    this.state = state;
    this.scene = scene;
    this.user = user;

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
      const actions = this.pendingActions;
      actions.length = 0;
      if (this.queuedActions.length > 0) {
        for (const a of this.queuedActions) actions.push(a);
        this.queuedActions.length = 0;
      }
      const result = this.simulation.tick(this.currentFrameId++, actions);
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
        this.updateDailyTaskProgress(ev);
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

    if (this.state.gameOver && !this._gameOverShown) {
      this._gameOverShown = true;
      this.showGameOverOverlay();
    }
  }

  private showGameOverOverlay(): void {
    const go = this.state.gameOver;
    if (!go) return;
    const winner = this.state.countries.get(go.winnerId);
    const loser = this.state.countries.get(go.loserId);
    const isPlayerWin = go.winnerId === this.countryId;

    const pLoss = this.state.warLosses.get(this.countryId);
    const oLoss = this.state.warLosses.get(isPlayerWin ? go.loserId : go.winnerId);

    let playerVPs = 0;
    let totalVPs = 0;
    this.state.provinces.forEach((p) => {
      if (p.VP > 0) {
        totalVPs += 1;
        if (p.controllerId === this.countryId) playerVPs += 1;
      }
    });

    this.scene.mainUi?.gameOverOverlay?.show({
      winnerId: go.winnerId,
      winnerName: winner?.name ?? go.winnerId,
      loserName: loser?.name ?? go.loserId,
      isPlayerWin,
      durationTicks: go.tickId,
      playerDivsKilled: oLoss?.divisionsLost ?? 0,
      enemyDivsKilled: pLoss?.divisionsLost ?? 0,
      playerProvincesLost: pLoss?.provincesLost ?? 0,
      enemyProvincesLost: oLoss?.provincesLost ?? 0,
      playerControlledVPs: playerVPs,
      totalVPs,
    });
    this.scene.mainUi?.gameOverOverlay?.onAction((action) => {
      if (action === 'restart') {
        const g = globalThis as unknown as { location?: { reload?: () => void } };
        if (g.location && typeof g.location.reload === 'function') {
          g.location.reload();
        }
      } else {
        // TODO: 返回主菜单，接入 ModeManager
      }
    });
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

  /** 获取当前登录用户信息 */
  getUser(): UserInfo | undefined {
    return this.user;
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

    // 战争徽章（顶栏）/ 外交面板战争总览按钮 → 打开战争总面板
    mainUi?.topBar?.onWarBadgeClick(() => {
      mainUi?.toggleWarOverview();
    });
    mainUi?.diplomacyPanel?.onAction((action) => {
      switch (action) {
        case 'warOverview':
          mainUi?.toggleWarOverview();
          break;
        case 'initiateDispute':
          this.initiateDispute();
          break;
        case 'ally':
        case 'trade':
          // M1: ally / trade 留作后续版本
          break;
        default:
          break;
      }
    });

    // 师团命令条：按钮动作 → 入队下一 tick
    mainUi?.onUnitCommand((action) => {
      this.enqueueUnitCommand(action);
    });

    // 地图交互：师团点击 / 省份点击 / 取消选择 / 移动命令
    const mapInteract = mainUi?.mapInteraction;
    if (mapInteract) {
      mapInteract.setPlayerCountryId(this.countryId);
      mapInteract.setMode('select');
      mapInteract.onDivisionClick((divId, additive) => {
        this.cancelMoveMode();
        this.cancelBuildMode();
        this.queuedActions.push({ kind: 'selectUnits', unitIds: [divId], additive });
        mapInteract.setMode('select');
      });
      mapInteract.onCancel(() => {
        if (this._moveArmed || this._retreatArmed) {
          this.cancelMoveMode();
          return;
        }
        if (mapInteract.mode === 'placeBuilding') {
          this.cancelBuildMode();
          return;
        }
        if (this.state.selectedUnitIds.length > 0) {
          this.queuedActions.push({ kind: 'deselectUnits' });
        }
      });
      mapInteract.onMoveOrder((provinceId) => {
        const ids = this.state.selectedUnitIds;
        if (ids.length === 0) {
          this.cancelMoveMode();
          return;
        }
        let reachable = false;
        for (const divId of ids) {
          const div = this.state.divisions.get(divId);
          if (!div || div.ownerId !== this.countryId) continue;
          const cur = this.state.provinces.get(div.currentProvinceId);
          if (cur && cur.adjacentProvinceIds.includes(provinceId)) {
            reachable = true;
            break;
          }
          if (div.currentProvinceId === provinceId) {
            reachable = true;
            break;
          }
        }
        if (!reachable) return;
        if (this._retreatArmed) {
          this.queuedActions.push({ kind: 'orderRetreat', divisionIds: ids.slice(), targetProvinceId: provinceId });
        } else {
          this.queuedActions.push({ kind: 'orderMove', divisionIds: ids.slice(), targetProvinceId: provinceId });
        }
        this.cancelMoveMode();
      });
      mapInteract.onPlaceBuilding((provinceId) => {
        this.onPlaceBuilding(provinceId);
      });
    }

    // 建造面板：点建筑按钮 → 进入/切换待建造类型（已在 placeBuilding 模式）
    mainUi?.buildingPanel?.onBuildingSelect((type) => {
      this._pendingBuildingType = type;
      // 确保处于 placeBuilding 模式
      this.scene.mainUi?.mapView?.showBuildTargets(this.countryId);
      this.scene.mainUi?.mapInteraction?.setMode('placeBuilding');
    });

    // 工厂面板：点空闲民厂 → 自动派去贸易；点军厂 → 派去步枪生产线
    mainUi?.factoryPanel?.onFactorySelect((factoryId) => {
      const f = this.state.factories.get(factoryId);
      if (!f || f.state !== 'idle') return;
      if (f.type === 'civilian') {
        this.queuedActions.push({ kind: 'assignFactory', factoryId, taskId: `trade_${this.countryId}` });
      } else {
        this.queuedActions.push({ kind: 'assignFactory', factoryId, taskId: 'tpl_infantry_equipment' });
      }
    });

    // 焦点面板：选择焦点
    mainUi?.focusPanel?.onFocusPick((focusId) => {
      this.queuedActions.push({ kind: 'pickFocus', focusId });
    });

    // 科研面板：选择科研线
    mainUi?.researchPanel?.onResearchAssign((lineId) => {
      this.queuedActions.push({ kind: 'pickResearch', lineId });
    });

    // 作战面板：画前线/下达攻势/部署部队
    mainUi?.combatPanel?.onAction((action) => {
      switch (action) {
        case 'drawFront':
          this.scene.mainUi?.mapInteraction?.setMode('drawLine');
          break;
        case 'issueOffensive': {
          const ids = this.state.selectedUnitIds;
          if (ids.length === 0) break;
          this.enterMoveMode();
          break;
        }
        case 'deployDivision': {
          const capId = this.state.countries.get(this.countryId)?.capitalProvinceId;
          if (capId != null) {
            this.queuedActions.push({ kind: 'recruitDivision', provinceId: capId });
          }
          break;
        }
        default:
          break;
      }
    });
  }

  /** 进入"下达移动命令"模式：高亮合法目标省份 + 命令条提示 */
  private enterMoveMode(): void {
    if (this._moveArmed) return;
    this.cancelBuildMode();
    this.cancelRetreatModeOnly();
    this._moveArmed = true;
    const ids = this.state.selectedUnitIds;
    this.scene.mainUi?.mapView?.showMoveTargets(ids, this.countryId);
    this.scene.mainUi?.mapInteraction?.setMode('move');
    this.scene.mainUi?.unitCommandBar?.setMoveHint(true);
  }

  /** 进入"撤退命令"模式 */
  private enterRetreatMode(): void {
    if (this._retreatArmed) return;
    this.cancelBuildMode();
    this.cancelMoveModeOnly();
    this._retreatArmed = true;
    const ids = this.state.selectedUnitIds;
    this.scene.mainUi?.mapView?.showMoveTargets(ids, this.countryId);
    this.scene.mainUi?.mapInteraction?.setMode('move');
    this.scene.mainUi?.unitCommandBar?.setMoveHint(true, 'retreat');
  }

  private cancelMoveModeOnly(): void {
    if (!this._moveArmed) return;
    this._moveArmed = false;
    this.scene.mainUi?.mapView?.clearMoveTargets(this.countryId);
    this.scene.mainUi?.mapInteraction?.setMode('select');
    this.scene.mainUi?.unitCommandBar?.setMoveHint(false);
  }

  private cancelRetreatModeOnly(): void {
    if (!this._retreatArmed) return;
    this._retreatArmed = false;
    this.scene.mainUi?.mapView?.clearMoveTargets(this.countryId);
    this.scene.mainUi?.mapInteraction?.setMode('select');
    this.scene.mainUi?.unitCommandBar?.setMoveHint(false);
  }

  /** 退出"下达移动/撤退命令"模式 */
  private cancelMoveMode(): void {
    this.cancelMoveModeOnly();
    this.cancelRetreatModeOnly();
  }

  /** 退出建造放置模式（清空待建类型、关建造面板、清高亮） */
  private cancelBuildMode(): void {
    this._pendingBuildingType = null;
    this.scene.mainUi?.mapView?.clearBuildTargets(this.countryId);
    this.scene.mainUi?.mapInteraction?.setMode('select');
    const ui = this.scene.mainUi;
    if (ui?.buildingPanel?.isShown) ui.buildingPanel.hide();
  }

  /**
   * 发起区域争端（M1极简实现）：
   * - 争端决心≥0.6 才可发起
   * - 自动选择第一个与己方省份接壤的非己控制国作为目标
   * - 若已经与该国处于争端中则忽略
   */
  private initiateDispute(): void {
    const me = this.state.countries.get(this.countryId);
    if (!me) return;
    const myResolve = me.disputeResolve.toNumber();
    if (myResolve < 0.6) return;

    // 收集己方控制省份的所有相邻省份控制方国家
    const myProvinces = new Set<number>();
    const neighborCountries = new Set<string>();
    this.state.provinces.forEach((p) => {
      if (p.controllerId === this.countryId) myProvinces.add(p.id);
    });
    myProvinces.forEach((pid) => {
      const p = this.state.provinces.get(pid);
      if (!p) return;
      for (const adjId of p.adjacentProvinceIds) {
        const adj = this.state.provinces.get(adjId);
        if (!adj) continue;
        if (adj.controllerId !== this.countryId) neighborCountries.add(adj.controllerId);
      }
    });

    // 过滤掉已经处于争端中的国家
    for (const targetId of neighborCountries) {
      let alreadyAtWar = false;
      this.state.disputes.forEach((d) => {
        if (alreadyAtWar) return;
        if (d.participantSet.has(this.countryId) && d.participantSet.has(targetId)) {
          alreadyAtWar = true;
        }
      });
      if (alreadyAtWar) continue;
      this.queuedActions.push({ kind: 'initiateDispute', targetCountryId: targetId });
      return;
    }
  }

  /**
   * 建造放置：在指定省份放置当前选中的建筑。
   * - 必须先通过 BuildingPanel 选择建筑类型
   * - 目标省份必须由己方控制且有空闲槽位（命中层已过滤，但此处再做一次保护）
   * - 投入 1 个民用工厂，保持在 placeBuilding 模式以支持连续放置
   */
  private onPlaceBuilding(provinceId: number): void {
    const type = this._pendingBuildingType;
    if (!type) return;
    const prov = this.state.provinces.get(provinceId);
    if (!prov || prov.controllerId !== this.countryId) return;
    let used = 0;
    this.state.buildings.forEach((b) => {
      if (b.provinceId === provinceId) used++;
    });
    if (used >= prov.buildingSlots) return;
    this.queuedActions.push({
      kind: 'placeBuilding',
      type: type as BuildingType,
      provinceId,
      factoryCount: 1,
    });
  }

  /** 将师团命令条按钮动作转换为 PlayerAction 入队 */
  private enqueueUnitCommand(action: UnitCommandAction): void {
    const ids = this.state.selectedUnitIds;
    switch (action) {
      case 'stop':
        if (!ids || ids.length === 0) return;
        this.queuedActions.push({ kind: 'orderStop', divisionIds: ids.slice() });
        this.cancelMoveMode();
        this.cancelBuildMode();
        break;
      case 'split':
        if (ids && ids.length === 1) {
          this.queuedActions.push({ kind: 'orderSplitDivision', divisionId: ids[0] });
        }
        break;
      case 'merge':
        if (ids && ids.length >= 2) {
          this.queuedActions.push({ kind: 'orderMergeDivisions', divisionIds: ids.slice() });
        }
        break;
      case 'move':
        if (ids && ids.length > 0) {
          this.enterMoveMode();
        }
        break;
      case 'attack':
      case 'assault':
        if (ids && ids.length > 0) {
          this.enterMoveMode();
        }
        break;
      case 'retreat':
        if (ids && ids.length > 0) {
          this.enterRetreatMode();
        }
        break;
      case 'selectAll': {
        const allIds: number[] = [];
        this.state.divisions.forEach((d) => {
          if (d.ownerId === this.countryId && d.status !== 'training') allIds.push(d.id);
        });
        if (allIds.length > 0) {
          this.cancelMoveMode();
          this.cancelBuildMode();
          this.queuedActions.push({ kind: 'selectUnits', unitIds: allIds });
        }
        break;
      }
      case 'deselect':
        this.cancelMoveMode();
        this.cancelBuildMode();
        this.queuedActions.push({ kind: 'deselectUnits' });
        break;
      default:
        break;
    }
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

    // M1 feature-grand-war UI shadows
    readWarOverviewShadow(this.state, this.countryId, pooledWarOverview);
    this.scene.mainUi?.updateWarOverview(pooledWarOverview);
    readUnitCommandShadow(this.state, this.countryId, pooledUnitCommand);
    this.scene.mainUi?.updateUnitCommand(pooledUnitCommand);
    const playerId = getPlayerCountryId(this.state) ?? this.countryId;
    const divisions = readMapDivisionViews(this.state, playerId);
    this.scene.mainUi?.updateMapDivisions(divisions, playerId);
    const bubbles = readCombatBubbles(this.state, playerId);
    this.scene.mainUi?.updateCombatBubbles(bubbles);

    // 顶栏战争徽章状态
    if (pooledWarOverview.atWar) {
      this.scene.mainUi?.topBar?.updateWarBadge(true, pooledWarOverview.enemySide.surrenderProgress);
    } else {
      this.scene.mainUi?.topBar?.updateWarBadge(false, 0);
    }

    // 建造面板：可用民厂 + 建造队列
    const buildingPanel = this.scene.mainUi?.buildingPanel;
    if (buildingPanel) {
      // 统计己方省份上建成的民厂（非建造中）
      const playerCivIds = new Set<number>();
      this.state.factories.forEach((f) => {
        if (f.type !== 'civilian' || f.state === 'construction') return;
        const p = this.state.provinces.get(f.provinceId);
        if (!p) return;
        if (p.ownerId === this.countryId || p.controllerId === this.countryId) {
          playerCivIds.add(f.id);
        }
      });
      const totalCiv = playerCivIds.size;
      const queue = this.state.constructionQueues.get(this.countryId);
      const queueItems: { id: string; type: string; progress: number }[] = [];
      let assignedCiv = 0;
      if (queue) {
        for (let i = 0; i < Math.min(queue.items.length, 3); i++) {
          const it = queue.items[i];
          for (const fid of it.assignedFactoryIds) if (playerCivIds.has(fid)) assignedCiv++;
          queueItems.push({
            id: it.id,
            type: BUILDING_TYPE_LABELS[it.buildingType] ?? it.buildingType,
            progress: it.progress.toNumber(),
          });
        }
      }
      buildingPanel.updateCivilianCount(Math.max(0, totalCiv - assignedCiv));
      buildingPanel.updateConstructionQueue(queueItems);
    }
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

  /**
   * 根据 GameEvent 自动推进每日任务进度
   *
   * 规则：
   * - buildingCompleted → build 类任务进度 +1
   * - productionCompleted → produce 类任务进度 +1（每次生产完成事件）
   * - provinceControlled（玩家） → combat 类任务进度 +1
   * - initiateDispute（玩家） → combat 类任务进度 +1
   * - warStarted（含投降信息）→ combat 类任务进度 +1
   */
  private updateDailyTaskProgress(ev: GameEvent): void {
    const tasks = this.dailyTask.getActiveTasks();
    const incBy = (type: string, delta: Fixed): void => {
      for (const t of tasks) {
        if (t.type !== type || t.completed) continue;
        this.dailyTask.updateProgress(this.state, t.id, t.progress.add(delta));
      }
    };

    switch (ev.kind) {
      case 'buildingCompleted': {
        const prov = this.state.provinces.get(ev.provinceId);
        if (prov && prov.controllerId === this.countryId) {
          incBy('build', Fixed.ONE);
        }
        break;
      }
      case 'productionCompleted':
        if (ev.countryId === this.countryId) {
          incBy('produce', Fixed.ONE);
        }
        break;
      case 'provinceControlled':
        if (ev.byCountryId === this.countryId) {
          incBy('combat', Fixed.ONE);
        }
        break;
      case 'warStarted':
        if (ev.relatedIds.attackerId === this.countryId) {
          incBy('combat', Fixed.ONE);
        }
        break;
      case 'surrendered': {
        const dispute = this.state.disputes.get(ev.disputeId);
        if (dispute) {
          const winner = dispute.participants.find((p) => p !== ev.countryId);
          if (winner === this.countryId) {
            incBy('combat', Fixed.ONE);
          }
        }
        break;
      }
      default:
        break;
    }
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
