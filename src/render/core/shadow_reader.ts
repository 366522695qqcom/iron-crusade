/**
 * core 影子读取器（render/ 层专用）
 *
 * 实现依据：技术设计文档 1.4 - core/ 与 render/ 解耦原则
 *   "core/ 是纯 TS 无 Cocos 依赖，渲染层只读 core 影子"
 *
 * 职责：把 WorldState（core/ 数据模型）转成 render/ 层只读的展示视图。
 *   - 不修改 core/ 状态
 *   - 不调用 core/ 系统方法（tick / applyAction 等由 game/ 层调用）
 *   - 仅暴露读取接口供 panels/cards/alerts 渲染
 *
 * 转换规则：
 * - Fixed → number（用 Fixed.toNumber()，仅渲染层允许浮点）
 * - SortedMap → 数组（按 forEach 升序）
 * - 资源/工厂/焦点/科研/争端/模式/会话目标等都提供专用读取接口
 *
 * 渲染层禁止直接访问 WorldState 字段，必须经 shadow_reader 转换。
 */
import { WorldState, Country, ResourceStockpile, Factory } from '../../core/state/world_state';
import { Fixed } from '../../core/determinism/fixed';
import { ResourceType } from '../../core/types';
import type { CombatPanelShadow } from '../ui/panels/combat_panel';

/** 资源条单项（PROJECT.md 3.2.6 顶部资源条） */
export interface ResourceBarItem {
  type: ResourceType;
  /** 当前储备 */
  current: number;
  /** 储备上限 */
  cap: number;
  /** 储备满 0-1 */
  ratio: number;
}

/** 顶部资源条影子 */
export interface ResourceBarShadow {
  countryId: string;
  items: ResourceBarItem[];
}

/** 焦点三选一候选影子（PROJECT.md 3.5） */
export interface FocusCandidateShadow {
  focusId: string;
  name: string;
  cost: number;
  /** 当前进度 0-1 */
  progress: number;
}

/** 焦点树面板影子 */
export interface FocusPanelShadow {
  countryId: string;
  /** 已完成焦点 ID */
  completed: string[];
  /** 当前进行中焦点（null 表示无） */
  active: { focusId: string; name: string; progress: number } | null;
  /** 三选一候选 */
  candidates: FocusCandidateShadow[];
  /** 距下次刷新 tick 数 */
  refreshInTicks: number;
}

/** 科研线影子 */
export interface ResearchLineShadow {
  lineId: string;
  /** 当前节点 ID */
  currentNode: string;
  /** 当前节点进度 0-1 */
  progress: number;
  /** 槽位（-1 = 未分配 / 已完成） */
  assignedSlot: number;
}

/** 科研面板影子 */
export interface ResearchPanelShadow {
  countryId: string;
  lines: ResearchLineShadow[];
}

/** 工厂影子（PROJECT.md 3.3） */
export interface FactoryShadow {
  id: number;
  provinceId: number;
  type: Factory['type'];
  state: Factory['state'];
  /** 空闲持续 tick 数（state=idle 时有效） */
  idleSinceTick: number;
  /** 生产进度 0-1 */
  productionProgress: number;
}

/** 工厂面板影子（含空闲统计，PROJECT.md 3.3.3 空闲提醒系统） */
export interface FactoryPanelShadow {
  countryId: string;
  factories: FactoryShadow[];
  /** 空闲工厂数量 */
  idleCount: number;
  /** 最长空闲 tick 数 */
  longestIdleTicks: number;
  /** 提醒层级 L0-L4 */
  alertLevel: 0 | 1 | 2 | 3 | 4;
}

/** 国家信息影子（顶部条显示用） */
export interface CountryHeaderShadow {
  countryId: string;
  name: string;
  /** 政治点 */
  politicalPower: number;
  /** 稳定度 0-1 */
  stability: number;
  /** 争端决心 0-1（S.2 脱敏：原战争支持度） */
  disputeResolve: number;
  /** 发展路线（S.1 脱敏：原意识形态） */
  developmentPath: string;
}

