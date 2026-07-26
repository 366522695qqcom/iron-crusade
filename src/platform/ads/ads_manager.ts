/**
 * 广告位统一管理器（spec B.2.3）
 *
 * 实现依据：spec `optimize-for-launch` B.2.3 广告位统一管理器
 *
 * 设计要点：
 * - 单例模式，全局唯一
 * - 封装抖音 `tt.createRewardedVideoAd` API，平台隔离
 * - 非抖音环境 fallback 到 noop（rewarded video 默认返回 'watched'，方便 Web 调试）
 * - 内部管理广告实例与加载状态，避免重复创建
 * - 提供 setEnabled 开关，联机模式下应关闭所有广告（联机无广告，PROJECT.md 8.2）
 *
 * 平台隔离：
 * - 所有 tt API 调用检测 `typeof tt !== 'undefined'`
 * - 非抖音环境 fallback 到 Promise.resolve，不抛异常
 * - 不 import cc（platform 层独立于 Cocos）
 */
import { AdResult, AD_SLOTS } from './ads_types';

// 抖音小游戏 StarkSDK 注入的全局 tt 对象。
// 此处 `any` 为平台 SDK 适配的唯一例外（ESLint warn 可接受）。
declare const tt: any;

/** 激励视频广告实例接口（抽象 tt.RewardedVideoAd） */
interface RewardedVideoAdInstance {
  show(): Promise<void>;
  onLoad(cb: () => void): void;
  onError(cb: (err: { errMsg?: string; errCode?: number }) => void): void;
  onClose(cb: (res: { isEnded?: boolean }) => void): void;
  load?(): Promise<void>;
  destroy?(): void;
}

/**
 * 广告管理器接口
 */
export interface AdsManager {
  /** 初始化（创建广告实例、预加载） */
  init(): void;

  /**
   * 展示激励视频广告
   * @param slotId 广告位 ID（对应 AD_SLOT_IDS）
   * @returns 广告结果：watched/cancelled/failed/not_ready
   */
  showRewardedVideo(slotId: string): Promise<AdResult>;

  /** 广告是否已加载（非 tt 环境返回 true 方便调试） */
  isReady(): boolean;

  /**
   * 设置广告总开关
   * 联机模式下应调用 setEnabled(false) 关闭所有广告（PROJECT.md 8.2 联机无广告）
   */
  setEnabled(enabled: boolean): void;

  /** 查询广告是否启用 */
  isEnabled(): boolean;
}

/**
 * 默认广告管理器实现（单例）
 */
export class DefaultAdsManager implements AdsManager {
  private static _instance: DefaultAdsManager | null = null;

  /** 获取单例 */
  static instance(): DefaultAdsManager {
    if (!DefaultAdsManager._instance) {
      DefaultAdsManager._instance = new DefaultAdsManager();
    }
    return DefaultAdsManager._instance;
  }

  /** 广告总开关（默认开启，联机模式下需关闭） */
  private enabled = true;

  /** 激励视频广告实例（按 slotId 索引） */
  private rewardedAds: Map<string, RewardedVideoAdInstance> = new Map();

  /** 广告加载状态（按 slotId 索引） */
  private adReady: Map<string, boolean> = new Map();

  /** 私有化构造函数（单例） */
  private constructor() {}

  init(): void {
    if (!this.isDouyin() || typeof tt.createRewardedVideoAd !== 'function') {
      // 非抖音环境：无需创建实例，isReady 返回 true，show 直接返回 watched
      return;
    }

    try {
      // 为每个激励视频广告位创建实例
      for (const [slotId, slot] of Object.entries(AD_SLOTS)) {
        if (slot.type !== 'rewarded_video' || !slot.enabled) continue;

        const ad = tt.createRewardedVideoAd({
          adUnitId: slotId, // 实际接入时替换为真实 adUnitId
        }) as RewardedVideoAdInstance;

        ad.onLoad(() => {
          this.adReady.set(slotId, true);
        });

        ad.onError(() => {
          this.adReady.set(slotId, false);
        });

        ad.onClose(() => {
          // 关闭后重置加载状态，下次 show 前需重新 load
          this.adReady.set(slotId, false);
        });

        this.rewardedAds.set(slotId, ad);
        this.adReady.set(slotId, false);

        // 预加载
        if (typeof ad.load === 'function') {
          ad.load().catch(() => {
            // 预加载失败不影响后续流程，show 时会再次尝试
          });
        }
      }
    } catch {
      // 创建广告实例失败，静默降级为非抖音环境行为
      this.rewardedAds.clear();
      this.adReady.clear();
    }
  }

  showRewardedVideo(slotId: string): Promise<AdResult> {
    return new Promise<AdResult>((resolve) => {
      // 1. 总开关检查
      if (!this.enabled) {
        resolve('not_ready');
        return;
      }

      // 2. 广告位存在性检查
      const slot = AD_SLOTS[slotId];
      if (!slot || slot.type !== 'rewarded_video') {
        resolve('failed');
        return;
      }

      // 3. 非抖音环境：直接返回 watched（方便 Web 调试）
      if (!this.isDouyin()) {
        resolve('watched');
        return;
      }

      // 4. 获取广告实例
      const ad = this.rewardedAds.get(slotId);
      if (!ad) {
        resolve('not_ready');
        return;
      }

      // 5. 绑定一次性 close/error 回调，展示广告
      let resolved = false;

      const onClose = (res: { isEnded?: boolean }) => {
        if (resolved) return;
        resolved = true;
        ad.onClose(() => {}); // 清理（部分 SDK 不支持 offClose，用空函数覆盖）
        ad.onError(() => {});
        resolve(res?.isEnded ? 'watched' : 'cancelled');
      };

      const onError = () => {
        if (resolved) return;
        resolved = true;
        ad.onClose(() => {});
        ad.onError(() => {});
        resolve('failed');
      };

      ad.onClose(onClose);
      ad.onError(onError);

      ad.show()
        .then(() => {
          // show 成功，等待用户观看完毕或关闭
        })
        .catch(() => {
          // show 失败，尝试重新加载后再 show 一次
          if (typeof ad.load === 'function') {
            ad.load()
              .then(() => ad.show())
              .then(() => {
                // 重新加载后 show 成功，等待回调
              })
              .catch(() => {
                if (!resolved) {
                  resolved = true;
                  ad.onClose(() => {});
                  ad.onError(() => {});
                  resolve('failed');
                }
              });
          } else {
            if (!resolved) {
              resolved = true;
              ad.onClose(() => {});
              ad.onError(() => {});
              resolve('failed');
            }
          }
        });
    });
  }

  isReady(): boolean {
    // 非抖音环境：始终返回 true（方便调试）
    if (!this.isDouyin()) {
      return this.enabled;
    }
    // 抖音环境：任一激励视频广告已加载即视为就绪
    if (!this.enabled) return false;
    for (const ready of this.adReady.values()) {
      if (ready) return true;
    }
    return false;
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  /** 抖音环境检测 */
  private isDouyin(): boolean {
    return typeof tt !== 'undefined' && tt !== null;
  }
}
