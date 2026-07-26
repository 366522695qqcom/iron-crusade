/**
 * 局外外观/皮肤解锁商店（spec commerce-redesign T2）
 *
 * 实现依据：spec `commerce-redesign` T2 局外外观/皮肤系统
 *
 * 设计要点：
 * - 单例模式，全局唯一
 * - 局外通过看广告解锁纯装饰外观（国家主题色 / 地图皮肤 / UI 主题 / 部队图标）
 * - 严格不影响任何数值（无资源 / 政治点 / 战斗力 / 产出等数值奖励字段，外观仅影响视觉）
 * - 解锁是局外行为，单机模式可用；联机模式由 Shop.isAvailable 隐藏入口（本类不感知联机状态）
 * - 解锁与装备状态持久化到 tt.setStorage / tt.getStorage；非抖音环境 fallback 到内存态
 *
 * 平台隔离：
 * - 所有 tt API 调用检测 `typeof tt !== 'undefined'`
 * - 非抖音环境 fallback 到 noop（仅内存，重启丢失），不抛异常
 * - 不 import cc（platform 层独立于 Cocos）
 *
 * 代码风格参考：./ads_manager.ts、../notify/notify_scheduler.ts（JSDoc、私有字段、单例、tt 存储）
 */
import { DefaultAdsManager } from './ads_manager';
import type { AdResult } from './ads_types';

/** 外观分类槽位 */
export type CosmeticSlot = 'country_theme' | 'map_skin' | 'ui_theme' | 'unit_icon';

/** 全部槽位（用于遍历默认装备等） */
const ALL_SLOTS: CosmeticSlot[] = [
  'country_theme',
  'map_skin',
  'ui_theme',
  'unit_icon',
];

/** 外观配置项接口（对应 configs/cosmetics.json 单项 schema） */
export interface Cosmetic {
  /** 唯一 ID */
  id: string;
  /** 分类槽位 */
  slot: CosmeticSlot;
  /** 展示名称 */
  name: string;
  /** 描述文案 */
  description: string;
  /** 解锁广告位 ID（固定 cosmetics_unlock） */
  adSlotId: string;
  /** 是否默认装备（每个 slot 恰好 1 项为 true，无需看广告即可装备） */
  default: boolean;
}

/** 已解锁 cosmeticId 列表持久化 key */
const COSMETICS_UNLOCKED_KEY = 'cosmetics_unlocked';

/** 已装备映射 { [slot]: cosmeticId } 持久化 key */
const COSMETICS_EQUIPPED_KEY = 'cosmetics_equipped';

/**
 * 默认外观配置（与 configs/cosmetics.json 内容一致）
 *
 * 由于 platform 层不依赖 Cocos，且 configs/cosmetics.json 在运行时由构建系统打入，
 * 此处硬编码作为默认数据源（避免运行时 JSON import，TS 不支持）；
 * 外部可通过 {@link CosmeticsStore.loadConfig} 注入解析后的 JSON 覆盖。
 */
const DEFAULT_COSMETICS: Cosmetic[] = [
  {
    id: 'country_theme_iron_cross_gold',
    slot: 'country_theme',
    name: '铁十字·金',
    description: '铁十字联邦金色主题色，工业重镇的荣耀徽记',
    adSlotId: 'cosmetics_unlock',
    default: true,
  },
  {
    id: 'country_theme_red_alliance_crimson',
    slot: 'country_theme',
    name: '赤色·朱',
    description: '赤色同盟朱红主题色，公社共治的鲜明旗帜',
    adSlotId: 'cosmetics_unlock',
    default: false,
  },
  {
    id: 'map_skin_classic_parchment',
    slot: 'map_skin',
    name: '经典羊皮纸',
    description: '默认羊皮纸风格地图，复古而内敛',
    adSlotId: 'cosmetics_unlock',
    default: true,
  },
  {
    id: 'map_skin_naval_chart',
    slot: 'map_skin',
    name: '航海蓝图',
    description: '海军蓝图风格地图，跨海工业巨头的制图传统',
    adSlotId: 'cosmetics_unlock',
    default: false,
  },
  {
    id: 'ui_theme_brass_default',
    slot: 'ui_theme',
    name: '黄铜·默认',
    description: '默认黄铜质感界面，沉稳而经典',
    adSlotId: 'cosmetics_unlock',
    default: true,
  },
  {
    id: 'ui_theme_midnight_blue',
    slot: 'ui_theme',
    name: '午夜蓝',
    description: '深邃午夜蓝界面，王冠群岛夜航的幽蓝',
    adSlotId: 'cosmetics_unlock',
    default: false,
  },
  {
    id: 'unit_icon_standard',
    slot: 'unit_icon',
    name: '标准制式',
    description: '默认标准制式部队图标，简洁清晰',
    adSlotId: 'cosmetics_unlock',
    default: true,
  },
  {
    id: 'unit_icon_heraldic',
    slot: 'unit_icon',
    name: '纹章风格',
    description: '复古纹章风格部队图标，樱岛协约的武家纹饰',
    adSlotId: 'cosmetics_unlock',
    default: false,
  },
];

