# Spec: 工厂经济系统补全（feature-factory-economy）

> 变更类型：功能补全（填补 M1 占位实现）
> 前置依赖：core-simulation / focus-research 已完成
> 目标：实现 B1 autoTrade（空闲民厂自动贸易）、B2 applyTemplate（完整军厂生产模板）、B3 装备入池，打通"民厂→建筑/资源→军厂→装备→师团"经济闭环

## Why

当前工厂系统存在三个 M1 占位：
1. `autoTrade()` 是空 noop，助理模式声明"自动调度补给"但实际不做任何事
2. `applyTemplate()` 只标记 factory.taskId，没有真正推进装备生产进度也没有产出装备
3. `produceTick()` 在 progress≥1 时只 clamp 到 ONE，没有把成品放入 equipmentPools，装备池永远为空

这导致：
- 玩家空闲民厂不会被助理自动调度，资源缺口无人填补
- 军厂生产看似在跑但永远无产出
- 师团招募/装备池面板没有数据，combat 系统无法启动
- 助理面板"调度补给"统计永远为 0

本 spec 填补这三个功能，不改变现有接口签名（只补全实现），打通工业生产闭环。

## What Changes

### B1: autoTrade 自动贸易（民厂→最缺资源）

**核心规则**：
- 触发时机：助理启用时由 assistant.tickAndApply 调用（已有 autoScheduleSupply 钩子，但内部调用 autoTrade）；或玩家手动点"自动贸易"按钮
- 资源缺口判定：对 steel/oil/tungsten/rubber/aluminum 五类资源，计算 `缺口 = cap(或某阈值) × 0.2 - current`，缺口最大者为目标资源
- 贸易代价：每启用一座空闲民厂做贸易，消耗 `TRADE_CONSUMPTION_MS = 60000ms`（60s）完成一次贸易，产出 `TRADE_RESOURCE_AMOUNT = Fixed.fromInt(50)` 单位目标资源
- 实现方式：复用现有 ProductionTask 机制？或独立 tradeTasks 列表？**推荐独立 tradeTasks 列表**（在 stockpile 或新结构上），避免与建造/军产混用 ProductionTask
- **简化方案（M1 实采用）**：不引入新状态，每次 autoTrade 直接取 N 座空闲民厂、立即产出资源、标记这些民厂为 trading 状态（用 factory.state='working' + factory.taskId='trade_<resource>' 复用现有机制）。60s 内这些民厂不被其他用途占用（和建造/军产同等优先级）。

**具体实现**：
- 在 factory_system.ts 添加：
  - `TRADE_BUILDUP_MS = 60000`（60s 完成一次贸易周期）
  - `TRADE_OUTPUT_AMOUNT = 50`（每次产 50 单位）
  - 模块级 `tradeProgress: Map<number, { resourceType: ResourceType; remainingMs: Fixed }>`（factoryId → 贸易进度）——或复用 ProductionTask 机制（id='trade', target=resourceType, progress=...）更简洁
- 推荐复用 ProductionTask：新增 type='trade' 的 ProductionTask（per-country per-resource），assignedFactoryIds 为参与贸易的民厂。produceTick 中已能处理 type='construction'/'production'，扩展支持 type='trade'：
  - 进度满时：给 stockpile 对应资源 +TRADE_OUTPUT_AMOUNT，progress 归零循环（贸易是持续行为）
- autoTrade 逻辑：
  1. 扫描 stockpile 找最缺资源（缺口 = cap × 0.5 - current，缺口最大且为正者）
  2. 收集该国空闲民厂（type='civilian' && state='idle'）
  3. 取最多 2 座分配到该资源的 trade 任务（与建造平衡，不占用所有民厂）
  4. 如果所有资源都 ≥50% cap，不启动贸易
- 助理的 autoScheduleSupply 方法改为调用 autoTrade（之前是空的？看 assistant 实现）

### B2: applyTemplate 完整生产线模板

**核心规则**：
- 模板定义：`configs/production_templates.json`（新配置文件），每个 template 有 `id/name/equipmentType/outputPerCycle/cycleTimeMs/requiredFactories`
- 军厂分配：applyTemplate(factoryIds, templateId) 将 factoryIds 中军厂的 taskId 设为 'tpl_\<templateId\>'
- produceTick 扩展：当 task.type='production' 且 task.target 是装备类型时，进度满后给 equipmentPools 对应装备类型 +1
- 生产效率：沿用现有 efficiency 字段（连续生产加成），实际产出时间 = cycleTimeMs / efficiency
- 多厂加成：N 座军厂生产同一模板，进度增量 = N × dtMs / cycleTimeMs × efficiency