/** 完整主界面影子（聚合各子影子，供 main_ui 渲染） */
export interface MainUiShadow {
  /** 玩家国家头部信息 */
  playerCountry: CountryHeaderShadow;
  /** 顶部资源条 */
  resourceBar: ResourceBarShadow;
  /** 焦点树面板 */
  focus: FocusPanelShadow;
  /** 科研面板 */
  research: ResearchPanelShadow;
  /** 工厂面板 */
  factory: FactoryPanelShadow;
}

/** 空闲提醒层级阈值（PROJECT.md 3.3.3，10Hz：50/100/150/300 tick = 5/10/15/30s） */
const IDLE_L1_TICKS = 50;
const IDLE_L2_TICKS = 100;
const IDLE_L3_TICKS = 150;
const IDLE_L4_TICKS = 300;

// ----- 模块级 pooled shadow 实例 -----

function createEmptyResourceBarItem(): ResourceBarItem {
  return { type: 'steel', current: 0, cap: 0, ratio: 0 };
}

function createEmptyFactoryShadow(): FactoryShadow {
  return { id: 0, provinceId: 0, type: 'civilian', state: 'idle', idleSinceTick: 0, productionProgress: 0 };
}

function createEmptyFocusCandidate(): FocusCandidateShadow {
  return { focusId: '', name: '', cost: 0, progress: 0 };
}

function createEmptyResearchLine(): ResearchLineShadow {
  return { lineId: '', currentNode: '', progress: 0, assignedSlot: -1 };
}

const pooledResourceBarItems: ResourceBarItem[] = [];
for (let i = 0; i < 6; i++) pooledResourceBarItems.push(createEmptyResourceBarItem());

const pooledFactories: FactoryShadow[] = [];
for (let i = 0; i < 12; i++) pooledFactories.push(createEmptyFactoryShadow());

const pooledFocusCandidates: FocusCandidateShadow[] = [];
for (let i = 0; i < 3; i++) pooledFocusCandidates.push(createEmptyFocusCandidate());

const pooledResearchLines: ResearchLineShadow[] = [];
for (let i = 0; i < 7; i++) pooledResearchLines.push(createEmptyResearchLine());

const pooledCountryHeader: CountryHeaderShadow = {
  countryId: '',
  name: '',
  politicalPower: 0,
  stability: 0,
  disputeResolve: 0,
  developmentPath: '',
};

const pooledResourceBar: ResourceBarShadow = {
  countryId: '',
  items: pooledResourceBarItems,
};

const pooledFocus: FocusPanelShadow = {
  countryId: '',
  completed: [],
  active: null,
  candidates: pooledFocusCandidates,
  refreshInTicks: 0,
};

const pooledResearch: ResearchPanelShadow = {
  countryId: '',
  lines: pooledResearchLines,
};

const pooledFactory: FactoryPanelShadow = {
  countryId: '',
  factories: pooledFactories,
  idleCount: 0,
  longestIdleTicks: 0,
  alertLevel: 0,
};

const pooledMainUiShadow: MainUiShadow = {
  playerCountry: pooledCountryHeader,
  resourceBar: pooledResourceBar,
  focus: pooledFocus,
  research: pooledResearch,
  factory: pooledFactory,
};

const pooledCombatStats = {
  controlledProvinces: 0,
  totalDivisions: 0,
  equipmentLoss: 0,
  enemyEquipmentLoss: 0,
  totalDisputes: 0,
};

const pooledCombatPanel: CombatPanelShadow = {
  fronts: [],
  stats: pooledCombatStats as CombatPanelShadow['stats'],
  disputeResolve: 0,
};

export { pooledMainUiShadow, pooledCombatPanel };

