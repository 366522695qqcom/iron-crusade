/**
 * 新游戏初始 WorldState 工厂（core/state/）
 *
 * 为 main.ts 与 game/modes/quick_battle.ts 等入口提供可直接跑通
 * 「开局 → 建造 → 生产 → 招兵 → 争端 → 胜利」主循环的初始状态。
 *
 * 设计要点：
 * - 确定性：固定 seed 常量，SortedMap 按 key 升序，禁止 Math.random 影响初始数据。
 * - 轻量可玩：玩家国（铁十字联邦 p1）+ 敌方（赤星公社 e1），4 个省份联通，
 *   3 座空闲民厂，200 政治点 + 300 钢铁，足以启动建造/生产/招兵。
 * - 数据口径对齐 playthrough.test.ts（已验证可跑通完整循环）。
 */
import { Fixed } from '../determinism/fixed';
import { SortedMap } from '../determinism/sorted_map';
import type {
  WorldState,
  Country,
  Province,
  ResourceStockpile,
  Factory,
  EquipmentPool,
  AirWing,
} from './world_state';

const PLAYER = 'p1';
const ENEMY = 'e1';

const STATE_VERSION = '1.0.0';
const START_SEED = 0xDEADBEEF;

/**
 * 创建一个全新单机游戏 WorldState（经典模式默认开局）。
 *
 * - playerCountryId = 'p1'（铁十字联邦）
 * - enemyCountryId  = 'e1'（赤星公社）
 * - 共 4 省：首都(1)-边境(3) | 敌边境(4)-敌首都(2)，邻接 1-3-4-2
 * - 玩家初始：3 座空闲民厂，政200/钢300/油100/钨40/橡60/铝80
 * - 敌方初始：1 民厂+1 军厂，装备库存500枪/20炮
 *
 * 调用方可直接传入 DefaultSimulation.create(state) 开始模拟。
 */
