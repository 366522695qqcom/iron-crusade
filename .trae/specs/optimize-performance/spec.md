# 性能优化 Spec（optimize-performance）

> 依赖：`optimize-for-launch` T.2.2 已落地确定性测试套件（39 用例），本 spec 所有优化必须保持 `npx vitest run` 全绿 + `npx tsc --noEmit` 零错误。
>
> 影响代码：`src/core/determinism/`、`src/core/simulation/`、`src/core/state/`、`src/render/core/`、`src/render/ui/`、`src/render/map/`、`src/game/game_runner.ts`

## 1. 背景与问题

PROJECT.md 7.3 性能 KPI：**目标 FPS ≥50，运行时内存 <150MB（中端安卓机红线）**。

**第三轮深度代码扫描**（ai/assistant_behavior_tree + game_runner + hash.ts + sorted_map + shadow_reader 全量）在原 20 个热点基础上新增 **11 个遗漏热点**，核心发现：

1. **AssistantBehaviorTree 每 tick 被调用 3 次**：DefaultAssistantSystem 的 autoAssignFactories/autoScheduleSupply/autoDefendFront 各调用一次 tree.tick()，每次 tick 遍历 factories + divisions + provinces + disputes 共 4 次全表扫描，合计每 tick 12 次 SortedMap 遍历
2. **decideDefense 中 disputes.indexOf(countryId)**：O(n) 线性查找，国家数多时开销叠加
3. **autoAssignFactories 中 queue.items.find() 重复查找**：decideFactory 已遍历 items 找到 topItem，但 autoAssignFactories 又用 itemId 做 O(n) find
4. **autoAssignFactories 中 assignedFactoryIds.indexOf(factoryId)**：O(n) 重复检查工厂是否已分配
5. **readFactoryPanel 遍历所有国家工厂**：注释写"简化：所有工厂都属当前国家"，但实际遍历了全地图所有工厂（含 AI 国家），应按省份归属过滤
6. **simulation.tick 空闲工厂事件重复遍历 factories**：第 197-207 行再次全表扫描找 firstIdleFactoryId，与 factorySystem.scanIdle 重复
7. **cloneSortedMap 批量构造低效**：forEach+set 每插入一个 key 都 push+置 dirty，批量插入 N 个元素触发 N 次 dirty 标记
8. **pendingActions 数组在 while 循环中重复清空**：可以在循环外复用，避免每 tick 重建
9. **Encoder.string 每字符串都做 unescape+encodeURIComponent**：短字符串（如 ID、类型枚举）的 UTF-8 转换开销可缓存
10. **eventToAction 假转换**：game_runner 中 eventToAction 总是返回 {kind: 'setSpeed'}，是错误的占位实现，应直接传递事件类型
11. **decideFactory 中 idleFactoryIds.slice()**：O(n) 数组拷贝，实际只需前 N 个元素，可用索引直接截取

前两轮已发现的 20 个热点（含未落地的规划项）：
- simulation.tick() 主循环对 countries 做 6 次独立 forEach（P1.4 规划但**未落地**）
- reserveCap 每 tick 每个国家全表扫描 buildings（P1.5 规划但未落地）
- state_manager.snapshot 对所有 Fixed 字段 new Fixed(raw) 深拷贝（P1.6 规划但**未落地**）
- hash.ts Encoder 仍用 number[] push（P3.1 规划但**未落地**）
- SortedMap.forEach 仍做 Map.get 二次查找（P2.3 规划但**未落地**）
- shadow_reader.readCombatPanelShadow 每帧遍历所有 provinces（P2.6 规划但未落地）
- focus_system 用 indexOf 做 O(n) 前置检查（P2.7 规划但未落地）
- research_system 每 tick findIndex 找当前节点（P2.8 规划但未落地）
- building_system.cancel/assignFactories 全局遍历所有国家队列（P2.10 规划但未落地）
- computeSteelCost/computeTimeCost 每次 Fixed.fromInt(常量)（P1.7 规划但未落地）
- stockpile.history.shift() 是 O(n)（P3.4 规划但降级为 P4）
- 暂停态（speed===0）仍每帧 pushShadows()（P1.3 规划但**未落地**）

在 speed=5 × 5 国家 × 中等存档规模下，单 tick Fixed 对象分配约 800-1500 个 + 每帧 10+ 次全表扫描 + 每帧全量 Graphics 重绘 + 每 16 帧序列化卡顿，中端机无法稳定 50 FPS。

## 2. 优化目标

