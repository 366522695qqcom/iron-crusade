/**
 * 经典存档模式控制器（spec A 级 - A.1，接口骨架）
 *
 * 实现依据：PROJECT.md 第 5 章存档系统 + 3.11 双模式分层
 *
 * 设计要点：
 * - 复用 PROJECT.md 5.2 SaveSlot 模型：持续型存档，一局游戏对应一个存档，可跨多次会话推进
 * - 自动存档（每 60 tick 环形缓冲 10 槽 + 关键事件即时存档）+ 手动存档
 * - 单机 3 个存档槽，玩家可删可覆盖
 * - 完整系统（焦点树 / 科研 / 外交 / 阵营 / 联机等）
 *
 * 与 QuickBattleMode 存档隔离（ModeManager 负责 'classic_' key 前缀命名空间）。
 */
import type { WorldState } from '../../core/state/world_state';
import type { DevelopmentPath } from '../../core/types';
import { Fixed } from '../../core/determinism/fixed';
import { SortedMap } from '../../core/determinism/sorted_map';

/** 单机存档槽位索引（0-2，共 3 槽） */
export type ClassicSlotIndex = 0 | 1 | 2;

/** 环形自动存档槽数 */
const AUTO_SAVE_RING_SIZE = 10;
/** 自动存档间隔（tick） */
const AUTO_SAVE_INTERVAL = 60;

/** 关键事件类型 */
export type KeyEventType =
  | 'focus_complete'
  | 'battle_start'
  | 'battle_end'
  | 'diplomacy'
  | 'war'
  | 'province_control';

/**
 * 经典存档槽结构（PROJECT.md 5.2 SaveSlot）
 *
 * 与 QuickBattleSave 字段隔离，mode 标识固定 'classic'。
 * 完整字段对齐 PROJECT.md 5.2，worldState 增量压缩由实现细化。
 */
export interface ClassicSaveSlot {
  /** 存档版本 */
  version: string;
  /** 模式标识，固定 'classic' */
  mode: 'classic';
  /** 存档槽位（0-2） */
  slotIndex: ClassicSlotIndex;
  /** 玩家国家 ID */
  countryId: string;
  /** 剧本 ID */
  scenarioId: string;
  /** 发展路线（S.1 三选一） */
  developmentPath: DevelopmentPath;
  /** 创建时间（ms 时间戳） */
  createdAt: number;
  /** 最近游玩时间（ms 时间戳） */
  lastPlayedAt: number;
  /** 已解锁焦点 */
  unlockedFocuses: string[];
  /** 世界状态快照（增量压缩，schema 由实现细化） */
  worldState: WorldState;
  /** 输入回放日志（最近 N 步，裁剪到 500，用于撤销 / 调试） */
  inputLog: unknown[];
  /** 决胜 / 管控 / 时长统计 */
  stats: {
    wins: number;
    controlledProvinces: number;
    playTimeSec: number;
  };
}

/** 自动存档快照（环形缓冲条目） */
interface AutoSaveSnapshot {
  tickId: number;
  timestamp: number;
  worldState: WorldState;
  eventType?: KeyEventType;
}

/**
 * 经典存档模式控制器（接口骨架）
 *
 * 提供存档槽 CRUD 与自动 / 手动存档入口。
 * 自动存档策略：
 * - 每 60 tick 写入环形缓冲（10 槽）
 * - 关键事件（焦点完成 / 战斗起止 / 外交 / 宣战 / 管控省份）即时存档
 */
export class ClassicMode {
  /** 存档槽位（单机 3 槽，空槽为 null） */
  private slots: (ClassicSaveSlot | null)[] = [null, null, null];
  /** 自动存档环形缓冲（每槽独立） */
  private autoSaveRings: Record<number, AutoSaveSnapshot[]> = { 0: [], 1: [], 2: [] };
  /** 每槽自上次自动存档以来的 tick 计数 */
  private tickCounters: Record<number, number> = { 0: 0, 1: 0, 2: 0 };

  /**
   * 新建经典存档
   * @param slotIndex 槽位
   * @param countryId 国家 ID
   * @param scenarioId 剧本 ID
   * @param developmentPath 发展路线
   * @param initialState 初始世界状态
   * @returns 新建的存档槽
   */
  createSlot(
    slotIndex: ClassicSlotIndex,
    countryId: string,
    scenarioId: string,
    developmentPath: DevelopmentPath,
    initialState: WorldState,
  ): ClassicSaveSlot {
    // TODO: 校验槽位是否已被占用（占用则提示覆盖或拒绝），由 UI 层处理
    const now = Date.now();
    const slot: ClassicSaveSlot = {
      version: '0.1.0',
      mode: 'classic',
      slotIndex,
      countryId,
      scenarioId,
      developmentPath,
      createdAt: now,
      lastPlayedAt: now,
      unlockedFocuses: [],
      worldState: initialState,
      inputLog: [],
      stats: { wins: 0, controlledProvinces: 0, playTimeSec: 0 },
    };
    this.slots[slotIndex] = slot;
    return slot;
  }

