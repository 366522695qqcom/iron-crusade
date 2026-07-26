# Checklist（implement-core-simulation）

> 验证检查点。每个检查点对应 spec.md 的需求与 tasks.md 的任务。

---

## T1：确定性状态哈希

- [x] `src/core/state/hash.ts` 已创建
- [x] `imul32` 本地实现 32 位整数乘法（不依赖 Math.imul）
- [x] `Encoder` 类含 i32/u32/u16/u8/string/bool/nullable/Fixed/toBytes 方法
- [x] `serializeWorld` 按技术设计文档 C.3.2 字段顺序序列化
- [x] `hashWorld` FNV-1a 32 位（offset 0x811c9dc5，prime 0x01000193）返回 8 位 hex
- [x] SortedMap 输出 u32 count + 按 key 升序 [k,v] 对
- [x] Fixed 输出 i32 小端（raw 值）
- [x] 同一 WorldState 两次 hashWorld 返回值相同
- [x] core/ 内无 Math 调用（除 fixed.ts 白名单）

---

## T2：资源系统

- [x] `src/core/simulation/resource_system.ts` 已创建 DefaultResourceSystem
- [x] 实现 ResourceSystem 接口（无新增字段）
- [x] yieldTick 遍历国家省份，资源节点+开采建筑产出
- [x] 管控区（occupied=true）产出减半
- [x] 超上限丢弃（储备不超上限）
- [x] consume 不足返回 false
- [x] reserveCap 基础 + 仓储建筑加成
- [x] 全部数值用 Fixed，无浮点
- [x] 无 cc import，无 Math 调用

---

## T3：建筑系统

- [x] `src/core/simulation/building_system.ts` 已创建 DefaultBuildingSystem
- [x] 实现 BuildingSystem 接口
- [x] validate 校验归属/沿海（船坞）/节点（矿场）/槽位/钢铁
- [x] enqueue 扣钢铁、入队、返回 itemId
- [x] cancel 移出队列（钢铁不返还）
- [x] assignFactories 设置施工民厂
- [x] advanceTick 按民厂数 × dt / timeCost 推进
- [x] 完成时 Building 状态变 active + 入库 + 发 buildingCompleted 事件

---

## T4：工厂系统

- [x] `src/core/simulation/factory_system.ts` 已创建 DefaultFactorySystem
- [x] 实现 FactorySystem 接口
- [x] assignTask/unassign 设置 taskId、重置 idleSinceTick
- [x] scanIdle 统计空闲数 + 最长空闲 + 告警层级
- [x] 告警阈值：L1=50tick/L2=100/L3=150/L4=300
- [x] produceTick 推进生产任务进度
- [x] oneClickBalance/autoTrade/applyTemplate 简化实现（M1 占位）

---

## T5：状态管理

- [x] `src/core/simulation/state_manager.ts` 已创建 DefaultStateManager
- [x] 实现 StateManager 接口
- [x] snapshot 深拷贝（SortedMap 重建）
- [x] restore 替换内部状态
- [x] hash 委托 hashWorld
- [x] diff/applyDiff M1 简化（占位）

---

## T6：Simulation tick 循环

- [x] `src/core/simulation/simulation.ts` 已创建 DefaultSimulation
- [x] 实现 Simulation 接口（index.ts 定义）
- [x] 构造接收 WorldState + 子系统实例 + StateManager
- [x] tick 应用玩家输入（setSpeed/placeBuilding/cancelBuilding/assignFactory 等）
- [x] tick 调用 resource/building/factory 系统 advanceTick
- [x] speed=0 时跳过系统推进
- [x] 每 16 帧算一次 hashWorld，否则返回上一帧 hash
- [x] 返回 TickResult（frameId/events/hash）
- [x] snapshot/restore/hash 委托 state_manager

---

## T7：模块导出与验证

- [x] `src/core/simulation/index.ts` 已导出 Default* 实现类
- [x] hashWorld/serializeWorld/Encoder 已导出
- [x] `npx tsc --noEmit` 零错误
- [x] 实现类严格符合既有接口（无新增接口字段）
- [x] core/ 无 cc import
- [x] core/ 无 Math 调用（除 fixed.ts 白名单）

---

## 跨模块一致性

- [x] 实现类严格符合 interfaces.ts/index.ts 既有接口（不改接口）
- [x] 确定性约定延续（Fixed/PRNG/SortedMap 不改）
- [x] 数据模型 world_state.ts 不改
- [x] ESLint 规则不改（hash.ts 用 imul32 规避）
