# Tasks（implement-focus-research）

> 实现焦点树系统 + 科研系统，填补 pickFocus/pickResearch noop，接入 tick 循环。
> 依赖：implement-core-simulation 已完成（DefaultSimulation tick 就绪）。

---

## T1：焦点树系统实现

- [x] **T1.1**：创建 `src/core/simulation/focus_system.ts`——DefaultFocusSystem
  - 实现 `FocusSystem` 接口（T0 先在 interfaces.ts 定义）
  - `refreshCandidates(state, countryId): void`：60s（600 tick）刷新三选一候选
    - 加载 `configs/focus_tree_<countryId>.json`（M1 用内联常量 + loadConfig 注入，避免 json import）
    - 按 developmentPath 过滤分支（requiresDevelopmentPath 匹配 country.developmentPath）
    - 按 prerequisites 过滤（所有前置已在 completedFocusIds 中）
    - 排除已在 completedFocusIds 的焦点
    - 用国家专属 PRNG（seedMap['focus_'+countryId]，不存在则用 state.seed + countryId 哈希派生）从可选项中确定性选 ≤3 个
    - 写入 state.focusTrees.get(countryId).candidates
  - `pickFocus(state, countryId, focusId): boolean`：校验 focusId 在 candidates 中、政治点 >= focus.cost；扣政治点、设 activeFocusId、activeProgress=Fixed.ZERO、refreshInTicks=0；失败返回 false
  - `advanceTick(state, countryId, dtMs): GameEvent[]`：
    - 取 focusTree = state.focusTrees.get(countryId)，无则 return []
    - 若 activeFocusId 非空：activeProgress += dtMs.div(Fixed.fromInt(60000))（60s 基准，cost 越高进度越慢：实际 += dtMs/(60000 × cost)）
    - 若 activeProgress >= Fixed.ONE：applyEffect 全部 effects + completedFocusIds.push + activeFocusId=null + refreshInTicks=600 + 发 focusCompleted 事件
    - 若 activeFocusId 为空：refreshInTicks--；若 <=0 调用 refreshCandidates 并重置 refreshInTicks=600
  - `applyEffect(state, countryId, effect): void`：
    - `political_power_per_day`：暂存到 country.activeBuffs（需扩展 Country 接口或在 seedMap 旁挂 buff map——**简化**：用 state.seedMap 旁的临时 buff 记录，或直接累加到一个 module-level Map<countryId, Buff[]>——**推荐**：扩展 WorldState 增加 `activeBuffs: SortedMap<string, ActiveBuff[]>`，但 world_state.ts 不改——**折中**：在 FocusSystem 内部维护 module-level Map 缓存 buff，提供 getBuff(countryId, target) 查询接口供其他系统用；政治点每日产出在 Simulation tick 中查询此 buff）
    - `stability`：country.stability = clamp(country.stability + value, 0, 1)
    - `disputeResolve`（warSupport 脱敏）：country.disputeResolve = clamp(country.disputeResolve + value, 0, 1)
    - `buff`：暂存到 module-level buff 缓存（target + value）
    - `research_bonus`：暂存到 module-level buff 缓存（target='research_'+researchLine, value）
  - `getBuff(countryId, target): Fixed`：查询某 buff target 的累计 value（供 Simulation/FactorySystem/ResearchSystem 用）
  - `getPoliticalPowerPerDay(countryId): Fixed`：查询每日政治点产出（base + buff）

---

## T2：科研系统实现

- [x] **T2.1**：创建 `configs/research_lines.json`——科研线配置
  - 7 条线：industry / electronics / infantry / armor / artillery / air / naval
  - 每条线 5-8 节点，每节点含：id / name / cost（政治点或时间基准）/ bonus（{type, target, value}）/ unlock（可选，解锁装备/兵种）
  - JSON schema 与 focus_tree 类似
