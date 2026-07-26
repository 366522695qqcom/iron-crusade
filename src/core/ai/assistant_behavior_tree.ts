/**
 * 助理模式行为树（spec A 级 - A.2.1）
 *
 * 顶部说明（spec Requirement: 助理模式）：
 * 本类与联机 AI 接管（附录 B.2 / 技术设计文档 6.4，未来联机核心）复用同一行为树核心，
 * 差异仅在 AssistantParams：助理模式参数更保守，不抢占玩家核心决策资源；
 * 联机 drop-out 时 AI 接管使用激进档参数（更低的空闲阈值、允许扩张等）。
 *
 * 行为树节点（对应附录 B.2.1 AI_Root，助理版仅保留三类节点）：
 * - Factory 决策（优先级 1）：分配空闲民厂至建造队列最高优先级项
 * - Supply 决策（优先级 2）：为 supply < 阈值的部队调度补给
 * - Defense 决策（优先级 3）：为本方管控的争端前线省份布防
 *
 * 确定性约束（技术设计文档 2.x / 附录 C.1）：
 * - 不依赖 Math.random（本类决策均为确定性阈值判定，无需随机；如需随机应使用 PRNG）
 * - 数值比较统一使用 Fixed（如 division.supply.lessThan(...)），禁止裸 number 数学运算
 * - 遍历 SortedMap 保持升序，决策产物按遍历顺序构建，跨引擎一致
 * - 不 import 'cc'（core/ 必须为纯 TS，技术设计文档 1.4）
 */
import { Fixed } from '../determinism/fixed';
import { WorldState } from '../state/world_state';

/** 助理决策类型（对应附录 B.2 行为树的三类节点） */
export type AssistantDecisionType = 'factory' | 'supply' | 'defense';

/**
 * 助理决策产物（与 simulation/assistant.ts 的 AssistantOperation.details 对齐）
 *
 * 字段映射：
 * - factoryIds  → AssistantOperation.details.factoryIds
 * - provinceIds → AssistantOperation.details.provinceIds
 * - taskId      → AssistantOperation.details.taskId
 * - reason      → AssistantOperation.details.reason
 * - divisionIds → 仅系统内部使用（details schema 未含，转 AssistantOperation 时丢弃）
 */
export interface AssistantDecision {
  type: AssistantDecisionType;
  /** 涉及的工厂 ID（Factory 决策） */
  factoryIds?: number[];
  /** 涉及的省份 ID（Supply / Defense 决策） */
  provinceIds?: number[];
  /** 涉及的建造队列项 ID（Factory 决策） */
  taskId?: string;
  /** 涉及的部队 ID（Supply 决策；内部使用，不写入 AssistantOperation.details） */
  divisionIds?: number[];
  /** 决策理由（用于 UI 提示与 operation log） */
  reason: string;
}

/**
 * 助理参数（区别于联机 AI 接管的激进参数）
 *
 * 保守原则（spec：助理不主动扩张、优先稳健运营，仅处理空闲/缺口状态）：
 * - Factory 决策仅当空闲民厂 >= idleFactoryThreshold 时触发（默认 2，避免抢占玩家核心决策资源）
 * - Supply 决策仅补足 supply < supplyShortageThreshold 的部队（默认 0.5）
 * - Defense 决策仅在存在争端且本方管控省份 < defenseControlledProvinceThreshold 时触发
 */
export interface AssistantParams {
  /** 仅当空闲民用工厂 >= 此值时才自动分配（默认 2，避免抢占玩家核心决策资源） */
  idleFactoryThreshold: number;
  /** 仅在建造队列非空时分配工厂 */
  requireNonEmptyConstructionQueue: boolean;
  /** 单次 Factory 决策最多分配的工厂数（保守上限，避免向单项倾泻全部空闲工厂） */
  maxFactoriesPerAssignment: number;
  /** 补给短缺阈值：仅调度 supply < 此值的部队（Fixed，默认 0.5） */
  supplyShortageThreshold: Fixed;
  /** 布防触发：本方管控省份数 < 此值时才布防（默认 3） */
  defenseControlledProvinceThreshold: number;
  /** 是否要求存在争端（Dispute）才触发布防（默认 true） */
  requireDisputeForDefense: boolean;
}

