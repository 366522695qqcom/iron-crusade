/**
 * 全局状态数据模型
 *
 * 实现依据：技术设计文档 第 3 章 + spec S.1 / S.2 脱敏要求
 *
 * S.1 脱敏（spec S.1）：
 * - Country.ideology 字段删除（原 'fascist' | 'communist' | 'democratic'）
 * - 替换为 Country.developmentPath: 'industrial_authoritarian' | 'communal' | 'federal_republic'
 *   （工业集权线 / 公社共治线 / 联邦共和线，三选一，国家不绑定固有路线）
 * - Country.warSupport 字段重命名为 disputeResolve（争端决心，原战争支持度）
 *
 * S.2 脱敏（spec S.2）：
 * - ResourceNode.occupied 字段名保留（二进制编码兼容，附录 C.2），
 *   注释改为「省份被管控 → 产出减半」（原"被占领"）
 * - Province.controllerId 注释改为「控制方（管控时 != owner）」（原"占领时"）
 * - WorldState.wars 字段重命名为 disputes（区域争端记录，S.2 术语统一）
 * - 原 War 接口重命名为 Dispute，warSupport / warGoals / occupiedVPs 字段同步脱敏
 */
import { Fixed } from '../determinism/fixed';
import { SortedMap } from '../determinism/sorted_map';
import {
  BuildingType,
  ResourceType,
  TerrainType,
  FactoryType,
  ProductionTaskType,
  BuildingState,
  FactoryState,
  DevelopmentPath,
  GameSpeed,
} from '../types';

/**
 * 前线（争端交火线段）
 */
export interface Front {
  attackerId: string;
  defenderId: string;
  fromProvince: number;
  toProvince: number;
}

/**
 * 全局世界状态（技术设计文档 3.1）
 *
 * 所有容器统一使用 SortedMap，保证遍历顺序确定性。
 */
export interface CountryWarLosses {
  countryId: string;
  divisionsLost: number;
  shipsLost: Record<string, number>;
  aircraftLost: Record<string, number>;
  convoysLost: number;
  provincesLost: number;
  majorCitiesLost: number;
  capitalLost: boolean;
}

export type WarLogKind =
  | 'province_controlled'
  | 'division_destroyed'
  | 'ship_sunk'
  | 'aircraft_lost'
  | 'convoy_sunk'
  | 'surrendered'
  | 'naval_battle'
  | 'air_battle'
  | 'invasion'
  | 'dispute_started';

export interface WarLogEntry {
  tickId: number;
  kind: WarLogKind;
  countryId: string;
  text: string;
  relatedIds?: { provinceId?: number; fleetId?: number; wingId?: number; divisionId?: number; disputeId?: string };
}

export interface WorldState {
  version: string;
  /** 全局 seed（Host 开局生成） */
  seed: number;
  /** 当前 tick 编号 */
  tickId: number;
  /** 累积游戏内时间（Fixed·ms） */
  tickElapsed: Fixed;
  /** 当前速度（0 = 暂停） */
  speed: GameSpeed;

  countries: SortedMap<string, Country>;
  provinces: SortedMap<number, Province>;
  resourceNodes: SortedMap<number, ResourceNode>;
  /** 按国家 ID 索引 */
  stockpiles: SortedMap<string, ResourceStockpile>;
  buildings: SortedMap<number, Building>;
  factories: SortedMap<number, Factory>;
  /** 按国家 ID 索引 */
  constructionQueues: SortedMap<string, ConstructionQueue>;
  /** 按国家 ID 聚合 */
  productionTasks: SortedMap<string, ProductionTask>;
  /** 按国家 ID 索引 */
  equipmentPools: SortedMap<string, EquipmentPool>;
  divisions: SortedMap<number, Division>;
  /** 师团模板库（M2 兵种卡系统） */
  divisionTemplates: SortedMap<string, DivisionTemplate>;
  supplyNetwork: SupplyNetwork;
  focusTrees: SortedMap<string, FocusTreeState>;
  research: SortedMap<string, ResearchState>;
  /** 区域争端记录（S.2 脱敏：原 wars 字段重命名） */
  disputes: SortedMap<string, Dispute>;
  /** 按 attackerId 索引的前线列表 */
  fronts: SortedMap<string, Front[]>;
  /** 国家累计损失（M1 feature-grand-war） */
  warLosses: SortedMap<string, CountryWarLosses>;
  /** 战争日志环形缓存，最近50条（M1 feature-grand-war） */
  warLog: WarLogEntry[];
  /** 当前选中的单位ID列表（师团/舰队/联队，M1选中师团用） */
  selectedUnitIds: number[];