/**
 * 局外外观/皮肤商店（单例）
 *
 * 纯装饰外观解锁与装备管理；严格不涉及任何数值奖励。
 * 联机模式下商店入口由 Shop.isAvailable 隐藏，本类不感知联机状态。
 */
export class CosmeticsStore {
  private static _instance: CosmeticsStore | null = null;

  /** 获取单例 */
  static instance(): CosmeticsStore {
    if (!CosmeticsStore._instance) {
      CosmeticsStore._instance = new CosmeticsStore();
    }
    return CosmeticsStore._instance;
  }

  /** 当前外观配置（默认为 DEFAULT_COSMETICS，可被 loadConfig 覆盖） */
  private cosmetics: Cosmetic[];

  /** 已（看广告）解锁的非默认 cosmeticId 集合（默认项不进此集合，始终可装备） */
  private unlocked: Set<string> = new Set();

  /** 已装备映射 { [slot]: cosmeticId } */
  private equipped: Partial<Record<CosmeticSlot, string>> = {};

  /** 是否已完成 storage 加载 */
  private loaded = false;

  /** 加载 Promise（防止并发重复加载） */
  private loadPromise: Promise<void> | null = null;

  /** 私有化构造函数（单例） */
  private constructor() {
    this.cosmetics = DEFAULT_COSMETICS.slice();
    this.fillDefaultEquipped();
  }

  /**
   * 注入外部解析后的配置（覆盖默认数据源）
   *
   * 用于运行时由构建系统打入的 configs/cosmetics.json 注入；
   * 仅当整体校验通过（含至少 1 项有效项）时覆盖，否则保留默认配置。
   *
   * @param raw 解析后的 JSON 对象（结构与 cosmetics.json 一致）
   */
  loadConfig(raw: unknown): void {
    if (!raw || typeof raw !== 'object') return;
    const obj = raw as { cosmetics?: unknown };
    if (!Array.isArray(obj.cosmetics)) return;

    const parsed: Cosmetic[] = [];
    for (const item of obj.cosmetics) {
      if (!item || typeof item !== 'object') continue;
      const c = item as Partial<Cosmetic>;
      if (
        typeof c.id === 'string' &&
        typeof c.slot === 'string' &&
        typeof c.name === 'string' &&
        typeof c.description === 'string' &&
        typeof c.adSlotId === 'string' &&
        typeof c.default === 'boolean' &&
        ALL_SLOTS.includes(c.slot as CosmeticSlot)
      ) {
        parsed.push({
          id: c.id,
          slot: c.slot as CosmeticSlot,
          name: c.name,
          description: c.description,
          adSlotId: c.adSlotId,
          default: c.default,
        });
      }
    }
    if (parsed.length === 0) return;

    this.cosmetics = parsed;
    // 配置变更后重置装备为默认（避免引用已不存在的 id）
    this.equipped = {};
    this.fillDefaultEquipped();
  }

  /** 列出所有外观（拷贝） */
  listCosmetics(): Cosmetic[] {
    return this.cosmetics.slice();
  }

  /** 按 slot 列出外观 */
  listBySlot(slot: CosmeticSlot): Cosmetic[] {
    return this.cosmetics.filter((c) => c.slot === slot);
  }

  /**
   * 查询是否已解锁
   *
   * 默认项（default:true）视为始终可用（无需看广告）；
   * 非默认项需在 unlocked 集合中。
   */
  isUnlocked(cosmeticId: string): boolean {
    const c = this.cosmetics.find((x) => x.id === cosmeticId);
    if (!c) return false;
    return c.default || this.unlocked.has(cosmeticId);
  }

  /**
   * 查询当前装备的 cosmeticId
   * @returns 已装备的 id；未装备返回 null（默认项会自动填充，理论上每个 slot 始终有值）
   */
  getEquipped(slot: CosmeticSlot): string | null {
    return this.equipped[slot] ?? null;
  }

  /**
   * 看广告解锁外观
   *
   * 仅当广告结果 === 'watched' 时标记解锁并持久化，返回 true；
   * cancelled / failed / not_ready 均返回 false。
   * 已解锁或默认项幂等返回 true（默认项不展示广告）。
   */
  async unlock(cosmeticId: string): Promise<boolean> {
    await this.ensureLoaded();

    const cosmetic = this.cosmetics.find((c) => c.id === cosmeticId);
    if (!cosmetic) {
      return false;
    }
    // 默认项或已解锁：幂等返回 true
    if (cosmetic.default || this.unlocked.has(cosmeticId)) {
      return true;
    }

    const result: AdResult = await DefaultAdsManager.instance().showRewardedVideo(
      cosmetic.adSlotId,
    );
    if (result !== 'watched') {
      return false;
    }

    this.unlocked.add(cosmeticId);
    await this.persistUnlocked();
    return true;
  }

