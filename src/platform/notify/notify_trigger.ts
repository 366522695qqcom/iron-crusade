/**
 * 推送触发条件检测（spec A.5.2）
 *
 * 实现依据：spec `optimize-for-launch` Requirement: 关键事件召回推送
 *           spec Scenario: 工厂空闲召回（离线且工厂空闲超过 30 分钟）
 *           spec Requirement: 触发场景（焦点完成 / 工厂长时间空闲 / 遭遇区域争端）
 *
 * 触发规则：
 * - focusCompleted       → 推送「焦点 X 已完成，回游戏领取奖励」
 * - factoryIdle          → durationTicks >= 30min/10Hz = 18000 ticks 时推送
 *                           「N 座工厂空闲，回游戏分配任务」
 * - disputeResolved      → 推送「区域争端有新进展」
 * - provinceControlled   → 推送「区域争端有新进展」
 *
 * 离线场景检测（checkOfflineIdle）：
 * - 玩家离线期间累积的工厂空闲时长 ≥ 30 分钟时触发
 * - 累积空闲时长 = 当前 tick - max(工厂空闲起始 tick, 上次在线 tick)
 *
 * 脱敏约束（spec S.2）：文案统一使用「区域争端」术语，禁用「宣战 / 占领 / 伤亡」。
 *
 * 依赖约束：仅依赖 core/simulation/types 与 core/state/world_state 的类型（type-only import），
 * 不破坏 core/ 确定性约束，不 import cc。
 */
import type { GameEvent } from '../../core/simulation/types';
import type { WorldState, Factory } from '../../core/state/world_state';
import type {
  NotifyRequest,
  NotifyTriggerType,
  NotifyDeepLinkTarget,
} from './notify_types';

/**
 * 工厂空闲推送阈值（ticks）
 *
 * 技术设计文档 2.4：tick 步长固定 100ms（10Hz）。
 * 30 分钟 = 30 * 60 * 1000ms / 100ms = 18000 ticks。
 */
export const FACTORY_IDLE_THRESHOLD_TICKS = 18000;

/**
 * 抖音订阅消息模板 ID 占位常量
 *
 * 实际值由抖音后台模板配置决定，提审前替换为真实 tmplId。
 */
export const TEMPLATE_ID_FOCUS = 'tmpl_focus_completed';
export const TEMPLATE_ID_FACTORY = 'tmpl_factory_idle';
export const TEMPLATE_ID_DISPUTE = 'tmpl_dispute_progress';

/**
 * 推送触发检测接口
 *
 * 监听 GameEvent 与离线场景，产出 NotifyRequest 交给 NotifyScheduler 调度发送。
 */
export interface NotifyTriggerDetector {
  /**
   * 监听 GameEvent，返回推送请求（无则 null）
   * @param event     模拟层产生的事件
   * @param state     全局状态（用于查询工厂归属 / 空闲数量）
   * @param countryId 玩家国家 ID（仅本国事件触发推送）
   * @returns 推送请求，无则 null
   */
  onGameEvent(
    event: GameEvent,
    state: WorldState,
    countryId: string,
  ): NotifyRequest | null;

  /**
   * 离线场景检测：玩家离线期间累积的工厂空闲时长 ≥ 30 分钟时触发
   * @param state       全局状态
   * @param countryId   玩家国家 ID
   * @param lastSeenAt  玩家上次在线的 tick 编号
   * @returns 推送请求，无则 null
   */
  checkOfflineIdle(
    state: WorldState,
    countryId: string,
    lastSeenAt: number,
  ): NotifyRequest | null;
}

/**
 * 默认触发检测实现
 *
 * 工厂归属判定：Factory 仅持有 provinceId，需通过 Province.ownerId 间接判定
 * 是否属于玩家国家。仅玩家本国的工厂空闲 / 焦点完成才触发召回推送。
 */
export class DefaultNotifyTriggerDetector implements NotifyTriggerDetector {
  onGameEvent(
    event: GameEvent,
    state: WorldState,
    countryId: string,
  ): NotifyRequest | null {
    switch (event.kind) {
      case 'focusCompleted':
        // 仅玩家本国焦点完成时推送
        if (event.countryId !== countryId) {
          return null;
        }
        return this.buildFocusRequest(event.focusId);

      case 'factoryIdle':
        // 工厂空闲时长未达 30 分钟阈值：不推送
        if (event.durationTicks < FACTORY_IDLE_THRESHOLD_TICKS) {
          return null;
        }
        // 仅玩家本国工厂触发召回
        if (!this.isPlayerFactory(state, countryId, event.factoryId)) {
          return null;
        }
        return this.buildFactoryRequest(state, countryId);

      case 'disputeResolved':
      case 'provinceControlled':
        // 区域争端有新进展（spec S.2 脱敏：原「战斗结算 / 占领」）
        return this.buildDisputeRequest();

      default:
        // 其余事件（buildingCompleted / resourceDepleted / hashMismatch）不触发召回
        return null;
    }
  }