/** 助理参数默认值（保守档，区别于联机 AI 接管的 Medium/激进档） */
export const DEFAULT_ASSISTANT_PARAMS: AssistantParams = {
  idleFactoryThreshold: 2,
  requireNonEmptyConstructionQueue: true,
  maxFactoriesPerAssignment: 4,
  supplyShortageThreshold: Fixed.HALF,
  defenseControlledProvinceThreshold: 3,
  requireDisputeForDefense: true,
};

/**
 * 助理模式行为树
 *
 * 用法：
 *   const tree = new AssistantBehaviorTree();
 *   tree.tick(state, countryId);
 *   const decisions = tree.getDecisions();
 *
 * 与联机 AI 接管的关系：联机 drop-out 时复用本行为树核心，
 * 仅替换 AssistantParams 为激进档（更低的空闲阈值、允许扩张等）。
 */
export class AssistantBehaviorTree {
  private params: AssistantParams;
  /** 当前 tick 产出的决策列表（tick() 每次重置） */
  private decisions: AssistantDecision[] = [];

  constructor(params?: Partial<AssistantParams>) {
    this.params = { ...DEFAULT_ASSISTANT_PARAMS, ...params };
  }

  /** 读取当前参数（联机 AI 接管可读取后替换为激进档） */
  getParams(): AssistantParams {
    return this.params;
  }

  /**
   * 推演一次决策（对应附录 B.2.1 AI_Root 每 tick 执行）
   *
   * 按 Factory → Supply → Defense 优先级顺序评估三类节点，
   * 结果写入内部 decisions，通过 getDecisions() 取出。
   */
  tick(state: WorldState, countryId: string): void {
    this.decisions = [];
    const factoryDecision = this.decideFactory(state, countryId);
    if (factoryDecision) this.decisions.push(factoryDecision);
    const supplyDecision = this.decideSupply(state, countryId);
    if (supplyDecision) this.decisions.push(supplyDecision);
    const defenseDecision = this.decideDefense(state, countryId);
    if (defenseDecision) this.decisions.push(defenseDecision);
  }

  /** 取本 tick 决策列表（按评估顺序） */
  getDecisions(): AssistantDecision[] {
    return this.decisions;
  }

  /**
   * Factory 决策（附录 B.2.1 优先级 1，助理版仅处理民厂）
   *
   * 触发条件：
   * - 该国空闲民用工厂数 >= idleFactoryThreshold
   * - 建造队列非空（requireNonEmptyConstructionQueue 开启时）
   *
   * 动作：将空闲民厂（上限 maxFactoriesPerAssignment）分配到队列中
   *       priority 最高（数值最小）的项；并列时取数组中首个（确定性）。
   *
   * 工厂归属判定：通过 province.ownerId === countryId 确认工厂属于该国主权省份
   *               （保守，不插手管控争议省份上的工厂）。
   */
  private decideFactory(state: WorldState, countryId: string): AssistantDecision | null {
    // 收集该国空闲民用工厂（按 SortedMap 升序遍历，保证跨引擎一致）
    const idleFactoryIds: number[] = [];
    state.factories.forEach((factory) => {
      if (factory.type !== 'civilian') return;
      if (factory.state !== 'idle') return;
      const province = state.provinces.get(factory.provinceId);
      if (!province || province.ownerId !== countryId) return;
      idleFactoryIds.push(factory.id);
    });

    if (idleFactoryIds.length < this.params.idleFactoryThreshold) {
      return null;
    }

    const queue = state.constructionQueues.get(countryId);
    if (!queue || queue.items.length === 0) {
      // requireNonEmptyConstructionQueue 已隐含：队列为空直接不分配
      return null;
    }

    // 找 priority 最高（数值最小）的队列项；并列时取数组中首个（确定性，禁用 Math.min）
    let topItem = queue.items[0];
    for (let i = 1; i < queue.items.length; i++) {
      if (queue.items[i].priority < topItem.priority) {
        topItem = queue.items[i];
      }
    }

    // 分配工厂数：不超过空闲数、不超过保守上限（禁用 Math.min，手动比较）
    const cap = this.params.maxFactoriesPerAssignment;
    const assignCount = idleFactoryIds.length < cap ? idleFactoryIds.length : cap;
    const factoryIds = idleFactoryIds.slice(0, assignCount);

    return {
      type: 'factory',
      factoryIds,
      taskId: topItem.id,
      reason: `分配 ${factoryIds.length} 座空闲民厂至建造队列最高优先级项 ${topItem.id}`,
    };
  }