  /** 全局自增 ID */
  nextEntityId: number;
  /** 对象 → PRNG 种子（技术设计文档 2.2，Host 同步） */
  seedMap: Record<string, number>;

  /** M2 胜负标记：null=进行中，{winnerId:'p1', loserId:'e1'} 表示胜负已分 */
  gameOver: { winnerId: string; loserId: string; tickId: number } | null;

  /** M3 海军系统 */
  shipTemplates: SortedMap<string, ShipTemplate>;
  ships: SortedMap<number, Ship>;
  fleets: SortedMap<number, Fleet>;
  seaZones: SortedMap<number, SeaZone>;
  seaControl: SortedMap<number, SeaControlState>;
  convoyRoutes: ConvoyRoute[];
  /** M4 空军系统 */
  airZones: SortedMap<number, AirZone>;
  wings: SortedMap<number, AirWing>;
  airSuperiority: SortedMap<number, AirSuperiorityState>;
  /** M5 登陆作战计划 */
  invasions: SortedMap<string, InvasionPlan>;
}

/**
 * 国家（技术设计文档 3.2 + spec S.1 脱敏）
 *
 * S.1 变更：
 * - 删除 ideology: 'fascist' | 'communist' | 'democratic'
 * - 新增 developmentPath（工业集权 / 公社共治 / 联邦共和，开局三选一）
 * - warSupport → disputeResolve（争端决心）
 *
 * 其余字段（id / name / isPlayer / isAI / capitalProvinceId / stability /
 * politicalPower / factionId / ownedProvinceIds / controlledProvinceIds）按文档保持。
 */
export interface Country {
  /** 国家 ID（如 'iron_cross'） */
  id: string;
  /** 架空国名（如 '铁十字联邦'） */
  name: string;
  /**
   * 发展路线（S.1 替换原 ideology 字段）
   * - industrial_authoritarian  工业集权线
   * - communal                  公社共治线
   * - federal_republic          联邦共和线
   * 国家不绑定固有路线，开局玩家三选一。
   */
  developmentPath: DevelopmentPath;
  isPlayer: boolean;
  /** drop-out 时置 true，由 AI 行为树接管（附录 B.2） */
  isAI: boolean;
  capitalProvinceId: number;
  /**
   * 争端决心（S.2 脱敏：原 warSupport 战争支持度），取值 0-1
   */
  disputeResolve: Fixed;
  /** 稳定度，取值 0-1 */
  stability: Fixed;
  /** 政治点储备 */
  politicalPower: Fixed;
  /** 所属阵营 ID，null 表示中立 */
  factionId: string | null;
  /** 主权省份列表 */
  ownedProvinceIds: number[];
  /** 实际管控省份列表（管控时 != owned，S.2 脱敏：原"占领"语义） */
  controlledProvinceIds: number[];
}

/**
 * 省份（技术设计文档 3.2）
 */
export interface Province {
  id: number;
  /** 主权方 */
  ownerId: string;
  /** 控制方（管控时 != owner，S.2 脱敏：原"占领时"） */
  controllerId: string;
  /** 代号（如 'P-101'，不使用真实地名） */
  name: string;
  terrain: TerrainType;
  isCoastal: boolean;
  /** 相邻省份ID列表（用于移动/进攻路径判定） */
  adjacentProvinceIds: number[];
  /** 基础设施等级 0-10 */
  infrastructure: number;
  /** 建筑槽位（基础 1 + floor(infra / 3)，上限 4） */
  buildingSlots: number;
  /** 战场宽度（由地形决定：plains 60 / mountain 30 / urban 40 ...） */
  combatWidth: number;
  supplyHubLevel: number;
  fortLevel: number;
  /** 港口等级（dockyard 建筑等级 ≥1 时启用；0=无港口） */
  portLevel: number;
  /** 相邻海域 ID（M3 海军系统） */
  adjacentSeaZoneIds: number[];
  /** 机场等级（air_base 建筑等级；0=无机场，M4） */
  airBaseLevel: number;
  /** 胜利点 */
  VP: number;
}