| 指标 | 当前估算 | 目标 | 验证方式 |
|------|---------|------|----------|
| 单 tick Fixed 对象分配 | 800-1500 | ≤100 | P1.1+P1.4+P1.7+P1.8 常量提升+遍历合并 |
| countries 遍历次数/帧 | 6 次独立 forEach | 1 次合并 | P1.4 |
| reserveCap 全表扫描 | 每 tick 每国家 | 0（缓存失效） | P1.5 |
| snapshot Fixed 深拷贝 | 50+ new Fixed/次 | 0（引用复用） | P1.6 |
| 每帧 Graphics draw 调用 | 全量重绘 | 仅脏项重绘 | P2.1 |
| hashWorld 序列化耗时 | 5-20ms/16帧 | ≤2ms/16帧 | P3.1 |
| SortedMap.forEach 成本 | O(2n) | O(n) | P2.3 |
| 每帧 shadow 对象分配 | 30+ 对象 | 0（对象池） | P3.2 |
| combat 省份统计 | 每帧全表扫描 provinces | O(1) 缓存 | P2.6 |
| focus 前置检查 | O(n) indexOf | O(1) Set | P2.7 |
| research nodeIndex 查找 | 每 tick O(n) findIndex | O(1) 缓存 | P2.8 |
| 暂停态 shadow 重建 | 每帧 | 0 | P1.3 |
| history.shift() | O(n) | O(1) 环形缓冲 | P3.4 |
| Assistant 行为树执行 | 3 次/帧 | 1 次/帧 | P1.9 |
| readFactoryPanel 工厂遍历 | 所有工厂 | 仅玩家国家工厂 | P1.10 |
| disputes.indexOf 检查 | O(n) | O(1) Set | P2.12 |

**硬约束**：所有优化不得改变确定性计算结果。`simulation.test.ts` 的"两独立实例同输入每帧 hash 相等"用例是回归红线。

## 3. 优化范围（按影响×成本排序，分 4 批）

### P1 第一批：高影响低成本（立即可做）

**P1.1 Fixed 常量提升** — 消除热路径上 `Fixed.fromInt(常量)` 的重复分配
- 影响：单 tick 消除几十到上百次 `new Fixed`
- 文件：`simulation.ts`、`resource_system.ts`、`building_system.ts`、`factory_system.ts`、`focus_system.ts`、`research_system.ts`
- 做法：把 `Fixed.fromInt(100)`、`Fixed.fromInt(1000)`、`Fixed.fromInt(60000)`、`Fixed.fromInt(864)`、`Fixed.fromInt(10)`、`Fixed.fromInt(2)` 等提升为模块级常量

**P1.2 渲染层静态资源跳过重绘** — 消除"永不变化"的 Graphics 每帧重绘
- 影响：删除静态图标（资源图标颜色、卡牌背景）每帧重绘
- 文件：`top_bar.ts`、`factory_panel.ts`、`combat_panel.ts`
- 做法：mount 时绘制的静态元素在 update 路径上不再调用 drawXxx

**P1.3 暂停态跳过 shadow 重建** — 消除暂停时无意义的 shadow 构造
- 影响：暂停时每帧省 30+ 对象分配 + 所有面板 update 调用
- 文件：`game_runner.ts`
- 做法：`speed===0` 时跳过 `pushShadows()`，仅在用户操作时手动触发一次 `refreshShadows()`

**P1.4 合并 countries 六次遍历为单次** — 消除主循环 5 次重复 SortedMap 遍历
- 影响：单 tick 减少 5 次 countries.forEach 调用 + 5 次 ensureSorted 开销
- 文件：`simulation.ts`
- 做法：tick() 中把 resourceSystem.yieldTick / buildingSystem.advanceTick / factorySystem.produceTick / focusSystem.advanceTick / researchSystem.advanceTick / 政治点产出 六个 forEach 合并为一个 countries.forEach，回调内串行调用

**P1.5 reserveCap 仓储加成缓存** — 消除每 tick 每国家全表扫描 buildings
- 影响：单 tick 减少 N_countries 次 buildings.forEach + provinces.get 查找
- 文件：`resource_system.ts`、`building_system.ts`、`simulation.ts`
- 做法：在 ResourceSystem 维护 `private storageBonusCache: Map<string, Caps>`，只在 type='storage' 建筑 state 变为 'active' 或建筑被移除时 invalidate；reserveCap 直接读缓存
- 失效时机：building_system.advanceTick 中 building 入库时若 type='storage' 触发缓存失效；取消建造不影响（cancel 只移除队列项）

