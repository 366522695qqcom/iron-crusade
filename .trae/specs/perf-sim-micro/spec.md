# Spec: 模拟层剩余微优化（perf-sim-micro）

> 变更类型：纯性能优化（零行为变化）
> 前置依赖：optimize-performance P1/P2/P3/P4 已完成阶段（含本轮已完成的 SortedMap 平行数组、Encoder Uint8Array 等）
> 目标：消除模拟 tick 中剩余的线性查找、对象分配和小热点，中端机模拟 tick ≤3ms

## Why

P1-P4 已消除了模拟层主要热点（常量提升、主循环合并、缓存、SortedMap 优化、快照复用、Encoder 重写、Assistant 单次 tick、队列精确查找、Dispute/focus Set 索引等）。但代码中仍有若干小热点：

1. **resource_system.yieldTick** 每次遍历全部 resourceNodes 查 province.controllerId（全节点扫描而非按国索引）
2. **research_system.advanceTick** 每节点用 findIndex 线性查找 currentNode（每次 advanceTick 对每个 research line 做 O(n) findIndex）
3. **state_manager.cloneSortedMap** 逐个 set 到新 SortedMap（无法利用已知有序性）
4. **factory_system.oneClickBalance** 用 `assignedFactoryIds.includes(id)` O(n) 去重
5. **building_system.cancel** 在有 countryId 路径下仍用 findIndex 线性查找 item（P2.10 已改精确队列定位，但队列内 item 查找仍 O(n)）
6. **shadow_reader.getPlayerCountryId** 可能被多次调用（每次新查 countries Map）
7. **hash.Encoder.string** 对高频短字符串（类型枚举如 'steel'/'oil'/'working'/'idle'）重复 UTF-8 编码

这些单看都不是瓶颈，但叠加起来每 tick 仍有可观开销。本 spec 批量清理这些微热点。

## What Changes

### A3: resourceNodes 反向索引（按国）

