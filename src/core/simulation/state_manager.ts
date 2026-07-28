/**
 * 状态管理默认实现（spec implement-core-simulation T5）
 *
 * 实现依据：技术设计文档 4.3 + spec implement-core-simulation T5
 *
 * 职责：
 * - snapshot：深拷贝当前 WorldState（SortedMap 重建），保证快照与原状态独立
 * - restore：直接替换内部状态引用（调用方负责传入独立快照）
 * - hash：委托 hash.ts 的 hashWorld，供联机一致性校验
 * - diff / applyDiff：M1 阶段简化占位，联机阶段再细化
 *
 * 实现约定：
 * - 不 import cc，core/ 层独立
 * - 不调用 Math（ESLint），Fixed 不可变直接复用引用（无需 new Fixed(f.raw)）
 * - 确定性：深拷贝 SortedMap 用 forEach（key 升序）；Record 类型用 Object.keys().sort() 升序
 * - 14 个 SortedMap 字段逐个 cloneSortedMap 重建，值为实体深拷贝
 */
import { Fixed } from '../determinism/fixed';
import { SortedMap } from '../determinism/sorted_map';
import { hashWorld } from '../state/hash';
import {
  WorldState,
  Country,
  Province,
  ResourceNode,
  ResourceStockpile,
  Building,
  Factory,
  ConstructionQueue,
  ConstructionQueueItem,
  ProductionTask,
  EquipmentPool,
  Division,
  DivisionTemplate,
  FocusTreeState,
  ResearchState,
  Dispute,
  Front,
  CountryWarLosses,
  WarLogEntry,
  SupplyNetwork,
  ProvinceSupply,
  SeaSupplyRoute,
  ShipTemplate,
  Ship,
  Fleet,
  SeaZone,
  SeaControlState,
  ConvoyRoute,
  AirZone,
  AirWing,
  AirSuperiorityState,
  InvasionPlan,
} from '../state/world_state';
import { StateManager, WorldDiff, StatePatch } from './interfaces';

/**
 * 默认状态管理器
 *
 * 持有当前 WorldState 引用，提供快照 / 恢复 / 哈希 / 差分能力。
 * diff / applyDiff 在 M1 阶段为占位实现，联机阶段再细化 patches schema。
 */
export class DefaultStateManager implements StateManager {
  constructor(private state: WorldState) {}

  /**
   * 深拷贝当前 state，返回独立快照。
   *
   * 拷贝规则：
   * - 5 个标量字段：version/seed/tickId/speed 直接复制（值类型）；
   *   tickElapsed 是 Fixed（不可变），为安全用 new Fixed(raw) 重建
   * - nextEntityId: number 直接复制
   * - seedMap: Record<string, number> 新建对象，按 Object.keys().sort() 升序逐键复制
   * - 14 个 SortedMap：对每个调用 cloneSortedMap，重建为新 SortedMap，值为实体深拷贝
   */
  snapshot(): WorldState {
    const s = this.state;
    return {
      version: s.version,
      seed: s.seed,
      tickId: s.tickId,
      tickElapsed: s.tickElapsed,
      speed: s.speed,

      countries: cloneSortedMap(s.countries, cloneCountry),
      provinces: cloneSortedMap(s.provinces, cloneProvince),
      resourceNodes: cloneSortedMap(s.resourceNodes, cloneResourceNode),
      stockpiles: cloneSortedMap(s.stockpiles, cloneStockpile),
      buildings: cloneSortedMap(s.buildings, cloneBuilding),
      factories: cloneSortedMap(s.factories, cloneFactory),
      constructionQueues: cloneSortedMap(s.constructionQueues, cloneConstructionQueue),
      productionTasks: cloneSortedMap(s.productionTasks, cloneProductionTask),
      equipmentPools: cloneSortedMap(s.equipmentPools, cloneEquipmentPool),
      divisions: cloneSortedMap(s.divisions, cloneDivision),
      divisionTemplates: cloneSortedMap(s.divisionTemplates, cloneDivisionTemplate),
      supplyNetwork: cloneSupplyNetwork(s.supplyNetwork),
      focusTrees: cloneSortedMap(s.focusTrees, cloneFocusTreeState),
      research: cloneSortedMap(s.research, cloneResearchState),
      disputes: cloneSortedMap(s.disputes, cloneDispute),
      fronts: cloneSortedMap(s.fronts, cloneFrontArray),
      warLosses: cloneSortedMap(s.warLosses, cloneWarLosses),
      warLog: s.warLog.map(cloneWarLogEntry),
      selectedUnitIds: s.selectedUnitIds.slice(),

      nextEntityId: s.nextEntityId,
      seedMap: cloneSeedMap(s.seedMap),
      gameOver: s.gameOver ? { ...s.gameOver } : null,
      shipTemplates: cloneSortedMap(s.shipTemplates, cloneShipTemplate),
      ships: cloneSortedMap(s.ships, cloneShip),
      fleets: cloneSortedMap(s.fleets, cloneFleet),
      seaZones: cloneSortedMap(s.seaZones, cloneSeaZone),
      seaControl: cloneSortedMap(s.seaControl, cloneSeaControlState),
      convoyRoutes: s.convoyRoutes.map(cloneConvoyRoute),
      airZones: cloneSortedMap(s.airZones, cloneAirZone),
      wings: cloneSortedMap(s.wings, cloneWing),
      airSuperiority: cloneSortedMap(s.airSuperiority, cloneAirSuperiorityState),
      invasions: cloneSortedMap(s.invasions, cloneInvasionPlan),
    };
  }