  /**
   * 装备已解锁外观
   * @returns 装备成功返回 true；未解锁 / 不存在返回 false；持久化装备状态
   */
  equip(cosmeticId: string): boolean {
    const cosmetic = this.cosmetics.find((c) => c.id === cosmeticId);
    if (!cosmetic) {
      return false;
    }
    if (!this.isEquippable(cosmeticId, cosmetic.slot)) {
      return false;
    }
    this.equipped[cosmetic.slot] = cosmeticId;
    void this.persistEquipped();
    return true;
  }

  /**
   * 从 storage 加载已解锁 / 已装备状态（应用启动时调用，幂等）
   *
   * 非抖音环境直接 resolve（仅使用内存默认态）。
   */
  async load(): Promise<void> {
    await this.ensureLoaded();
  }

  /** 校验某 cosmeticId 是否可装备（存在、slot 匹配、且已解锁或为默认项） */
  private isEquippable(cosmeticId: string, slot: CosmeticSlot): boolean {
    const c = this.cosmetics.find((x) => x.id === cosmeticId && x.slot === slot);
    return !!c && (c.default || this.unlocked.has(cosmeticId));
  }

  /** 为未装备的 slot 填充默认装备（每个 slot 的 default:true 项） */
  private fillDefaultEquipped(): void {
    for (const slot of ALL_SLOTS) {
      if (!this.equipped[slot]) {
        const def = this.cosmetics.find((c) => c.slot === slot && c.default);
        if (def) {
          this.equipped[slot] = def.id;
        }
      }
    }
  }

  /** 确保已从 storage 加载（懒加载，并发安全） */
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

  /** 从 tt.getStorage 加载解锁与装备状态；非 tt 环境直接 resolve */
  private loadFromStorage(): Promise<void> {
    // 顺序：先解锁，后装备（装备校验依赖已加载的解锁集合）
    return this.loadUnlocked().then(() => this.loadEquipped());
  }

  /** 加载已解锁 cosmeticId 列表；非 tt 环境 noop */
  private loadUnlocked(): Promise<void> {
    return new Promise<void>((resolve) => {
      if (!this.isDouyin() || typeof tt.getStorage !== 'function') {
        resolve();
        return;
      }
      try {
        tt.getStorage({
          key: COSMETICS_UNLOCKED_KEY,
          success: (res: { data: unknown }) => {
            const data = res?.data;
            if (Array.isArray(data)) {
              for (const id of data) {
                if (typeof id === 'string') {
                  this.unlocked.add(id);
                }
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

  /** 加载已装备映射；非 tt 环境 noop；加载后补齐缺失 slot 的默认装备 */
  private loadEquipped(): Promise<void> {
    return new Promise<void>((resolve) => {
      const done = () => {
        this.fillDefaultEquipped();
        resolve();
      };
      if (!this.isDouyin() || typeof tt.getStorage !== 'function') {
        done();
        return;
      }
      try {
        tt.getStorage({
          key: COSMETICS_EQUIPPED_KEY,
          success: (res: { data: unknown }) => {
            const data = res?.data;
            if (data && typeof data === 'object' && !Array.isArray(data)) {
              const map = data as Record<string, unknown>;
              for (const slot of ALL_SLOTS) {
                const id = map[slot];
                if (typeof id === 'string' && this.isEquippable(id, slot)) {
                  this.equipped[slot] = id;
                }
              }
            }
            done();
          },
          fail: () => done(),
        });
      } catch {
        done();
      }
    });
  }

  /** 持久化解锁状态到 tt.setStorage；非 tt 环境 noop（仅内存）；fail 不抛异常只 resolve */
  private persistUnlocked(): Promise<void> {
    return new Promise<void>((resolve) => {
      if (!this.isDouyin() || typeof tt.setStorage !== 'function') {
        resolve();
        return;
      }
      try {
        tt.setStorage({
          key: COSMETICS_UNLOCKED_KEY,
          data: Array.from(this.unlocked),
          success: () => resolve(),
          fail: () => resolve(),
        });
      } catch {
        resolve();
      }
    });
  }

  /** 持久化装备状态到 tt.setStorage；非 tt 环境 noop；fail 不抛异常只 resolve */
  private persistEquipped(): Promise<void> {
    return new Promise<void>((resolve) => {
      if (!this.isDouyin() || typeof tt.setStorage !== 'function') {
        resolve();
        return;
      }
      try {
        tt.setStorage({
          key: COSMETICS_EQUIPPED_KEY,
          data: this.equipped,
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

// 抖音小游戏 StarkSDK 注入的全局 tt 对象（同 ads_manager.ts，platform 层共享）。
// 此处 `any` 为平台 SDK 适配的唯一例外（ESLint warn 可接受）。
declare const tt: any;
