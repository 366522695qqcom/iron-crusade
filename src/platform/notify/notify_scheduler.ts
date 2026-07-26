/**
 * 推送频率限制与调度（spec A.5.3）
 *
 * 实现依据：spec `optimize-for-launch` Requirement: 关键事件召回推送
 *           spec Requirement: 推送频率限制（每日 ≤2 条）
 *
 * 频率限制规则：
 * - 每日 ≤ 2 条（硬限制，按北京时间 0:00 切日，与每日任务体系一致）
 * - 同 triggerType 4 小时内不重复（避免焦点连续完成时刷屏）
 * - 用户未授权时不发送（不强制弹窗，spec 隐含）
 *
 * 持久化策略：
 * - 抖音环境使用 tt.setStorage / tt.getStorage 持久化 sentHistory（key: 'notify_history'）
 * - 非 tt 环境 fallback 到内存（仅本次会话有效，重启丢失）
 * - 首次 schedule 时懒加载历史，加载完成后驻留内存
 *
 * 平台隔离：所有 tt API 调用检测 `typeof tt !== 'undefined'`，非抖音环境 fallback 到 noop。
 * 异步：所有 tt API 返回 Promise，不阻塞主线程。不 import cc。
 */
import type { NotifyRequest, NotifyRecord } from './notify_types';
import type { DouyinNotifyChannel } from './douyin_notify';

/** 每日推送上限（spec Requirement: 推送频率限制） */
export const DAILY_LIMIT = 2;

/** 同 triggerType 去重窗口（4 小时，单位 ms） */
export const SAME_TYPE_DEDUP_MS = 4 * 60 * 60 * 1000;

/** 持久化 storage key */
export const NOTIFY_HISTORY_KEY = 'notify_history';

/** 北京时区偏移（UTC+8，单位 ms） */
const BEIJING_OFFSET_MS = 8 * 60 * 60 * 1000;

/** 北京时间一天（ms） */
const ONE_DAY_MS = 24 * 60 * 60 * 1000;

/**
 * 推送调度器接口
 *
 * 接收 NotifyRequest，校验频率限制后通过 DouyinNotifyChannel 发送，并记录发送历史。
 */
export interface NotifyScheduler {
  /**
   * 调度发送一条推送请求
   *
   * 校验顺序：
   * 1. 每日上限（≤2 条）
   * 2. 同 triggerType 4 小时去重
   * 3. 用户授权状态（未授权不发送）
   * 4. 通过 channel 实际发送
   *
   * @param request 推送请求
   * @returns 是否成功发送（被频率限制 / 未授权 / 发送失败均返回 false）
   */
  schedule(request: NotifyRequest): Promise<boolean>;

  /** 查询今日（北京时间）已成功发送数 */
  getTodaySentCount(): number;

  /** 查询发送历史（按时间升序，拷贝） */
  getSentHistory(): NotifyRecord[];
}

/**
 * 默认调度器实现
 *
 * 通过构造函数注入 DouyinNotifyChannel（依赖倒置，便于单测注入 mock）。
 */
export class DefaultNotifyScheduler implements NotifyScheduler {
  private readonly channel: DouyinNotifyChannel;
  /** 内存中的发送历史（已从 storage 加载或本会话新增） */
  private history: NotifyRecord[] = [];
  /** 是否已完成 storage 加载 */
  private loaded = false;
  /** 加载 Promise（防止并发重复加载） */
  private loadPromise: Promise<void> | null = null;
  /** 自增 ID 计数（用于生成记录 ID） */
  private idCounter = 0;

  constructor(channel: DouyinNotifyChannel) {
    this.channel = channel;
  }

