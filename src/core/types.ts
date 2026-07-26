/**
 * 公共枚举类型定义
 *
 * 实现依据：技术设计文档 第 3 章
 * 提取 BuildingType / ResourceType / TerrainType 等公共枚举，
 * 供 core/state、core/simulation 各模块共用，避免循环依赖。
 */

/** 建筑类型（技术设计文档 3.4） */
export type BuildingType =
  | 'civilian_factory' // 民用工厂
  | 'military_factory' // 军用工厂
  | 'dockyard'         // 船坞
  | 'infrastructure'   // 基础设施
  | 'mine'             // 矿场
  | 'storage'          // 仓储
  | 'supply_hub'       // 补给枢纽
  | 'fort';            // 工事

/** 资源类型（技术设计文档 3.3） */
export type ResourceType =
  | 'steel'      // 钢铁
  | 'oil'        // 石油
  | 'tungsten'   // 钨
  | 'rubber'     // 橡胶
  | 'aluminum'   // 铝
  | 'political'; // 政治点

/** 省份地形（技术设计文档 3.2） */
export type TerrainType =
  | 'plains'   // 平原
  | 'mountain' // 山地
  | 'forest'   // 森林
  | 'urban'    // 城市
  | 'desert'   // 沙漠
  | 'marsh';   // 沼泽

/** 工厂类型（技术设计文档 3.5） */
export type FactoryType = 'civilian' | 'military' | 'dockyard';

/** 生产任务类型（技术设计文档 3.5） */
export type ProductionTaskType = 'construction' | 'trade' | 'production';

/** 建筑状态（技术设计文档 3.4） */
export type BuildingState = 'planned' | 'constructing' | 'active';

/** 工厂状态（技术设计文档 3.5） */
export type FactoryState = 'idle' | 'working' | 'construction';

/**
 * 国家发展路线（spec S.1 脱敏：替换原 ideology 枚举）
 *
 * 删除原 'fascist' | 'communist' | 'democratic'，替换为架空发展路线：
 * - industrial_authoritarian  工业集权线
 * - communal                  公社共治线
 * - federal_republic          联邦共和线
 *
 * 国家不绑定固有路线，开局三选一，影响焦点树分支与 buffs，但无意识形态敏感词。
 */
export type DevelopmentPath =
  | 'industrial_authoritarian'
  | 'communal'
  | 'federal_republic';

/** 时间速度（技术设计文档 2.4，0 = 暂停） */
export type GameSpeed = 0 | 1 | 2 | 5;
