/**
 * 科研系统默认实现（spec implement-focus-research T2 + PROJECT.md 3.6）
 *
 * 实现依据：spec implement-focus-research T2.2 + PROJECT.md 3.6
 *
 * 关键规则：
 * - 线性科研线：nodes 按顺序逐个完成
 * - 推进基准：90s × cost（cost 越高推进越慢，progress += dtMs / (90000 × cost)）
 * - maxSlots 默认 2（M1 简化，后续可由焦点/科技扩展）
 * - 完成节点：currentNode 前进到下一节点、bonus 累计生效、发 researchCompleted 事件
 * - 线完成（最后一个节点完成）：assignedSlot = -1 标记
 *
 * 实现约定（严格遵守）：
 * - 不 import cc，core/ 层独立
 * - 不调用 Math，全部用 Fixed 运算（仅 fixed.ts 白名单允许 Math）
 * - 不依赖裸 number 参与逻辑判定（仅 cost/slot/数组索引用 number）
 * - 用 Fixed.ONE 表示 1.0（Fixed 实例，可直接传给比较方法）
 * - 遍历 SortedMap 用 forEach（保证 key 升序，跨引擎确定性）
 * - 不修改 world_state.ts / interfaces.ts / 其他 simulation 文件
 */
import { Fixed } from '../determinism/fixed';
import { WorldState, ResearchState } from '../state/world_state';
import { GameEvent } from './types';
import { ResearchSystem, ResearchLine } from './interfaces';

/** M1 简化：科研槽位上限（后续可由焦点/科技扩展） */
const MAX_SLOTS = 2;

/** 推进时间基准（毫秒）：cost=1 时约 90s 完成一个节点 */
const BASE_RESEARCH_MS = 90000;
const FIXED_BASE_RESEARCH_MS = Fixed.fromInt(BASE_RESEARCH_MS);

/** 科研线配置：lineId → ResearchLine */
type ResearchConfigMap = Record<string, ResearchLine>;

/**
 * 默认科研线配置（内联，对应 configs/research_lines.json schema）。
 *
 * bonus.value 在 JSON 中为 number，此处用 Fixed.fromNumber 转换为 Fixed。
 * unlock 字段保留为 string。
 */
