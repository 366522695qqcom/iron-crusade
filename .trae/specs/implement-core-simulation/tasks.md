# Tasks（implement-core-simulation）

> 实现核心 Simulation 全套：哈希 + 资源 + 建筑 + 工厂 + 状态管理 + tick 循环。
> 依赖：数据模型、确定性基础、接口契约均已就绪；本 spec 仅新增实现类，不改接口。

---

## T1：确定性状态哈希

- [x] **T1.1**：创建 `src/core/state/hash.ts`
  - `imul32(a, b)`：本地实现 32 位整数乘法（替代 Math.imul，保持 ESLint 不破）
  - `Encoder` 类：`i32/v/u32/u16/u8/string/bool/nullable/Fixed/toBytes` 方法
  - `serializeWorld(state): Uint8Array`：按技术设计文档 C.3.2 字段顺序序列化（version/seed/tickId/tickElapsed/speed/各 SortedMap/nextEntityId/seedMap）
  - `hashWorld(state): string`：FNV-1a 32 位（offset 0x811c9dc5，prime 0x01000193），返回 8 位 hex
  - SortedMap 输出 u32 count + 按 key 升序 [k,v] 对
  - Fixed 输出 i32 小端（raw 值）

---

## T2：资源系统实现

- [x] **T2.1**：创建 `src/core/simulation/resource_system.ts`——DefaultResourceSystem
  - 实现 `ResourceSystem` 接口（见 `interfaces.ts`）
  - `yieldTick(state, countryId, dt)`：遍历国家省份，有资源节点 + 开采建筑的省份产出（管控区减半，超上限丢弃）
  - `consume(state, countryId, type, amount): boolean`：不足返回 false
  - `reserveCap(state, countryId, type): Fixed`：基础 + 仓储建筑等级加成
  - 全部数值用 Fixed，无浮点
  - 不 import cc，不 import Math

---

## T3：建筑系统实现

- [x] **T3.1**：创建 `src/core/simulation/building_system.ts`——DefaultBuildingSystem
  - 实现 `BuildingSystem` 接口
  - `validate(state, req): { ok: boolean; reason?: string }`：归属/沿海（船坞）/节点（矿场）/槽位/钢铁校验
  - `enqueue(state, req): string`：扣钢铁、入队、返回 itemId
  - `cancel(state, itemId): void`：移出队列（钢铁不返还）
  - `assignFactories(state, itemId, factoryIds): void`
  - `advanceTick(state, countryId, dt): GameEvent[]`：按民厂数 × dt / timeCost 推进，完成时建 Building 入库 + 发 buildingCompleted 事件

---

## T4：工厂系统实现

- [x] **T4.1**：创建 `src/core/simulation/factory_system.ts`——DefaultFactorySystem
  - 实现 `FactorySystem` 接口
  - `assignTask(state, factoryId, taskId)` / `unassign(state, factoryId)`
  - `scanIdle(state, countryId): { idleCount: number; longestIdleTicks: number; level: 0|1|2|3|4 }`
    - 阈值：L1=50tick/L2=100/L3=150/L4=300
  - `produceTick(state, countryId, dt): GameEvent[]`：推进生产任务进度
  - `oneClickBalance(state, countryId)` / `autoTrade(state, countryId, resourceType)` / `applyTemplate(state, factoryId, templateId)`：M1 简化实现（占位，后续细化）

---

## T5：状态管理实现

- [x] **T5.1**：创建 `src/core/simulation/state_manager.ts`——DefaultStateManager
  - 实现 `StateManager` 接口
  - `snapshot(): WorldState`：深拷贝（SortedMap 重建，保证独立）
  - `restore(s: WorldState): void`：替换内部状态
  - `hash(): string`：委托 `hashWorld`
  - `diff(): WorldDiff`：M1 简化（返回占位空 diff）
  - `applyDiff(d: WorldDiff): void`：M1 简化（noop，联机阶段细化）

---

## T6：Simulation tick 循环实现

- [x] **T6.1**：创建 `src/core/simulation/simulation.ts`——DefaultSimulation
  - 实现 `Simulation` 接口（见 `index.ts`）
  - 构造：接收 WorldState + 各子系统实例（resource/building/factory）+ StateManager
  - `tick(frameId, inputs): TickResult`：
    - 应用玩家输入（setSpeed/placeBuilding/cancelBuilding/assignFactory/unassignFactory/reorderConstruction/trade 等已定义 action）
    - 调用 resource.yieldTick / building.advanceTick / factory.produceTick（按 speed 跳过 if 0）
    - 收集各系统返回的 GameEvent
    - 每 16 帧（frameId % 16 === 0）算一次 hashWorld，否则返回上一帧 hash
  - `snapshot()` / `restore(s)` / `hash()`：委托 state_manager
  - 焦点树/科研/战斗/dispute 推进不在本范围（后续 spec）

---

## T7：模块导出与验证

- [x] **T7.1**：更新 `src/core/simulation/index.ts`——导出 DefaultResourceSystem/DefaultBuildingSystem/DefaultFactorySystem/DefaultStateManager/DefaultSimulation
- [x] **T7.2**：更新 `src/core/state/index.ts`（若存在）或在 simulation/index.ts 导出 `hashWorld`/`serializeWorld`/`Encoder`
- [x] **T7.3**：`npx tsc --noEmit` 零错误
- [x] **T7.4**：确认实现类严格符合既有接口（无新增接口字段）
- [x] **T7.5**：确认 core/ 无 cc import、无 Math 调用（除 fixed.ts 白名单）

---

# Task Dependencies

- T1（hash）独立，可立即开始
- T2（resource）独立，可与 T1 并行
- T3（building）依赖 T2（钢铁消耗用 ResourceSystem.consume）
- T4（factory）依赖 T2（生产消耗资源）+ T3（工厂任务与建筑关联）
- T5（state_manager）依赖 T1（hash）
- T6（simulation）依赖 T1-T5 全部
- T7（验证）依赖 T6

## 可并行任务

- T1 与 T2 可并行（无相互依赖）
- T3 与 T5 可并行（T3 依赖 T2，T5 依赖 T1，互不冲突）
- T4 在 T3 完成后开始
