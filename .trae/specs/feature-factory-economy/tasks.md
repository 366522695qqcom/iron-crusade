# Tasks（feature-factory-economy）

> B1 autoTrade（自动贸易）+ B2 applyTemplate（军厂产装）+ B3 装备/资源入池
> 回归红线：每步后 `npx tsc --noEmit`（零错）+ `npx vitest run`（全过）。

---

## T0：类型与常量准备

- [ ] **T0.1**：world_state.ts ProductionTaskType 联合添加 `'trade'`
- [ ] **T0.2**：types.ts GameEvent 联合添加：
  - `{ kind: 'productionCompleted'; countryId: string; equipmentType: string; count: number }`
  - `{ kind: 'tradeCompleted'; countryId: string; resourceType: ResourceType; amount: Fixed }`
- [ ] **T0.3**：factory_system.ts 添加模块级常量：
  - `TRADE_CYCLE_MS = Fixed.fromInt(60000)`
  - `TRADE_OUTPUT = Fixed.fromInt(50)`
  - `TRADE_MAX_FACTORIES = 2`
  - `TRADE_THRESHOLD = Fixed.TENTH.times(5)`（缺口阈值 = cap × 0.5）
  - 硬编码装备模板表 `EQUIPMENT_TEMPLATES: Record<string, { cycleMs: Fixed; output: number }>` = { infantry_equipment: {30000, 10}, artillery: {60000, 2}, light_tank: {90000, 1} }
- [ ] **T0.4**：运行 `npx tsc --noEmit` 确认无类型错误（新 event kind 可能需要 default 分支处理）

---

## T1：produceTick 支持 trade/production 入池

- [ ] **T1.1**：在 produceTick 开头 task 存在判断之后，根据 task.type 分派：
  - type='construction'：本方法不处理（由 building_system 处理，这里 return 或 noop）
  - type='trade'：用 TRADE_CYCLE_MS 作为分母；progress≥ONE 时调用 completeTrade
  - type='production'：从 EQUIPMENT_TEMPLATES[task.target] 取参数（默认 {60000, 1}）；progress≥ONE 时调用 completeProduction
- [ ] **T1.2**：实现 private completeTrade(state, countryId, task)：
  - stockpile = state.stockpiles.get(countryId)，无则 return
  - resType = task.target（ResourceType）
  - current = getRes(stockpile, resType)
  - cap = getCap(reserveCap(state, countryId), resType)
  - next = current.add(TRADE_OUTPUT).min(cap)
  - setRes(stockpile, resType, next)
  - task.progress = Fixed.ZERO
  - task.efficiency = task.efficiency.add(Fixed.TENTH).min(Fixed.ONE)
  - 返回 `{ kind: 'tradeCompleted', countryId, resourceType: resType, amount: TRADE_OUTPUT }`
- [ ] **T1.3**：实现 private completeProduction(state, countryId, task)：
  - pool = state.equipmentPools.get(countryId)，无则 return
  - tpl = EQUIPMENT_TEMPLATES[task.target] ?? { cycleMs: FIXED_60000, output: 1 }
  - stock = pool.stocks.find(s => s.type === task.target)；无则 push 新项
  - stock.count += tpl.output
  - task.progress = Fixed.ZERO
  - task.efficiency = task.efficiency.add(Fixed.TENTH).min(Fixed.ONE)
  - 返回 `{ kind: 'productionCompleted', countryId, equipmentType: task.target, count: tpl.output }`
- [ ] **T1.4**：produceTick 返回 `GameEvent[]`（原返回 void）
  - 收集 completeTrade/completeProduction 返回的事件
- [ ] **T1.5**：更新 interfaces.ts FactorySystem 接口 produceTick 返回 `GameEvent[]`
- [ ] **T1.6**：simulation.tick 主循环接收 factory_events 并 push 到 events 数组
- [ ] **T1.7**：运行回归

---

## T2：B1 autoTrade 实现

