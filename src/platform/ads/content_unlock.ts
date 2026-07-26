/**
 * 局外内容解锁商店（spec commerce-redesign T3）
 *
 * 实现依据：spec `commerce-redesign` T3 局外内容解锁
 *
 * 设计要点：
 * - 局外内容解锁，可用性解锁非数值优势（解锁后该内容与其他内容平衡一致，不给数值加成）
 * - 联机模式由 Shop.isAvailable 隐藏入口（联机无广告，PROJECT.md 8.2）
 * - 供新建存档时校验国家/剧本可用性（isAvailable）
 * - 单例模式，全局唯一
 * - 看广告解锁：调用 DefaultAdsManager.showRewardedVideo('content_unlock')，
 *   仅 'watched' 视为成功并持久化
 * - 持久化：tt.setStorage/tt.getStorage，key='content_unlocked'（string[] 已解锁 id 列表）
 * - 非 tt 环境仅内存态
 *
 * 平台隔离：所有 tt API 调用检测 `typeof tt !== 'undefined'`，非抖音环境 fallback。
 * 不 import cc（platform 层独立于 Cocos）。
 *
 * 非数值优势：本文件不包含任何资源/政治点/战斗力/产出等数值奖励逻辑，
 * 仅控制内容「能否选用」。
 */
import { DefaultAdsManager } from './ads_manager';
import type { AdResult } from './ads_types';

/** 可解锁内容类型 */
export type UnlockableContentType = 'scenario' | 'country' | 'focus_branch';

/** 可解锁内容项（同 configs/unlockable_content.json schema） */
export interface UnlockableContent {
  /** 唯一标识 */
  id: string;
  /** 内容类型 */
  type: UnlockableContentType;
  /** 显示名称 */
  name: string;
  /** 描述文案 */
  description: string;
  /** 广告位 ID（固定 'content_unlock'） */
  adSlotId: string;
  /** 是否开局即可用（true 则无需看广告） */
  default: boolean;
}

/** 持久化 storage key（已解锁内容 id 列表） */
const CONTENT_UNLOCKED_KEY = 'content_unlocked';

/** 广告位 ID（与 AD_SLOT_IDS.CONTENT_UNLOCK 一致） */
const CONTENT_UNLOCK_SLOT = 'content_unlock';

/**
 * 默认可解锁内容配置（与 configs/unlockable_content.json 内容一致）
 *
 * platform 层不依赖 Cocos，无法 import JSON（TS 不支持），
 * 故在此内联默认数据；外部可通过 loadConfig 注入解析后的 JSON 覆盖。
 */
const DEFAULT_CONTENT: UnlockableContent[] = [
  {
    id: 'scenario_storm_break',
    type: 'scenario',
    name: '风暴骤起',
    description: '1936 架空剧本：欧洲局势骤紧，铁十字联邦工业崛起',
    adSlotId: 'content_unlock',
    default: false,
  },
  {
    id: 'country_cedar_republic',
    type: 'country',
    name: '雪松共和国',
    description: '架空中立国，依托山脉防线与外贸立国',
    adSlotId: 'content_unlock',
    default: false,
  },
  {
    id: 'focus_branch_industry_deep',
    type: 'focus_branch',
    name: '深度工业线',
    description: '工业集权线额外分支：解锁后可在焦点树选择深度工业化路径',
    adSlotId: 'content_unlock',
    default: false,
  },
  {
    id: 'focus_branch_base_logistics',
    type: 'focus_branch',
    name: '基础后勤线',
    description: '通用后勤分支：开局即可选用，无需看广告解锁',
    adSlotId: 'content_unlock',
    default: true,
  },
];

// 抖音小游戏 StarkSDK 注入的全局 tt 对象（platform 层共享）。
// 此处 `any` 为平台 SDK 适配的唯一例外（ESLint warn 可接受）。
declare const tt: any;

/**
 * 局外内容解锁商店（单例）
 *
 * 管理局外可解锁内容（新剧本/新国家/新焦点树分支）的解锁状态。
 * 看广告解锁，属可用性解锁，非数值优势。
 */
export class ContentUnlockStore {
  private static _instance: ContentUnlockStore | null = null;

  /** 当前配置内容列表 */
  private content: UnlockableContent[] = DEFAULT_CONTENT.slice();

  /** 已解锁内容 id 集合（内存态，tt 环境会从 storage 加载） */
  private unlockedIds: Set<string> = new Set();

  /** 是否已完成 storage 加载 */
  private loaded = false;

  /** 加载 Promise（防止并发重复加载） */
  private loadPromise: Promise<void> | null = null;

  /** 私有化构造函数（单例） */
  private constructor() {}

  /** 获取单例 */
  static instance(): ContentUnlockStore {
    if (!ContentUnlockStore._instance) {
      ContentUnlockStore._instance = new ContentUnlockStore();
    }
    return ContentUnlockStore._instance;
  }