  /**
   * 状态差分（M1 简化占位）。
   *
   * 不实际计算 patches，仅返回 fromTickId / toTickId 占位结构。
   * 联机阶段再细化 patches schema（按字段级 diff 生成）。
   */
  diff(prev: WorldState): WorldDiff {
    return {
      fromTickId: prev.tickId,
      toTickId: this.state.tickId,
      patches: [],
    };
  }

  /**
   * 恢复状态：直接替换内部引用。
   *
   * 调用方负责传入独立快照（通常由 snapshot() 产生），避免外部修改影响内部状态。
   */
  restore(s: WorldState): void {
    this.state = s;
  }

  /**
   * 应用差分（M1 简化占位）。
   *
   * noop，联机阶段再细化 patches 应用逻辑。
   */
  applyDiff(_d: WorldDiff): void {
    // M1 占位：联机阶段实现 patches 应用（字段级回滚 / 前推）
  }

  /**
   * 应用状态补丁列表
   *
   * 支持对 countries / stockpiles / factories / provinces 四个顶层 SortedMap
   * 进行 set / delete 操作，路径可深入实体内部字段。
   *
   * 路径格式：[collection, entityId, ...subPath]
   * - collection: 'countries' | 'stockpiles' | 'factories' | 'provinces'
   * - entityId: SortedMap 的 key
   * - subPath: 实体内部字段路径（可选，不提供则操作整个实体）
   *
   * set 操作：
   * - 无 subPath：将整个实体设置为 value
   * - 有 subPath：沿 subPath 遍历设置字段
   *
   * delete 操作：
   * - 无 subPath：从 SortedMap 中删除实体
   * - 有 subPath：沿 subPath 遍历删除字段
   */
  applyPatches(patches: StatePatch[]): void {
    for (const patch of patches) {
      this.applyPatch(patch);
    }
  }

  /** 应用单个补丁 */
  private applyPatch(patch: StatePatch): void {
    const [collection, entityId, ...subPath] = patch.path;
    const map = (this.state as unknown as Record<string, SortedMap<string | number, unknown>>)[collection];
    if (!map || !(map instanceof SortedMap)) return;

    if (patch.op === 'delete') {
      if (subPath.length === 0) {
        map.delete(entityId);
        return;
      }
      const entity = map.get(entityId);
      if (!entity || typeof entity !== 'object') return;
      deleteNested(entity as Record<string, unknown>, subPath);
      return;
    }

    if (patch.op === 'set') {
      if (subPath.length === 0) {
        map.set(entityId, patch.value);
        return;
      }
      let entity = map.get(entityId);
      if (!entity || typeof entity !== 'object') return;
      setNested(entity as Record<string, unknown>, subPath, patch.value);
    }
  }

  /** 哈希：委托 hash.ts 的 hashWorld（FNV-1a 32 位 hex） */
  hash(): string {
    return hashWorld(this.state);
  }

  /** 供 Simulation 层访问当前状态（接口未要求但 Simulation 需要） */
  getState(): WorldState {
    return this.state;
  }
}

