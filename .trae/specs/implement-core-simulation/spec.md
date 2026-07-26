# 核心 Simulation 系统实现 Spec（implement-core-simulation）

> 变更类型：新增核心系统实现（M1 单机核心基础）
> 影响文档：技术设计文档 4.x / C.3
> 影响代码：`src/core/state/`、`src/core/simulation/`
> 依赖：数据模型（`world_state.ts`）、确定性基础（`fixed.ts`/`prng.ts`/`sorted_map.ts`）、接口契约（`interfaces.ts`/`index.ts`）均已就绪

## Why

当前 `src/core/` 已有完整的数据模型（WorldState 及全部实体接口）、确定性基础（Fixed/PRNG/SortedMap）、以及子模块接口契约（ResourceSystem/BuildingSystem/FactorySystem/StateManager/Simulation），但**这些接口全部未实现**——`simulation/index.ts` 仅导出接口，`interfaces.ts` 仅定义契约。这导致：

1. 无法运行任何单局推演（tick 循环不存在），M1 单机核心无法启动
2. 确定性能力（技术设计文档 T.2.2「固定 tick + CI 哈希校验」）缺关键一环——`hash.ts` 未实现，无法做跨引擎哈希一致性校验
3. 上层 A 级功能（快速对局/助理模式/会话目标/每日任务）虽有控制器骨架，但底层 tick 推演缺失，无法真正运行

本次实现核心 Simulation 全套（哈希 + 资源 + 建筑 + 工厂 + 状态管理 + tick 循环），打通单机推演主链路，为 M1 上层玩法提供可运行基底。

## What Changes

### ADDED（新增核心系统实现）

- **ADDED** `src/core/state/hash.ts`——确定性序列化 + FNV-1a 32 位哈希（技术设计文档 C.3）
  - `Encoder` 类：i32/u32/u16/u8/string/bool/nullable/Fixed 写入
  - `serializeWorld(state): Uint8Array`：严格按 C.3.2 字段顺序序列化
  - `hashWorld(state): string`：FNV-1a 32 位，返回 8 位 hex
  - 本地实现 `imul32`（避免 core/ 用 Math，保持 ESLint 规则不破）
- **ADDED** `src/core/simulation/resource_system.ts`——DefaultResourceSystem（PROJECT.md 3.2）
  - `yieldTick`：遍历国家省份，资源节点 + 开采建筑 → 产出进储备（管控区减半，超上限丢弃）
  - `consume`：不足返回 false
  - `reserveCap`：基础 + 仓储建筑加成
- **ADDED** `src/core/simulation/building_system.ts`——DefaultBuildingSystem（PROJECT.md 3.4）
  - `validate`：归属/沿海/节点/槽位/钢铁校验
  - `enqueue`：扣钢铁、入队、返回 itemId
  - `cancel`：移出队列（钢铁不返还，3.4.5）
  - `assignFactories`：设置施工民厂
  - `advanceTick`：按民厂数 × dt / timeCost 推进，完成时建 Building 入库 + 发事件
- **ADDED** `src/core/simulation/factory_system.ts`——DefaultFactorySystem（PROJECT.md 3.3）
  - `assignTask`/`unassign`：设置 taskId、重置 idleSinceTick
  - `scanIdle`：统计空闲数 + 最长空闲 tick + 告警层级 L0-L4
  - `produceTick`：推进生产任务进度
  - `oneClickBalance`/`autoTrade`/`applyTemplate`：简化实现
- **ADDED** `src/core/simulation/state_manager.ts`——DefaultStateManager
  - `snapshot`：深拷贝 WorldState（SortedMap 重建）
  - `restore`：替换内部状态
  - `hash`：委托 hashWorld
  - `diff`/`applyDiff`：M1 简化实现（返回占位 WorldDiff，applyDiff 暂不落地，联机阶段再细化）
- **ADDED** `src/core/simulation/simulation.ts`——DefaultSimulation（tick 循环）
  - `tick(frameId, inputs)`：应用玩家输入（setSpeed/placeBuilding 等）→ 各系统 advanceTick → 收集事件 → 每 16 帧算哈希
  - `snapshot`/`restore`/`hash`：委托 state_manager
  - 焦点树/科研/战斗/dispute 推进**暂不在本 spec 范围**（对应系统接口未定义，后续 spec 实现）

### MODIFIED

- **MODIFIED** `src/core/simulation/index.ts`——导出新增的 Default* 实现类与 hashWorld/serializeWorld

## Impact

- **Affected specs**：
  - `optimize-for-launch` T.2.2（固定 tick + CI 哈希校验）：本 spec 落地 hash.ts + simulation tick，完成 T.2.2 核心能力
  - A 级上层（快速对局/助理/会话目标/每日任务）：底层 tick 可用，上层控制器可接入真实推演