export function createNewGameState(): WorldState {
  const countries = new SortedMap<string, Country>();
  countries.set(PLAYER, {
    id: PLAYER,
    name: '铁十字联邦',
    developmentPath: 'industrial_authoritarian',
    isPlayer: true,
    isAI: false,
    capitalProvinceId: 1,
    disputeResolve: Fixed.fromInt(0),
    stability: Fixed.fromNumber(0.6),
    politicalPower: Fixed.fromInt(200),
    factionId: null,
    ownedProvinceIds: [1, 3],
    controlledProvinceIds: [1, 3],
  });
  countries.set(ENEMY, {
    id: ENEMY,
    name: '赤星公社',
    developmentPath: 'communal',
    isPlayer: false,
    isAI: true,
    capitalProvinceId: 2,
    disputeResolve: Fixed.fromInt(0),
    stability: Fixed.fromNumber(0.5),
    politicalPower: Fixed.fromInt(100),
    factionId: null,
    ownedProvinceIds: [2, 4],
    controlledProvinceIds: [2, 4],
  });

  const provinces = new SortedMap<number, Province>();
  provinces.set(1, {
    id: 1, ownerId: PLAYER, controllerId: PLAYER, name: '首都',
    terrain: 'plains', isCoastal: false, adjacentProvinceIds: [3],
    infrastructure: 3, buildingSlots: 6, combatWidth: 10,
    supplyHubLevel: 2, fortLevel: 1, portLevel: 0, airBaseLevel: 2, VP: 15,
    adjacentSeaZoneIds: [],
  });
  provinces.set(3, {
    id: 3, ownerId: PLAYER, controllerId: PLAYER, name: '边境省',
    terrain: 'plains', isCoastal: false, adjacentProvinceIds: [1, 4],
    infrastructure: 2, buildingSlots: 4, combatWidth: 8,
    supplyHubLevel: 1, fortLevel: 0, portLevel: 0, airBaseLevel: 1, VP: 5,
    adjacentSeaZoneIds: [],
  });
  provinces.set(2, {
    id: 2, ownerId: ENEMY, controllerId: ENEMY, name: '敌首都',
    terrain: 'plains', isCoastal: false, adjacentProvinceIds: [4],
    infrastructure: 2, buildingSlots: 4, combatWidth: 8,
    supplyHubLevel: 1, fortLevel: 1, portLevel: 0, airBaseLevel: 2, VP: 15,
    adjacentSeaZoneIds: [],
  });
  provinces.set(4, {
    id: 4, ownerId: ENEMY, controllerId: ENEMY, name: '敌边境',
    terrain: 'plains', isCoastal: false, adjacentProvinceIds: [3, 2],
    infrastructure: 1, buildingSlots: 3, combatWidth: 6,
    supplyHubLevel: 0, fortLevel: 0, portLevel: 0, airBaseLevel: 0, VP: 3,
    adjacentSeaZoneIds: [],
  });

  const stockpiles = new SortedMap<string, ResourceStockpile>();
  stockpiles.set(PLAYER, {
    countryId: PLAYER,
    steel: Fixed.fromInt(300), oil: Fixed.fromInt(100), tungsten: Fixed.fromInt(40),
    rubber: Fixed.fromInt(60), aluminum: Fixed.fromInt(80), political: Fixed.fromInt(200),
    caps: {
      steel: Fixed.fromInt(500), oil: Fixed.fromInt(300), tungsten: Fixed.fromInt(80),
      rubber: Fixed.fromInt(150), aluminum: Fixed.fromInt(200), political: Fixed.fromInt(200),
    },
    history: [],
  });
  stockpiles.set(ENEMY, {
    countryId: ENEMY,
    steel: Fixed.fromInt(300), oil: Fixed.fromInt(100), tungsten: Fixed.fromInt(40),
    rubber: Fixed.fromInt(60), aluminum: Fixed.fromInt(80), political: Fixed.fromInt(100),
    caps: {
      steel: Fixed.fromInt(500), oil: Fixed.fromInt(300), tungsten: Fixed.fromInt(80),
      rubber: Fixed.fromInt(150), aluminum: Fixed.fromInt(200), political: Fixed.fromInt(200),
    },
    history: [],
  });

  const factories = new SortedMap<number, Factory>();
  factories.set(1, mkFactory(1, 1, 'civilian'));
  factories.set(2, mkFactory(2, 1, 'civilian'));
  factories.set(3, mkFactory(3, 3, 'civilian'));
  factories.set(101, mkFactory(101, 2, 'civilian'));
  factories.set(102, mkFactory(102, 2, 'military'));

  const equipmentPools = new SortedMap<string, EquipmentPool>();
  equipmentPools.set(PLAYER, {
    countryId: PLAYER,
    stocks: [
      { type: 'infantry_equipment', count: 0 },
      { type: 'artillery', count: 0 },
      { type: 'light_tank', count: 0 },
      { type: 'fighter', count: 20 },
      { type: 'cas', count: 12 },
      { type: 'tactical_bomber', count: 0 },
      { type: 'naval_fighter', count: 0 },
    ],
  });
  equipmentPools.set(ENEMY, {
    countryId: ENEMY,
    stocks: [
      { type: 'infantry_equipment', count: 500 },
      { type: 'artillery', count: 20 },
      { type: 'light_tank', count: 0 },
      { type: 'fighter', count: 20 },
      { type: 'cas', count: 12 },
      { type: 'tactical_bomber', count: 0 },
      { type: 'naval_fighter', count: 0 },
    ],
  });

  const wings = new SortedMap<number, AirWing>();
  const PLAYER_WING_ID = 200;
  const ENEMY_WING_ID = 201;
  wings.set(PLAYER_WING_ID, {
    id: PLAYER_WING_ID,
    ownerId: PLAYER,
    name: '第1战斗机联队',
    aircraft: { fighter: 40 },
    organization: Fixed.ONE,
    strength: Fixed.ONE,
    trainingProgress: Fixed.ONE,
    status: 'idle',
    homeBaseId: 1,
    carrierFleetId: null,
    mission: 'idle',
    assignedAirZoneId: null,
    targetProvinceId: null,
    targetSeaZoneId: null,
  });
  wings.set(ENEMY_WING_ID, {
    id: ENEMY_WING_ID,
    ownerId: ENEMY,
    name: '赤旗战斗机联队',
    aircraft: { fighter: 40 },
    organization: Fixed.ONE,
    strength: Fixed.ONE,
    trainingProgress: Fixed.ONE,
    status: 'idle',
    homeBaseId: 2,
    carrierFleetId: null,
    mission: 'idle',
    assignedAirZoneId: null,
    targetProvinceId: null,
    targetSeaZoneId: null,
  });

  return {
    version: STATE_VERSION,
    seed: START_SEED,
    tickId: 0,
    tickElapsed: Fixed.fromInt(0),
    speed: 0,
    countries,
    provinces,
    resourceNodes: new SortedMap(),
    stockpiles,
    buildings: new SortedMap(),
    factories,
    constructionQueues: new SortedMap(),
    productionTasks: new SortedMap(),
    equipmentPools,
    divisions: new SortedMap(),
    divisionTemplates: new SortedMap(),
    supplyNetwork: {
      provinceSupply: new SortedMap(),
      seaSupplyRoutes: [],
      lastRecalcTick: 0,
    },
    focusTrees: new SortedMap(),
    research: new SortedMap(),
    disputes: new SortedMap(),
    fronts: new SortedMap(),
    warLosses: new SortedMap(),
    warLog: [],
    selectedUnitIds: [],
    nextEntityId: 202,
    seedMap: { [PLAYER]: 1001, [ENEMY]: 2002 },
    gameOver: null,
    shipTemplates: new SortedMap(),
    ships: new SortedMap(),
    fleets: new SortedMap(),
    seaZones: new SortedMap(),
    seaControl: new SortedMap(),
    convoyRoutes: [],
    airZones: new SortedMap(),
    wings,
    airSuperiority: new SortedMap(),
    invasions: new SortedMap(),
  };
}

function mkFactory(id: number, provinceId: number, type: 'civilian' | 'military' | 'dockyard'): Factory {
  return {
    id,
    provinceId,
    type,
    level: 1,
    state: 'idle',
    taskId: null,
    idleSinceTick: 0,
    productionProgress: Fixed.fromInt(0),
  };
}
