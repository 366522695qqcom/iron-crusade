/**
 * 关键事件召回推送 - 模块出口（spec A.5）
 *
 * 实现依据：spec `optimize-for-launch` Requirement: 关键事件召回推送
 *           技术设计文档 1.5 目录结构 platform/notify/
 *
 * 模块组成：
 * - notify_types.ts      共享类型（NotifyRequest / NotifyRecord / deepLink decode）
 * - douyin_notify.ts     A.5.1 抖音订阅消息封装（授权 / 查询 / 发送）
 * - notify_trigger.ts    A.5.2 触发条件检测（焦点完成 / 工厂空闲 / 区域争端）
 * - notify_scheduler.ts  A.5.3 频率限制与调度（每日 ≤2 条 + 同类型 4h 去重）
 *
 * 使用示例：
 * ```ts
 * import {
 *   DefaultDouyinNotifyChannel,
 *   DefaultNotifyScheduler,
 *   DefaultNotifyTriggerDetector,
 * } from '@/platform/notify';
 *
 * const channel = new DefaultDouyinNotifyChannel();
 * const scheduler = new DefaultNotifyScheduler(channel);
 * const detector = new DefaultNotifyTriggerDetector();
 *
 * // 事件触发
 * const req = detector.onGameEvent(event, state, playerCountryId);
 * if (req) await scheduler.schedule(req);
 * ```
 */
export type {
  NotifyTriggerType,
  NotifyDeepLinkTarget,
  NotifyRequest,
  NotifyRecord,
} from './notify_types';
export { decodeDeepLinkTarget } from './notify_types';

export type { SubscribeAuthStatus, DouyinNotifyChannel } from './douyin_notify';
export { DefaultDouyinNotifyChannel } from './douyin_notify';

export type { NotifyTriggerDetector } from './notify_trigger';
export {
  DefaultNotifyTriggerDetector,
  FACTORY_IDLE_THRESHOLD_TICKS,
  TEMPLATE_ID_FOCUS,
  TEMPLATE_ID_FACTORY,
  TEMPLATE_ID_DISPUTE,
} from './notify_trigger';

export type { NotifyScheduler } from './notify_scheduler';
export {
  DefaultNotifyScheduler,
  DAILY_LIMIT,
  SAME_TYPE_DEDUP_MS,
  NOTIFY_HISTORY_KEY,
} from './notify_scheduler';
