/**
 * 模式切换管理器（spec A 级 - A.1.3）
 *
 * 实现依据：PROJECT.md 3.11 双模式分层 + spec Requirement: 双模式分层
 *
 * 职责：
 * - 切换当前激活模式（quick / classic）
 * - 存档隔离：快速对局与经典存档命名空间分离，互不影响
 * - 新玩家默认进入快速对局模式
 * - 首局快速对局完成后触发经典模式导流（A.1.4）
 *
 * 存档隔离策略：
 * - quick 命名空间：仅 1 个活跃快速对局存档（单局结束即归档为只读历史）
 * - classic 命名空间：3 个存档槽（持续型）
 * - 两套存档分别存储（platform 层 key 前缀 'qb_' / 'classic_'），切换模式不影响对方存档
 */
import type { QuickBattleSave } from './quick_battle';

/** 游戏模式 */
export type GameMode = 'quick' | 'classic';

/**
 * 模式切换管理器接口
 */
export interface ModeManager {
  /** 获取当前激活模式 */
  getCurrentMode(): GameMode;
  /** 切换模式（不影响对方模式存档） */
  switchMode(mode: GameMode): void;
  /** 新玩家首次进入，默认 quick */
  initForNewPlayer(): void;
  /** 判断是否应展示经典模式导流 */
  shouldShowClassicGuide(): boolean;
  /** 标记导流已展示 */
  markClassicGuideShown(): void;
}

/**
 * 默认 ModeManager 实现
 *
 * 存档隔离说明：
 * - 本类仅维护模式状态与导流标记，不直接持有存档对象
 * - 实际存档读写由 QuickBattleMode / ClassicMode 各自负责
 * - platform 持久化层按 'qb_' / 'classic_' key 前缀隔离，保证两种模式存档互不影响
 */
export class DefaultModeManager implements ModeManager {
  /** 当前激活模式，默认 quick（新玩家入口） */
  private currentMode: GameMode = 'quick';
  /** 是否已触发经典模式导流（首局快速对局结算后置 true） */
  private classicGuideTriggered = false;
  /** 导流是否已展示给玩家 */
  private classicGuideShown = false;

  getCurrentMode(): GameMode {
    return this.currentMode;
  }

  /**
   * 切换模式
   * 切换不影响对方模式存档（存档按命名空间隔离，由 platform 层 key 前缀保证）
   */
  switchMode(mode: GameMode): void {
    this.currentMode = mode;
  }

  /**
   * 新玩家首次进入初始化
   * 默认进入快速对局模式（spec Scenario: 新玩家首次进入）
   */
  initForNewPlayer(): void {
    this.currentMode = 'quick';
    this.classicGuideTriggered = false;
    this.classicGuideShown = false;
  }

  /**
   * 通知首局快速对局已结算，触发经典模式导流
   * 由 QuickBattleMode.finish 后调用（A.1.4）
   * @param save 已结算的快速对局存档
   */
  notifyQuickBattleFinished(save: QuickBattleSave): void {
    // 仅当快速对局已结算时触发导流（进行中或未开始不触发）
    if (save.result === null) return;
    this.classicGuideTriggered = true;
  }

  /** 是否应展示经典模式导流：已触发且未展示 */
  shouldShowClassicGuide(): boolean {
    return this.classicGuideTriggered && !this.classicGuideShown;
  }

  /** 标记经典模式导流已展示，重置触发标记 */
  markClassicGuideShown(): void {
    this.classicGuideShown = true;
    this.classicGuideTriggered = false;
  }
}
