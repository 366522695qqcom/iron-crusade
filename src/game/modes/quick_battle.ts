/**
 * 快速对局模式控制器（spec A 级 - A.1）
 *
 * 实现依据：PROJECT.md 3.11 双模式分层 + spec Requirement: 双模式分层
 *
 * 设计要点：
 * - 单局 10-15 分钟可完成，作为抖音碎片化场景的新手入口
 * - 仅保留资源-工厂-战斗核心系统，禁用复杂子系统以降低决策成本
 * - 存档独立于经典存档，单局结束即归档为只读历史
 * - 首局完成后引导玩家尝试经典存档模式（A.1.4 导流）
 *
 * 与经典模式的隔离由 ModeManager 负责命名空间分离（platform 层 key 前缀 'qb_'）。
 */
import type { WorldState } from '../../core/state/world_state';
import type { DevelopmentPath } from '../../core/types';
import { Fixed } from '../../core/determinism/fixed';
import { SortedMap } from '../../core/determinism/sorted_map';

const QB_ARCHIVES_KEY = 'qb_archives';

declare const tt: {
  setStorageSync(key: string, value: string): void;
  getStorageSync(key: string): string | null | undefined;
} | undefined;

/** 快速对局预设 ID（对应 configs/quick_battle_presets.json） */
export type QuickBattlePresetId = 'balanced' | 'industrial' | 'combat';

/** 快速对局单局结算结果 */
export type QuickBattleResult =
  | 'victory'    // 胜利（达成单局目标，如管控指定数量省份）
  | 'defeat'     // 失败
  | 'timeout'    // 超过 HARD_CAP 仍未达成
  | 'abandoned'; // 玩家主动放弃

/** 快速对局单局统计 */
export interface QuickBattleStats {
  /** 单局时长（秒） */
  durationSec: number;
  /** 建造建筑数 */
  buildingsBuilt: number;
  /** 升级工厂数 */
  factoriesUpgraded: number;
  /** 完成焦点数（快速对局仅保留 3 个核心焦点） */
  focusesCompleted: number;
  /** 管控省份数（S.2 脱敏：原"占领"） */
  provincesControlled: number;
}

/**
 * 快速对局存档结构（A.1.1）
 *
 * 独立于经典存档（ClassicSaveSlot），单局结束即归档为只读历史。
 * - 与经典存档分别存储（ModeManager + platform key 前缀 'qb_' 隔离）
 * - 单局结束后存档不再继续推演，仅保留作历史回顾
 */
export interface QuickBattleSave {
  /** 存档版本 */
  version: string;
  /** 模式标识，固定 'quick' */
  mode: 'quick';
  /** 存档 ID（单机唯一） */
  saveId: string;
  /** 玩家国家 ID */
  countryId: string;
  /** 选用预设 ID */
  presetId: QuickBattlePresetId;
  /** 发展路线（S.1 三选一：工业集权 / 公社共治 / 联邦共和） */
  developmentPath: DevelopmentPath;
  /** 单局开始时间（ms 时间戳） */
  startTime: number;
  /** 单局结束时间（ms 时间戳），进行中为 null */
  endTime: number | null;
  /** 单局结果，进行中为 null */
  result: QuickBattleResult | null;
  /** 单局统计 */
  stats: QuickBattleStats;
  /** 首局导流标记：首局结束后置 true，引导玩家尝试经典模式（A.1.4） */
  classicGuideShown: boolean;
  /** 世界状态快照（单局结束后保留只读，进行中为当前最新状态） */
  worldState: WorldState;
}

/**
 * 快速对局模式控制器（A.1）
 *
 * 禁用的子系统（降低决策成本，仅保留资源-工厂-战斗核心）：
 * - 关闭：完整国策树（仅保留 3 个核心焦点）
 * - 关闭：科研系统（预设固定科研路线，玩家无需决策）
 * - 关闭：完整外交系统（仅保留区域争端入口）
 * - 关闭：阵营管理
 * - 关闭：联机（仅单机）
 *
 * 启用的核心系统：资源采集 / 工厂建造与分配 / 装备生产 / 部队作战（区域争端）。
 */
export class QuickBattleMode {
  /** 单局目标时长下限（分钟），用于 UI 提示 */
  static readonly TARGET_DURATION_MIN = 10;
  /** 单局目标时长上限（分钟） */
  static readonly TARGET_DURATION_MAX = 15;
  /** 单局硬性时长上限（分钟），超过按 timeout 结算 */
  static readonly HARD_CAP_MIN = 15;

  /** 当前激活的快速对局存档（无则 null） */
  private activeSave: QuickBattleSave | null = null;
  /** 已归档的快速对局历史（内存缓存） */
  private archives: QuickBattleSave[] = [];

  constructor() {
    this.loadArchives();
  }

  /**
   * 开始一局新的快速对局
   * @param countryId 玩家国家 ID
   * @param presetId 预设 ID（决定初始资源 / 预设建筑 / 发展路线）
   * @param developmentPath 发展路线（S.1 三选一）
   * @param initialState 由外部按预设构建的初始世界状态
   * @returns 新建的快速对局存档
   */
  start(
    countryId: string,
    presetId: QuickBattlePresetId,
    developmentPath: DevelopmentPath,
    initialState: WorldState,
  ): QuickBattleSave {
    const save: QuickBattleSave = {
      version: '0.1.0',
      mode: 'quick',
      saveId: `qb_${Date.now()}`,
      countryId,
      presetId,
      developmentPath,
      startTime: Date.now(),
      endTime: null,
      result: null,
      stats: {
        durationSec: 0,
        buildingsBuilt: 0,
        factoriesUpgraded: 0,
        focusesCompleted: 0,
        provincesControlled: 0,
      },
      classicGuideShown: false,
      worldState: initialState,
    };
    this.activeSave = save;
    return save;
  }