const DEFAULT_RESEARCH_CONFIGS: ResearchConfigMap = {
  industry: {
    id: 'industry',
    name: '工业线',
    nodes: [
      { id: 'ind_1', name: '基础工业', cost: 1, bonus: { type: 'industry', value: Fixed.fromNumber(0.05) } },
      { id: 'ind_2', name: '流水线生产', cost: 1, bonus: { type: 'industry', value: Fixed.fromNumber(0.05) } },
      { id: 'ind_3', name: '集中规划', cost: 2, bonus: { type: 'industry', value: Fixed.fromNumber(0.08) } },
      { id: 'ind_4', name: '重工业扩张', cost: 2, bonus: { type: 'industry', value: Fixed.fromNumber(0.10) } },
      { id: 'ind_5', name: '自动化制造', cost: 3, bonus: { type: 'industry', value: Fixed.fromNumber(0.12) } },
      { id: 'ind_6', name: '综合工业体系', cost: 3, bonus: { type: 'industry', value: Fixed.fromNumber(0.15) } },
    ],
  },
  electronics: {
    id: 'electronics',
    name: '电子线',
    nodes: [
      { id: 'ele_1', name: '基础电子学', cost: 1, bonus: { type: 'electronics', value: Fixed.fromNumber(0.05) } },
      { id: 'ele_2', name: '无线通讯', cost: 1, bonus: { type: 'electronics', value: Fixed.fromNumber(0.05) } },
      { id: 'ele_3', name: '计算机械', cost: 2, bonus: { type: 'electronics', value: Fixed.fromNumber(0.08) } },
      { id: 'ele_4', name: '雷达系统', cost: 2, bonus: { type: 'electronics', value: Fixed.fromNumber(0.10) } },
      { id: 'ele_5', name: '密码破译', cost: 2, bonus: { type: 'electronics', value: Fixed.fromNumber(0.10) } },
      { id: 'ele_6', name: '综合电子战', cost: 3, bonus: { type: 'electronics', value: Fixed.fromNumber(0.15) } },
    ],
  },
  infantry: {
    id: 'infantry',
    name: '步兵线',
    nodes: [
      { id: 'inf_1', name: '基础步兵装备', cost: 1, bonus: { type: 'infantry', value: Fixed.fromNumber(0.05) } },
      { id: 'inf_2', name: '工兵装备', cost: 1, bonus: { type: 'infantry', value: Fixed.fromNumber(0.05) } },
      { id: 'inf_3', name: '机械化步兵', cost: 2, bonus: { type: 'infantry', value: Fixed.fromNumber(0.08) } },
      { id: 'inf_4', name: '突击步枪', cost: 2, bonus: { type: 'infantry', value: Fixed.fromNumber(0.10) } },
      { id: 'inf_5', name: '特种作战', cost: 2, bonus: { type: 'infantry', value: Fixed.fromNumber(0.12) } },
      { id: 'inf_6', name: '现代步兵学说', cost: 3, bonus: { type: 'infantry', value: Fixed.fromNumber(0.15) }, unlock: 'elite_infantry' },
    ],
  },
  armor: {
    id: 'armor',
    name: '装甲线',
    nodes: [
      { id: 'arm_1', name: '基础装甲', cost: 1, bonus: { type: 'armor', value: Fixed.fromNumber(0.05) } },
      { id: 'arm_2', name: '中型坦克', cost: 1, bonus: { type: 'armor', value: Fixed.fromNumber(0.05) } },
      { id: 'arm_3', name: '装甲突击', cost: 2, bonus: { type: 'armor', value: Fixed.fromNumber(0.08) } },
      { id: 'arm_4', name: '重型坦克', cost: 2, bonus: { type: 'armor', value: Fixed.fromNumber(0.10) } },
      { id: 'arm_5', name: '装甲协同', cost: 3, bonus: { type: 'armor', value: Fixed.fromNumber(0.12) }, unlock: 'heavy_tank' },
      { id: 'arm_6', name: '闪电战学说', cost: 3, bonus: { type: 'armor', value: Fixed.fromNumber(0.15) }, unlock: 'assault_tank' },
    ],
  },
  artillery: {
    id: 'artillery',
    name: '炮兵线',
    nodes: [
      { id: 'art_1', name: '基础火炮', cost: 1, bonus: { type: 'artillery', value: Fixed.fromNumber(0.05) } },
      { id: 'art_2', name: '牵引炮', cost: 1, bonus: { type: 'artillery', value: Fixed.fromNumber(0.05) } },
      { id: 'art_3', name: '自行火炮', cost: 2, bonus: { type: 'artillery', value: Fixed.fromNumber(0.08) } },
      { id: 'art_4', name: '火箭炮', cost: 2, bonus: { type: 'artillery', value: Fixed.fromNumber(0.10) } },
      { id: 'art_5', name: '现代炮兵学说', cost: 3, bonus: { type: 'artillery', value: Fixed.fromNumber(0.15) }, unlock: 'rocket_artillery' },
    ],
  },
  air: {
    id: 'air',
    name: '航空线',
    nodes: [
      { id: 'air_1', name: '基础航空', cost: 1, bonus: { type: 'air', value: Fixed.fromNumber(0.05) } },
      { id: 'air_2', name: '战斗机', cost: 1, bonus: { type: 'air', value: Fixed.fromNumber(0.05) } },
      { id: 'air_3', name: '俯冲轰炸机', cost: 2, bonus: { type: 'air', value: Fixed.fromNumber(0.08) } },
      { id: 'air_4', name: '战略轰炸', cost: 2, bonus: { type: 'air', value: Fixed.fromNumber(0.10) } },
      { id: 'air_5', name: '雷达引导', cost: 3, bonus: { type: 'air', value: Fixed.fromNumber(0.12) }, unlock: 'jet_fighter' },
      { id: 'air_6', name: '现代空军学说', cost: 3, bonus: { type: 'air', value: Fixed.fromNumber(0.15) }, unlock: 'strategic_bomber' },
    ],
  },
  naval: {
    id: 'naval',
    name: '海军线',
    nodes: [
      { id: 'nav_1', name: '基础造船', cost: 1, bonus: { type: 'naval', value: Fixed.fromNumber(0.05) } },
      { id: 'nav_2', name: '驱逐舰', cost: 1, bonus: { type: 'naval', value: Fixed.fromNumber(0.05) } },
      { id: 'nav_3', name: '巡洋舰', cost: 2, bonus: { type: 'naval', value: Fixed.fromNumber(0.08) } },
      { id: 'nav_4', name: '潜艇', cost: 2, bonus: { type: 'naval', value: Fixed.fromNumber(0.10) } },
      { id: 'nav_5', name: '战列舰', cost: 3, bonus: { type: 'naval', value: Fixed.fromNumber(0.12) }, unlock: 'battleship' },
      { id: 'nav_6', name: '航母编队', cost: 3, bonus: { type: 'naval', value: Fixed.fromNumber(0.15) }, unlock: 'carrier' },
    ],
  },
};