  /**
   * Supply 决策（附录 B.2.1 优先级 2，助理版仅补足 supply < 阈值的部队）
   *
   * 触发条件：
   * - 存在该国 supply < supplyShortageThreshold 的部队
   * - 存在该国补给枢纽省份（supplyHubLevel > 0），否则无法调度（保守，不凭空补给）
   *
   * 动作：标记低补给部队与途经补给枢纽（实际调度由上层最小实现记录到 operation log）。
   */
  private decideSupply(state: WorldState, countryId: string): AssistantDecision | null {
    const threshold = this.params.supplyShortageThreshold;
    const lowSupplyDivisionIds: number[] = [];
    state.divisions.forEach((division) => {
      if (division.ownerId !== countryId) return;
      // Fixed 比较：supply < threshold（禁止裸 number 数学运算）
      if (division.supply.lessThan(threshold)) {
        lowSupplyDivisionIds.push(division.id);
      }
    });

    if (lowSupplyDivisionIds.length === 0) return null;

    // 收集本方补给枢纽省份（按 SortedMap 升序）
    const hubProvinceIds: number[] = [];
    state.provinces.forEach((province) => {
      if (province.ownerId !== countryId) return;
      if (province.supplyHubLevel > 0) {
        hubProvinceIds.push(province.id);
      }
    });

    // 无枢纽则无法调度（保守）
    if (hubProvinceIds.length === 0) return null;

    return {
      type: 'supply',
      divisionIds: lowSupplyDivisionIds,
      provinceIds: hubProvinceIds,
      reason: `调度补给至 ${lowSupplyDivisionIds.length} 个低补给部队（途经 ${hubProvinceIds.length} 个补给枢纽）`,
    };
  }

  /**
   * Defense 决策（附录 B.2.1 优先级 4，助理版仅布防、不主动攻势）
   *
   * 触发条件（保守门槛）：
   * - requireDisputeForDefense 开启时，该国必须参与某条争端（Dispute）
   * - 本方管控省份数（controllerId === countryId 且 != ownerId）< defenseControlledProvinceThreshold
   *
   * 动作：在管控前线省份中，存在敌对部队驻留的，标记布防。
   *
   * 注：Province 数据模型无邻接表，「周边有敌对部队」此处最小实现为
   *     「敌对部队位于本方管控省份内」（直接争端威胁）；
   *     Set 仅用于成员判定（.has/.add），不做遍历，不破坏确定性。
   *     完整邻接判定留待后续地图模块补全。
   */
  private decideDefense(state: WorldState, countryId: string): AssistantDecision | null {
    // 争端存在性检查
    if (this.params.requireDisputeForDefense) {
      let hasDispute = false;
      state.disputes.forEach((dispute) => {
        if (dispute.participantSet.has(countryId)) hasDispute = true;
      });
      if (!hasDispute) return null;
    }

    // 收集本方管控但非主权的省份（争端前线，按 SortedMap 升序）
    const controlledNotOwnedProvinceIds: number[] = [];
    state.provinces.forEach((province) => {
      if (province.controllerId === countryId && province.ownerId !== countryId) {
        controlledNotOwnedProvinceIds.push(province.id);
      }
    });

    // 布防门槛：本方管控省份数 >= 阈值时不触发（保守，避免过度布防）
    if (controlledNotOwnedProvinceIds.length >= this.params.defenseControlledProvinceThreshold) {
      return null;
    }

    // 收集敌对部队所在省份（成员判定用 Set，不做遍历，确定性安全）
    const enemyOccupiedProvinceIds = new Set<number>();
    state.divisions.forEach((division) => {
      if (division.ownerId !== countryId) {
        enemyOccupiedProvinceIds.add(division.currentProvinceId);
      }
    });

    const defendProvinceIds: number[] = [];
    for (const pid of controlledNotOwnedProvinceIds) {
      if (enemyOccupiedProvinceIds.has(pid)) {
        defendProvinceIds.push(pid);
      }
    }

    if (defendProvinceIds.length === 0) return null;

    return {
      type: 'defense',
      provinceIds: defendProvinceIds,
      reason: `布防 ${defendProvinceIds.length} 个本方管控前线省份`,
    };
  }
}