/**
 * SortedMap 深拷贝辅助：按 key 升序遍历原 map，收集已 clone 的 entries，
 * 一次性传给 SortedMap 构造函数，避免逐项 set 触发多次 dirty 排序。
 */
function cloneSortedMap<K extends string | number, V>(
  src: SortedMap<K, V>,
  cloneVal: (v: V) => V,
): SortedMap<K, V> {
  const entries: [K, V][] = [];
  src.forEach((v, k) => {
    entries.push([k, cloneVal(v)]);
  });
  return new SortedMap<K, V>(entries);
}

/** seedMap 深拷贝：新建对象，按 Object.keys().sort() 升序逐键复制 */
function cloneSeedMap(src: Record<string, number>): Record<string, number> {
  const dst: Record<string, number> = {};
  const keys = Object.keys(src).sort();
  for (const k of keys) {
    dst[k] = src[k];
  }
  return dst;
}

/** Country 深拷贝：标量直接复制 + 数组 slice + Fixed 引用复用 + factionId 直接复制 */
function cloneCountry(c: Country): Country {
  return {
    id: c.id,
    name: c.name,
    developmentPath: c.developmentPath,
    isPlayer: c.isPlayer,
    isAI: c.isAI,
    capitalProvinceId: c.capitalProvinceId,
    disputeResolve: c.disputeResolve,
    stability: c.stability,
    politicalPower: c.politicalPower,
    factionId: c.factionId,
    ownedProvinceIds: c.ownedProvinceIds.slice(),
    controlledProvinceIds: c.controlledProvinceIds.slice(),
  };
}

/** Province 深拷贝：全部标量直接复制 */
function cloneProvince(p: Province): Province {
  return {
    id: p.id,
    ownerId: p.ownerId,
    controllerId: p.controllerId,
    name: p.name,
    terrain: p.terrain,
    isCoastal: p.isCoastal,
    adjacentProvinceIds: p.adjacentProvinceIds.slice(),
    infrastructure: p.infrastructure,
    buildingSlots: p.buildingSlots,
    combatWidth: p.combatWidth,
    supplyHubLevel: p.supplyHubLevel,
    fortLevel: p.fortLevel,
    portLevel: p.portLevel,
    airBaseLevel: p.airBaseLevel,
    adjacentSeaZoneIds: p.adjacentSeaZoneIds.slice(),
    VP: p.VP,
  };
}

/** ResourceNode 深拷贝：标量 + baseYield 引用复用 + occupied 直接复制 */
function cloneResourceNode(r: ResourceNode): ResourceNode {
  return {
    id: r.id,
    provinceId: r.provinceId,
    type: r.type,
    baseYield: r.baseYield,
    mineBuildingLevel: r.mineBuildingLevel,
    occupied: r.occupied,
  };
}

/** ResourceStockpile 深拷贝：6 个 Fixed 引用复用 + caps 对象深拷贝 + history 数组 slice（每项 delta 引用复用） */
function cloneStockpile(s: ResourceStockpile): ResourceStockpile {
  return {
    countryId: s.countryId,
    steel: s.steel,
    oil: s.oil,
    tungsten: s.tungsten,
    rubber: s.rubber,
    aluminum: s.aluminum,
    political: s.political,
    caps: {
      steel: s.caps.steel,
      oil: s.caps.oil,
      tungsten: s.caps.tungsten,
      rubber: s.caps.rubber,
      aluminum: s.caps.aluminum,
      political: s.caps.political,
    },
    history: s.history.map((h) => ({
      tick: h.tick,
      delta: h.delta,
    })),
  };
}

/** Building 深拷贝：标量 + constructionProgress 引用复用 */
function cloneBuilding(b: Building): Building {
  return {
    id: b.id,
    provinceId: b.provinceId,
    type: b.type,
    level: b.level,
    state: b.state,
    constructionProgress: b.constructionProgress,
    assignedCivilianFactories: b.assignedCivilianFactories,
  };
}

/** Factory 深拷贝：标量 + taskId 直接复制 + idleSinceTick + productionProgress 引用复用 */
function cloneFactory(f: Factory): Factory {
  return {
    id: f.id,
    provinceId: f.provinceId,
    type: f.type,
    level: f.level,
    state: f.state,
    taskId: f.taskId,
    idleSinceTick: f.idleSinceTick,
    productionProgress: f.productionProgress,
  };
}