/** 取玩家国家 ID（isPlayer=true 的第一个国家，模块级缓存避免每帧遍历所有国家） */
let cachedPlayerStateRef: WorldState | null = null;
let cachedPlayerId: string | null = null;
export function getPlayerCountryId(state: WorldState): string | null {
  if (state === cachedPlayerStateRef) return cachedPlayerId;
  let found: string | null = null;
  state.countries.forEach((c: Country) => {
    if (c.isPlayer && found === null) found = c.id;
  });
  cachedPlayerStateRef = state;
  cachedPlayerId = found;
  return found;
}

/** 读取顶部资源条影子 */
export function readResourceBar(state: WorldState, countryId: string, out?: ResourceBarShadow): ResourceBarShadow {
  const stockpile: ResourceStockpile | undefined = state.stockpiles.get(countryId);
  const types: ResourceType[] = ['steel', 'oil', 'tungsten', 'rubber', 'aluminum', 'political'];
  if (out) {
    out.countryId = countryId;
    const items = out.items;
    items.length = 0;
    for (let i = 0; i < types.length; i++) {
      const type = types[i];
      const current = stockpile ? toNum(stockpile[type as keyof ResourceStockpile] as Fixed) : 0;
      const cap = stockpile ? toNum(stockpile.caps[type as keyof ResourceStockpile['caps']] as Fixed) : 0;
      const ratio = cap > 0 ? clamp01(current / cap) : 0;
      const item = pooledResourceBarItems[i];
      item.type = type;
      item.current = current;
      item.cap = cap;
      item.ratio = ratio;
      items.push(item);
    }
    return out;
  }
  const items: ResourceBarItem[] = types.map((type) => {
    const current = stockpile ? toNum(stockpile[type as keyof ResourceStockpile] as Fixed) : 0;
    const cap = stockpile ? toNum(stockpile.caps[type as keyof ResourceStockpile['caps']] as Fixed) : 0;
    const ratio = cap > 0 ? clamp01(current / cap) : 0;
    return { type, current, cap, ratio };
  });
  return { countryId, items };
}

/** 读取焦点面板影子 */
export function readFocusPanel(state: WorldState, countryId: string, out?: FocusPanelShadow): FocusPanelShadow {
  const focusTree = state.focusTrees.get(countryId);
  if (!focusTree) {
    if (out) {
      out.countryId = countryId;
      out.completed.length = 0;
      out.active = null;
      const cands = out.candidates;
      cands.length = 0;
      out.refreshInTicks = 0;
      return out;
    }
    return { countryId, completed: [], active: null, candidates: [], refreshInTicks: 0 };
  }
  if (out) {
    out.countryId = countryId;
    out.completed.length = 0;
    for (const id of focusTree.completedFocusIds) out.completed.push(id);
    if (focusTree.activeFocusId) {
      if (!out.active) out.active = { focusId: '', name: '', progress: 0 };
      out.active.focusId = focusTree.activeFocusId;
      out.active.name = focusTree.activeFocusId;
      out.active.progress = toNum(focusTree.activeProgress);
    } else {
      out.active = null;
    }
    const cands = out.candidates;
    cands.length = 0;
    for (let i = 0; i < focusTree.candidates.length; i++) {
      const id = focusTree.candidates[i];
      const cand = pooledFocusCandidates[i];
      cand.focusId = id;
      cand.name = id;
      cand.cost = 0;
      cand.progress = focusTree.activeFocusId === id ? toNum(focusTree.activeProgress) : 0;
      cands.push(cand);
    }
    out.refreshInTicks = focusTree.refreshInTicks;
    return out;
  }
  return {
    countryId,
    completed: [...focusTree.completedFocusIds],
    active: focusTree.activeFocusId
      ? {
          focusId: focusTree.activeFocusId,
          name: focusTree.activeFocusId,
          progress: toNum(focusTree.activeProgress),
        }
      : null,
    candidates: focusTree.candidates.map((id) => ({
      focusId: id,
      name: id,
      cost: 0,
      progress: focusTree.activeFocusId === id ? toNum(focusTree.activeProgress) : 0,
    })),
    refreshInTicks: focusTree.refreshInTicks,
  };
}

