# Checklist（implement-focus-research）

> 验证检查点。每个检查点对应 spec.md 的需求与 tasks.md 的任务。

---

## T1：焦点树系统

- [x] `src/core/simulation/focus_system.ts` 已创建 DefaultFocusSystem
- [x] refreshCandidates 按 developmentPath + prerequisites 过滤，PRNG 确定性选 ≤3 个
- [x] pickFocus 校验 candidates + 政治点，扣点 + 设 activeFocusId
- [x] 政治点不足返回 false（不扣点）
- [x] advanceTick 推进 activeProgress（dtMs/(60000×cost)）
- [x] 完成时 applyEffect + completedFocusIds + 清 activeFocusId + refreshInTicks=600
- [x] 发 focusCompleted 事件
- [x] applyEffect 落地 stability/disputeResolve（clamp 0-1）
- [x] applyEffect 暂存 buff/research_bonus/political_power_per_day 到 module-level 缓存
- [x] getBuff/getPoliticalPowerPerDay 查询接口可用
- [x] 无 cc import，无 Math 调用，数值用 Fixed

---

## T2：科研系统

- [x] `configs/research_lines.json` 已创建（7 条线 × 5-8 节点）
- [x] `src/core/simulation/research_system.ts` 已创建 DefaultResearchSystem
- [x] assignSlot 校验 slot < maxSlots(2) + lineId 有效
- [x] advanceTick 推进 progress（dtMs/90000）
- [x] 完成时 currentNode 前进 + 发 researchCompleted 事件
- [x] 无下一节点时标记线完成（assignedSlot=-1）
- [x] getBonus 累加已完成节点 bonus
- [x] isUnlocked 查询节点是否已解锁
- [x] 配置加载用内联常量 + loadConfig
- [x] 无 cc import，无 Math 调用，数值用 Fixed

---

## T3：接口与类型定义

- [x] interfaces.ts 已新增 FocusSystem 接口（refreshCandidates/pickFocus/advanceTick/applyEffect/getBuff/getPoliticalPowerPerDay）
- [x] interfaces.ts 已新增 ResearchSystem 接口（assignSlot/advanceTick/getBonus/isUnlocked）
- [x] types.ts GameEvent 联合类型已新增 researchCompleted 成员
- [x] researchCompleted 字段：{ kind, countryId, lineId, nodeId }
- [x] 注释说明仅类型层面新增，无二进制协议破坏

---

## T4：接入 tick 循环

- [x] simulation.ts DefaultSimulation 构造注入 focusSystem/researchSystem
- [x] create 工厂方法内 new DefaultFocusSystem/DefaultResearchSystem
- [x] applyAction 中 pickFocus 调用 focusSystem.pickFocus
- [x] applyAction 中 pickResearch 调用 researchSystem.assignSlot
- [x] tick 推进块遍历国家调用 focusSystem.advanceTick
- [x] tick 推进块遍历国家调用 researchSystem.advanceTick
- [x] 政治点每日产出按国家累加（baseRate + buff）
- [x] focusCompleted/researchCompleted 事件加入 TickResult.events

---

## T5：模块导出与验证

- [x] index.ts 已导出 DefaultFocusSystem/DefaultResearchSystem
- [x] index.ts 已导出 FocusSystem/ResearchSystem 接口
- [x] `npx tsc --noEmit` 零错误
- [x] simulation.ts 中 pickFocus/pickResearch 不再走 default noop
- [x] core/ 无 cc import
- [x] core/ 无 Math 调用（除 fixed.ts 白名单）
- [x] FocusTreeState/ResearchState 数据模型未改（world_state.ts 不动）
- [x] focus_tree_iron_cross.json 未改

---

## 跨模块一致性

- [x] 实现类严格符合 interfaces.ts 既有 + 新增接口
- [x] 确定性约定延续（Fixed/PRNG/SortedMap 不改）
- [x] 焦点刷新用国家专属 PRNG（seedMap['focus_'+countryId]）保证联机一致
- [x] GameEvent 新增 researchCompleted 不影响既有编码值
- [x] 数据模型 world_state.ts 不改