**P1.6 snapshot Fixed 引用复用** — 消除快照中不必要的 Fixed 深拷贝
- 影响：每次 snapshot 减少 50+ 次 `new Fixed(raw)` 分配（Fixed 是不可变类）
- 文件：`state_manager.ts`
- 做法：所有 `new Fixed(f.raw)` 改为直接引用 `f`（Fixed 不可变，共享引用安全）；仅可变字段（数组 slice、对象浅拷贝）保留深拷贝
- 例外：tickElapsed 是随 tick 推进的可变 Fixed？不，Fixed.add/sub/mul/div 都返回新实例，原对象不变，所以所有 Fixed 都可以直接引用

**P1.7 建筑成本常量表** — computeSteelCost/computeTimeCost 预计算
- 影响：enqueue/validate 每次调用消除 8 个 switch Fixed.fromInt
- 文件：`building_system.ts`
- 做法：模块级 `const STEEL_COST: Record<BuildingType, Fixed>` 和 `const TIME_COST: Record<BuildingType, Fixed>` 预计算，computeSteelCost/computeTimeCost 直接查表返回

**P1.8 统一用 Fixed.ONE 替代 Fixed.fromInt(1)** — 消除完成判定重复分配
- 影响：focus_system.advanceTick、research_system.advanceTick 每 tick 减少 Fixed.fromInt(1) 分配
- 文件：`focus_system.ts`、`research_system.ts`、其他有 `Fixed.fromInt(1)` 的位置
- 做法：Fixed.ONE 已经是 `static readonly ONE: Fixed = new Fixed(65536)`，是 Fixed 实例而非 number；删除错误注释，统一改用 Fixed.ONE

**P1.9 Assistant 行为树单次 tick 复用决策** — 消除每 tick 3 次行为树执行
- 影响：开启助理时每 tick 减少 2 次 tree.tick()（共减少 8 次全表 SortedMap 遍历）
- 文件：`assistant.ts`、`assistant_behavior_tree.ts`
- 做法：
  - DefaultAssistantSystem 新增 `tickIfNeeded(state, countryId)` 方法，内部缓存本 tick 已执行标记；autoAssignFactories/autoScheduleSupply/autoDefendFront 改为取决策而非重新 tick
  - 或更简单：在 game_runner 中每 tick 只调用一次 assistant.tickAndDecide() 得到全部三类决策，然后分别应用
  - decideFactory 返回 topItem 引用（或 item 索引）而非仅 taskId，避免 autoAssignFactories 再次 find
  - 消除 idleFactoryIds.slice() 拷贝，直接用长度截取
  - 消除 assignedFactoryIds.indexOf(factoryId) 检查，决策阶段已确认空闲，无需二次验证

**P1.10 readFactoryPanel 按国家过滤工厂** — 消除遍历 AI 国家工厂
- 影响：readFactoryPanel 从遍历全地图工厂降为只遍历玩家主权省份上的工厂
- 文件：`shadow_reader.ts`
- 做法：readFactoryPanel 中先收集 playerCountry 的 ownedProvinceIds（或 controlledProvinceIds），遍历 factories 时检查 factory.provinceId 是否在玩家省份集合中；用 Set<number> 做 O(1) 省份归属判定
- 注意：需通过 province.ownerId 判定工厂归属（国家主权），而非 controllerId（管控权）

### P2 第二批：高影响中成本（缓存+索引）

**P2.1 Graphics 脏标记** — 跳过未变化的 drawXxx
- 影响：每帧 draw 调用从全量降到仅变化项
- 文件：所有 panels 的 Graphics 组件
- 做法：每个 handle 缓存 `lastRatio`/`lastColor`/`lastAccent`，update 时比对，仅变化时调 drawXxx

**P2.2 Label 字符串缓存** — 跳过未变化的 `label.string =` 赋值
- 影响：减少 Label 内部重排 + 减少模板字符串拼接
- 文件：同 P2.1
- 做法：handle 缓存 `lastString`，比对后仅变化时赋值

**P2.3 SortedMap values 平行数组** — 消除 forEach 内 Map.get 二次查找
- 影响：simulation 单 tick 内 10+ 次 forEach 成本减半
- 文件：`sorted_map.ts`
- 做法：维护 `values: V[]` 与 `keys` 平行，set/delete 置 dirty，ensureSorted 时重建 values，forEach 改为索引遍历

