# Tasks（perf-sim-micro）

> 模拟层剩余微优化：A3 资源索引 + A4 科研索引+bonus缓存 + A6 SortedMap批量构造 + P4.2 建造item索引 + P4.3 playerId缓存 + P4.4 Set去重 + P4.5 字符串预编码
> 回归红线：每步后 `npx tsc --noEmit`（零错）+ `npx vitest run`（全过）。确定性测试是红线。

---

## T0：安全前置（SortedMap 构造 + 测试）

- [ ] **T0.1**：sorted_map.ts 添加构造函数 `constructor(entries?: [K, V][])`
  - entries 存在时：for 循环 push 到 keys/values，store.set(k,v)，dirty=false
  - entries 不存在：保持原行为（keys=[], values=[], store=new Map）
- [ ] **T0.2**：在 sorted_map.test.ts 追加 3 个测试：
  - 空 entries 构造后 forEach 为空
  - 已排序 entries 构造后 forEach 顺序与 entries 一致
  - 构造后 set 新 key 仍能正确排序（dirty 标记工作）
- [ ] **T0.3**：运行 `npx vitest run src/core/determinism/sorted_map.test.ts`

---

## T1：A6 cloneSortedMap 优化

- [ ] **T1.1**：state_manager.ts 的 cloneSortedMap 改为：
  - src.forEach 收集 `entries: [K, V][] = []`，每 entry.push([k, cloneVal(v)])
  - 返回 `new SortedMap(entries)`
- [ ] **T1.2**：运行全部测试，重点 hash.test.ts 和 simulation.test.ts

---

## T2：P4.5 Encoder.string 短字符串缓存

- [ ] **T2.1**：hash.ts 模块级添加 `const ENCODED_STRING_CACHE = new Map<string, Uint8Array>()`
- [ ] **T2.2**：添加 `function encodeCached(s: string): Uint8Array` 辅助函数
  - 查缓存，命中返回
  - 未命中：unescape(encodeURIComponent(s)) 编码，构造 Uint8Array，缓存后返回
- [ ] **T2.3**：Encoder.string 改为：
  - u16(utf8.length)
  - ensure(utf8.length)
  - this.buf.set(bytes, this.pos)；this.pos += bytes.length；同时更新 fnv（for 循环 bytes 每个字节 xor+mul）
- [ ] **T2.4**：运行 hash.test.ts 确认哈希值不变（字节级兼容）

---

## T3：A3 resourceNodes 反向索引

- [ ] **T3.1**：DefaultResourceSystem 添加字段：
  - `private countryNodeIndex = new Map<string, number[]>()`
  - `private nodeIndexValid = false`
- [ ] **T3.2**：添加 `private rebuildIndex(state): void`：
  - 清空 countryNodeIndex
  - state.resourceNodes.forEach(node)：查 province，取 controllerId，push node.id 到对应 list
  - nodeIndexValid = true
- [ ] **T3.3**：yieldTick 改为：
  - if (!nodeIndexValid) rebuildIndex(state)
  - 取 nodeIds = countryNodeIndex.get(countryId)，空则记录 history 0 值并 return
  - 遍历 nodeIds：get(node)，跳过 mineBuildingLevel<=0，原产出计算保留
  - 不再做 province.controllerId 判断（索引已保证）
- [ ] **T3.4**：添加 `invalidateNodeIndex(countryId?: string): void`：
  - countryId 存在：delete 单国
  - 否则：clear 全部，nodeIndexValid=false
- [ ] **T3.5**：运行 simulation.test.ts 确定性测试（必过）

---

## T4：A4 research currentNodeIndex + bonusCache

- [ ] **T4.1**：world_state.ts ResearchLineState 添加 `currentNodeIndex: number`（默认 0）
- [ ] **T4.2**：research_system.ts DefaultResearchSystem 添加 `private bonusCache = new Map<string, Map<string, Fixed>>()`
- [ ] **T4.3**：assignSlot 初始化 currentNodeIndex=0
- [ ] **T4.4**：advanceTick 用 lineState.currentNodeIndex 替代 findIndex：
  - node = line.nodes[lineState.currentNodeIndex]（若越界 return）
  - 完成时 currentNodeIndex++（若到末尾则 assignedSlot=-1）
- [ ] **T4.5**：节点完成时 this.addNodeBonus(countryId, node.bonus) 更新 bonusCache
- [ ] **T4.6**：getBonus 改为查 bonusCache，miss 时 rebuild
- [ ] **T4.7**：state_manager.ts cloneResearchState 拷贝 currentNodeIndex
- [ ] **T4.8**：hash.ts 序列化 research lines 时不序列化 currentNodeIndex（因为它派生自 currentNode+nodes 顺序；若 hash 测试失败则补上）
- [ ] **T4.9**：运行全部测试，特别关注 simulation 确定性测试

---

## T5：P4.2 building itemId 反向索引

- [ ] **T5.1**：DefaultBuildingSystem 添加 `private itemIndex = new Map<string, Map<string, number>>()`（countryId → itemId → index）
- [ ] **T5.2**：enqueue 成功后更新 itemIndex：items.push 后 index = items.length-1，itemIndex.get(countryId).set(item.id, index)
- [ ] **T5.3**：cancel（countryId 路径）用 itemIndex 直接 O(1) 定位，splice 后重建该 queue 的 itemIndex（splice 位置之后的索引都 -1）
- [ ] **T5.4**：advanceTick 完成项删除后同步维护 itemIndex（倒序 splice 前先收集要删除的 itemId，splice 后从 index 删除，再调整后续索引）
- [ ] **T5.5**：assignFactories/oneClickBalance 等不改变 items 顺序的方法无需维护索引
- [ ] **T5.6**：运行 simulation.test.ts 确保 cancel/建造流程一致

---

## T6：P4.3 + P4.4 小修

- [ ] **T6.1**：shadow_reader.ts 添加模块级缓存变量：
  - `let cachedCountryId: string | null = null`
  - `let cachedPlayerId: string = ''`
  - getPlayerCountryId 开头：if (countryId === cachedCountryId) return cachedPlayerId
  - 找到 playerId 后更新缓存
- [ ] **T6.2**：factory_system.ts oneClickBalance 中：
  - 遍历 factories 前 `const assignedSet = new Set(targetItem.assignedFactoryIds)`
  - 去重判断 `if (assignedSet.has(id)) continue;`
  - 同步 `targetItem.assignedFactoryIds.push(id)` 和 `assignedSet.add(id)`（保持 set 与数组同步）
- [ ] **T6.3**：运行全部测试

---

## T7：最终验证

- [ ] **T7.1**：`npx tsc --noEmit` 零错误
- [ ] **T7.2**：`npx vitest run` 全过
- [ ] **T7.3**：simulation.test.ts 200 帧压力测试通过
- [ ] **T7.4**：hash.test.ts 同 state 多次 hash 相等、改字段必变 hash
- [ ] **T7.5**：perf 基准：200 tick 总耗时较优化前下降 ≥10%

---

# Dependencies

- T0（SortedMap 构造）先行，独立
- T1（cloneSortedMap）依赖 T0
- T2（字符串缓存）独立，可与 T3-T6 并行
- T3（资源索引）独立
- T4（科研索引）涉及 world_state 接口变更，独立
- T5（建造 item 索引）独立
- T6 两个小修独立
- T7 依赖全部完成

可并行：T2/T3/T4/T5/T6 互不冲突可并行开发；T0→T1 串行。