/** 读取科研面板影子 */
export function readResearchPanel(state: WorldState, countryId: string, out?: ResearchPanelShadow): ResearchPanelShadow {
  const research = state.research.get(countryId);
  if (!research) {
    if (out) {
      out.countryId = countryId;
      out.lines.length = 0;
      return out;
    }
    return { countryId, lines: [] };
  }
  if (out) {
    out.countryId = countryId;
    const lines = out.lines;
    lines.length = 0;
    for (let i = 0; i < research.lines.length; i++) {
      const l = research.lines[i];
      const line = pooledResearchLines[i];
      line.lineId = l.lineId;
      line.currentNode = l.currentNode;
      line.progress = toNum(l.progress);
      line.assignedSlot = l.assignedSlot;
      lines.push(line);
    }
    return out;
  }
  return {
    countryId,
    lines: research.lines.map((l) => ({
      lineId: l.lineId,
      currentNode: l.currentNode,
      progress: toNum(l.progress),
      assignedSlot: l.assignedSlot,
    })),
  };
}

/** 读取工厂面板影子（含空闲统计，按国家过滤工厂） */
export function readFactoryPanel(state: WorldState, countryId: string, out?: FactoryPanelShadow): FactoryPanelShadow {
  const resultFactories = out ? out.factories : [];
  if (out) resultFactories.length = 0;
  let idleCount = 0;
  let longestIdleTicks = 0;
  let factoryIdx = 0;

  state.factories.forEach((f: Factory) => {
    const prov = state.provinces.get(f.provinceId);
    if (!prov || prov.controllerId !== countryId) return;
    let shadow: FactoryShadow;
    if (out) {
      shadow = pooledFactories[factoryIdx] ?? (pooledFactories[factoryIdx] = createEmptyFactoryShadow());
    } else {
      shadow = createEmptyFactoryShadow();
    }
    shadow.id = f.id;
    shadow.provinceId = f.provinceId;
    shadow.type = f.type;
    shadow.state = f.state;
    shadow.idleSinceTick = f.idleSinceTick;
    shadow.productionProgress = toNum(f.productionProgress);
    resultFactories.push(shadow);
    factoryIdx++;

    if (f.state === 'idle') {
      idleCount++;
      const idleTicks = state.tickId - f.idleSinceTick;
      if (idleTicks > longestIdleTicks) longestIdleTicks = idleTicks;
    }
  });

  let alertLevel: 0 | 1 | 2 | 3 | 4 = 0;
  if (idleCount > 0) {
    if (longestIdleTicks >= IDLE_L4_TICKS) alertLevel = 4;
    else if (longestIdleTicks >= IDLE_L3_TICKS) alertLevel = 3;
    else if (longestIdleTicks >= IDLE_L2_TICKS) alertLevel = 2;
    else if (longestIdleTicks >= IDLE_L1_TICKS) alertLevel = 1;
  }

  if (out) {
    out.countryId = countryId;
    out.idleCount = idleCount;
    out.longestIdleTicks = longestIdleTicks;
    out.alertLevel = alertLevel;
    return out;
  }
  return { countryId, factories: resultFactories, idleCount, longestIdleTicks, alertLevel };
}

/** 读取国家头部影子 */
export function readCountryHeader(state: WorldState, countryId: string, out?: CountryHeaderShadow): CountryHeaderShadow {
  const country = state.countries.get(countryId);
  if (!country) {
    if (out) {
      out.countryId = countryId;
      out.name = countryId;
      out.politicalPower = 0;
      out.stability = 0;
      out.disputeResolve = 0;
      out.developmentPath = 'unknown';
      return out;
    }
    return {
      countryId,
      name: countryId,
      politicalPower: 0,
      stability: 0,
      disputeResolve: 0,
      developmentPath: 'unknown',
    };
  }
  if (out) {
    out.countryId = country.id;
    out.name = country.name;
    out.politicalPower = toNum(country.politicalPower);
    out.stability = toNum(country.stability);
    out.disputeResolve = toNum(country.disputeResolve);
    out.developmentPath = country.developmentPath;
    return out;
  }
  return {
    countryId: country.id,
    name: country.name,
    politicalPower: toNum(country.politicalPower),
    stability: toNum(country.stability),
    disputeResolve: toNum(country.disputeResolve),
    developmentPath: country.developmentPath,
  };
}