/**
 * 默认科研系统实现
 *
 * - assignSlot：分配科研槽位到指定线（校验 slot/lineId，覆盖同槽旧分配）
 * - advanceTick：推进各线 progress；完成节点时 currentNode 前进 + 发 researchCompleted 事件
 * - getBonus：查询某 bonusType 的累计加成（所有已完成节点的 bonus 累加）
 * - isUnlocked：查询某 nodeId 是否在已完成节点集合
 */
export class DefaultResearchSystem implements ResearchSystem {
  /** 注入自定义配置（测试 / 模组用）；默认用 DEFAULT_RESEARCH_CONFIGS */
  private researchConfigs: ResearchConfigMap = DEFAULT_RESEARCH_CONFIGS;

  /**
   * 科研加成缓存：countryId → bonusType → 累计 Fixed 值。
   * 节点完成时增量累加，避免 getBonus 每 tick 遍历所有节点。
   */
  private bonusCache = new Map<string, Map<string, Fixed>>();

  /** 注入配置（覆盖默认） */
  setConfig(configs: ResearchConfigMap): void {
    this.researchConfigs = configs;
    this.bonusCache.clear();
  }

  /**
   * 分配科研槽位
   *
   * 步骤：
   * 1. 校验 slot 在 0..MAX_SLOTS-1、lineId 在配置中存在；无效返回 false
   * 2. 取或创建该国 ResearchState
   * 3. 在 research.lines 中找 assignedSlot === slot 的项：
   *    - 若存在且 lineId 相同：幂等返回 true
   *    - 若存在但 lineId 不同：覆盖 lineId/currentNode/progress/assignedSlot
   * 4. 若无对应 slot 项：push 新项（currentNode 取该线首节点 id）
   * 5. 写回 state.research.set(countryId, research)
   */
  assignSlot(state: WorldState, countryId: string, lineId: string, slot: number): boolean {
    if (slot < 0 || slot >= MAX_SLOTS) return false;

    const line = this.findLine(lineId);
    if (!line) return false;
    if (line.nodes.length === 0) return false;

    const research = this.ensureResearch(state, countryId);
    const firstNodeId = line.nodes[0].id;

    const existingIdx = research.lines.findIndex((l) => l.assignedSlot === slot);
    if (existingIdx >= 0) {
      const existing = research.lines[existingIdx];
      if (existing.lineId === lineId) {
        state.research.set(countryId, research);
        return true;
      }
      // 覆盖：同槽不同线 → 失效该国 bonusCache（旧线的 bonus 已不适用）
      existing.lineId = lineId;
      existing.currentNode = firstNodeId;
      existing.currentNodeIndex = 0;
      existing.progress = Fixed.ZERO;
      existing.assignedSlot = slot;
      this.bonusCache.delete(countryId);
    } else {
      // 新增槽位项
      research.lines.push({
        lineId,
        currentNode: firstNodeId,
        currentNodeIndex: 0,
        progress: Fixed.ZERO,
        assignedSlot: slot,
      });
    }

    state.research.set(countryId, research);
    return true;
  }

