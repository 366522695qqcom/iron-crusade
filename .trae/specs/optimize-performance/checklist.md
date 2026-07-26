# Checklist（optimize-performance）

> 共 31 个优化项（原 8 + 第二轮 12 + 第三轮 11），分 4 批执行。

## P1 第一批：高影响低成本

### P1.1 Fixed 常量提升
- [ ] simulation.ts: FIXED_100 / FIXED_864 / FIXED_1000 提升为模块级常量
- [ ] resource_system.ts: FIXED_1000 / FIXED_2 提升为模块级常量
- [ ] building_system.ts: FIXED_1000 提升为模块级常量
- [ ] factory_system.ts: FIXED_60000 / FIXED_10 提升为模块级常量
- [ ] focus_system.ts: FIXED_60000 提升为模块级常量
- [ ] research_system.ts: FIXED_BASE_RESEARCH_MS(90000) 提升为模块级常量
- [ ] grep 确认 tick 主循环内无纯数字 `Fixed.fromInt(常量)` 残留
- [ ] `npx tsc --noEmit` 零错误
- [ ] `npx vitest run` 全过

### P1.2 渲染层静态资源跳过重绘
- [ ] top_bar.ts: 删除 updateResourceBar 中的静态 drawResourceIcon 调用
- [ ] graphics_util.ts: 添加 colorEquals 工具函数
- [ ] factory_panel.ts / combat_panel.ts: drawCard 加 accent 脏标记
- [ ] `npx tsc --noEmit` 零错误
- [ ] `npx vitest run` 全过

### P1.3 暂停态跳过 shadow 重建
- [ ] game_runner.ts: speed===0 分支直接 return（跳过 pushShadows）
- [ ] game_runner.ts: 添加 refreshShadows() 公开方法
- [ ] game_runner.ts: setSpeed/用户操作回调中调用 refreshShadows
- [ ] `npx tsc --noEmit` 零错误
- [ ] `npx vitest run` 全过

### P1.4 合并 countries 六次遍历为单次
- [ ] simulation.ts: tick() 中 6 个独立 countries.forEach 合并为 1 个
- [ ] 合并回调内串行调用 resourceSystem.yieldTick → buildingSystem.advanceTick → factorySystem.produceTick → focusSystem.advanceTick → researchSystem.advanceTick → 政治点产出
- [ ] `npx tsc --noEmit` 零错误
- [ ] `npx vitest run` 确定性测试全过（关键！合并遍历不得改变计算结果）
- [ ] grep 确认 simulation.ts tick() 中只有 1 个 `state.countries.forEach`

### P1.5 reserveCap 仓储加成缓存
- [ ] resource_system.ts: 添加 storageBonusCache: Map<string, Fixed>
- [ ] resource_system.ts: reserveCap 改为查缓存，computeStorageBonus 延迟计算并缓存
- [ ] resource_system.ts: 添加 invalidateStorageCache(countryId?) 方法
- [ ] simulation.ts: 建筑完成后触发缓存失效
- [ ] `npx tsc --noEmit` 零错误
- [ ] `npx vitest run` 全过

### P1.6 snapshot Fixed 引用复用
- [ ] state_manager.ts: 所有 cloneXxx 函数中 `new Fixed(xxx.raw)` 替换为直接引用 `xxx`
- [ ] grep 确认 state_manager.ts 无 `new Fixed` 残留
- [ ] `npx tsc --noEmit` 零错误
- [ ] `npx vitest run` 全过

### P1.7 建筑成本常量表
- [ ] building_system.ts: STEEL_COST / TIME_COST 模块级常量表预计算
- [ ] building_system.ts: computeSteelCost/computeTimeCost 改为查表
- [ ] `npx tsc --noEmit` 零错误
- [ ] `npx vitest run` 全过

### P1.8 统一用 Fixed.ONE 替代 Fixed.fromInt(1)
- [ ] focus_system.ts: Fixed.fromInt(1) → Fixed.ONE，删除错误注释
- [ ] research_system.ts: Fixed.fromInt(1) → Fixed.ONE
- [ ] grep 确认全局无 `Fixed.fromInt(1)` 单独出现
- [ ] `npx tsc --noEmit` 零错误
- [ ] `npx vitest run` 全过