  /**
   * 注入解析后的 JSON 配置（覆盖默认 DEFAULT_CONTENT）
   *
   * platform 层不 import JSON（TS 不支持），由外部构建系统加载
   * configs/unlockable_content.json 后调用本方法注入。
   *
   * @param raw 解析后的 JSON 对象（需含 contents 数组）
   */
  loadConfig(raw: unknown): void {
    if (!raw || typeof raw !== 'object') return;
    const obj = raw as { contents?: unknown };
    if (!Array.isArray(obj.contents)) return;
    const parsed: UnlockableContent[] = [];
    for (const item of obj.contents) {
      if (!item || typeof item !== 'object') continue;
      const c = item as Partial<UnlockableContent>;
      if (
        typeof c.id === 'string' &&
        (c.type === 'scenario' ||
          c.type === 'country' ||
          c.type === 'focus_branch') &&
        typeof c.name === 'string' &&
        typeof c.description === 'string' &&
        typeof c.adSlotId === 'string' &&
        typeof c.default === 'boolean'
      ) {
        parsed.push({
          id: c.id,
          type: c.type,
          name: c.name,
          description: c.description,
          adSlotId: c.adSlotId,
          default: c.default,
        });
      }
    }
    if (parsed.length > 0) {
      this.content = parsed;
    }
  }

  /** 列出所有可解锁内容 */
  listContent(): UnlockableContent[] {
    return this.content.slice();
  }

  /**
   * 按类型列出可解锁内容
   * @param type 内容类型
   */
  listByType(type: UnlockableContentType): UnlockableContent[] {
    return this.content.filter((c) => c.type === type);
  }

  /**
   * 查询是否已解锁
   *
   * default:true 的项永远返回 true（开局即可用，无需看广告）。
   *
   * @param contentId 内容 id
   */
  isUnlocked(contentId: string): boolean {
    const item = this.content.find((c) => c.id === contentId);
    if (!item) return false;
    if (item.default) return true;
    return this.unlockedIds.has(contentId);
  }

  /**
   * 查询是否可用（= 已解锁）
   *
   * 供新建存档时校验国家/剧本可用性。
   * 与 isUnlocked 等价（内容解锁只控制可用性）。
   *
   * @param contentId 内容 id
   */
  isAvailable(contentId: string): boolean {
    return this.isUnlocked(contentId);
  }

  /**
   * 看广告解锁内容
   *
   * 调用 DefaultAdsManager.showRewardedVideo，仅当结果 === 'watched' 时
   * 标记解锁并持久化，返回 true；否则返回 false。
   * default:true 的项直接返回 true，不看广告。
   *
   * @param contentId 内容 id
   * @returns 是否解锁成功
   */
  async unlock(contentId: string): Promise<boolean> {
    const item = this.content.find((c) => c.id === contentId);
    if (!item) return false;

    // default:true 的项开局即可用，无需看广告
    if (item.default) return true;

    // 确保 storage 已加载，避免重复解锁已持久化的内容
    await this.ensureLoaded();

    // 已解锁则直接返回
    if (this.unlockedIds.has(contentId)) return true;

    // 看广告
    const result: AdResult =
      await DefaultAdsManager.instance().showRewardedVideo(
        CONTENT_UNLOCK_SLOT,
      );
    if (result !== 'watched') return false;

    // 标记解锁并持久化
    this.unlockedIds.add(contentId);
    await this.persist();
    return true;
  }

  /**
   * 确保已从 storage 加载（懒加载，并发安全）
   */
  private ensureLoaded(): Promise<void> {
    if (this.loaded) return Promise.resolve();
    if (!this.loadPromise) {
      this.loadPromise = this.loadFromStorage().then(() => {
        this.loaded = true;
      });
    }
    return this.loadPromise;
  }

  /** 从 tt.getStorage 加载已解锁 id 列表；非 tt 环境直接保留内存空集合 */
  private loadFromStorage(): Promise<void> {
    return new Promise<void>((resolve) => {
      if (!this.isDouyin() || typeof tt.getStorage !== 'function') {
        resolve();
        return;
      }
      try {
        tt.getStorage({
          key: CONTENT_UNLOCKED_KEY,
          success: (res: { data: unknown }) => {
            const data = res?.data;
            if (Array.isArray(data)) {
              for (const id of data) {
                if (typeof id === 'string') this.unlockedIds.add(id);
              }
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

  /** 持久化已解锁 id 列表到 tt.setStorage；非 tt 环境 noop（仅内存） */
  private persist(): Promise<void> {
    return new Promise<void>((resolve) => {
      if (!this.isDouyin() || typeof tt.setStorage !== 'function') {
        resolve();
        return;
      }
      try {
        tt.setStorage({
          key: CONTENT_UNLOCKED_KEY,
          data: Array.from(this.unlockedIds),
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