  /**
   * 推进科研
   *
   * 步骤：
   * 1. 取 research = state.research.get(countryId)，不存在返回 []
   * 2. 遍历 research.lines（按数组顺序，保证联机一致）：
   *    - 跳过 assignedSlot < 0 的线（已完成）
   *    - 取 line = findLine(lineId)；找不到跳过
   *    - 取 nodeIndex = line.nodes.findIndex(currentNode)；找不到跳过
   *    - progress += dtMs / (BASE_RESEARCH_MS × cost)
   *    - 若 progress >= 1：
   *      - 发 researchCompleted 事件
   *      - 若有下一节点：currentNode 前进、progress=0
   *      - 否则：assignedSlot=-1、progress=0
   * 3. 写回 state.research.set(countryId, research)
   */
  advanceTick(state: WorldState, countryId: string, dtMs: Fixed): GameEvent[] {
    const research = state.research.get(countryId);
    if (!research) return [];

    const events: GameEvent[] = [];

    for (const lineState of research.lines) {
      if (lineState.assignedSlot < 0) continue;

      const line = this.findLine(lineState.lineId);
      if (!line) continue;

      // 使用 currentNodeIndex 缓存，索引越界时回退 findIndex 修复
      let nodeIndex = lineState.currentNodeIndex;
      if (nodeIndex < 0 || nodeIndex >= line.nodes.length || line.nodes[nodeIndex].id !== lineState.currentNode) {
        nodeIndex = line.nodes.findIndex((n) => n.id === lineState.currentNode);
        lineState.currentNodeIndex = nodeIndex < 0 ? 0 : nodeIndex;
      }
      if (nodeIndex < 0) continue;

      const node = line.nodes[nodeIndex];
      // progress += dtMs / (90000 × cost)
      const divisor = FIXED_BASE_RESEARCH_MS.mul(Fixed.fromInt(node.cost));
      lineState.progress = lineState.progress.add(dtMs.div(divisor));

      if (lineState.progress.greaterOrEqual(Fixed.ONE)) {
        events.push({
          kind: 'researchCompleted',
          countryId,
          lineId: lineState.lineId,
          nodeId: lineState.currentNode,
        });

        // 累加该节点 bonus 到缓存
        if (node.bonus) {
          this.addNodeBonus(countryId, node.bonus.type, node.bonus.value);
        }

        if (nodeIndex + 1 < line.nodes.length) {
          // 前进到下一节点
          lineState.currentNode = line.nodes[nodeIndex + 1].id;
          lineState.currentNodeIndex = nodeIndex + 1;
          lineState.progress = Fixed.ZERO;
        } else {
          // 该线完成
          lineState.assignedSlot = -1;
          lineState.progress = Fixed.ZERO;
        }
      }
    }

    state.research.set(countryId, research);
    return events;
  }

  /** bonusCache 增量累加 */
  private addNodeBonus(countryId: string, bonusType: string, value: Fixed): void {
    let countryMap = this.bonusCache.get(countryId);
    if (!countryMap) {
      countryMap = new Map();
      this.bonusCache.set(countryId, countryMap);
    }
    const current = countryMap.get(bonusType) ?? Fixed.ZERO;
    countryMap.set(bonusType, current.add(value));
  }

