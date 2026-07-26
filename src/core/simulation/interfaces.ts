/**
 * 子模块接口定义（技术设计文档 4.3）
 *
 * 仅定义接口契约，具体实现类由 A 级任务填充。
 * 所有接口的 Fixed / SortedMap 参数保证确定性。
 *
 * spec implement-focus-research T3.1：新增 FocusSystem / ResearchSystem 接口
 * 及 Focus / FocusEffect / ResearchLine / ResearchNode 配置类型。
 */
import { Fixed } from '../determinism/fixed';
import {
  WorldState,
  ResourceStockpile,
  ValidationResult,
  IdleAlertState,
} from '../state/world_state';
import { BuildingType, ResourceType, DevelopmentPath } from '../types';
import { GameEvent } from './types';

/** 新建建筑请求（BuildingSystem.enqueue 入参） */
export interface NewBuildingRequest {
  type: BuildingType;
  provinceId: number;
  factoryCount: number;
  priority: number;
}

/** 状态差分（StateManager.diff 返回） */
export interface WorldDiff {
  fromTickId: number;
  toTickId: number;
  /** 改动字段集合（具体 schema 由实现细化） */
  patches: unknown[];
}

/**
 * 状态补丁操作类型：
 * - set：在指定路径设置值
 * - delete：删除指定路径的键（仅对 SortedMap/Record 有效）
 */
export type PatchOp = 'set' | 'delete';

/**
 * StatePatch 路径支持的顶层集合：
 * - countries / stockpiles / factories / provinces 四个 SortedMap
 *
 * 路径格式：[collection, entityId, ...subPath]
 * - collection: 'countries' | 'stockpiles' | 'factories' | 'provinces'
 * - entityId: string | number（实体 key）
 * - subPath: string[]（实体内部字段路径，如 ['politicalPower'] 或 ['caps', 'steel']）
 *
 * 示例：
 * - { op: 'set', path: ['stockpiles', 'IRON', 'steel'], value: Fixed.fromInt(100) }
 * - { op: 'delete', path: ['factories', 5] }
 */
export interface StatePatch {
  op: PatchOp;
  path: [string, string | number, ...string[]];
  value?: unknown;
}

/**
 * 资源系统接口（技术设计文档 4.3）
 *
 * - yieldTick：单 tick 资源产出，未消耗部分永久保留
 * - consume：消耗资源，不足返回 false
 * - reserveCap：查询储备上限
 */
export interface ResourceSystem {
  yieldTick(state: WorldState, countryId: string, dtMs: Fixed): void;
  /** 不足返回 false */
  consume(state: WorldState, countryId: string, type: ResourceType, amount: Fixed): boolean;
  reserveCap(state: WorldState, countryId: string): ResourceStockpile['caps'];
  /** storage 建筑建成/移除时调用以失效仓储加成缓存 */
  invalidateStorageCache(countryId?: string): void;
  /** 省份管控变更/重置时调用以失效资源节点反向索引 */
  invalidateNodeIndex(countryId?: string): void;
}

/**
 * 建筑系统接口（技术设计文档 4.3）
 */
export interface BuildingSystem {
  validate(state: WorldState, countryId: string, type: BuildingType, provinceId: number): ValidationResult;
  /** 入队建造，返回 itemId */
  enqueue(state: WorldState, countryId: string, req: NewBuildingRequest): string;
  cancel(state: WorldState, itemId: string, countryId?: string): void;
  assignFactories(state: WorldState, itemId: string, factoryIds: number[], countryId?: string): void;
  advanceTick(state: WorldState, countryId: string, dtMs: Fixed): void;
}

/**
 * 工厂系统接口（技术设计文档 4.3）
 */
export interface FactorySystem {
  assignTask(state: WorldState, factoryId: number, taskId: string): void;
  unassign(state: WorldState, factoryId: number): void;
  scanIdle(state: WorldState, countryId: string): IdleAlertState;
  produceTick(state: WorldState, countryId: string, dtMs: Fixed): GameEvent[];
  /** 一键平衡 */
  oneClickBalance(state: WorldState, countryId: string): void;
  /** 自动贸易 */
  autoTrade(state: WorldState, countryId: string): void;
  applyTemplate(state: WorldState, factoryIds: number[], templateId: string): void;
}

/**
 * 状态管理接口（技术设计文档 4.3）
 */
export interface StateManager {
  snapshot(): WorldState;
  diff(prev: WorldState): WorldDiff;
  restore(s: WorldState): void;
  applyDiff(d: WorldDiff): void;
  applyPatches(patches: StatePatch[]): void;
  hash(): string;
}