/**
 * 资源储备（技术设计文档 3.3）
 *
 * 关键规则：未消耗资源永久保留，跨 tick / 跨会话 / 跨存档都不丢失。
 */
export interface ResourceStockpile {
  countryId: string;
  steel: Fixed;
  oil: Fixed;
  tungsten: Fixed;
  rubber: Fixed;
  aluminum: Fixed;
  political: Fixed;
  caps: {
    steel: Fixed;
    oil: Fixed;
    tungsten: Fixed;
    rubber: Fixed;
    aluminum: Fixed;
    political: Fixed;
  };
  /** 最近 7 天产出曲线（UI 用，可裁剪） */
  history: { tick: number; delta: Fixed }[];
}

/**
 * 资源节点（技术设计文档 3.3）
 *
 * S.2 脱敏：occupied 字段名保留（二进制编码兼容，附录 C.2），
 * 但语义从「被占领」改为「被管控」，产出减半逻辑不变。
 */
export interface ResourceNode {
  id: number;
  provinceId: number;
  type: ResourceType;
  /** 每秒基础产出 */
  baseYield: Fixed;
  /** 关联开采建筑等级 */
  mineBuildingLevel: number;
  /**
   * 省份被管控 → 产出减半（S.2 脱敏：原"被占领"）
   * 字段名 occupied 保留以维持二进制编码兼容（附录 C.2）。
   */
  occupied: boolean;
}

/**
 * 建筑（技术设计文档 3.4）
 */
export interface Building {
  id: number;
  provinceId: number;
  type: BuildingType;
  level: number;
  state: BuildingState;
  /** 建造进度 0-1 */
  constructionProgress: Fixed;
  assignedCivilianFactories: number;
}

/**
 * 建造队列项（技术设计文档 3.4）
 */
export interface ConstructionQueueItem {
  id: string;
  buildingType: BuildingType;
  provinceId: number;
  /** 数字越小越优先 */
  priority: number;
  /** 总钢铁成本 */
  steelCost: Fixed;
  /** 基础建造时间（秒） */
  timeCost: Fixed;
  assignedFactoryIds: number[];
  /** 进度 0-1 */
  progress: Fixed;
}

/**
 * 建造队列（按国家聚合，items 按 priority 升序）
 */
export interface ConstructionQueue {
  countryId: string;
  items: ConstructionQueueItem[];
}

/**
 * 工厂（技术设计文档 3.5）
 */
export interface Factory {
  id: number;
  provinceId: number;
  type: FactoryType;
  level: number;
  state: FactoryState;
  taskId: string | null;
  /** 空闲起始 tick（用于提醒计时） */
  idleSinceTick: number;
  /** 生产进度 0-1 */
  productionProgress: Fixed;
}

/**
 * 生产任务（技术设计文档 3.5）
 */
export interface ProductionTask {
  id: string;
  type: ProductionTaskType;
  /** 所属国家 ID */
  countryId: string;
  /** 建筑类型 / 资源类型 / 装备类型 */
  target: string;
  assignedFactoryIds: number[];
  priority: number;
  progress: Fixed;
  /** HOI4 生产效率简化版，连续生产提升 */
  efficiency: Fixed;
}

/**
 * 装备池（按装备类型累积；生产流入、招募流出）
 */
export interface EquipmentPool {
  countryId: string;
  /** 装备类型 → 数量 */
  stocks: { type: string; count: number }[];
}

/**
 * 师团状态
 */
export type DivisionStatus = 'training' | 'ready' | 'fighting' | 'retreating' | 'moving' | 'landing';

/**
 * 师团模板（M2 兵种卡系统）
 *
 * 4槽位编制，每个槽位引用装备类型；模板定义师团的基础属性和招募成本。
 */