**P2.4 合并重复工厂扫描** — 消除 game_runner + shadow_reader 的二次 forEach
- 影响：每帧少一次 factories 全表扫描
- 文件：`game_runner.ts`、`shadow_reader.ts`
- 做法：`buildAssistantShadow` 复用 `readFactoryPanel` 已计算的 idleCount/longestIdleTicks

**P2.5 resourceNodes 反向索引** — 消除 yieldTick 全局遍历 resourceNodes
- 影响：yieldTick 从遍历所有 resourceNodes 降为只遍历该国管控的节点
- 文件：`resource_system.ts`（或 world_state.ts 加索引字段）
- 做法：维护 `private countryNodeIndex: Map<string, number[]>`（countryId→resourceNodeId[]），province.controllerId 变更或 mineBuildingLevel 变化时更新索引；yieldTick 直接遍历索引内节点
- 注意：省份 controllerId 变更涉及 dispute 系统（C 级联机），M1 阶段可简化为只在 building 入库/资源节点 occupied 变更时重建索引

**P2.6 省份管控数缓存** — 消除 readCombatPanelShadow 全表扫描
- 影响：每帧少一次 provinces.forEach
- 文件：`shadow_reader.ts`、`simulation.ts`（或 WorldState 增缓存字段）
- 做法：在 WorldState 上增 `countryControlledProvinceCount: Map<string, number>`，省份 controllerId 变更时更新；readCombatPanelShadow 直接读缓存
- M1 简化：因暂无省份易主逻辑，首次计算后缓存即可，不需实时更新

**P2.7 focus completedFocusIds 用 Set** — 消除 indexOf O(n) 查找
- 影响：refreshCandidates 前置检查从 O(n²) 降为 O(n)
- 文件：`focus_system.ts`、`world_state.ts`（FocusTreeState 类型）
- 做法：FocusTreeState 增 `completedFocusSet: Set<string>` 与 completedFocusIds 同步维护；refreshCandidates 用 set.has() 替代 indexOf
- 注意：snapshot 需深拷贝 Set（new Set(completedFocusSet)），hash 序列化仍用数组保证确定性

**P2.8 research currentNodeIndex 缓存 + bonus 累加缓存** — 消除每 tick findIndex 和 getBonus 双重循环
- 影响：advanceTick 不再每 tick findIndex；getBonus 从 O(线×节点) 降为 O(1)
- 文件：`research_system.ts`
- 做法：
  - ResearchLineState 增 `currentNodeIndex: number` 字段，advanceTick 完成时自增而非 findIndex
  - 维护 `private bonusCache: Map<string, Map<string, Fixed>>`（countryId→bonusType→累计值），节点完成时 add 对应 bonus；getBonus 直接查缓存返回

**P2.9 消除 prevMaxBuildingId 全表扫描** — 用 nextEntityId 推断
- 影响：tick() 推进前后各少一次 buildings.forEach
- 文件：`simulation.ts`
- 做法：推进前记录 `const prevNextId = state.nextEntityId`，推进后新增建筑 id 必然 >= prevNextId，扫描时只遍历 id >= prevNextId 的建筑（或直接用事件机制由 buildingSystem 返回完成事件）
- 更优方案：让 buildingSystem.advanceTick 直接返回本 tick 完成的 buildingId 列表，events 在子系统内产生，不需要 simulation 层扫描

**P2.10 队列操作不再全局遍历** — cancel/assignFactories 直接定位玩家队列
- 影响：cancel/assignFactories/reorderConstruction 从遍历所有国家队列降为直接取玩家队列
- 文件：`building_system.ts`、`simulation.ts`
- 做法：cancel(state, itemId, countryId?) 增加 countryId 参数；Simulation.applyAction 传入 this.playerCountryId；assignFactories 同理
- 对于 enqueue，已知 countryId 直接取/建队列，已经是 O(1)

**P2.11 advanceTick 原地删除完成项** — 替代 filter 新建数组
- 影响：每 tick 消除 queue.items.filter 产生的新数组
- 文件：`building_system.ts`
- 做法：遍历时收集完成项索引到 `completed: number[]`，遍历完后倒序 splice 删除

**P2.12 Dispute participants 用 Set 加速存在性检查** — 消除 decideDefense 中 indexOf O(n)
- 影响：decideDefense 中 disputes.forEach 内的 indexOf 从 O(n) 降为 O(1)
- 文件：`world_state.ts`、`assistant_behavior_tree.ts`、`state_manager.ts`、`hash.ts`
- 做法：Dispute 接口增 `participantSet: Set<string>` 与 participants 数组同步维护；assistant_behavior_tree.decideDefense 用 set.has(countryId) 替代 indexOf
- 注意：snapshot 需深拷贝 Set（new Set(d.participantSet)）；hash 序列化仍用 participants 数组保证确定性顺序