### P1.9 Assistant 行为树单次 tick 复用决策
- [ ] assistant.ts: 添加 tickAndApply(state, countryId) 公开方法
- [ ] assistant.ts: 内部缓存 lastTickId + currentDecisions，同 tick 不重复执行 tree.tick()
- [ ] assistant_behavior_tree.ts: decideFactory 返回 itemIndex 避免二次 find
- [ ] assistant.ts: applyFactoryDecision 用索引直接取项，消除 find() 和 indexOf() 检查
- [ ] game_runner.ts: 3 个 auto 调用改为 1 个 tickAndApply 调用
- [ ] interfaces.ts: AssistantSystem 接口增加 tickAndApply 方法
- [ ] grep 确认 assistant.ts 中 tree.tick 只出现 1 次
- [ ] `npx tsc --noEmit` 零错误
- [ ] `npx vitest run` 全过

### P1.10 readFactoryPanel 按国家过滤工厂
- [ ] shadow_reader.ts: readFactoryPanel 中构建 playerProvinceIds: Set<number>
- [ ] shadow_reader.ts: forEach factories 时用 Set.has(provinceId) 过滤
- [ ] `npx tsc --noEmit` 零错误
- [ ] `npx vitest run` 全过

## P2 第二批：高影响中成本（缓存+索引）

### P2.1 Graphics 脏标记
- [ ] 8 个面板文件（top_bar/factory/focus/research/combat/session_goal/daily_task/assistant）加 lastRatio/lastColor/lastProgress 脏标记
- [ ] `npx tsc --noEmit` 零错误
- [ ] `npx vitest run` 全过

### P2.2 Label 字符串缓存
- [ ] 同 P2.1 的 8 个文件加 lastString 缓存
- [ ] `npx tsc --noEmit` 零错误
- [ ] `npx vitest run` 全过

### P2.3 SortedMap values 平行数组
- [ ] sorted_map.test.ts: 新增 values 同步测试
- [ ] sorted_map.ts: 添加 values: V[] 平行数组
- [ ] sorted_map.ts: forEach/entries 改为索引遍历（消除 Map.get 二次查找）
- [ ] sorted_map.ts: ensureSorted 重建 values 数组
- [ ] grep 确认 forEach 内无 `this.store.get`
- [ ] `npx vitest run` 全过
- [ ] `npx tsc --noEmit` 零错误

### P2.4 合并重复工厂扫描
- [ ] game_runner.ts: buildAssistantShadow 复用 readFactoryPanel 已计算的 idleCount
- [ ] game_runner.ts: 删除 buildAssistantShadow 中重复的 factories.forEach 循环
- [ ] `npx tsc --noEmit` 零错误
- [ ] `npx vitest run` 全过

### P2.5 resourceNodes 反向索引
- [ ] resource_system.ts: 添加 countryNodeIndex: Map<string, number[]>
- [ ] resource_system.ts: rebuildIndex 按 controllerId 构建索引
- [ ] resource_system.ts: yieldTick 使用索引而非全局遍历
- [ ] `npx tsc --noEmit` 零错误
- [ ] `npx vitest run` 确定性测试全过

### P2.6 省份管控数缓存
- [ ] shadow_reader.ts: 模块级 controlledCache: Map<string, number>
- [ ] shadow_reader.ts: getControlledCount 函数，首次全表扫描后缓存
- [ ] shadow_reader.ts: readCombatPanelShadow 使用缓存
- [ ] `npx tsc --noEmit` 零错误
- [ ] `npx vitest run` 全过

### P2.7 focus completedFocusIds 用 Set
- [ ] world_state.ts: FocusTreeState 增加 completedFocusSet: Set<string>
- [ ] focus_system.ts: refreshCandidates 用 set.has() 替代 indexOf
- [ ] focus_system.ts: advanceTick 完成时同步 add 到 Set
- [ ] state_manager.ts: cloneFocusTreeState 深拷贝 Set
- [ ] hash.ts: 序列化仍用数组（不改）
- [ ] `npx tsc --noEmit` 零错误
- [ ] `npx vitest run` 全过