/** ConstructionQueueItem 深拷贝：assignedFactoryIds slice + 三个 Fixed 引用复用 */
function cloneConstructionQueueItem(it: ConstructionQueueItem): ConstructionQueueItem {
  return {
    id: it.id,
    buildingType: it.buildingType,
    provinceId: it.provinceId,
    priority: it.priority,
    steelCost: it.steelCost,
    timeCost: it.timeCost,
    assignedFactoryIds: it.assignedFactoryIds.slice(),
    progress: it.progress,
  };
}

/** ConstructionQueue 深拷贝：countryId + items 数组 slice（每项深拷贝） */
function cloneConstructionQueue(q: ConstructionQueue): ConstructionQueue {
  return {
    countryId: q.countryId,
    items: q.items.map(cloneConstructionQueueItem),
  };
}

/** ProductionTask 深拷贝：assignedFactoryIds slice + progress/efficiency 引用复用 */
function cloneProductionTask(t: ProductionTask): ProductionTask {
  return {
    id: t.id,
    type: t.type,
    countryId: t.countryId,
    target: t.target,
    assignedFactoryIds: t.assignedFactoryIds.slice(),
    priority: t.priority,
    progress: t.progress,
    efficiency: t.efficiency,
  };
}

/** EquipmentPool 深拷贝：stocks 数组 slice（每项 {type, count} 标量，浅拷贝即可） */
function cloneEquipmentPool(p: EquipmentPool): EquipmentPool {
  return {
    countryId: p.countryId,
    stocks: p.stocks.map((s) => ({ type: s.type, count: s.count })),
  };
}

/** Division 深拷贝：template 数组 slice + 6 个 Fixed 引用复用 + targetProvinceId 直接复制 + 新字段 */
function cloneDivision(d: Division): Division {
  return {
    id: d.id,
    ownerId: d.ownerId,
    templateId: d.templateId,
    template: d.template.map((slot) => ({ slot: slot.slot, equipmentType: slot.equipmentType })),
    organization: d.organization,
    hardness: d.hardness,
    softAttack: d.softAttack,
    hardAttack: d.hardAttack,
    currentProvinceId: d.currentProvinceId,
    targetProvinceId: d.targetProvinceId,
    supply: d.supply,
    supplyStatus: d.supplyStatus,
    strength: d.strength,
    trainingProgress: d.trainingProgress,
    status: d.status,
    inOffensive: d.inOffensive,
  };
}

function cloneDivisionTemplate(t: DivisionTemplate): DivisionTemplate {
  return {
    id: t.id,
    name: t.name,
    slots: t.slots.map(s => ({ slot: s.slot, equipmentType: s.equipmentType })),
    organization: t.organization,
    hardness: t.hardness,
    softAttack: t.softAttack,
    hardAttack: t.hardAttack,
    politicalCost: t.politicalCost,
    equipmentCost: { ...t.equipmentCost },
    trainingTicks: t.trainingTicks,
  };
}

function cloneProvinceSupply(ps: ProvinceSupply): ProvinceSupply {
  return {
    provinceId: ps.provinceId,
    level: ps.level,
    demand: ps.demand,
    received: ps.received,
    viaPort: ps.viaPort,
    bombedUntilTick: ps.bombedUntilTick,
  };
}

function cloneSeaSupplyRoute(r: SeaSupplyRoute): SeaSupplyRoute {
  return {
    id: r.id,
    ownerId: r.ownerId,
    fromPortId: r.fromPortId,
    toPortId: r.toPortId,
    pathSeaZoneIds: r.pathSeaZoneIds.slice(),
    convoysAssigned: r.convoysAssigned,
    efficiency: r.efficiency,
    escortFleetIds: r.escortFleetIds.slice(),
  };
}

function cloneSupplyNetwork(net: SupplyNetwork): SupplyNetwork {
  return {
    provinceSupply: cloneSortedMap(net.provinceSupply, cloneProvinceSupply),
    seaSupplyRoutes: net.seaSupplyRoutes.map(cloneSeaSupplyRoute),
    lastRecalcTick: net.lastRecalcTick,
  };
}

function cloneShipTemplate(t: ShipTemplate): ShipTemplate {
  return {
    id: t.id,
    name: t.name,
    type: t.type,
    hp: t.hp,
    navalAttack: t.navalAttack,
    subAttack: t.subAttack,
    antiSub: t.antiSub,
    shoreBombardment: t.shoreBombardment,
    antiAir: t.antiAir,
    armor: t.armor,
    speed: t.speed,
    steelCost: t.steelCost,
    buildTicks: t.buildTicks,
  };
}