// ============================================================================
// 焦点树系统（spec implement-focus-research T3.1，PROJECT.md 3.5）
// ============================================================================

/**
 * 焦点效果类型联合（spec implement-focus-research T3.1）
 *
 * type 含义：
 * - political_power_per_day：每日政治点产出加成（暂存 buff）
 * - stability：稳定度直接调整（country.stability += value，clamp 0-1）
 * - disputeResolve：争端决心直接调整（country.disputeResolve += value，clamp 0-1，S.2 脱敏：原 warSupport）
 * - buff：通用 buff，按 target 暂存（如 civilian_factory_speed / military_factory_speed /
 *         production_efficiency_cap / factory_output / trade_efficiency / supply_range）
 * - research_bonus：科研加成 buff，target 为科研线 ID（如 armor / infantry / industry）
 *
 * value 在 JSON 中为 number，加载时由 FocusSystem 用 Fixed.fromNumber 转换为 Fixed。
 */
export interface FocusEffect {
  type:
    | 'political_power_per_day'
    | 'stability'
    | 'disputeResolve'
    | 'buff'
    | 'research_bonus';
  /** buff / research_bonus 的目标 key；其余 type 无需 target */
  target?: string;
  /** Fixed 形式的值（JSON number 在加载时转换） */
  value: Fixed;
}

/**
 * 焦点定义（spec implement-focus-research T3.1，对应 configs/focus_tree_<countryId>.json schema）
 *
 * 字段对应 focus_tree_iron_cross.json 既有 schema：
 * - id / name / cost（政治点）
 * - prerequisites：前置焦点 ID 列表（需全部完成才能选）
 * - requiresDevelopmentPath：分支限定（S.1 脱敏：原 requiresIdeology），null 表示通用
 * - effects：完成时生效的效果列表
 */
export interface Focus {
  id: string;
  name: string;
  cost: number;
  prerequisites: string[];
  requiresDevelopmentPath: DevelopmentPath | null;
  effects: FocusEffect[];
}

/**
 * 焦点系统接口（spec implement-focus-research T3.1）
 *
 * - refreshCandidates：60s（600 tick）刷新三选一候选
 * - pickFocus：扣政治点、设 activeFocusId、重置进度
 * - advanceTick：推进 activeFocus 进度；完成时 applyEffect + 发 focusCompleted 事件
 * - applyEffect：把焦点 effect 落地（数值直接改 country / buff 暂存到 module-level 缓存）
 * - getBuff：查询某 buff target 的累计 value（供 Simulation / FactorySystem / ResearchSystem 用）
 * - getPoliticalPowerPerDay：查询每日政治点产出（base + buff）
 */
export interface FocusSystem {
  /**
   * 刷新三选一候选焦点
   *
   * 按 developmentPath 过滤分支、按 prerequisites（已完成）过滤可选项，
   * 用国家专属 PRNG（seedMap['focus_'+countryId]）确定性选 ≤3 个。
   * 候选不足 3 个时返回全部可选。
   */
  refreshCandidates(state: WorldState, countryId: string): void;

  /**
   * 选择焦点
   *
   * 校验 focusId 在 candidates 中、政治点 >= focus.cost；
   * 扣政治点、设 activeFocusId、activeProgress=Fixed.ZERO、refreshInTicks=0（暂停刷新直到完成）。
   * @returns 校验失败返回 false（不修改状态）
   */
  pickFocus(state: WorldState, countryId: string, focusId: string): boolean;

  /**
   * 推进焦点
   *
   * 若 activeFocusId 非空：activeProgress += dtMs / (60000 × cost)（60s 基准，cost 越高越慢）
   * 若 activeProgress >= 1：applyEffect 全部 effects + completedFocusIds.push +
   *   activeFocusId=null + refreshInTicks=600 + 发 focusCompleted 事件
   * 若 activeFocusId 为空：refreshInTicks--；若 <=0 调用 refreshCandidates 并重置 refreshInTicks=600
   * @returns 本 tick 产生的 GameEvent 列表（focusCompleted）
   */
  advanceTick(state: WorldState, countryId: string, dtMs: Fixed): GameEvent[];

  /**
   * 落地单个焦点效果
   *
   * - political_power_per_day / buff / research_bonus：暂存到 module-level buff 缓存
   * - stability / disputeResolve：直接修改 country 字段（clamp 0-1）
   */
  applyEffect(state: WorldState, countryId: string, effect: FocusEffect): void;

  /** 查询某 buff target 的累计 value（含 research_bonus，target='research_'+lineId） */
  getBuff(countryId: string, target: string): Fixed;

  /** 查询每日政治点产出（base + political_power_per_day buff 累加） */
  getPoliticalPowerPerDay(countryId: string): Fixed;
}