- **Affected code**：
  - 新增：`core/state/hash.ts`、`core/simulation/{resource,building,factory,state_manager,simulation}_system.ts`（文件名见 tasks）
  - 改造：`core/simulation/index.ts`（导出新模块）
- **不变**：
  - 数据模型（`world_state.ts`）不改
  - 接口契约（`interfaces.ts`/`simulation/index.ts` 接口定义）不改——实现类严格符合既有接口
  - 确定性基础（`fixed.ts`/`prng.ts`/`sorted_map.ts`）不改
  - ESLint 规则不改——hash.ts 用本地 imul32 规避 Math 限制

---

## ADDED Requirements

### Requirement: 确定性状态哈希

系统 SHALL 提供确定性序列化与 FNV-1a 32 位哈希，保证同一 WorldState 在不同 JS 引擎产生相同哈希。

- 序列化严格按技术设计文档 C.3.2 字段顺序（version/seed/tickId/tickElapsed/speed/各 SortedMap/nextEntityId/seedMap）
- SortedMap 输出 u32 count + 按 key 升序的 [k,v] 对
- Fixed 输出 i32 小端（raw 值）
- 哈希算法 FNV-1a 32 位，offset basis 0x811c9dc5，prime 0x01000193
- 返回 8 位 hex 字符串
- core/ 内不使用 Math（本地实现 imul32，保持 ESLint 规则）

#### Scenario: 同状态同哈希
- **WHEN** 对同一 WorldState 调用 hashWorld 两次
- **THEN** 返回值完全相同

#### Scenario: 跨引擎一致
- **WHEN** 同一 seed + 同一输入序列跑 1000 tick
- **THEN** V8/JSC/SpiderMonkey 三引擎计算的 hash 一致

### Requirement: 资源系统

系统 SHALL 实现资源产出与消耗，未消耗资源永久保留（不清零）。

- yieldTick：遍历国家省份，有资源节点 + 开采建筑的省份产出（管控区减半，超上限丢弃）
- consume：不足返回 false，足够则扣除
- reserveCap：基础 + 仓储建筑等级加成
- 全部数值用 Fixed，无浮点

#### Scenario: 资源产出累加
- **WHEN** 国家有钢铁节点 + 开采建筑等级 1
- **THEN** 每 tick 钢铁储备增加 baseYield × dt
- **AND** 未消耗的钢铁保留到下一 tick

#### Scenario: 管控区减半
- **WHEN** 资源节点所在省份被管控（occupied=true）
- **THEN** 产出减半

#### Scenario: 超上限丢弃
- **WHEN** 储备达到上限
- **THEN** 超出部分丢弃，储备不超上限

### Requirement: 建筑系统

系统 SHALL 实现建筑校验、入队、取消、施工推进。

- validate：归属/沿海（船坞）/节点（矿场）/槽位/钢铁校验
- enqueue：扣钢铁、入队、返回 itemId
- cancel：移出队列，钢铁不返还
- advanceTick：按民厂数 × dt / timeCost 推进进度，完成时 Building 入库

#### Scenario: 建造完成
- **WHEN** 施工进度 ≥ 1
- **THEN** Building 状态变 active，加入 state.buildings，发 buildingCompleted 事件

### Requirement: 工厂系统

系统 SHALL 实现任务分配、空闲扫描、生产推进。

- assignTask/unassign：设置 taskId，重置 idleSinceTick
- scanIdle：统计空闲数 + 最长空闲 + 告警层级（L1=50tick/L2=100/L3=150/L4=300）
- produceTick：推进生产任务进度
- oneClickBalance/autoTrade/applyTemplate：简化实现（M1 占位，后续细化）

#### Scenario: 空闲告警升级
- **WHEN** 工厂空闲超过 50 tick
- **THEN** scanIdle 返回 level ≥ 1

### Requirement: 状态管理

系统 SHALL 提供 WorldState 快照、恢复、哈希。

- snapshot：深拷贝（SortedMap 重建，保证快照与原状态独立）
- restore：替换内部状态
- hash：委托 hashWorld
- diff/applyDiff：M1 简化（占位返回，联机阶段细化）

### Requirement: Simulation tick 循环

系统 SHALL 提供固定 tick 推演主循环。

- tick(frameId, inputs)：应用玩家输入 → 资源/建筑/工厂系统 advanceTick → 收集 GameEvent → 每 16 帧算哈希
- 玩家输入处理：setSpeed/placeBuilding/cancelBuilding/assignFactory/unassignFactory/reorderConstruction/trade 等
- 焦点树/科研/战斗/dispute 推进不在本范围（后续 spec）
- 返回 TickResult（frameId/events/hash）

#### Scenario: 单 tick 推进
- **WHEN** 调用 tick(frameId, [setSpeed(1)])
- **THEN** 速度更新，资源/建筑/工厂系统各 advanceTick 一次
- **AND** 返回 TickResult 含该帧事件