  async schedule(request: NotifyRequest): Promise<boolean> {
    await this.ensureLoaded();
    const now = Date.now();

    // 1. 每日上限校验（按北京时间切日）
    if (this.getTodaySentCount() >= DAILY_LIMIT) {
      return false;
    }

    // 2. 同 triggerType 4 小时去重（仅对已成功发送的记录去重）
    const recentSameType = this.history.find(
      (r) =>
        r.request.triggerType === request.triggerType &&
        r.status === 'sent' &&
        now - r.sentAt < SAME_TYPE_DEDUP_MS,
    );
    if (recentSameType) {
      return false;
    }

    // 3. 用户授权校验（未授权不发送，不强制弹窗）
    const authStatus = await this.channel.getAuthorizationStatus(
      request.templateId,
    );
    if (authStatus !== 'accept') {
      return false;
    }

    // 4. 通过渠道发送
    const sentOk = await this.channel.send(request.templateId, request.data);

    const record: NotifyRecord = {
      id: this.genId(now),
      request,
      sentAt: now,
      status: sentOk ? 'sent' : 'failed',
      failReason: sentOk ? undefined : 'send_failed',
    };
    this.history.push(record);
    await this.persist();

    return sentOk;
  }

  getTodaySentCount(): number {
    const todayKey = this.beijingDateKey(Date.now());
    return this.history.filter(
      (r) => r.status === 'sent' && this.beijingDateKey(r.sentAt) === todayKey,
    ).length;
  }

  getSentHistory(): NotifyRecord[] {
    return this.history.slice();
  }

  /**
   * 计算北京时间日期 key（如 '2026-07-23'）
   *
   * 与每日任务体系（daily_task）一致，按北京时间 0:00 切日，
   * 不受运行设备本地时区影响。
   */
  private beijingDateKey(ms: number): string {
    const beijing = new Date(ms + BEIJING_OFFSET_MS);
    const y = beijing.getUTCFullYear();
    const m = String(beijing.getUTCMonth() + 1).padStart(2, '0');
    const d = String(beijing.getUTCDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  /** 生成记录 ID（时间戳 + 自增计数，避免 Math.random） */
  private genId(now: number): string {
    this.idCounter += 1;
    return `${now.toString(36)}-${this.idCounter.toString(36)}`;
  }

  /**
   * 确保历史已从 storage 加载（懒加载，并发安全）
   */
  private ensureLoaded(): Promise<void> {
    if (this.loaded) {
      return Promise.resolve();
    }
    if (!this.loadPromise) {
      this.loadPromise = this.loadFromStorage().then(() => {
        this.loaded = true;
      });
    }
    return this.loadPromise;
  }

  /** 从 tt.getStorage 加载历史；非 tt 环境直接保留内存空数组 */
  private loadFromStorage(): Promise<void> {
    return new Promise<void>((resolve) => {
      if (!this.isDouyin() || typeof tt.getStorage !== 'function') {
        resolve();
        return;
      }
      try {
        tt.getStorage({
          key: NOTIFY_HISTORY_KEY,
          success: (res: { data: unknown }) => {
            const data = res?.data;
            if (Array.isArray(data)) {
              // 仅保留近 7 天的历史，避免 storage 无限增长
              const cutoff = Date.now() - 7 * ONE_DAY_MS;
              this.history = (data as NotifyRecord[]).filter(
                (r) => r && typeof r.sentAt === 'number' && r.sentAt >= cutoff,
              );
            }
            resolve();
          },
          fail: () => resolve(),
        });
      } catch {
        resolve();
      }
    });
  }

  /** 持久化历史到 tt.setStorage；非 tt 环境 noop（仅内存） */
  private persist(): Promise<void> {
    return new Promise<void>((resolve) => {
      if (!this.isDouyin() || typeof tt.setStorage !== 'function') {
        resolve();
        return;
      }
      try {
        tt.setStorage({
          key: NOTIFY_HISTORY_KEY,
          data: this.history,
          success: () => resolve(),
          fail: () => resolve(),
        });
      } catch {
        resolve();
      }
    });
  }

  /** 抖音环境检测 */
  private isDouyin(): boolean {
    return typeof tt !== 'undefined' && tt !== null;
  }
}

// 抖音小游戏 StarkSDK 注入的全局 tt 对象（同 douyin_notify.ts，platform 层共享）。
// 此处 `any` 为平台 SDK 适配的唯一例外（ESLint warn 可接受）。
declare const tt: any;