export interface DivisionTemplate {
  id: string;
  name: string;
  /** 4 个槽位的装备类型 */
  slots: { slot: number; equipmentType: string }[];
  /** 基础组织度 */
  organization: Fixed;
  /** 基础硬度（0-1） */
  hardness: Fixed;
  /** 基础软攻 */
  softAttack: Fixed;
  /** 基础硬攻 */
  hardAttack: Fixed;
  /** 招募政治点消耗 */
  politicalCost: Fixed;
  /** 各装备类型需求数量 */
  equipmentCost: Record<string, number>;
  /** 训练所需 tick 数（基础 600） */
  trainingTicks: number;
}

/**
 * 舰船类型（M3）
 */
export type ShipType = 'destroyer' | 'cruiser' | 'battleship' | 'carrier' | 'submarine' | 'convoy';

/**
 * 舰船模板（M3）
 */
export interface ShipTemplate {
  id: string;
  name: string;
  type: ShipType;
  /** HP */
  hp: Fixed;
  /** 对舰攻击 */
  navalAttack: Fixed;
  /** 对潜攻击 */
  subAttack: Fixed;
  /** 反潜 */
  antiSub: Fixed;
  /** 对地炮击（岸轰） */
  shoreBombardment: Fixed;
  /** 防空 */
  antiAir: Fixed;
  /** 护甲 */
  armor: Fixed;
  /** 速度（km/h, Fixed） */
  speed: Fixed;
  /** 建造花费钢铁 */
  steelCost: Fixed;
  /** 建造花费（tick 数） */
  buildTicks: number;
}

/**
 * 舰船个体（M3）
 */
export interface Ship {
  id: number;
  ownerId: string;
  templateId: string;
  type: ShipType;
  hp: Fixed;
  maxHp: Fixed;
  navalAttack: Fixed;
  subAttack: Fixed;
  antiSub: Fixed;
  shoreBombardment: Fixed;
  antiAir: Fixed;
  armor: Fixed;
  speed: Fixed;
  /** 所属舰队 ID */
  fleetId: number;
}

/**
 * 舰队任务类型（M3）
 */
export type FleetMission =
  | 'idle'           // 在港待命
  | 'patrol'         // 巡逻（seek and engage）
  | 'convoy_escort'  // 护航运输船
  | 'shore_bombard'  // 岸轰支援
  | 'interdiction';  // 破交拦截

/**
 * 舰队状态（M3）
 */
export type FleetStatus = 'training' | 'idle' | 'on_mission' | 'combat' | 'retreating';

/**
 * 舰队（M3）
 */
export interface Fleet {
  id: number;
  ownerId: string;
  name: string;
  /** 停泊港口省份 ID（idle/training 时） */
  homePortId: number;
  /** 当前状态 */
  status: FleetStatus;
  /** 组织度 0-1 */
  organization: Fixed;
  /** 战力 0-1（反映舰船完好度） */
  strength: Fixed;
  /** 训练进度 0-1（新招募舰队从 0.3 开始，满 1 可执行任务） */
  trainingProgress: Fixed;
  /** 当前任务 */
  mission: FleetMission;
  /** 执行任务的海域 ID（patrol/escort/bombard/interdiction） */
  assignedSeaZoneId: number | null;
  /** 岸轰目标省份 ID（mission=shore_bombard 时） */
  bombardTargetProvinceId: number | null;
  /** 舰船 ID 列表 */
  shipIds: number[];
}

/**
 * 海域（M3）
 */
export interface SeaZone {
  id: number;
  name: string;
  /** 相邻陆地省份 ID（沿海） */
  adjacentProvinceIds: number[];
  /** 相邻海域 ID */
  adjacentSeaZoneIds: number[];
}

/**
 * 制海权状态（M3）
 */
export interface SeaControlState {
  seaZoneId: number;
  /** 国家 ID → 控制权比例 0-1 */
  control: { countryId: string; ratio: Fixed }[];
}

/**
 * 空军任务类型（M4）
 */
export type AirMission =
  | 'idle'               // 驻机场待命
  | 'air_superiority'    // 争夺制空权
  | 'cas'                // 近距空中支援
  | 'ground_attack'      // 对地打击
  | 'port_strike'        // 港口袭击
  | 'naval_strike'       // 对海打击
  | 'naval_fighter_patrol'; // 舰载机巡逻

/**
 * 空军联队状态（M4）
 */