function cloneShip(s: Ship): Ship {
  return {
    id: s.id,
    ownerId: s.ownerId,
    templateId: s.templateId,
    type: s.type,
    hp: s.hp,
    maxHp: s.maxHp,
    navalAttack: s.navalAttack,
    subAttack: s.subAttack,
    antiSub: s.antiSub,
    shoreBombardment: s.shoreBombardment,
    antiAir: s.antiAir,
    armor: s.armor,
    speed: s.speed,
    fleetId: s.fleetId,
  };
}

function cloneFleet(f: Fleet): Fleet {
  return {
    id: f.id,
    ownerId: f.ownerId,
    name: f.name,
    homePortId: f.homePortId,
    status: f.status,
    organization: f.organization,
    strength: f.strength,
    trainingProgress: f.trainingProgress,
    mission: f.mission,
    assignedSeaZoneId: f.assignedSeaZoneId,
    bombardTargetProvinceId: f.bombardTargetProvinceId,
    shipIds: f.shipIds.slice(),
  };
}

function cloneSeaZone(sz: SeaZone): SeaZone {
  return {
    id: sz.id,
    name: sz.name,
    adjacentProvinceIds: sz.adjacentProvinceIds.slice(),
    adjacentSeaZoneIds: sz.adjacentSeaZoneIds.slice(),
  };
}

function cloneSeaControlState(sc: SeaControlState): SeaControlState {
  return {
    seaZoneId: sc.seaZoneId,
    control: sc.control.map((c) => ({ countryId: c.countryId, ratio: c.ratio })),
  };
}

function cloneConvoyRoute(r: ConvoyRoute): ConvoyRoute {
  return {
    id: r.id,
    countryId: r.countryId,
    fromProvinceId: r.fromProvinceId,
    toProvinceId: r.toProvinceId,
    seaZoneIds: r.seaZoneIds.slice(),
    escortFleetId: r.escortFleetId,
    supplyFlow: r.supplyFlow,
    convoyCount: r.convoyCount,
  };
}

function cloneAirZone(z: AirZone): AirZone {
  return {
    id: z.id,
    name: z.name,
    provinceIds: z.provinceIds.slice(),
    seaZoneIds: z.seaZoneIds.slice(),
  };
}

function cloneWing(w: AirWing): AirWing {
  return {
    id: w.id,
    ownerId: w.ownerId,
    name: w.name,
    aircraft: { ...w.aircraft },
    organization: w.organization,
    strength: w.strength,
    trainingProgress: w.trainingProgress,
    status: w.status,
    homeBaseId: w.homeBaseId,
    carrierFleetId: w.carrierFleetId,
    mission: w.mission,
    assignedAirZoneId: w.assignedAirZoneId,
    targetProvinceId: w.targetProvinceId,
    targetSeaZoneId: w.targetSeaZoneId,
  };
}

function cloneAirSuperiorityState(s: AirSuperiorityState): AirSuperiorityState {
  return {
    airZoneId: s.airZoneId,
    control: s.control.map((c) => ({ countryId: c.countryId, ratio: c.ratio })),
  };
}

function cloneInvasionPlan(p: InvasionPlan): InvasionPlan {
  return {
    id: p.id,
    ownerId: p.ownerId,
    fromProvinceId: p.fromProvinceId,
    toProvinceId: p.toProvinceId,
    divisionIds: p.divisionIds.slice(),
    requiredConvoys: p.requiredConvoys,
    preparationProgress: p.preparationProgress,
    status: p.status,
    escortFleetIds: p.escortFleetIds.slice(),
    supportWingIds: p.supportWingIds.slice(),
    launchedTick: p.launchedTick,
    pathSeaZoneIds: p.pathSeaZoneIds.slice(),
    targetAirZoneId: p.targetAirZoneId,
  };
}

/** Front[] 深拷贝：每个 Front 标量复制 */
function cloneFrontArray(fronts: Front[]): Front[] {
  return fronts.map((f) => ({
    attackerId: f.attackerId,
    defenderId: f.defenderId,
    fromProvince: f.fromProvince,
    toProvince: f.toProvince,
  }));
}