- [ ] **T2.1**：实现 DefaultFactorySystem.autoTrade(state, countryId)：
  1. 取 stockpile，无则 return
  2. caps = reserveCap(state, countryId)
  3. 遍历 steel/oil/tungsten/rubber/aluminum，计算缺口 = getCap(caps, type).mul(TRADE_THRESHOLD).sub(getRes(stockpile, type))
  4. 找缺口最大且 >0 的资源类型；若都 ≤0 则 return
  5. 收集该国空闲民厂：state.factories.forEach → type='civilian' && state='idle' && province.controllerId===countryId
  6. 已有 trade task 时：读取 task.assignedFactoryIds.length，只补充到 TRADE_MAX_FACTORIES
  7. 无 trade task 时：state.productionTasks.set(countryId + '_trade', { id: 'trade', type: 'trade', target: resType, assignedFactoryIds: [], priority: 99, progress: Fixed.ZERO, efficiency: Fixed.fromFloat(0.5) })——或用 countryId 作为 key 但避免与已有 construction task 冲突
  - 注意：productionTasks 当前以 countryId 为 key 存单个 task。需改为支持多 task：或用 `countryId + '_trade'` 作 key
- [ ] **T2.2**：修正 productionTasks 遍历方式
  - 当前 simulation.tick 和 produceTick 用 `state.productionTasks.get(countryId)` 取单任务
  - 需要改为支持多任务：或保留单任务（建造），trade 作为独立字段
  - **更简洁方案**：不改 productionTasks 结构，在 stockpile 或独立字段维护 trade 进度
  - 添加 FactorySystem 内部 `tradeTasks: Map<string, { resourceType: ResourceType; progress: Fixed; efficiency: Fixed; factoryIds: number[] }>`
  - produceTick 同时处理 productionTasks（建造/军产）和 tradeTasks
  - 这样 productionTasks 保持单任务/国家不变（主建造队列）
- [ ] **T2.3**：重新设计：把 trade 作为 ProductionTask，id 固定为 'trade_\<countryId\>'、key = 'trade_\<countryId\>'，produceTick 遍历 productionTasks 所有条目（forEach）处理，不再只 get(countryId)
  - simulation.tick 中 factorySystem.produceTick 改为遍历所有国家/所有生产任务：或在 factorySystem 内做遍历
  - 最简：produceTick 不再接收 countryId 参数，内部遍历所有 productionTasks（类似其他 system 的模式？看 resourceSystem/ buildingSystem 接收 countryId）
  - **M1 最简**：保持 produceTick(countryId, dtMs) 签名，方法内同时处理主 productionTask 和 该国家的 trade task（通过 key = countryId + '_trade' 获取）
- [ ] **T2.4**：autoTrade 最终实现：
  - 取 tradeKey = `trade_${countryId}`
  - tradeTask = state.productionTasks.get(tradeKey) as ProductionTask | undefined
  - 若 tradeTask 不存在或 resourceType 已不是最缺，重建 task（调整 target 为最缺资源）
  - 为 tradeTask 补充 idle 民厂到 TRADE_MAX_FACTORIES
  - 更新这些 factory.taskId = tradeKey、factory.state = 'working'、factory.idleSinceTick = -1
- [ ] **T2.5**：把 autoTrade 的返回值（或 produceTick 的 trade task 处理）整合到 simulation tick
- [ ] **T2.6**：assistant.autoScheduleSupply 方法调用 factorySystem.autoTrade(state, countryId)
- [ ] **T2.7**：运行回归

---

## T3：B2 applyTemplate 完整实现

