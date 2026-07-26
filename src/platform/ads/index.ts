/**
 * platform/ads 广告模块统一导出
 *
 * 实现依据：spec `commerce-redesign` 局外只卖外观与内容（不卖数值）
 *
 * 导出广告类型、广告管理器等公开接口。
 * 原 `optimize-for-launch` B.2 的每日补给箱 / 离线收益双倍已删除（违反「局外不卖数值」）。
 * 新增局外非数值变现：外观/皮肤解锁（cosmetics）、内容解锁（content_unlock）、统一商店入口（shop）。
 */

export type {
  AdType,
  AdResult,
  AdSlot,
} from './ads_types';
export {
  AD_SLOT_IDS,
  AD_SLOTS,
} from './ads_types';

export type { AdsManager } from './ads_manager';
export { DefaultAdsManager } from './ads_manager';

export type { CosmeticSlot, Cosmetic } from './cosmetics';
export { CosmeticsStore } from './cosmetics';

export type { UnlockableContentType, UnlockableContent } from './content_unlock';
export { ContentUnlockStore } from './content_unlock';

export type { ShopItem } from './shop';
export { Shop } from './shop';