在 [resource_system.ts](file:///workspace/src/core/simulation/resource_system.ts) 的 DefaultResourceSystem 类中添加 `countryNodeIndex: Map<string, number[]>`，将"遍历全部节点→查 province→判断 controllerId"改为"按 countryId 直接遍历节点列表"。

- 索引内容：countryId → 该国管控省份上的 resourceNodeId[]
- 失效时机：
  - M1 阶段省份管控不变（dispute 系统未实装），索引构建一次后永有效
  - 预留 `invalidateNodeIndex(countryId?: string)` 方法供 C 级联机争端系统调用
  - mine 建筑建设/拆除不改变节点归属（节点归属省份而非建筑），无需失效
- yieldTick 使用索引后，不再对每个节点查 province 和判断 controllerId，但仍需保留 node.mineBuildingLevel > 0 和 node.occupied 检查

### A4: ResearchLineState currentNodeIndex + bonusCache

在 [world_state.ts](file:///workspace/src/core/state/world_state.ts) 的 ResearchLineState 接口增加 `currentNodeIndex: number` 字段（默认 0），在 [research_system.ts](file:///workspace/src/core/simulation/research_system.ts) 维护 bonus 累加缓存。

- assignSlot 初始化 currentNodeIndex=0
- advanceTick 用 `lineState.currentNodeIndex` 直接索引 `line.nodes[currentNodeIndex]`，替代 `findIndex(n => n.id === lineState.currentNode)` O(n) 查找
- 节点完成时 currentNodeIndex++（或若跳节点则 findIndex 一次），progress 重置
- research_system 内维护 `bonusCache: Map<string, Map<string, Fixed>>`（countryId → bonusType → total），getBonus 直接查缓存
- state_manager.cloneResearchState 拷贝 currentNodeIndex 字段
- hash.ts 序列化 research 时不需要序列化 currentNodeIndex（它是派生状态，由 nodes 顺序+currentNode 决定），但为了快照一致性必须包含（否则 snapshot/restore 后索引错位）

### A6: SortedMap 批量构造 + cloneSortedMap 优化

在 [sorted_map.ts](file:///workspace/src/core/determinism/sorted_map.ts) 添加构造函数参数支持从**已排序**entries 直接初始化：

```typescript
constructor(entries?: [K, V][]) {
  if (entries) {
    for (const [k, v] of entries) {
      this.keys.push(k);
      this.values.push(v);
      this.store.set(k, v);
    }
    this.dirty = false; // 调用方保证 entries 已按 key 升序
  }
}
```

在 [state_manager.ts](file:///workspace/src/core/simulation/state_manager.ts) 重构 `cloneSortedMap`：src.forEach 收集已排序的 [k, cloneVal(v)] 对，直接 `new SortedMap(entries)`，跳过逐个 set 的 dirty/sort 路径。

### P4.2: building itemId 反向索引（每国）

在 building_system.ts 的 DefaultBuildingSystem 维护 `itemIndex: Map<string, Map<string, number>>`（countryId → itemId → items 数组索引）：

- enqueue 时建立索引
- cancel/advanceTick 删除时同步清理
- cancel 在 countryId 路径下用 `queue.items[itemIndex.get(countryId)?.get(itemId)]` 直接取项，O(1)
- 索引仅对"已知 countryId"的调用路径生效，全局 forEach 后备路径保留

### P4.3: getPlayerCountryId 缓存

在 shadow_reader.ts 添加模块级缓存：`lastCountryId: string | null`、`lastPlayerId: string | null`。getPlayerCountryId 若参数 countryId 与 lastCountryId 相同直接返回 lastPlayerId。注意缓存只在同一帧内有效（countryId 不变时），跨 countryId 切换（联机/观战）会自动失效。

### P4.4: oneClickBalance Set 去重

在 factory_system.ts oneClickBalance 中，遍历前先 `const assignedSet = new Set(targetItem.assignedFactoryIds)`，用 `assignedSet.has(id)` 替代 `includes(id)`。完成后一次性写回或不改数组（因为我们不新增重复项，只需要判断）。

### P4.5: Encoder.string 高频短字符串预编码

在 hash.ts 模块级添加 CACHED_STRINGS，对高频类型枚举字符串（'steel'/'oil'/'tungsten'/'rubber'/'aluminum'/'political'/'civilian_factory'/'military_factory'/'working'/'idle'/'active' 等 20-30 个）预编码 UTF-8 字节，Encoder.string 命中缓存时直接 memcpy（Uint8Array.set）。

缓存使用懒填充：首次遇到字符串时编码并缓存，后续命中直接用。不预建列表，避免遗漏。

## Impact

- **Affected core files**：
  - `src/core/simulation/resource_system.ts`（A3）
  - `src/core/simulation/research_system.ts`（A4）
  - `src/core/simulation/building_system.ts`（P4.2）
  - `src/core/simulation/factory_system.ts`（P4.4）
  - `src/core/determinism/sorted_map.ts`（A6）
  - `src/core/simulation/state_manager.ts`（A6 配合）
  - `src/core/state/world_state.ts`（A4 字段）
  - `src/core/state/hash.ts`（P4.5）
  - `src/render/core/shadow_reader.ts`（P4.3）
- **Interface changes**：ResearchLineState 增加 currentNodeIndex 字段（非破坏，默认 0）；SortedMap 构造函数增加可选参数
- **Determinism**：确定性红线——全部改动不得改变 hash 序列；simulation.test.ts 200 帧联机一致性必须通过
- **Tests**：SortedMap 构造测试可追加；其他无需新测试（行为不变）

---

## Requirements

### Requirement: 资源索引正确性

- **WHEN** 调用 yieldTick(state, countryId, dtMs)
- **THEN** 产出结果与全表扫描版本完全一致
- **AND** 确定性哈希在 200 帧压力测试中两实例完全相等

### Requirement: Research currentNodeIndex 一致性

- **WHEN** snapshot/restore 后推进科研
- **THEN** currentNodeIndex 与 currentNode 指向同一节点
- **AND** 科研进度与优化前字节一致

### Requirement: SortedMap 批量构造有序

- **WHEN** 通过 new SortedMap(entries) 构造
- **THEN** forEach 遍历顺序与 entries 顺序一致（调用方保证 entries 已升序）
- **AND** 后续 set/delete 操作仍保持升序

### Requirement: 所有微优化不改变行为

- **WHEN** 全部优化应用后
- **THEN** 现有 39 个测试全部通过
- **AND** 200 帧联机哈希一致