- [ ] **T3.1**：applyTemplate 改为创建/更新 production task：
  - taskKey = `tpl_${templateId}_${countryId}`（或每个军厂独立 task？）
  - **M1 最简**：每国每 template 一个 task，taskKey = `tpl_${templateId}`
  - task = state.productionTasks.get(taskKey)
  - 不存在则创建：{ id: taskKey, type: 'production', target: templateId 对应 equipmentType（infantry_equipment/artillery/light_tank）, assignedFactoryIds: [], priority: 10, progress: 0, efficiency: 0.5 }
  - 把 factoryIds 中军厂加入 task.assignedFactoryIds，设置 factory.state='working', taskId=taskKey, idleSinceTick=-1
- [ ] **T3.2**：produceTick 需要遍历该国所有 production tasks，而不仅仅是 countryId 对应的主建造 task
  - 重构：新增内部方法 `advanceProductionTask(state, task, dtMs, countryId): GameEvent[]`
  - produceTick 中：
    1. 处理主 construction task（原逻辑，但 type='construction' 由 building_system 处理，这里跳过）
    2. 遍历 state.productionTasks 中以 `tpl_` 或 `trade_` 开头、且属于 countryId 的 task → advanceProductionTask
  - 或更简单：produceTick 遍历 productionTasks.forEach，按 task.id 前缀/字段判断所属国家
  - **最简方案**：ProductionTask 增加 countryId 字段（task.countryId = countryId），produceTick 遍历 forEach，按 countryId 过滤
- [ ] **T3.3**：world_state.ts ProductionTask 增加 `countryId: string` 字段
- [ ] **T3.4**：所有创建 ProductionTask 的地方（enqueueConstruction、applyTemplate、autoTrade）都填 countryId
- [ ] **T3.5**：produceTick 改为不带 countryId 参数？保持签名但内部遍历所有任务——不，保持签名 `produceTick(state, countryId, dtMs)` 但内部用 countryId 过滤：
  - state.productionTasks.forEach(task => { if (task.countryId !== countryId) return; ...advance... })
- [ ] **T3.6**：更新 interfaces.ts 保持签名不变
- [ ] **T3.7**：simulation.tick 主循环中 factorySystem.produceTick 调用保持不变
- [ ] **T3.8**：运行回归

---

## T4：B3 默认装备池与贸易 task 初始化

- [ ] **T4.1**：在玩家国家创建后（classic.ts / quick_battle.ts 初始 state 构造处），确保 equipmentPools 初始包含三类装备 count=0
  - 或在 DefaultSimulation 构造 / applyAction startGame 时懒初始化
- [ ] **T4.2**：simulation.ts 创建新国家时（如果有），初始化 equipmentPools
- [ ] **T4.3**：state_manager.ts cloneEquipmentPool 确保 stocks 数组深拷贝
- [ ] **T4.4**：hash.ts 序列化 equipmentPools 已覆盖 stocks 数组，验证序列化正确
- [ ] **T4.5**：运行 hash 测试确认新增字段不破坏现有哈希值（ProductionTask.countryId 是新增字段，hash 必须包含！）

---

## T5：新增测试

- [ ] **T5.1**：factory_system.test.ts（新建）：
  - test autoTrade 在资源不足时分配民厂
  - test autoTrade 在资源充足时不分配
  - test produceTick trade task 60s 后资源增加 50
  - test applyTemplate 创建 production task
  - test produceTick production task 完成后装备池 +output
  - test 多工厂生产进度更快
- [ ] **T5.2**：simulation.test.ts 扩展：
  - 200 帧运行后 equipmentPools 有非零 count（军产有产出）
  - 贸易周期后 stockpile 资源增加
  - 两实例一致性（trade + production 哈希一致）
- [ ] **T5.3**：运行全部测试通过

---

## T6：最终验证

- [ ] **T6.1**：`npx tsc --noEmit` 零错
- [ ] **T6.2**：`npx vitest run` 全过（含新增测试）
- [ ] **T6.3**：助理面板"调度补给"统计不再恒为 0
- [ ] **T6.4**：建造队列进度不受贸易/军产影响
- [ ] **T6.5**：快速对战 smoke：运行 500 tick 无异常，资源/装备值正常
