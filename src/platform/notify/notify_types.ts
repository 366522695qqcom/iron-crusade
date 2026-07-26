/**
 * 关键事件召回推送 - 共享类型定义（spec A.5）
 *
 * 实现依据：spec `optimize-for-launch` Requirement: 关键事件召回推送
 *           PROJECT.md 3.14 单次会话目标 + 第 9 章审核合规（推送文案脱敏）
 *           技术设计文档 1.5 目录结构 platform/notify/
 *
 * 设计要点：
 * - 推送渠道：抖音订阅消息（需用户授权，spec Requirement）
 * - 触发场景：焦点完成 / 工厂长时间空闲 / 区域争端进展
 * - 推送频率限制：每日 ≤2 条，同 triggerType 4 小时去重（见 notify_scheduler.ts）
 * - 推送点击直达：deepLinkTarget 携带目标界面 ID，UI 层在启动时 decode 并路由（A.5.4）
 *
 * 脱敏约束（spec S.2）：推送文案统一使用「区域争端 / 管控 / 撤离」等脱敏术语，
 * 禁用「宣战 / 占领 / 伤亡」等战争敏感词。
 */

/**
 * 推送触发类型
 * - focus_completed  焦点完成召回
 * - factory_idle      工厂长时间空闲召回
 * - dispute_progress  区域争端进展召回
 */
export type NotifyTriggerType =
  | 'focus_completed'
  | 'factory_idle'
  | 'dispute_progress';

/**
 * 推送点击直达目标界面（A.5.4）
 * - focus_panel    焦点树界面
 * - factory_panel  工厂管理界面
 * - dispute_panel  区域争端界面
 */
export type NotifyDeepLinkTarget =
  | 'focus_panel'
  | 'factory_panel'
  | 'dispute_panel';

/**
 * 推送请求（触发检测产物，交给 NotifyScheduler 调度发送）
 *
 * 字段说明：
 * - templateId       抖音订阅消息模板 ID（由抖音后台配置）
 * - triggerType      触发类型（用于频率去重）
 * - data             模板参数（如 { focusName: '工业扩张', factoryCount: '3' }）
 * - deepLinkTarget   点击直达目标界面 ID（A.5.4，UI 层 decode 后路由）
 * - createdAt        触发时间戳（ms）
 */
export interface NotifyRequest {
  templateId: string;
  triggerType: NotifyTriggerType;
  data: Record<string, string>;
  deepLinkTarget: NotifyDeepLinkTarget;
  createdAt: number;
}

/**
 * 推送发送记录（持久化到 tt.setStorage，用于频率限制统计）
 *
 * 字段说明：
 * - id          记录 ID
 * - request     关联的推送请求
 * - sentAt      发送时间戳（ms）
 * - status      发送状态
 * - failReason  失败原因（status !== 'sent' 时填充）
 */
export interface NotifyRecord {
  id: string;
  request: NotifyRequest;
  sentAt: number;
  status: 'sent' | 'failed' | 'pending';
  failReason?: string;
}

/**
 * 解码 tt.getEnterOptionsSync().query 中的 deepLink 目标界面 ID（A.5.4）
 *
 * UI 层在游戏启动时调用本函数，根据返回值路由到对应界面：
 * - 'focus_panel'    → 打开焦点树界面
 * - 'factory_panel'  → 打开工厂管理界面
 * - 'dispute_panel'  → 打开区域争端界面
 * - null             → 无直达目标，进入默认主界面
 *
 * 同时兼容驼峰 (deepLinkTarget) 与下划线 (deep_link_target) 两种 query key，
 * 以适配不同分发渠道的链接格式。
 *
 * @param query tt.getEnterOptionsSync().query 对象
 * @returns 直达目标界面 ID，无有效值时返回 null
 */
export function decodeDeepLinkTarget(
  query: Record<string, unknown> | undefined | null,
): NotifyDeepLinkTarget | null {
  if (!query) {
    return null;
  }
  const raw: unknown = query.deepLinkTarget ?? query.deep_link_target;
  if (
    raw === 'focus_panel' ||
    raw === 'factory_panel' ||
    raw === 'dispute_panel'
  ) {
    return raw;
  }
  return null;
}
