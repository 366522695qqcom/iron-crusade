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

/** 战争损失方单项（玩家/敌方） */
export interface WarSideLossesView {
  countryId: string;
  countryName: string;
  /** 投降进度 0-1 */
  surrenderProgress: number;
  /** 投降阈值（M1统一0.8） */
  surrenderThreshold: number;
  /** 已管控敌方省份 */
  provincesTaken: number;
  /** 被歼师团数 */
  divisionsDestroyed: number;
  /** 我方现有师团数 */
  divisionsAlive: number;
  /** 被歼舰船数（M3使用，M1=0） */
  shipsDestroyed: number;
  /** 被歼飞机数（M4使用，M1=0） */
  aircraftDestroyed: number;
  /** 被击沉运输船数（M3使用，M1=0） */
  convoysDestroyed: number;
  /** 丢失VP省数 */
  majorCitiesLost: number;
  /** 首都是否沦陷 */
  capitalLost: boolean;
  /** 控制VP数 */
  controlledVPs: number;
  /** 总VP数 */
  totalVPs: number;
  /** 设备损失 */
  equipmentLoss: number;
}

/** 战争日志条目 */
export interface WarLogEntryView {
  tick: number;
  text: string;
  type: 'combat' | 'control' | 'destroy' | 'surrender' | 'other';
}

/** 战争总面板影子（WarOverviewPanel） */
export interface WarOverviewShadow {
  /** 是否处于战争（false时面板不显示） */
  atWar: boolean;
  /** 玩家方损失 */
  playerSide: WarSideLossesView;
  /** 敌方损失（取当前主要对手） */
  enemySide: WarSideLossesView;
  /** 战争日志（最近N条，倒序） */
  recentLogs: WarLogEntryView[];
}

/** 师团选中状态条影子（UnitCommandBar） */
export interface UnitCommandShadow {
  /** 是否有选中师团 */
  hasSelection: boolean;
  /** 选中师团数量 */
  selectedCount: number;
  /** 是否可移动（ready状态 + 有相邻省） */
  canMove: boolean;
  /** 是否可拆分（满编ready师团） */
  canSplit: boolean;
  /** 是否可合并（同省>=2个不满编） */
  canMerge: boolean;
  /** 是否可停止（moving/retreating/offensive中） */
  canStop: boolean;
  /** 当前师团整体状态概要 */
  statusSummary: string;
  /** 当前省份名 */
  provinceSummary: string;
  /** 平均兵力 0-1 */
  avgStrength: number;
  /** 平均组织度 0-1 */
  avgOrganization: number;
}

/** 师团在地图上的渲染影子（CombatBubble用） */
export interface MapDivisionView {
  divisionId: number;
  ownerId: string;
  provinceId: number;
  status: 'ready' | 'moving' | 'fighting' | 'retreating' | 'training';
  isSelected: boolean;
  /** 兵力0-1 */
  strength: number;
  /** 组织度0-1 */
  organization: number;
}

