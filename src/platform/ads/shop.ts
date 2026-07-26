/**
 * 局外商店统一入口（spec commerce-redesign T4）
 *
 * 实现依据：spec `commerce-redesign` T4 局外商店统一入口
 *
 * 设计要点：
 * - 局外商店统一入口，聚合外观/内容解锁，不展示任何数值商品；
 *   联机模式 isAvailable 返回 false 隐藏入口
 * - 单例模式，全局唯一
 * - 位于主菜单（非对局内），含「外观」「内容」两个分页
 * - 不卖数值：ShopItem 只含展示与状态字段（id/name/description/slot或type/unlocked/equipped），
 *   严格禁止 resource/political/combat/power/yield/amount/buff 等数值奖励字段
 * - 所有商品仅可通过看广告解锁，无 IAP
 * - 联机模式：isAvailable() 复用 DefaultAdsManager.isEnabled()（联机 setEnabled(false)，
 *   故 isEnabled===false 即联机模式，商店入口隐藏，不触发任何广告）
 * - 不 import cc（platform 层独立于 Cocos）
 *
 * 代码风格参考：./ads_manager.ts、./cosmetics.ts、./content_unlock.ts（JSDoc、私有字段、单例）
 */
import { DefaultAdsManager } from './ads_manager';
import {
  CosmeticsStore,
  type Cosmetic,
  type CosmeticSlot,
} from './cosmetics';
import {
  ContentUnlockStore,
  type UnlockableContent,
  type UnlockableContentType,
} from './content_unlock';

/**
 * 统一商店商品接口（外观与内容共用，用可选 slot/type 区分类别）
 *
 * 严格不含任何数值奖励字段（resource/political/combat/power/yield/amount/buff 等），
 * 仅含展示与状态字段。
 */
export interface ShopItem {
  /** 唯一 ID */
  id: string;
  /** 展示名称 */
  name: string;
  /** 描述文案 */
  description: string;
  /** 是否已解锁 */
  unlocked: boolean;
  /** 外观分类槽位（仅外观分页项有值） */
  slot?: CosmeticSlot;
  /** 内容分类类型（仅内容分页项有值） */
  type?: UnlockableContentType;
  /** 是否已装备（仅外观分页项有值） */
  equipped?: boolean;
}

/**
 * 局外商店统一入口（单例）
 *
 * 聚合 {@link CosmeticsStore} 与 {@link ContentUnlockStore}，
 * 作为主菜单的局外变现入口。联机模式下入口隐藏。
 */
export class Shop {
  private static _instance: Shop | null = null;

  /** 获取单例 */
  static instance(): Shop {
    if (!Shop._instance) {
      Shop._instance = new Shop();
    }
    return Shop._instance;
  }

  /** 私有化构造函数（单例） */
  private constructor() {}

  /**
   * 商店是否可用
   *
   * 复用 DefaultAdsManager.isEnabled()：联机模式下会 setEnabled(false) 关闭所有广告，
   * 故 isEnabled===false 即联机模式，商店入口隐藏，不触发任何广告。
   */
  isAvailable(): boolean {
    return DefaultAdsManager.instance().isEnabled();
  }

  /**
   * 返回外观分页数据
   *
   * 聚合 CosmeticsStore.listCosmetics，每项含 id/name/description/slot/unlocked/equipped，
   * 不含任何数值字段。
   */
  getCosmeticsPage(): ShopItem[] {
    const store = CosmeticsStore.instance();
    const cosmetics: Cosmetic[] = store.listCosmetics();
    return cosmetics.map((c) => {
      const item: ShopItem = {
        id: c.id,
        name: c.name,
        description: c.description,
        unlocked: store.isUnlocked(c.id),
        slot: c.slot,
        equipped: store.getEquipped(c.slot) === c.id,
      };
      return item;
    });
  }

  /**
   * 返回内容分页数据
   *
   * 聚合 ContentUnlockStore.listContent，每项含 id/name/description/type/unlocked，
   * 不含任何数值字段。
   */
  getContentPage(): ShopItem[] {
    const store = ContentUnlockStore.instance();
    const contents: UnlockableContent[] = store.listContent();
    return contents.map((c) => {
      const item: ShopItem = {
        id: c.id,
        name: c.name,
        description: c.description,
        unlocked: store.isUnlocked(c.id),
        type: c.type,
      };
      return item;
    });
  }

  /**
   * 看广告解锁外观
   *
   * 委托 CosmeticsStore.unlock；联机模式下广告管理器已关闭，
   * 触发广告会返回 not_ready，本方法返回 false。
   *
   * @param cosmeticId 外观 id
   * @returns 是否解锁成功
   */
  async unlockCosmetic(cosmeticId: string): Promise<boolean> {
    return CosmeticsStore.instance().unlock(cosmeticId);
  }

  /**
   * 看广告解锁内容
   *
   * 委托 ContentUnlockStore.unlock；联机模式下广告管理器已关闭，
   * 触发广告会返回 not_ready，本方法返回 false。
   *
   * @param contentId 内容 id
   * @returns 是否解锁成功
   */
  async unlockContent(contentId: string): Promise<boolean> {
    return ContentUnlockStore.instance().unlock(contentId);
  }

  /**
   * 装备已解锁外观
   *
   * 委托 CosmeticsStore.equip。
   *
   * @param cosmeticId 外观 id
   * @returns 装备是否成功
   */
  equipCosmetic(cosmeticId: string): boolean {
    return CosmeticsStore.instance().equip(cosmeticId);
  }

  /**
   * 启动时加载（应用启动时调用）
   *
   * 委托 CosmeticsStore.load() 从 storage 加载已解锁/已装备状态；
   * 内容解锁是懒加载（首次 unlock 时 ensureLoaded），无需在此显式 load，
   * 但预留入口以便后续扩展。
   */
  async loadAll(): Promise<void> {
    await CosmeticsStore.instance().load();
  }
}