export type WingStatus = 'training' | 'idle' | 'on_mission' | 'combat' | 'retreating' | 'carrier_based';

/**
 * 空军联队（M4）
 */
export interface AirWing {
  id: number;
  ownerId: string;
  name: string;
  /** 各机型数量（type → count，100架=满编联队） */
  aircraft: Record<string, number>;
  /** 组织度 0-1 */
  organization: Fixed;
  /** 战力 0-1 */
  strength: Fixed;
  /** 训练进度 0-1 */
  trainingProgress: Fixed;
  status: WingStatus;
  /** 驻地省 ID（机场省；carrier_based 时为 -1 表示在航母上） */
  homeBaseId: number;
  /** 搭载的航母舰队 ID（仅 carrier_based 时使用） */
  carrierFleetId: number | null;
  /** 当前任务 */
  mission: AirMission;
  /** 执行任务的空域 ID */
  assignedAirZoneId: number | null;
  /** 打击目标省 ID（ground_attack/port_strike 时） */
  targetProvinceId: number | null;
  /** 打击目标海域 ID（naval_strike 时） */
  targetSeaZoneId: number | null;
}

/**
 * 空域（M4）
 */
export interface AirZone {
  id: number;
  name: string;
  /** 覆盖省份 */
  provinceIds: number[];
  /** 覆盖海域 */
  seaZoneIds: number[];
}

/**
 * 制空权状态（M4）
 */
export interface AirSuperiorityState {
  airZoneId: number;
  /** 国家 ID → 制空权比例 0-1 */
  control: { countryId: string; ratio: Fixed }[];
}

/**
 * M5 登陆作战
 */
export type InvasionStatus = 'preparing' | 'ready' | 'launched' | 'success' | 'repelled';

export interface InvasionPlan {
  id: string;
  ownerId: string;
  fromProvinceId: number;
  toProvinceId: number;
  divisionIds: number[];
  requiredConvoys: number;
  preparationProgress: Fixed;
  status: InvasionStatus;
  escortFleetIds: number[];
  supportWingIds: number[];
  /** 登陆发起 tick */
  launchedTick: number;
  /** 路径经过的海域 ID（用于判定制海权） */
  pathSeaZoneIds: number[];
  /** 目标空域 ID（用于判定制空权） */
  targetAirZoneId: number | null;
}

/**
 * 运输航线（M3，海运补给）
 */
export interface ConvoyRoute {
  id: string;
  countryId: string;
  /** 起点港口省份 */
  fromProvinceId: number;
  /** 终点港口省份 */
  toProvinceId: number;
  /** 途经海域 */
  seaZoneIds: number[];
  /** 执行护航的舰队 ID（可选） */
  escortFleetId: number | null;
  /** 该航线输送的补给强度 0-1 */
  supplyFlow: Fixed;
  /** 运输船数量 */
  convoyCount: number;
}

export type SupplyStatus = 'ok' | 'low' | 'critical' | 'none';

/**
 * 部队（技术设计文档 3.7）
 *
 * 编制 = 4 兵种卡；含组织度 / 硬度 / 软硬攻 / 当前省份 / 目标攻势 / 补给状态。
 */
export interface Division {
  id: number;
  ownerId: string;
  /** 使用的模板 ID */
  templateId: string;
  /** 编制（4 兵种卡，引用装备类型） */
  template: { slot: number; equipmentType: string }[];
  organization: Fixed;
  hardness: Fixed;
  softAttack: Fixed;
  hardAttack: Fixed;
  /** 当前所在省份 */
  currentProvinceId: number;
  /** 目标攻势（拉线终点省份），null 表示无攻势 */
  targetProvinceId: number | null;
  /** 补给状态（0-1，1 = 满补给） */
  supply: Fixed;
  /** 补给档位 */
  supplyStatus: SupplyStatus;
  /** 当前强度（人员 / 装备饱满度，0-1） */
  strength: Fixed;
  /** 训练进度 0-1 */
  trainingProgress: Fixed;
  /** 师团状态 */
  status: DivisionStatus;
  /** 是否在进攻中 */
  inOffensive: boolean;
}

export interface ProvinceSupply {
  provinceId: number;
  level: Fixed;
  demand: Fixed;
  received: Fixed;
  viaPort: boolean;
  bombedUntilTick: number;
}