**P2.13 simulation.tick 空闲工厂事件复用 scanIdle 结果** — 消除二次 factories 遍历
- 影响：tick() 中找 firstIdleFactoryId 不再二次遍历 factories
- 文件：`simulation.ts`、`factory_system.ts`
- 做法：让 factorySystem.scanIdle 返回 `{ level, idleFactoryCount, longestIdleTicks, firstIdleFactoryId }`；simulation.tick 直接使用返回的 firstIdleFactoryId，删除 197-207 行的二次遍历代码

### P3 第三批：中影响中成本（序列化+对象池+环形缓冲）

**P3.1 hashWorld Encoder 重写为 Uint8Array** — 消除 number[] push + 最终拷贝
- 影响：每 16 帧序列化耗时从 5-20ms 降到 ≤2ms
- 文件：`hash.ts`
- 做法：`buf: Uint8Array`（初始 4KB，满了翻倍扩容）+ 手动 `offset` 写入 + `bytes()` 返回 subarray 视图；string 改用 TextEncoder.encodeInto（需验证 UTF-8 字节与 unescape(encodeURIComponent) 一致）

**P3.2 shadow 对象池** — 消除每帧 shadow 对象分配
- 影响：每帧 shadow 分配从 30+ 降到 0
- 文件：`shadow_reader.ts`
- 做法：持有可复用的 `MainUiShadow` 实例，每帧更新字段值而非 new 新对象

**P3.3 daily/session view 脏标记缓存** — 消除每帧 view 重建
- 影响：每帧少 N 个 view 对象 + 字符串拼接
- 文件：`game_runner.ts`
- 做法：缓存上次的 view 数组 + 脏标记，仅任务/目标进度变化时重建

**P3.4 stockpile.history 环形缓冲区** — history.shift() O(n)→O(1)
- 影响：消除每 tick history.shift() 数组搬移
- 文件：`resource_system.ts`、`world_state.ts`（ResourceStockpile 类型）
- 做法：history 改为固定长度 70 的数组 + head 指针；push 时写到 head 位置，head = (head+1) % HISTORY_LIMIT；读取时按 (head+i) % HISTORY_LIMIT 顺序遍历；序列化按逻辑顺序展开
- 简化方案：用 pop+unshift 不对，还是 shift 问题；真正 O(1) 方案是环形缓冲。但因 HISTORY_LIMIT=70 很小，O(n) shift 影响有限，可降级为"仅当长度超限才 shift"（已经是了），优先级低于 P3.1-P3.3

**P3.5 factory activeFactoryCount 增量维护** — produceTick 不再遍历 assignedFactoryIds
- 影响：produceTick 消除每 tick 对 assignedFactoryIds 的遍历统计
- 文件：`factory_system.ts`
- 做法：ProductionTask 增 `activeFactoryCount: number` 字段，assignTask/unassign 时根据 factory.state 增减；produceTick 直接使用
- M1 阶段因 assignedFactoryIds 通常很短（<10），收益有限

**P3.6 cloneSortedMap 批量构造优化** — 消除批量 set 时的 dirty 抖动
- 影响：snapshot 时 14 个 SortedMap 批量 clone 减少 dirty 标记和 ensureSorted 调用
- 文件：`sorted_map.ts`、`state_manager.ts`
- 做法：为 SortedMap 添加 `bulkSet(entries: [K, V][])` 方法，一次性写入 keys/values/store 并排序；或添加构造函数接受预排序的 entries 数组；cloneSortedMap 改用批量构造
- 简化方案：在 cloneSortedMap 中，先收集所有 entries，排序后直接赋值 keys/values/store，不走 set 方法

**P3.7 pendingActions 数组复用** — 消除每 tick 数组重建
- 影响：每 tick 消除 pendingActions 数组分配（虽然是空数组）
- 文件：`game_runner.ts`
- 做法：把 pendingActions 提升为类字段，在 while 循环开始前 length=0 清空而非新建

### P4 第四批：低影响低成本（按需收尾）

**P4.1 beijingDateKey 秒级缓存** — 消除每帧 new Date + 字符串拼接
- 文件：`game_runner.ts`
- 做法：缓存上次 Date.now() 整秒值，500ms 内不重算