- [x] **T2.2**：创建 `src/core/simulation/research_system.ts`——DefaultResearchSystem
  - 实现 `ResearchSystem` 接口（T0 先在 interfaces.ts 定义）
  - `assignSlot(state, countryId, lineId, slot): boolean`：校验 slot < maxSlots(默认2)、lineId 有效；设置 ResearchState.lines 中对应槽位的 assignedSlot/lineId/currentNode（首个未完成节点）
  - `advanceTick(state, countryId, dtMs): GameEvent[]`：
    - 取 research = state.research.get(countryId)，无则 return []
    - 遍历 research.lines，对 assignedSlot >= 0 的线推进 progress += dtMs.div(Fixed.fromInt(90000))（90s 基准）
    - 若 progress >= 1：currentNode 前进到下一节点、progress=0、发 researchCompleted 事件
    - 若无下一节点：该线完成（assignedSlot=-1 标记完成）
  - `getBonus(state, countryId, bonusType): Fixed`：遍历已完成节点的 bonus，累加 type 匹配的 value
  - `isUnlocked(state, countryId, nodeId): boolean`：查询 nodeId 是否在已完成节点集合
  - 配置加载：内联 DEFAULT_RESEARCH_LINES 常量 + loadConfig 注入

---

## T3：接口与类型定义

- [x] **T3.1**：更新 `src/core/simulation/interfaces.ts`——新增 FocusSystem / ResearchSystem 接口
  - FocusSystem: refreshCandidates/pickFocus/advanceTick/applyEffect/getBuff/getPoliticalPowerPerDay
  - ResearchSystem: assignSlot/advanceTick/getBonus/isUnlocked
- [x] **T3.2**：更新 `src/core/simulation/types.ts`——GameEvent 联合类型新增 researchCompleted 成员
  - `| { kind: 'researchCompleted'; countryId: string; lineId: string; nodeId: string }`
  - 注释说明仅类型层面新增，无二进制协议破坏

---

## T4：接入 tick 循环

- [x] **T4.1**：更新 `src/core/simulation/simulation.ts`——DefaultSimulation 接入焦点/科研
  - 构造新增 focusSystem / researchSystem 参数（或 create 工厂方法内 new）
  - applyAction 中：
    - `case 'pickFocus'`：focusSystem.pickFocus(state, playerCountryId, action.focusId)
    - `case 'pickResearch'`：researchSystem.assignSlot(state, playerCountryId, action.lineId, 0)（slot 取第一个空闲，M1 简化）
  - tick 推进块（speed>0）中：遍历国家调用 focusSystem.advanceTick + researchSystem.advanceTick
  - 政治点每日产出：tick 中按国家累加（baseRate + focusSystem.getPoliticalPowerPerDay buff）
  - 事件收集：focusCompleted / researchCompleted 加入 TickResult.events

---

## T5：模块导出与验证

- [x] **T5.1**：更新 `src/core/simulation/index.ts`——导出 DefaultFocusSystem/DefaultResearchSystem + FocusSystem/ResearchSystem 接口
- [x] **T5.2**：`npx tsc --noEmit` 零错误
- [x] **T5.3**：确认 pickFocus/pickResearch 在 simulation.ts 中不再走 default noop
- [x] **T5.4**：确认 core/ 无 cc import、无 Math 调用（除 fixed.ts 白名单）
- [x] **T5.5**：确认 FocusTreeState/ResearchState 数据模型未改（world_state.ts 不动）
- [x] **T5.6**：确认 focus_tree_iron_cross.json 未改（读取既有 schema）

---

# Task Dependencies

- T3（接口与类型）先行，T1/T2 依赖接口定义
- T1（focus）与 T2（research）可并行（互不依赖，仅共享 buff 缓存查询）
- T4（接入 tick）依赖 T1+T2+T3
- T5（验证）依赖 T4

## 可并行任务

- T1（focus_system）与 T2（research_system）可并行（T3.1 先定义两个接口）
- T3.1（接口）与 T3.2（GameEvent 类型）可并行