### P2.8 research currentNodeIndex 缓存 + bonus 累加缓存
- [ ] world_state.ts: ResearchLineState 增加 currentNodeIndex: number
- [ ] research_system.ts: assignSlot 初始化 currentNodeIndex=0
- [ ] research_system.ts: advanceTick 用 currentNodeIndex 替代 findIndex
- [ ] research_system.ts: 完成时自增 currentNodeIndex
- [ ] research_system.ts: bonusCache 增量累加
- [ ] state_manager.ts: cloneResearchState 拷贝 currentNodeIndex
- [ ] `npx tsc --noEmit` 零错误
- [ ] `npx vitest run` 全过

### P2.9 消除 prevMaxBuildingId 全表扫描
- [ ] simulation.ts: 推进前记录 prevNextEntityId = state.nextEntityId
- [ ] simulation.ts: 删除推进前的 buildings.forEach 扫描 prevMaxBuildingId
- [ ] simulation.ts: 推进后用 b.id >= prevNextEntityId 检测新建筑
- [ ] `npx tsc --noEmit` 零错误
- [ ] `npx vitest run` 全过

### P2.10 队列操作不再全局遍历
- [ ] interfaces.ts + building_system.ts: cancel 增加 countryId 参数
- [ ] simulation.ts: applyAction cancelBuilding/reorderConstruction 传入 playerCountryId
- [ ] building_system.ts: 有 countryId 时直接取队列操作，不再 forEach 所有国家队列
- [ ] `npx tsc --noEmit` 零错误
- [ ] `npx vitest run` 全过

### P2.11 advanceTick 原地删除完成项
- [ ] building_system.ts: 收集 completedIdx 数组，遍历完后倒序 splice
- [ ] building_system.ts: 删除 queue.items.filter() 新建数组
- [ ] `npx tsc --noEmit` 零错误
- [ ] `npx vitest run` 全过

### P2.12 Dispute participants 用 Set
- [ ] world_state.ts: Dispute 增加 participantSet: Set<string>
- [ ] assistant_behavior_tree.ts: decideDefense 用 set.has(countryId) 替代 indexOf
- [ ] state_manager.ts: cloneDispute 深拷贝 Set
- [ ] hash.ts: 序列化仍用 participants 数组（不改）
- [ ] `npx tsc --noEmit` 零错误
- [ ] `npx vitest run` 全过

### P2.13 simulation.tick 空闲工厂事件复用 scanIdle 结果
- [ ] interfaces.ts + factory_system.ts: scanIdle 返回值增加 firstIdleFactoryId
- [ ] factory_system.ts: scanIdle 遍历时记录第一个 idle 工厂 id
- [ ] simulation.ts: 删除 197-207 行二次遍历 factories 的代码，直接用 idleAlert.firstIdleFactoryId
- [ ] `npx tsc --noEmit` 零错误
- [ ] `npx vitest run` 全过

## P3 第三批：中影响中成本

### P3.1 hashWorld Encoder 重写为 Uint8Array
- [ ] hash.test.ts: 添加重写前后哈希一致性测试
- [ ] hash.ts: Encoder.buf 改为 Uint8Array(4096 初始) + offset
- [ ] hash.ts: ensure(extra) 翻倍扩容
- [ ] hash.ts: u8/u16/i32/u32/bool/fixed 改为手动 offset 写入（无 push）
- [ ] hash.ts: bytes() 返回 subarray(0, offset) 视图（无拷贝）
- [ ] hash.ts: string 保持 unescape(encodeURIComponent) 保证字节一致
- [ ] grep 确认 Encoder 内无 `this.buf.push`
- [ ] `npx vitest run` 哈希确定性测试全过
- [ ] `npx tsc --noEmit` 零错误