/** 战斗泡泡影子（交火省份） */
export interface CombatBubbleView {
  provinceId: number;
  /** 攻方师团数 */
  attackerDivisions: number;
  /** 守方师团数 */
  defenderDivisions: number;
  /** 攻方国家名 */
  attackerName: string;
  /** 守方国家名 */
  defenderName: string;
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

function emptyWarSide(): WarSideLossesView {
  return {
    countryId: '',
    countryName: '',
    surrenderProgress: 0,
    surrenderThreshold: 0.8,
    provincesTaken: 0,
    divisionsDestroyed: 0,
    divisionsAlive: 0,
    shipsDestroyed: 0,
    aircraftDestroyed: 0,
    convoysDestroyed: 0,
    majorCitiesLost: 0,
    capitalLost: false,
    controlledVPs: 0,
    totalVPs: 0,
    equipmentLoss: 0,
  };
}

const pooledPlayerSide: WarSideLossesView = emptyWarSide();
const pooledEnemySide: WarSideLossesView = emptyWarSide();
const pooledWarLogs: WarLogEntryView[] = [];

const pooledWarOverview: WarOverviewShadow = {
  atWar: false,
  playerSide: pooledPlayerSide,
  enemySide: pooledEnemySide,
  recentLogs: pooledWarLogs,
};

const pooledUnitCommand: UnitCommandShadow = {
  hasSelection: false,
  selectedCount: 0,
  canMove: false,
  canSplit: false,
  canMerge: false,
  canStop: false,
  statusSummary: '',
  provinceSummary: '',
  avgStrength: 0,
  avgOrganization: 0,
};

export {
  pooledMainUiShadow,
  pooledCombatPanel,
  pooledWarOverview,
  pooledUnitCommand,
};

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

/** 读取战争总面板影子 */
export function readWarOverviewShadow(state: WorldState, countryId: string, out?: WarOverviewShadow): WarOverviewShadow {
  const playerCountry = state.countries.get(countryId);
  const playerName = playerCountry ? playerCountry.name : countryId;

  let enemyId: string | null = null;
  let enemyName = '';
  state.disputes.forEach((disp) => {
    if (!disp.participantSet.has(countryId)) return;
    for (const pid of disp.participants) {
      if (pid !== countryId) {
        enemyId = pid;
        const ec = state.countries.get(pid);
        enemyName = ec ? ec.name : pid;
        return;
      }
    }
  });

  const playerLosses = state.warLosses.get(countryId);
  const enemyLosses = enemyId ? state.warLosses.get(enemyId) : null;

  let playerSurrender = 0;
  let playerThreshold = 0.8;
  let enemySurrender = 0;
  let enemyThreshold = 0.8;
  state.disputes.forEach((disp) => {
    if (disp.participantSet.has(countryId)) {
      if (disp.surrenderProgress[countryId]) playerSurrender = toNum(disp.surrenderProgress[countryId]);
      if (disp.surrenderThreshold[countryId]) playerThreshold = toNum(disp.surrenderThreshold[countryId]);
      if (enemyId) {
        if (disp.surrenderProgress[enemyId]) enemySurrender = toNum(disp.surrenderProgress[enemyId]);
        if (disp.surrenderThreshold[enemyId]) enemyThreshold = toNum(disp.surrenderThreshold[enemyId]);
      }
    }
  });

  const atWar = enemyId !== null;

  // 统计现有师团数/VP控制
  let playerDivsAlive = 0;
  let enemyDivsAlive = 0;
  let playerControlledVPs = 0;
  let enemyControlledVPs = 0;
  let totalVPs = 0;
  state.provinces.forEach((p) => {
    if (p.VP > 0) totalVPs += p.VP;
    if (p.controllerId === countryId && p.VP > 0) playerControlledVPs += p.VP;
    if (enemyId && p.controllerId === enemyId && p.VP > 0) enemyControlledVPs += p.VP;
  });
  state.divisions.forEach((d) => {
    if (d.ownerId === countryId) playerDivsAlive++;
    if (enemyId && d.ownerId === enemyId) enemyDivsAlive++;
  });

  const recentLogs: WarLogEntryView[] = out ? out.recentLogs : [];
  if (out) recentLogs.length = 0;
  const logCount = Math.min(state.warLog.length, 10);
  for (let i = 0; i < logCount; i++) {
    const entry = state.warLog[state.warLog.length - 1 - i];
    let type: WarLogEntryView['type'] = 'other';
    switch (entry.kind) {
      case 'province_controlled': type = 'control'; break;
      case 'division_destroyed': type = 'destroy'; break;
      case 'naval_battle':
      case 'air_battle':
      case 'invasion': type = 'combat'; break;
      case 'surrendered': type = 'surrender'; break;
      default: type = 'other';
    }
    const t = Math.floor(entry.tickId / 10);
    recentLogs.push({ tick: entry.tickId, text: `T${t} ${entry.text}`, type });
  }

  const playerSide: WarSideLossesView = out ? out.playerSide : emptyWarSide();
  playerSide.countryId = countryId;
  playerSide.countryName = playerName;
  playerSide.surrenderProgress = playerSurrender;
  playerSide.surrenderThreshold = playerThreshold;
  playerSide.divisionsDestroyed = playerLosses ? playerLosses.divisionsLost : 0;
  playerSide.divisionsAlive = playerDivsAlive;
  playerSide.shipsDestroyed = 0;
  playerSide.aircraftDestroyed = 0;
  playerSide.convoysDestroyed = playerLosses ? playerLosses.convoysLost : 0;
  playerSide.provincesTaken = enemyLosses ? enemyLosses.provincesLost : 0;
  playerSide.majorCitiesLost = playerLosses ? playerLosses.majorCitiesLost : 0;
  playerSide.capitalLost = playerLosses ? playerLosses.capitalLost : false;
  playerSide.controlledVPs = playerControlledVPs;
  playerSide.totalVPs = totalVPs;
  playerSide.equipmentLoss = 0;

  const enemySide: WarSideLossesView = out ? out.enemySide : emptyWarSide();
  enemySide.countryId = enemyId ?? '';
  enemySide.countryName = enemyName;
  enemySide.surrenderProgress = enemySurrender;
  enemySide.surrenderThreshold = enemyThreshold;
  enemySide.divisionsDestroyed = enemyLosses ? enemyLosses.divisionsLost : 0;
  enemySide.divisionsAlive = enemyDivsAlive;
  enemySide.shipsDestroyed = 0;
  enemySide.aircraftDestroyed = 0;
  enemySide.convoysDestroyed = enemyLosses ? enemyLosses.convoysLost : 0;
  enemySide.provincesTaken = playerLosses ? playerLosses.provincesLost : 0;
  enemySide.majorCitiesLost = enemyLosses ? enemyLosses.majorCitiesLost : 0;
  enemySide.capitalLost = enemyLosses ? enemyLosses.capitalLost : false;
  enemySide.controlledVPs = enemyControlledVPs;
  enemySide.totalVPs = totalVPs;
  enemySide.equipmentLoss = 0;

  if (out) {
    out.atWar = atWar;
    return out;
  }
  return { atWar, playerSide, enemySide, recentLogs };
}

/** 读取师团命令条影子 */
export function readUnitCommandShadow(state: WorldState, countryId: string, out?: UnitCommandShadow): UnitCommandShadow {
  const ids = state.selectedUnitIds;
  const selectedDivs: typeof state.divisions extends Map<number, infer D> ? D[] : never[] = [];
  for (const id of ids) {
    const d = state.divisions.get(id);
    if (d && d.ownerId === countryId) selectedDivs.push(d as never);
  }
  const count = selectedDivs.length;
  const hasSelection = count > 0;

  let canMove = false;
  let canSplit = false;
  let canMerge = false;
  let canStop = false;
  let avgStrength = 0;
  let avgOrg = 0;
  let statusSummary = '';
  let provinceSummary = '';

  if (hasSelection) {
    let totalStrength = 0;
    let totalOrg = 0;
    let allReady = true;
    let anyMoving = false;
    let anyFighting = false;
    let anyRetreating = false;
    let allSameProvince = true;
    let firstProv: number | null = null;
    const provinceCount = new Map<number, number>();

    for (const d of selectedDivs) {
      totalStrength += toNum((d as { strength: Fixed }).strength);
      totalOrg += toNum((d as { organization: Fixed }).organization);
      const status = (d as { status: string }).status;
      const prov = (d as { currentProvinceId: number }).currentProvinceId;
      if (firstProv === null) firstProv = prov;
      else if (prov !== firstProv) allSameProvince = false;
      provinceCount.set(prov, (provinceCount.get(prov) ?? 0) + 1);
      if (status !== 'ready') allReady = false;
      if (status === 'moving') anyMoving = true;
      if (status === 'fighting') anyFighting = true;
      if (status === 'retreating') anyRetreating = true;
      if ((d as { inOffensive: boolean }).inOffensive) anyFighting = true;
    }

    avgStrength = totalStrength / count;
    avgOrg = totalOrg / count;

    canMove = allReady && count > 0;
    canSplit = count === 1 && allReady && avgStrength >= 0.5;
    canStop = anyMoving || anyRetreating || anyFighting;

    if (allSameProvince && count >= 2 && allReady) {
      let totalStr = 0;
      for (const d of selectedDivs) totalStr += toNum((d as { strength: Fixed }).strength);
      if (totalStr < count * 0.99) canMerge = true;
    }

    if (count === 1) {
      const d = selectedDivs[0] as { status: string; currentProvinceId: number };
      const statusMap: Record<string, string> = {
        ready: '待命', moving: '移动中', fighting: '交战中',
        retreating: '撤退中', training: '训练中',
      };
      statusSummary = statusMap[d.status] ?? d.status;
      const p = state.provinces.get(d.currentProvinceId);
      provinceSummary = p ? p.name : `P-${d.currentProvinceId}`;
    } else {
      if (anyFighting) statusSummary = `交战中(${count})`;
      else if (anyMoving) statusSummary = `移动中(${count})`;
      else if (anyRetreating) statusSummary = `撤退中(${count})`;
      else statusSummary = `已选${count}个师团`;
      provinceSummary = allSameProvince
        ? (state.provinces.get(firstProv!)?.name ?? `P-${firstProv}`)
        : `${provinceCount.size}个省份`;
    }
  }

  const result: UnitCommandShadow = out ?? {
    hasSelection: false, selectedCount: 0, canMove: false, canSplit: false,
    canMerge: false, canStop: false, statusSummary: '', provinceSummary: '',
    avgStrength: 0, avgOrganization: 0,
  };
  result.hasSelection = hasSelection;
  result.selectedCount = count;
  result.canMove = canMove;
  result.canSplit = canSplit;
  result.canMerge = canMerge;
  result.canStop = canStop;
  result.statusSummary = statusSummary;
  result.provinceSummary = provinceSummary;
  result.avgStrength = avgStrength;
  result.avgOrganization = avgOrg;
  return result;
}

/** 读取地图师团视图数组 */
export function readMapDivisionViews(state: WorldState, playerCountryId: string): MapDivisionView[] {
  const selectedSet = new Set(state.selectedUnitIds);
  const result: MapDivisionView[] = [];
  state.divisions.forEach((d) => {
    result.push({
      divisionId: d.id,
      ownerId: d.ownerId,
      provinceId: d.currentProvinceId,
      status: d.status as MapDivisionView['status'],
      isSelected: selectedSet.has(d.id) && d.ownerId === playerCountryId,
      strength: toNum(d.strength),
      organization: toNum(d.organization),
    });
  });
  return result;
}

/** 读取战斗泡泡（交火省份） */
export function readCombatBubbles(state: WorldState, _playerCountryId: string): CombatBubbleView[] {
  const result: CombatBubbleView[] = [];
  const fightingProv = new Map<number, { attackerName: string; defenderName: string; attackers: number; defenders: number }>();
  state.divisions.forEach((d) => {
    if (d.status !== 'fighting' || d.targetProvinceId === null) return;
    const provId = d.targetProvinceId;
    let entry = fightingProv.get(provId);
    if (!entry) {
      const defCountry = state.countries.get(d.ownerId);
      entry = { attackerName: '', defenderName: defCountry?.name ?? d.ownerId, attackers: 0, defenders: 0 };
      fightingProv.set(provId, entry);
    }
    if (d.inOffensive) {
      entry.attackers++;
      const ac = state.countries.get(d.ownerId);
      if (!entry.attackerName) entry.attackerName = ac?.name ?? d.ownerId;
    } else {
      entry.defenders++;
    }
  });
  fightingProv.forEach((e, provId) => {
    if (e.attackers > 0 && e.defenders > 0) {
      result.push({
        provinceId: provId,
        attackerDivisions: e.attackers,
        defenderDivisions: e.defenders,
        attackerName: e.attackerName,
        defenderName: e.defenderName,
      });
    }
  });
  return result;
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