**P4.2 applyAction 反向索引** — itemId O(n) 队列查找降为 O(1)
- 文件：`building_system.ts`、`simulation.ts`
- 做法：维护 `Map<itemId, {countryId, queueRef, itemRef}>`，enqueue 时建立

**P4.3 getPlayerCountryId 缓存** — 消除 forEach countries
- 影响：GameRunner 构造函数调用一次，结果终身不变
- 文件：`shadow_reader.ts` 或 `game_runner.ts`
- 做法：首次查找后缓存到变量，不再调用 getPlayerCountryId（GameRunner 已经在构造时做了，但 shadow_reader.getPlayerCountryId 仍可被其他地方调用）

**P4.4 oneClickBalance includes 改 Set** — 消除 O(n) includes
- 影响：oneClickBalance 中 `targetItem.assignedFactoryIds.includes(id)` 是 O(n)
- 文件：`factory_system.ts`
- 做法：维护 assignedFactorySet 与数组同步，或直接用 Set 存储

**P4.5 Encoder.string 短字符串缓存** — 消除重复 UTF-8 转换
- 影响：hashWorld 序列化时，类型枚举字符串（'civilian'/'military'/'working' 等）被反复编码
- 文件：`hash.ts`
- 做法：模块级 `const STRING_CACHE = new Map<string, { bytes: Uint8Array; length: number }>()`，首次编码后缓存字节；或更简单地预编码所有枚举值

**P4.6 eventToAction 修正** — 消除无意义的假转换
- 影响：game_runner 中 eventToAction 总是返回 setSpeed 占位，sessionTracker.updateProgress 收到错误数据；虽然当前是最小实现，但应直接传事件 kind
- 文件：`game_runner.ts`
- 做法：修改 SessionGoalTracker.updateProgress 签名接受 GameEvent 或 event.kind 字符串，不再构造假 PlayerAction

**P4.7 formatReward/formatSessionReward 字符串模板缓存** — 消除每帧重复字符串拼接
- 影响：buildDailyTaskViews/buildSessionGoalViews 每帧都做数组 join
- 文件：`game_runner.ts`
- 做法：在奖励领取前摘要字符串不变，可缓存到 DailyTask/SessionGoal 对象上，或在 build 方法中做脏标记

## 4. 非目标（本 spec 不做）

- Fixed in-place 变种（架构级改动，风险高，留待联机阶段）
- 增量哈希（需侵入式包装 SortedMap，风险高）
- 纹理资源优化（本仓库 UI 全代码绘制，无纹理）
- 包体优化（属 `optimize-for-launch` T.1 范围）
- WebWorker 离线程模拟（架构级改动，留待 C 级联机后评估）
- 地图渲染优化（map_view 目前是占位骨架，正式地图渲染优化在地图 spec 中处理）

## 5. 验收标准

每个优化批次完成后必须同时满足：
1. `npx tsc --noEmit` 退出码 0
2. `npx vitest run` 全过（确定性回归红线）
3. 该批次涉及的文件 grep 确认无残留旧模式：
   - P1.1+P1.8 完成后，tick 主循环内无 `Fixed.fromInt(纯数字常量)`，所有 `Fixed.fromInt(1)` 替换为 `Fixed.ONE`
   - P1.4 完成后，simulation.ts tick() 中只有一个 `state.countries.forEach`
   - P1.5 完成后，reserveCap 不再 forEach buildings
   - P1.9 完成后，DefaultAssistantSystem 中 tree.tick() 每帧只调用一次
   - P2.3 完成后，sorted_map.ts forEach 内无 `this.store.get`
   - P3.1 完成后，hash.ts Encoder 内无 `this.buf.push`
   - P1.6 完成后，state_manager.ts 无 `new Fixed(xxx.raw)` 模式
   - P1.10 完成后，readFactoryPanel 中有省份 Set 过滤逻辑

## 6. 与其他 spec 的关系

- **依赖** `optimize-for-launch` T.2.2：确定性测试套件是本 spec 的回归红线
- **不冲突** `optimize-for-launch` T.1（包体管控）：本 spec 只优化运行时性能，不改资源体积
- **为 C 级联机铺路**：P1.6 snapshot 引用复用 + P3.1 Encoder 重写后，联机快照序列化/反序列化同样大幅受益
- **P2.5/P2.6 省份级索引**：M1 阶段做简化版本，C 级联机 dispute 系统实现省份管控变更时再补全失效逻辑