export interface SeaSupplyRoute {
  id: string;
  ownerId: string;
  fromPortId: number;
  toPortId: number;
  pathSeaZoneIds: number[];
  convoysAssigned: number;
  efficiency: Fixed;
  escortFleetIds: number[];
}

export interface SupplyNetwork {
  provinceSupply: SortedMap<number, ProvinceSupply>;
  seaSupplyRoutes: SeaSupplyRoute[];
  lastRecalcTick: number;
}

/**
 * 焦点树状态（技术设计文档 3.7）
 *
 * 当前进度 + 已解锁 + 可选三选一刷新计时（60s）。
 */
export interface FocusTreeState {
  countryId: string;
  /** 已完成的焦点 ID */
  completedFocusIds: string[];
  /** 当前进行中的焦点 ID（null 表示无） */
  activeFocusId: string | null;
  /** 当前焦点累计进度（0-1） */
  activeProgress: Fixed;
  /** 三选一候选焦点 ID（每 60s 刷新） */
  candidates: string[];
  /** 距下次刷新 tick 数 */
  refreshInTicks: number;
}

/**
 * 科研状态（技术设计文档 3.7）
 *
 * 每条线当前节点 + 进度 + 槽位分配。
 */
export interface ResearchState {
  countryId: string;
  /** 科研线 → 状态 */
  lines: {
    lineId: string;
    currentNode: string;
    /** currentNode 在 line.nodes 中的索引（缓存，避免每 tick findIndex；不同步进 hash） */
    currentNodeIndex: number;
    progress: Fixed;
    assignedSlot: number;
  }[];
}

/**
 * 区域争端记录（技术设计文档 3.7 War + spec S.2 脱敏）
 *
 * S.2 变更：原 War 接口语义从「战争」改为「区域争端」。
 * - warSupport → disputeResolve（争端决心）
 * - warGoals → disputeGoals（争端目标）
 * - occupiedVPs → controlledVPs（管控的胜利点）
 *
 * 这是初始骨架，无既有二进制协议兼容性顾虑，故字段名一并脱敏。
 */
export interface Dispute {
  id: string;
  /** 参与方国家 ID */
  participants: string[];
  /** participants 的 Set 视图（加速存在性检查，不参与序列化/hash） */
  participantSet: Set<string>;
  /** 争端决心（S.2 脱敏：原 warSupport），按国家 ID 索引 */
  disputeResolve: Record<string, Fixed>;
  /** 争端目标（S.2 脱敏：原 warGoals） */
  disputeGoals: string[];
  /** 已管控的胜利点（S.2 脱敏：原 occupiedVPs），按国家 ID 索引 */
  controlledVPs: Record<string, number>;
  /** 双方投降倾向 0-1（M1 feature-grand-war），达到surrenderThreshold时投降 */
  surrenderProgress: Record<string, Fixed>;
  /** 双方投降阈值（M1 feature-grand-war），主要国0.8，次要国0.6 */
  surrenderThreshold: Record<string, Fixed>;
  /** 争端开始tick（M1 feature-grand-war） */
  startTick: number;
  /** 总VP数（M1 feature-grand-war，缓存用于计算投降增长） */
  totalVPs: number;
}

/**
 * 空闲工厂提醒状态（技术设计文档 3.6）
 */
export interface IdleAlertState {
  idleFactoryCount: number;
  longestIdleTicks: number;
  /** L0 无 / L1 静默 / L2 角标 / L3 浮窗 / L4 自动暂停 */
  level: 0 | 1 | 2 | 3 | 4;
  /** 第一个空闲工厂 id（SortedMap 升序，最小 id），无空闲工厂时为 0 */
  firstIdleFactoryId: number;
}

/** 阈值（10Hz：50 / 100 / 150 / 300 tick） */
export const IDLE_L1 = 50;
export const IDLE_L2 = 100;
export const IDLE_L3 = 150;
export const IDLE_L4 = 300;

/** 放置校验结果（技术设计文档 3.4 validatePlacement 返回） */
export interface ValidationResult {
  ok: boolean;
  reason?: 'not_owned' | 'not_coastal' | 'no_node' | 'no_slot' | 'no_steel';
}