/** 读取完整主界面影子（聚合） */
export function readMainUiShadow(state: WorldState, countryId: string, out?: MainUiShadow): MainUiShadow {
  if (out) {
    readCountryHeader(state, countryId, out.playerCountry as CountryHeaderShadow);
    readResourceBar(state, countryId, out.resourceBar as ResourceBarShadow);
    readFocusPanel(state, countryId, out.focus as FocusPanelShadow);
    readResearchPanel(state, countryId, out.research as ResearchPanelShadow);
    readFactoryPanel(state, countryId, out.factory as FactoryPanelShadow);
    return out;
  }
  return {
    playerCountry: readCountryHeader(state, countryId),
    resourceBar: readResourceBar(state, countryId),
    focus: readFocusPanel(state, countryId),
    research: readResearchPanel(state, countryId),
    factory: readFactoryPanel(state, countryId),
  };
}

/** 读取作战面板影子 */
export function readCombatPanelShadow(state: WorldState, countryId: string, out?: CombatPanelShadow): CombatPanelShadow {
  const country = state.countries.get(countryId);
  const disputeResolve = country ? toNum(country.disputeResolve) : 0;

  let controlledProvinces = 0;
  state.provinces.forEach((p) => {
    if (p.controllerId === countryId) {
      controlledProvinces++;
    }
  });

  let totalDivisions = 0;
  state.divisions.forEach((d) => {
    if (d.ownerId === countryId) totalDivisions++;
  });

  let totalDisputes = 0;
  state.disputes.forEach((disp) => {
    if (disp.participantSet.has(countryId)) totalDisputes++;
  });

  let frontCount = 0;
  const frontLines: CombatPanelShadow['fronts'] = out ? out.fronts : [];
  if (out) frontLines.length = 0;

  state.fronts.forEach((fronts) => {
    for (const f of fronts) {
      if (f.attackerId === countryId || f.defenderId === countryId) {
        frontCount++;
        if (frontLines.length < 3) {
          const toProv = state.provinces.get(f.toProvince);
          const name = toProv ? `前线-${toProv.id}` : `front-${frontCount}`;
          let deployedDivisions = 0;
          let enemyDivisions = 0;
          state.divisions.forEach((div) => {
            if (div.currentProvinceId === f.toProvince || div.currentProvinceId === f.fromProvince) {
              if (div.ownerId === countryId) deployedDivisions++;
              else enemyDivisions++;
            }
          });
          frontLines.push({
            frontId: `${f.attackerId}-${f.fromProvince}-${f.toProvince}`,
            name,
            deployedDivisions,
            enemyDivisions,
            offensiveProgress: 0,
            provinceDelta: 0,
          });
        }
      }
    }
  });

  if (out) {
    out.stats.controlledProvinces = controlledProvinces;
    out.stats.totalDivisions = totalDivisions;
    out.stats.equipmentLoss = 0;
    out.stats.enemyEquipmentLoss = 0;
    out.stats.totalDisputes = totalDisputes;
    out.disputeResolve = disputeResolve;
    return out;
  }
  return {
    fronts: frontLines,
    stats: {
      controlledProvinces,
      totalDivisions,
      equipmentLoss: 0,
      enemyEquipmentLoss: 0,
      totalDisputes,
    },
    disputeResolve,
  };
}

// ----- 内部工具 -----

function toNum(f: Fixed): number {
  return f.toNumber();
}

function clamp01(v: number): number {
  if (v < 0) return 0;
  if (v > 1) return 1;
  return v;
}
