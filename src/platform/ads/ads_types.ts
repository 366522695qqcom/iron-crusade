/**
 * 广告位通用类型定义（spec B.2.3）
 *
 * 实现依据：spec `optimize-for-launch` B.2.3 广告位统一管理器
 *
 * 定义广告类型、结果、广告位接口及预定义常量。
 * platform 层独立，不依赖 Cocos，不依赖 core/ 以外的模块。
 */

/** 广告类型枚举 */
export type AdType =
  | 'rewarded_video' // 激励视频
  | 'interstitial'   // 插屏（暂不实现）
  | 'banner';        // Banner（暂不实现）

/** 广告展示结果 */
export type AdResult =
  | 'watched'    // 用户完整观看
  | 'cancelled'  // 用户中途取消
  | 'failed'     // 广告加载/播放失败
  | 'not_ready'; // 广告未准备好

/** 广告位配置接口 */
export interface AdSlot {
  slotId: string;
  type: AdType;
  enabled: boolean;
}

/** 预定义广告位 ID 常量 */
export const AD_SLOT_IDS = {
  // 局外外观/皮肤解锁（spec commerce-redesign，非数值变现）
  COSMETICS_UNLOCK: 'cosmetics_unlock',
  // 局外内容解锁（spec commerce-redesign，非数值变现）
  CONTENT_UNLOCK: 'content_unlock',
} as const;

/** 预定义广告位配置 */
export const AD_SLOTS: Record<string, AdSlot> = {
  [AD_SLOT_IDS.COSMETICS_UNLOCK]: {
    slotId: AD_SLOT_IDS.COSMETICS_UNLOCK,
    type: 'rewarded_video',
    enabled: true,
  },
  [AD_SLOT_IDS.CONTENT_UNLOCK]: {
    slotId: AD_SLOT_IDS.CONTENT_UNLOCK,
    type: 'rewarded_video',
    enabled: true,
  },
};