**M1 简化**：不做配置文件，硬编码 3 个基础模板（light_tank / infantry_equipment / artillery），装备类型直接作为 task.target。模板参数：
- infantry_equipment：cycleTimeMs=30000，outputPerCycle=10
- artillery：cycleTimeMs=60000，outputPerCycle=2
- light_tank：cycleTimeMs=90000，outputPerCycle=1

applyTemplate 保持现有签名不变，produceTick 根据 task.target（装备类型 id）查硬编码参数。后续配置文件可平滑替换硬编码。

### B3: 装备入池

**核心规则**：
- produceTick 中 task.progress ≥ ONE 时：
  - 如果 task.type='production'（军厂）：equipmentPools 对应装备类型 count + outputPerCycle，发 `productionCompleted` 事件，progress 归零
  - 如果 task.type='trade'（民厂贸易）：stockpile 对应资源 +TRADE_OUTPUT_AMOUNT，发 `tradeCompleted` 事件，progress 归零
  - 如果 task.type='construction'（建造）：由 building_system.advanceTick 处理（不动）
- equipmentPools 初始化：每国默认有 infantry_equipment/artillery/light_tank 三类，count=0
- productionTasks 初始化：玩家国初始有一个 type='trade' task（无分配工厂，progress=0）用于贸易循环；军产任务在 applyTemplate 时创建

**事件扩展**：
- GameEvent 新增 `'productionCompleted' | 'tradeCompleted'` kind
- simulation.tick() 收集这些 events 加入 result.events

## Impact

- **Affected files**：
  - `src/core/simulation/factory_system.ts`（主要：autoTrade/applyTemplate 实现、produceTick 装备/贸易入池）
  - `src/core/simulation/simulation.ts`（collect events 增加 productionCompleted/tradeCompleted；初始化 equipmentPools/productionTasks 默认项）
  - `src/core/simulation/types.ts`（GameEvent 加新 kind）
  - `src/core/simulation/interfaces.ts`（FactorySystem 接口不变，但 autoTrade 行为从 noop 变为实际操作）
  - `src/core/simulation/assistant.ts`（autoScheduleSupply 调用 autoTrade）
  - `src/core/state/world_state.ts`（ProductionTaskType 加 'trade'）
  - `src/core/simulation/state_manager.ts`（clone 默认任务/装备池）
  - `src/core/state/hash.ts`（如改 WorldState 字段需更新序列化，但 ProductionTask/EquipmentPool 已在序列化范围内）
- **Interface changes**：
  - ProductionTaskType 联合类型增加 `'trade'`
  - GameEvent 联合增加 `{ kind: 'productionCompleted'; ... }` / `{ kind: 'tradeCompleted'; ... }`
  - FactorySystem 接口签名不变（autoTrade/applyTemplate 已有方法）
- **Determinism**：所有计算必须用 Fixed，PRNG 如有随机选择需用国家专属 PRNG（seedMap['trade_'+countryId]）；M1 简化用确定规则（最多 2 座、最缺资源），不引入随机
- **Tests**：factory_system 需新增测试：autoTrade 分配正确、produceTick 贸易入池、produceTick 装备入池

---

## Requirements

### Requirement: autoTrade 填补最缺资源

- **WHEN** 助理启用且存在资源缺口 >50% cap
- **THEN** 最多 2 座空闲民厂被分配到最缺资源的 trade 任务
- **AND** 60s 后对应资源增加 50 单位
- **AND** 所有资源 ≥50% cap 时不启动新贸易

### Requirement: applyTemplate 实际产装

- **WHEN** 军厂应用模板并满进度
- **THEN** equipmentPools 对应装备类型 count 增加 outputPerCycle
- **AND** 进度归零循环生产
- **AND** efficiency 随连续生产提升

### Requirement: 装备入池事件

- **WHEN** 生产周期完成
- **THEN** 发出 productionCompleted/tradeCompleted 事件
- **AND** 事件包含 countryId/target/outputCount

### Requirement: 确定性

- **WHEN** 两实例用相同 seed 和输入序列
- **THEN** 每帧 stockpile/equipmentPool 数值完全一致
- **AND** simulation.test.ts 联机一致性测试通过（需扩展测试覆盖新行为）

### Requirement: 不破坏现有建造/生产

- **WHEN** 民厂已被建造占用
- **THEN** autoTrade 不抢占
- **AND** 建造队列进度不受影响
- **AND** 现有 39 个测试全部通过