// ============================================================================
// 科研系统（spec implement-focus-research T3.1，PROJECT.md 3.6）
// ============================================================================

/**
 * 科研节点 bonus（spec implement-focus-research T3.1）
 *
 * - type：bonus 类别（如 armor / infantry / industry / production_efficiency 等）
 * - target：可选细分目标（如 research_bonus 的具体科研线）
 * - value：Fixed 形式的加成值（JSON number 在加载时转换）
 */
export interface ResearchBonus {
  type: string;
  target?: string;
  value: Fixed;
}

/**
 * 科研节点定义（spec implement-focus-research T3.1）
 *
 * 字段对应 configs/research_lines.json schema：
 * - id / name / cost（推进时间基准，单位：节点数权重）
 * - bonus：完成后生效的全局加成
 * - unlock：可选，解锁的装备 / 兵种 ID
 */
export interface ResearchNode {
  id: string;
  name: string;
  cost: number;
  bonus?: ResearchBonus;
  unlock?: string;
}

/**
 * 科研线定义（spec implement-focus-research T3.1）
 *
 * 线性推进：nodes 按顺序逐个完成。
 */
export interface ResearchLine {
  id: string;
  name: string;
  nodes: ResearchNode[];
}

/**
 * 科研系统接口（spec implement-focus-research T3.1）
 *
 * - assignSlot：分配科研槽位到指定线（maxSlots 默认 2）
 * - advanceTick：推进各线 progress；完成节点时 currentNode 前进 + 发 researchCompleted 事件
 * - getBonus：查询某 bonusType 的累计加成（所有已完成节点的 bonus 累加）
 * - isUnlocked：查询某 nodeId 是否在已完成节点集合
 */
export interface ResearchSystem {
  /**
   * 分配科研槽位
   *
   * 校验 slot 在 0..maxSlots-1、lineId 有效；
   * 设置该槽位指向 lineId，currentNode 取该线首个未完成节点。
   * @returns 校验失败返回 false
   */
  assignSlot(state: WorldState, countryId: string, lineId: string, slot: number): boolean;

  /**
   * 推进科研
   *
   * 对每个 assignedSlot >= 0 的线推进 progress += dtMs / 90000（90s 基准）；
   * 若 progress >= 1：currentNode 前进到下一节点、progress=0、发 researchCompleted 事件；
   * 若无下一节点：该线完成（assignedSlot=-1 标记完成）。
   * @returns 本 tick 产生的 GameEvent 列表（researchCompleted）
   */
  advanceTick(state: WorldState, countryId: string, dtMs: Fixed): GameEvent[];

  /** 查询某 bonusType 的累计加成（所有已完成科研节点的 bonus 累加） */
  getBonus(state: WorldState, countryId: string, bonusType: string): Fixed;

  /** 查询某科技节点是否已解锁（在已完成节点集合中） */
  isUnlocked(state: WorldState, countryId: string, nodeId: string): boolean;
}

// ============================================================================
// 师团系统（feature-combat-skeleton T1）
// ============================================================================

export interface DivisionSystem {
  /**
   * 招募师团
   * - 校验政治点 >= 100、infantry_equipment >= 200、省份归属
   * - 扣资源、创建师团、加入 state.divisions
   * @returns 成功返回 true
   */
  recruit(state: WorldState, countryId: string, provinceId: number): boolean;

  /**
   * 推进师团训练 tick
   * - training 状态：推进 trainingProgress，满则 status='ready'，发 divisionRecruited 事件
   * @returns 本 tick 产生的事件
   */
  advanceTick(state: WorldState, countryId: string, dtMs: Fixed): GameEvent[];
}

// ============================================================================
// 战斗系统（feature-combat-skeleton T2）
// ============================================================================

export interface CombatSystem {
  /**
   * 发起区域争端
   * @returns disputeId，失败返回 null
   */
  initiateDispute(state: WorldState, attackerId: string, targetId: string): string | null;

  /**
   * 绘制前线（attacker fromProvince → defender toProvince）
   * defenderId 从 toProvince.controllerId 推断
   */
  drawFront(state: WorldState, attackerId: string, fromProvince: number, toProvince: number): void;

  /**
   * 下达攻势：指定师团进攻目标省份
   */
  issueOffensive(state: WorldState, countryId: string, divisionIds: number[], targetProvince: number): void;

  /**
   * 推进战斗 tick（骰子战斗、省份易主、VP扣分、决心结算）
   * 独立于国家遍历，处理所有 active disputes
   * @returns 本 tick 产生的事件（provinceControlled / disputeResolved）
   */
  advanceTick(state: WorldState, dtMs: Fixed): GameEvent[];
}