/** FocusTreeState 深拷贝：数组 slice + activeFocusId 直接复制 + activeProgress 引用复用 */
function cloneFocusTreeState(f: FocusTreeState): FocusTreeState {
  return {
    countryId: f.countryId,
    completedFocusIds: f.completedFocusIds.slice(),
    activeFocusId: f.activeFocusId,
    activeProgress: f.activeProgress,
    candidates: f.candidates.slice(),
    refreshInTicks: f.refreshInTicks,
  };
}

/** ResearchState 深拷贝：lines 数组 slice（每项 progress 引用复用） */
function cloneResearchState(r: ResearchState): ResearchState {
  return {
    countryId: r.countryId,
    lines: r.lines.map((line) => ({
      lineId: line.lineId,
      currentNode: line.currentNode,
      currentNodeIndex: line.currentNodeIndex,
      progress: line.progress,
      assignedSlot: line.assignedSlot,
    })),
  };
}

/** Dispute 深拷贝：participants/disputeGoals slice + 两个 Record 按 key 升序重建 */
function cloneDispute(d: Dispute): Dispute {
  const resolveKeys = Object.keys(d.disputeResolve).sort();
  const disputeResolve: Record<string, Fixed> = {};
  for (const k of resolveKeys) {
    disputeResolve[k] = d.disputeResolve[k];
  }

  const vpKeys = Object.keys(d.controlledVPs).sort();
  const controlledVPs: Record<string, number> = {};
  for (const k of vpKeys) {
    controlledVPs[k] = d.controlledVPs[k];
  }

  const surrenderProgress: Record<string, Fixed> = {};
  const surrenderThreshold: Record<string, Fixed> = {};
  if (d.surrenderProgress) {
    const surrenderKeys = Object.keys(d.surrenderProgress).sort();
    for (const k of surrenderKeys) {
      surrenderProgress[k] = d.surrenderProgress[k];
    }
  }
  if (d.surrenderThreshold) {
    const thresholdKeys = Object.keys(d.surrenderThreshold).sort();
    for (const k of thresholdKeys) {
      surrenderThreshold[k] = d.surrenderThreshold[k];
    }
  }

  return {
    id: d.id,
    participants: d.participants.slice(),
    participantSet: new Set(d.participantSet),
    disputeResolve,
    disputeGoals: d.disputeGoals.slice(),
    controlledVPs,
    surrenderProgress,
    surrenderThreshold,
    startTick: d.startTick || 0,
    totalVPs: d.totalVPs || 0,
  };
}

function cloneWarLosses(w: CountryWarLosses): CountryWarLosses {
  return {
    countryId: w.countryId,
    divisionsLost: w.divisionsLost,
    shipsLost: { ...w.shipsLost },
    aircraftLost: { ...w.aircraftLost },
    convoysLost: w.convoysLost,
    provincesLost: w.provincesLost,
    majorCitiesLost: w.majorCitiesLost,
    capitalLost: w.capitalLost,
  };
}

function cloneWarLogEntry(e: WarLogEntry): WarLogEntry {
  return {
    tickId: e.tickId,
    kind: e.kind,
    countryId: e.countryId,
    text: e.text,
    relatedIds: e.relatedIds ? { ...e.relatedIds } : undefined,
  };
}

/**
 * 沿路径设置嵌套对象字段值
 * @param obj 根对象
 * @param path 字段路径（如 ['caps', 'steel']）
 * @param value 要设置的值
 */
function setNested(obj: Record<string, unknown>, path: string[], value: unknown): void {
  let cur: Record<string, unknown> = obj;
  for (let i = 0; i < path.length - 1; i++) {
    const key = path[i];
    const next = cur[key];
    if (!next || typeof next !== 'object') return;
    cur = next as Record<string, unknown>;
  }
  cur[path[path.length - 1]] = value;
}

/**
 * 沿路径删除嵌套对象字段
 * @param obj 根对象
 * @param path 字段路径
 */
function deleteNested(obj: Record<string, unknown>, path: string[]): void {
  let cur: Record<string, unknown> = obj;
  for (let i = 0; i < path.length - 1; i++) {
    const key = path[i];
    const next = cur[key];
    if (!next || typeof next !== 'object') return;
    cur = next as Record<string, unknown>;
  }
  delete cur[path[path.length - 1]];
}
