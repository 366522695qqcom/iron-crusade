/**
 * PlayerAction + GameEvent 类型定义
 *
 * 实现依据：技术设计文档 4.2 / 4.4 + spec S.2 脱敏
 *
 * S.2 脱敏：
 * - PlayerAction.declareWar → initiateDispute（发起区域争端）
 * - GameEvent.combatResolved → disputeResolved（争端结算）
 * - GameEvent.provinceOccupied → provinceControlled（省份被管控）
 *
 * 二进制兼容性说明：
 * 附录 C.2.2 的 kind 值保持不变（如 declareWar 的 0x0C 仍保留为 initiateDispute 的编码值），
 * 仅枚举名脱敏，编码位级不变以维持联机协议兼容（S.2.4 注释更新由协议层处理）。
 */
import { Fixed } from '../determinism/fixed';
import { BuildingType, ResourceType, GameSpeed } from '../types';

/**
 * 玩家动作联合类型（技术设计文档 4.2）
 *
 * S.2 脱敏变更：
 * - declareWar → initiateDispute（发起区域争端，原"宣战"）
 * - targetCountryId 字段名保留不变
 *
 * 其余 kind（setSpeed / placeBuilding / cancelBuilding / assignFactory /
 * unassignFactory / reorderConstruction / pickFocus / pickResearch /
 * drawFront / issueOffensive / trade / joinFaction）保持不变。
 */
export type PlayerAction =
  | { kind: 'setSpeed'; speed: GameSpeed }
  | { kind: 'placeBuilding'; type: BuildingType; provinceId: number; factoryCount: number }
  | { kind: 'cancelBuilding'; itemId: string }
  | { kind: 'assignFactory'; factoryId: number; taskId: string }
  | { kind: 'unassignFactory'; factoryId: number }
  | { kind: 'reorderConstruction'; itemId: string; newPriority: number }
  | { kind: 'pickFocus'; focusId: string }
  | { kind: 'pickResearch'; lineId: string }
  | { kind: 'drawFront'; fromProvince: number; toProvince: number }
  | { kind: 'issueOffensive'; divisionIds: number[]; targetProvince: number }
  | { kind: 'trade'; resourceType: ResourceType; factoryCount: number; amount: Fixed }
  /**
   * 发起区域争端（S.2 脱敏：原 declareWar 宣战）
   * 二进制 kind 值仍为 0x0C，仅枚举名脱敏（附录 C.2.2）。
   */
  | { kind: 'initiateDispute'; targetCountryId: string }
  | { kind: 'recruitDivision'; provinceId: number; templateId?: string }
  | { kind: 'joinFaction'; factionId: string }
  /** M1 feature-grand-war: 师团选择命令 */
  | { kind: 'selectUnits'; unitIds: number[]; additive?: boolean }
  | { kind: 'deselectUnits' }
  | { kind: 'orderMove'; divisionIds: number[]; targetProvinceId: number }
  | { kind: 'orderStop'; divisionIds: number[] }
  | { kind: 'orderRetreat'; divisionIds: number[]; targetProvinceId: number }
  | { kind: 'orderSplitDivision'; divisionId: number }
  | { kind: 'orderMergeDivisions'; divisionIds: number[] }
  /** M3 海军 */
  | { kind: 'recruitFleet'; portProvinceId: number; composition: Record<string, number>; name: string }
  | { kind: 'assignFleetMission'; fleetId: number; mission: import('../state/world_state').FleetMission; seaZoneId?: number; targetProvinceId?: number }
  | { kind: 'recallFleet'; fleetId: number }
  /** M4 空军 */
  | { kind: 'recruitWing'; baseProvinceId: number; aircraft: Record<string, number>; name: string }
  | { kind: 'assignWingMission'; wingId: number; mission: import('../state/world_state').AirMission; airZoneId?: number; targetProvinceId?: number; targetSeaZoneId?: number }
  | { kind: 'recallWing'; wingId: number }
  /** M5 登陆作战 */
  | { kind: 'prepareInvasion'; fromProvinceId: number; toProvinceId: number; divisionIds: number[]; escortFleetIds: number[]; supportWingIds: number[] }
  | { kind: 'launchInvasion'; planId: string }
  | { kind: 'cancelInvasion'; planId: string };

/**
 * 游戏事件联合类型（技术设计文档 4.4）
 *
 * S.2 脱敏变更：
 * - combatResolved → disputeResolved（争端结算，原"战斗结算"）
 * - provinceOccupied → provinceControlled（省份被管控，原"被占领"）
 *
 * spec implement-focus-research T3.2 变更：
 * - 新增 researchCompleted 成员（科研节点完成）
 *
 * 其余事件（buildingCompleted / factoryIdle / resourceDepleted /
 * focusCompleted / hashMismatch）保持不变。
 *
 * 注：仅类型层面新增成员，无二进制协议破坏（GameEvent 编码层由序列化器处理，
 * 新增 kind 不会影响既有编码值）。
 */