  /**
   * 查询某 bonusType 的累计加成
   *
   * 优先查 bonusCache；cache miss 时全量遍历重建缓存。
   * 已完成节点定义：
   * - assignedSlot === -1（线完成）：该线所有节点都算已完成
   * - 否则：nodeIndex < currentNodeIndex 的节点算已完成
   */
  getBonus(state: WorldState, countryId: string, bonusType: string): Fixed {
    const research = state.research.get(countryId);
    if (!research) return Fixed.ZERO;

    // 先查缓存
    const countryMap = this.bonusCache.get(countryId);
    if (countryMap && countryMap.has(bonusType)) {
      return countryMap.get(bonusType) as Fixed;
    }

    // cache miss：全量计算并回填整个国家的 bonusMap
    const rebuilt = this.rebuildBonusCache(research);
    return rebuilt.get(bonusType) ?? Fixed.ZERO;
  }

  /**
   * 全量遍历该国所有线/节点，重建 bonusCache 中该国条目
   */
  private rebuildBonusCache(research: ResearchState): Map<string, Fixed> {
    const countryMap = new Map<string, Fixed>();
    for (const lineState of research.lines) {
      const line = this.findLine(lineState.lineId);
      if (!line) continue;

      // currentNodeIndex 越界时修复
      let currentIdx = lineState.currentNodeIndex;
      if (currentIdx < 0 || currentIdx > line.nodes.length || (currentIdx < line.nodes.length && line.nodes[currentIdx].id !== lineState.currentNode)) {
        currentIdx = line.nodes.findIndex((n) => n.id === lineState.currentNode);
        if (currentIdx < 0) currentIdx = lineState.assignedSlot === -1 ? line.nodes.length : 0;
        lineState.currentNodeIndex = currentIdx;
      }

      const completedCount = lineState.assignedSlot === -1 ? line.nodes.length : currentIdx;
      for (let i = 0; i < completedCount; i++) {
        const node = line.nodes[i];
        if (!node.bonus) continue;
        const cur = countryMap.get(node.bonus.type) ?? Fixed.ZERO;
        countryMap.set(node.bonus.type, cur.add(node.bonus.value));
      }
    }
    this.bonusCache.set(research.countryId, countryMap);
    return countryMap;
  }

  /**
   * 查询某科技节点是否已解锁
   *
   * 遍历该国所有科研线，若 nodeId 在某线的已完成节点集合中则返回 true。
   * 已完成定义同 getBonus：
   * - assignedSlot === -1（线完成）：该线所有节点都算已解锁
   * - 否则：nodeIndex < currentNodeIndex 的节点算已解锁
   */
  isUnlocked(state: WorldState, countryId: string, nodeId: string): boolean {
    const research = state.research.get(countryId);
    if (!research) return false;

    for (const lineState of research.lines) {
      const line = this.findLine(lineState.lineId);
      if (!line) continue;

      // 直接查 nodeId 所在索引（这是冷路径，不频繁）
      const nodeIndex = line.nodes.findIndex((n) => n.id === nodeId);
      if (nodeIndex < 0) continue;

      if (lineState.assignedSlot === -1) {
        return true;
      }

      // 使用 currentNodeIndex 缓存，越界时修复
      let currentIdx = lineState.currentNodeIndex;
      if (currentIdx < 0 || currentIdx >= line.nodes.length || line.nodes[currentIdx].id !== lineState.currentNode) {
        currentIdx = line.nodes.findIndex((n) => n.id === lineState.currentNode);
        if (currentIdx < 0) currentIdx = 0;
        lineState.currentNodeIndex = currentIdx;
      }

      if (nodeIndex < currentIdx) {
        return true;
      }
    }
    return false;
  }

  /** 从 researchConfigs 查找科研线配置 */
  private findLine(lineId: string): ResearchLine | null {
    return this.researchConfigs[lineId] ?? null;
  }

  /** 取或创建该国 ResearchState（lines 为空数组） */
  private ensureResearch(state: WorldState, countryId: string): ResearchState {
    const existing = state.research.get(countryId);
    if (existing) return existing;

    const research: ResearchState = {
      countryId,
      lines: [],
    };
    state.research.set(countryId, research);
    return research;
  }
}