### P3.2 shadow 对象池
- [ ] shadow_reader.ts: 模块级 pooledMainUiShadow 等可复用实例
- [ ] shadow_reader.ts: read 函数改为更新字段而非 new 对象
- [ ] 确认 render 层 update 方法不跨帧持有 shadow 引用
- [ ] `npx tsc --noEmit` 零错误
- [ ] `npx vitest run` 全过

### P3.3 daily/session view 脏标记缓存
- [ ] game_runner.ts: 添加 view 缓存 + 脏标记字段
- [ ] game_runner.ts: tick 推进后标记脏
- [ ] game_runner.ts: build 函数检查脏标记
- [ ] `npx tsc --noEmit` 零错误
- [ ] `npx vitest run` 全过

### P3.4 stockpile.history 环形缓冲区（降级为 P4 可选）
- [ ] （可选，HISTORY_LIMIT=70 影响极小）

### P3.5 factory activeFactoryCount 增量维护（降级为 P4 可选）
- [ ] （可选，assignedFactoryIds 通常 < 10）

### P3.6 cloneSortedMap 批量构造优化
- [ ] sorted_map.ts: 构造函数接受预排序 entries 数组
- [ ] state_manager.ts: cloneSortedMap 先收集 entries 再批量构造
- [ ] `npx tsc --noEmit` 零错误
- [ ] `npx vitest run` 全过
- [ ] 注：依赖 P2.3 values 平行数组完成后一起做

### P3.7 pendingActions 数组复用
- [ ] game_runner.ts: pendingActions 提升为类字段
- [ ] game_runner.ts: while 循环中用 this.pendingActions，length=0 清空
- [ ] `npx tsc --noEmit` 零错误
- [ ] `npx vitest run` 全过

## P4 第四批：低影响低成本

### P4.1 beijingDateKey 秒级缓存
- [ ] game_runner.ts: 添加 500ms 缓存避免每帧 new Date
- [ ] `npx tsc --noEmit` 零错误
- [ ] `npx vitest run` 全过

### P4.2 applyAction/building itemId 反向索引
- [ ] building_system.ts: itemIndex Map，enqueue 建立、cancel/完成清理
- [ ] `npx tsc --noEmit` 零错误
- [ ] `npx vitest run` 全过

### P4.3 getPlayerCountryId 缓存
- [ ] shadow_reader.ts: 模块级缓存首次查找结果
- [ ] `npx tsc --noEmit` 零错误
- [ ] `npx vitest run` 全过

### P4.4 oneClickBalance includes 改 Set
- [ ] factory_system.ts: assignedFactoryIds 同时维护 Set 或临时用 Set 去重
- [ ] `npx tsc --noEmit` 零错误
- [ ] `npx vitest run` 全过

### P4.5 Encoder.string 短字符串缓存（低优先级）
- [ ] hash.ts: 常用枚举字符串缓存 UTF-8 字节
- [ ] `npx tsc --noEmit` 零错误
- [ ] `npx vitest run` 全过

### P4.6 eventToAction 修正
- [ ] game_runner.ts: 删除假 eventToAction，直接传 ev 给 sessionTracker
- [ ] `npx tsc --noEmit` 零错误
- [ ] `npx vitest run` 全过

### P4.7 formatReward/formatSessionReward 缓存（低优先级）
- [ ] game_runner.ts: 缓存 rewardSummary 字符串
- [ ] `npx tsc --noEmit` 零错误
- [ ] `npx vitest run` 全过

## 完成后总结
- [ ] `npx tsc --noEmit` 零错误
- [ ] `npx vitest run` 全部通过（确定性回归红线）
- [ ] grep 验证：simulation.ts 只有 1 个 state.countries.forEach
- [ ] grep 验证：state_manager.ts 无 new Fixed(x.raw)
- [ ] grep 验证：sorted_map.ts forEach 内无 this.store.get
- [ ] grep 验证：hash.ts Encoder 无 buf.push
- [ ] grep 验证：assistant.ts 中 tree.tick 只出现 1 次
- [ ] grep 验证：tick 主循环内无 Fixed.fromInt(纯数字常量)
- [ ] 更新 tasks.md 标记所有完成项