export type GameEvent =
  | { kind: 'buildingCompleted'; buildingId: number; provinceId: number }
  | { kind: 'factoryIdle'; factoryId: number; durationTicks: number }
  | { kind: 'resourceDepleted'; countryId: string; type: ResourceType }
  | { kind: 'focusCompleted'; countryId: string; focusId: string }
  /**
   * 科研节点完成（spec implement-focus-research T3.2 新增）
   *
   * 字段：countryId / lineId / nodeId
   * 触发：ResearchSystem.advanceTick 检测到某线 currentNode 前进时发出。
   */
  | { kind: 'researchCompleted'; countryId: string; lineId: string; nodeId: string }
  /**
   * 生产完成：装备入池
   */
  | { kind: 'productionCompleted'; countryId: string; equipmentType: string; count: number }
  /**
   * 贸易完成：资源入池
   */
  | { kind: 'tradeCompleted'; countryId: string; resourceType: ResourceType; amount: Fixed }
  /**
   * 师团招募/训练完成
   */
  | { kind: 'divisionRecruited'; divisionId: number; provinceId: number }
  /**
   * 师团被歼灭（M1 feature-grand-war）
   */
  | { kind: 'divisionDestroyed'; divisionId: number; ownerId: string; provinceId: number }
  /**
   * 争端结算（S.2 脱敏：原 combatResolved 战斗结算）
   */
  | { kind: 'disputeResolved'; disputeId: string; winnerCountryId: string; loserCountryId: string }
  /**
   * 省份被管控（S.2 脱敏：原 provinceOccupied 占领）
   */
  | { kind: 'provinceControlled'; provinceId: number; byCountryId: string; fromCountryId: string }
  /**
   * 国家投降（M1 feature-grand-war）
   */
  | { kind: 'surrendered'; countryId: string; disputeId: string }
  /**
   * 战争开始（M2 外交系统）
   */
  | { kind: 'warStarted'; countryId: string; disputeId: string; tickId: number; relatedIds: { attackerId: string; defenderId: string } }
  /**
   * 和谈达成（M2 外交系统）
   */
  | { kind: 'peaceTreaty'; countryId: string; disputeId: string; tickId: number; relatedIds: { proposerId: string; targetId: string } }
  /**
   * 补给危机（M2 补给系统：大量师团断补）
   */
  | { kind: 'supplyCrisis'; countryId: string; divisionsOutOfSupply: number }
  /**
   * 舰队创建（M3）
   */
  | { kind: 'fleetCreated'; fleetId: number; ownerId: string }
  /**
   * 海战发生（M3）
   */
  | { kind: 'navalBattle'; seaZoneId: number; attackerCountryId: string; defenderCountryId: string; attackerShipsLost: number; defenderShipsLost: number }
  /**
   * 舰船被击沉（M3）
   */
  | { kind: 'shipSunk'; shipId: number; ownerId: string; seaZoneId: number }
  /**
   * 岸轰支援（M3）
   */
  | { kind: 'shoreBombardment'; fleetId: number; provinceId: number; bombardStrength: Fixed }
  /**
   * 运输船被击沉（M3）
   */
  | { kind: 'convoySunk'; countryId: string; count: number; seaZoneId: number }
  /**
   * 联队创建（M4）
   */
  | { kind: 'wingCreated'; wingId: number; ownerId: string }
  /**
   * 空战发生（M4）
   */
  | { kind: 'airBattle'; airZoneId: number; attackerCountryId: string; defenderCountryId: string; attackerAircraftLost: number; defenderAircraftLost: number }
  /**
   * 飞机损失（M4）
   */
  | { kind: 'aircraftLost'; wingId: number; ownerId: string; aircraftType: string; count: number; airZoneId: number }
  /**
   * 港口被轰炸（M4）
   */
  | { kind: 'portStruck'; provinceId: number; attackerCountryId: string }
  /**
   * CAS 支援（M4）
   */
  | { kind: 'casSupport'; wingId: number; provinceId: number; supportStrength: Fixed }
  /**
   * 对海打击（M4）
   */
  | { kind: 'navalStrike'; wingId: number; seaZoneId: number; shipsSunk: number }
  /**
   * M5 登陆作战
   */
  | { kind: 'invasionPrepared'; planId: string; ownerId: string; fromProvinceId: number; toProvinceId: number }
  | { kind: 'invasionLaunched'; planId: string; ownerId: string }
  | { kind: 'invasionRepelled'; planId: string; ownerId: string; divisionsLost: number; convoysLost: number }
  | { kind: 'invasionSuccess'; planId: string; ownerId: string; provinceId: number }
  | { kind: 'invasionCancelled'; planId: string; ownerId: string }
  | { kind: 'hashMismatch'; frameId: number; expected: string; actual: string };