  /** 加载存档槽（空槽返回 null） */
  loadSlot(slotIndex: ClassicSlotIndex): ClassicSaveSlot | null {
    return this.slots[slotIndex];
  }

  /**
   * 保存存档槽（手动存档，立即写 worldState 并刷新时间）
   * @param slotIndex 槽位
   * @param worldState 最新世界状态
   */
  saveSlot(slotIndex: ClassicSlotIndex, worldState: WorldState): void {
    const slot = this.slots[slotIndex];
    if (!slot) return;
    slot.worldState = worldState;
    slot.lastPlayedAt = Date.now();
    this.writeAutoSave(slotIndex, worldState, undefined);
  }

  /**
   * 每个 tick 调用，累积计数到 AUTO_SAVE_INTERVAL 时自动写入环形缓冲
   * @param slotIndex 槽位
   * @param worldState 最新世界状态
   */
  onTick(slotIndex: ClassicSlotIndex, worldState: WorldState): void {
    if (!this.slots[slotIndex]) return;
    this.tickCounters[slotIndex] = (this.tickCounters[slotIndex] || 0) + 1;
    if (this.tickCounters[slotIndex] >= AUTO_SAVE_INTERVAL) {
      this.tickCounters[slotIndex] = 0;
      this.writeAutoSave(slotIndex, worldState, undefined);
    }
    const slot = this.slots[slotIndex];
    if (slot) {
      slot.worldState = worldState;
      slot.lastPlayedAt = Date.now();
    }
  }

  /**
   * 关键事件触发即时存档（写入环形缓冲，标记事件类型）
   * @param slotIndex 槽位
   * @param worldState 最新世界状态
   * @param eventType 事件类型
   */
  onKeyEvent(slotIndex: ClassicSlotIndex, worldState: WorldState, eventType: KeyEventType): void {
    if (!this.slots[slotIndex]) return;
    this.writeAutoSave(slotIndex, worldState, eventType);
    const slot = this.slots[slotIndex];
    if (slot) {
      slot.worldState = worldState;
      slot.lastPlayedAt = Date.now();
    }
  }

  /**
   * 获取指定槽位的自动存档环形缓冲（从新到旧）
   */
  getAutoSaves(slotIndex: ClassicSlotIndex): AutoSaveSnapshot[] {
    return (this.autoSaveRings[slotIndex] || []).slice().reverse();
  }

  /**
   * 写入自动存档到环形缓冲（超出 RING_SIZE 则淘汰最旧）
   */
  private writeAutoSave(slotIndex: ClassicSlotIndex, worldState: WorldState, eventType?: KeyEventType): void {
    const ring = this.autoSaveRings[slotIndex] || (this.autoSaveRings[slotIndex] = []);
    const snapshot: AutoSaveSnapshot = {
      tickId: worldState.tickId,
      timestamp: Date.now(),
      worldState: deepCloneWorldState(worldState),
      eventType,
    };
    ring.push(snapshot);
    if (ring.length > AUTO_SAVE_RING_SIZE) {
      ring.shift();
    }
  }

  /** 删除存档槽 */
  deleteSlot(slotIndex: ClassicSlotIndex): void {
    this.slots[slotIndex] = null;
    this.autoSaveRings[slotIndex] = [];
    this.tickCounters[slotIndex] = 0;
  }

  /** 列出所有存档槽（含空槽） */
  listSlots(): (ClassicSaveSlot | null)[] {
    return [...this.slots];
  }
}

function deepCloneWorldState(ws: WorldState): WorldState {
  return deepCloneValue(ws) as WorldState;
}

function deepCloneValue(obj: unknown): unknown {
  if (obj === null || obj === undefined) return obj;
  if (obj instanceof Fixed) return new Fixed(obj.raw);
  if (obj instanceof SortedMap) {
    const entries = obj.entries();
    return new SortedMap(entries.map(([k, v]) => [k, deepCloneValue(v)] as [string | number, unknown]));
  }
  if (Array.isArray(obj)) return obj.map((item) => deepCloneValue(item));
  if (obj instanceof Set) return new Set([...obj].map((v) => deepCloneValue(v)));
  if (typeof obj === 'object') {
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(obj as Record<string, unknown>)) {
      out[key] = deepCloneValue((obj as Record<string, unknown>)[key]);
    }
    return out;
  }
  return obj;
}