  checkOfflineIdle(
    state: WorldState,
    countryId: string,
    lastSeenAt: number,
  ): NotifyRequest | null {
    // 统计玩家本国工厂中，离线期间累积空闲时长 ≥ 30 分钟的数量
    let triggeredCount = 0;
    const playerIdleFactories = this.getPlayerIdleFactories(state, countryId);
    for (const f of playerIdleFactories) {
      // 离线期间累积空闲 = 当前 tick - max(空闲起始, 上次在线)
      // - 若工厂在离线前已空闲，累积从 lastSeenAt 起算
      // - 若工厂在离线期间变空闲，累积从 idleSinceTick 起算
      const offlineIdleStart = Math.max(f.idleSinceTick, lastSeenAt);
      const accumulated = state.tickId - offlineIdleStart;
      if (accumulated >= FACTORY_IDLE_THRESHOLD_TICKS) {
        triggeredCount++;
      }
    }
    if (triggeredCount <= 0) {
      return null;
    }
    return this.buildFactoryRequest(state, countryId);
  }

  /**
   * 构建焦点完成推送请求
   * 注：focusId 作为模板参数传入；focusName 的展示名映射由焦点配置层负责
   * （本任务范围不触碰 configs/，此处以 focusId 占位）。
   */
  private buildFocusRequest(focusId: string): NotifyRequest {
    return this.buildRequest(
      TEMPLATE_ID_FOCUS,
      'focus_completed',
      'focus_panel',
      { focusName: focusId },
    );
  }

  /**
   * 构建工厂空闲推送请求
   * 统计玩家本国当前所有空闲工厂数，作为模板参数 factoryCount。
   */
  private buildFactoryRequest(state: WorldState, countryId: string): NotifyRequest {
    const idleCount = this.countPlayerIdleFactories(state, countryId);
    return this.buildRequest(
      TEMPLATE_ID_FACTORY,
      'factory_idle',
      'factory_panel',
      { factoryCount: String(idleCount) },
    );
  }

  /** 构建区域争端进展推送请求（spec S.2 脱敏术语） */
  private buildDisputeRequest(): NotifyRequest {
    return this.buildRequest(
      TEMPLATE_ID_DISPUTE,
      'dispute_progress',
      'dispute_panel',
      {},
    );
  }

  /** 统一构造推送请求，填充 createdAt */
  private buildRequest(
    templateId: string,
    triggerType: NotifyTriggerType,
    deepLinkTarget: NotifyDeepLinkTarget,
    data: Record<string, string>,
  ): NotifyRequest {
    return {
      templateId,
      triggerType,
      data,
      deepLinkTarget,
      createdAt: Date.now(),
    };
  }

  /** 判定指定工厂是否属于玩家国家（通过省份 ownerId 间接判定） */
  private isPlayerFactory(
    state: WorldState,
    countryId: string,
    factoryId: number,
  ): boolean {
    const fac = state.factories.get(factoryId);
    if (!fac) {
      return false;
    }
    const prov = state.provinces.get(fac.provinceId);
    return prov?.ownerId === countryId;
  }

  /** 统计玩家本国当前空闲工厂数 */
  private countPlayerIdleFactories(
    state: WorldState,
    countryId: string,
  ): number {
    let count = 0;
    state.factories.forEach((f) => {
      if (f.state !== 'idle') {
        return;
      }
      const prov = state.provinces.get(f.provinceId);
      if (prov?.ownerId === countryId) {
        count++;
      }
    });
    return count;
  }

  /** 获取玩家本国所有空闲工厂列表 */
  private getPlayerIdleFactories(
    state: WorldState,
    countryId: string,
  ): Factory[] {
    const result: Factory[] = [];
    state.factories.forEach((f) => {
      if (f.state !== 'idle') {
        return;
      }
      const prov = state.provinces.get(f.provinceId);
      if (prov?.ownerId === countryId) {
        result.push(f);
      }
    });
    return result;
  }
}