  /** 查询当前进行中的快速对局存档 */
  getActive(): QuickBattleSave | null {
    return this.activeSave;
  }

  /**
   * 结束当前快速对局并归档
   * @param result 结算结果
   * @returns 归档后的只读存档；无进行中对局则返回 null
   */
  finish(result: QuickBattleResult): QuickBattleSave | null {
    if (!this.activeSave) return null;
    this.activeSave.endTime = Date.now();
    this.activeSave.result = result;
    this.activeSave.stats.durationSec = Math.floor(
      (this.activeSave.endTime - this.activeSave.startTime) / 1000,
    );
    const archived = this.activeSave;
    this.archives.push(archived);
    this.activeSave = null;
    this.archiveGame(archived);
    return archived;
  }

  /** 获取已归档的快速对局历史 */
  getArchives(): QuickBattleSave[] {
    return this.archives.slice();
  }

  /**
   * 持久化归档到 tt.setStorageSync；非 tt 环境 noop（仅内存）
   */
  private archiveGame(_save: QuickBattleSave): void {
    try {
      if (typeof tt === 'undefined' || tt === null || typeof tt.setStorageSync !== 'function') {
        return;
      }
      tt.setStorageSync(QB_ARCHIVES_KEY, JSON.stringify(this.archives.map((a) => this.toJSON(a))));
    } catch {
      // 存储失败不影响游戏流程
    }
  }

  /**
   * 启动时从 tt.getStorageSync 加载归档历史；非 tt 环境直接保留空数组
   */
  private loadArchives(): void {
    try {
      if (typeof tt === 'undefined' || tt === null || typeof tt.getStorageSync !== 'function') {
        return;
      }
      const raw = tt.getStorageSync(QB_ARCHIVES_KEY);
      if (!raw) return;
      const arr = JSON.parse(raw);
      if (!Array.isArray(arr)) return;
      this.archives = arr.map((item) => this.fromJSON(item)).filter((s): s is QuickBattleSave => s !== null);
    } catch {
      this.archives = [];
    }
  }

  /** 将 QuickBattleSave 转为 JSON-safe 对象（Fixed→number, SortedMap→array） */
  private toJSON(save: QuickBattleSave): unknown {
    return deepSerialize(save);
  }

  /** 从 JSON-safe 对象还原 QuickBattleSave */
  private fromJSON(raw: unknown): QuickBattleSave | null {
    try {
      const restored = deepDeserialize(raw);
      if (!restored || typeof restored !== 'object') return null;
      const s = restored as Record<string, unknown>;
      if (s.mode !== 'quick') return null;
      return restored as QuickBattleSave;
    } catch {
      return null;
    }
  }

  /**
   * 判断单局是否超过硬性时长上限
   * @returns 超过 HARD_CAP 返回 true，应按 timeout 结算
   */
  isTimedOut(): boolean {
    if (!this.activeSave || this.activeSave.endTime !== null) return false;
    const elapsedMin = (Date.now() - this.activeSave.startTime) / 60000;
    return elapsedMin >= QuickBattleMode.HARD_CAP_MIN;
  }

  /**
   * 标记首局经典模式导流已展示（A.1.4）
   * 首局完成后引导玩家尝试经典存档模式。
   */
  markClassicGuideShown(): void {
    if (this.activeSave) {
      this.activeSave.classicGuideShown = true;
    }
  }

  /**
   * 判断是否应触发经典模式导流
   * 触发条件：首局已结算 + 导流未展示
   */
  shouldShowClassicGuide(): boolean {
    if (!this.activeSave) return false;
    return this.activeSave.result !== null && !this.activeSave.classicGuideShown;
  }
}

function deepSerialize(obj: unknown): unknown {
  if (obj === null || obj === undefined) return obj;
  if (obj instanceof Fixed) return { __f: obj.raw };
  if (obj instanceof SortedMap) {
    const entries = obj.entries();
    return { __sm: entries.map(([k, v]) => [k, deepSerialize(v)]) };
  }
  if (Array.isArray(obj)) return obj.map((item) => deepSerialize(item));
  if (typeof obj === 'object') {
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(obj as Record<string, unknown>)) {
      out[key] = deepSerialize((obj as Record<string, unknown>)[key]);
    }
    return out;
  }
  return obj;
}

function deepDeserialize(obj: unknown): unknown {
  if (obj === null || obj === undefined) return obj;
  if (Array.isArray(obj)) return obj.map((item) => deepDeserialize(item));
  if (typeof obj === 'object') {
    const o = obj as Record<string, unknown>;
    if (typeof o.__f === 'number') return new Fixed(o.__f);
    if (Array.isArray(o.__sm)) {
      const entries = o.__sm.map((pair: unknown) => {
        const [k, v] = pair as [string | number, unknown];
        return [k, deepDeserialize(v)] as [string | number, unknown];
      });
      return new SortedMap(entries);
    }
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(o)) {
      out[key] = deepDeserialize(o[key]);
    }
    return out;
  }
  return obj;
}
