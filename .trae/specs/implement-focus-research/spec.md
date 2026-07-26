# 焦点树与科研系统实现 Spec（implement-focus-research）

> 变更类型：新增核心系统实现（M1 单机核心 · 决策循环）
> 影响文档：PROJECT.md 3.5（国家焦点树）/ 3.6（科研）/ 技术设计文档 4.3
> 影响代码：`src/core/simulation/`、`src/core/simulation/simulation.ts`（tick 接入）
> 依赖：`implement-core-simulation` 已完成（DefaultSimulation tick 循环就绪，pickFocus/pickResearch 当前为 default noop）

## Why

`implement-core-simulation` 打通了资源/建筑/工厂三系统 tick 循环，但 `DefaultSimulation.tick` 中 `pickFocus` / `pickResearch` 两个 PlayerAction 走 default 分支 noop——玩家无法选择焦点、无法推进科研。这导致：

1. PROJECT.md 3.5「国家焦点树」核心玩法缺失——三选一卡牌刷新 + 焦点推进 + 效果生效全未实现
2. PROJECT.md 3.6「科研」核心玩法缺失——线性科技线推进 + 解锁 buff/兵种全未实现
3. `FocusTreeState` / `ResearchState` 数据模型已就绪但无系统驱动，状态永远不更新
4. 上层 A 级功能（会话目标含「完成 1 个焦点」、每日任务、助理模式焦点选择）缺底层支撑

本次实现焦点树系统 + 科研系统，填补 `pickFocus`/`pickResearch` noop，让玩家决策能真正影响局势（焦点给 buff/资源/政治点，科研解锁全局 buff/新装备），完成「决策 → 推进 → 生效」闭环。

## What Changes

### ADDED（新增系统实现）

- **ADDED** `src/core/simulation/focus_system.ts`——DefaultFocusSystem（PROJECT.md 3.5）
  - `refreshCandidates(state, countryId)`：60s（600 tick）刷新三选一候选；按 developmentPath 过滤分支、按 prerequisites 过滤可选项、用 PRNG 确定性选 3 个
  - `pickFocus(state, countryId, focusId)`：扣政治点、设 activeFocusId、重置进度
  - `advanceTick(state, countryId, dtMs)`：推进 activeFocus 进度；完成时生效 effects + 发 focusCompleted 事件 + 触发下次 refreshCandidates
  - `applyEffect(state, countryId, effect)`：把焦点 effect 落地（buff 暂存到 country/politicalPower/stability/disputeResolve；research_bonus 委托给 FocusSystem 暴露的查询接口供 ResearchSystem 用）
- **ADDED** `src/core/simulation/research_system.ts`——DefaultResearchSystem（PROJECT.md 3.6）
  - `assignSlot(state, countryId, lineId, slot)`：分配科研槽位到指定线
  - `advanceTick(state, countryId, dtMs)`：推进各线 progress；完成节点时解锁（记录到 ResearchState.lines.currentNode）+ 发 researchCompleted 事件
  - `getBonus(state, countryId, bonusType)`：查询某类科研 bonus（如 armor/infantry/industry），供 FactorySystem/BuildingSystem/Division 用
  - `isUnlocked(state, countryId, nodeId)`：查询某科技节点是否已解锁（供装备生产/兵种校验）
- **ADDED** `configs/research_lines.json`——科研线配置（7 条线 × 5-8 节点，含 bonus/unlock 字段）

### MODIFIED

- **MODIFIED** `src/core/simulation/interfaces.ts`——新增 FocusSystem / ResearchSystem 接口定义
- **MODIFIED** `src/core/simulation/simulation.ts`——DefaultSimulation 构造注入 FocusSystem/ResearchSystem；tick 中处理 pickFocus/pickResearch action；tick 推进时调用 focus/research advanceTick；收集 focusCompleted/researchCompleted 事件
- **MODIFIED** `src/core/simulation/index.ts`——导出 DefaultFocusSystem/DefaultResearchSystem + FocusSystem/ResearchSystem 接口

## Impact

- **Affected specs**：
  - `implement-core-simulation`：tick 循环接入焦点/科研推进，pickFocus/pickResearch 不再 noop
  - A 级上层（会话目标「完成 1 个焦点」、每日任务、助理焦点选择）：底层可用
- **Affected code**：
  - 新增：`core/simulation/focus_system.ts`、`core/simulation/research_system.ts`、`configs/research_lines.json`
  - 改造：`core/simulation/interfaces.ts`（加接口）、`core/simulation/simulation.ts`（tick 接入）、`core/simulation/index.ts`（导出）
- **不变**：
  - 数据模型（`world_state.ts` 的 FocusTreeState/ResearchState）不改
  - PlayerAction/GameEvent 类型不改（pickFocus/pickResearch/focusCompleted 已定义；researchCompleted 需新增到 GameEvent）
  - 确定性基础（Fixed/PRNG/SortedMap）不改
  - 焦点树配置（`focus_tree_iron_cross.json`）不改——读取既有 schema

---

## ADDED Requirements

### Requirement: 焦点树系统

系统 SHALL 实现焦点三选一刷新、选择、推进、生效。

- refreshCandidates：每 600 tick（60s）刷新；按 developmentPath 过滤分支、按 prerequisites（已完成）过滤可选项；候选不足 3 个时返回全部可选；用国家专属 PRNG（seedMap['focus_'+countryId]）确定性选 3 个
- pickFocus：校验 focusId 在 candidates 中、政治点足够；扣政治点、设 activeFocusId、activeProgress=0、refreshInTicks=0（暂停刷新直到完成）
- advanceTick：推进 activeProgress（按 focus.cost 与 60s 基准推进，即 progress += dtMs / 60000）；完成时（>=1）applyEffect + 清 activeFocusId + refreshInTicks=600 + 发 focusCompleted 事件
- applyEffect：落地 effect——political_power_per_day（暂存到 country buff，下文 buff 集合）、stability（country.stability += value，clamp 0-1）、disputeResolve（country.disputeResolve += value，clamp 0-1）、buff（暂存到 country.activeBuffs 列表）、research_bonus（暂存供 ResearchSystem 查询）
- 政治点每日自动产出：本 spec 顺带在 FocusSystem.advanceTick 或 Simulation tick 中按「政治点每日产出 + political_power_per_day buff」累加（每 tick += baseRate × dtMs × (1 + buffSum)）

#### Scenario: 三选一刷新
- **WHEN** refreshInTicks 减到 0 且无 activeFocus
- **THEN** 调用 refreshCandidates，candidates 含 ≤3 个可选焦点（按 developmentPath + prerequisites 过滤）

#### Scenario: 焦点完成生效
- **WHEN** activeProgress >= 1
- **THEN** applyEffect 落地所有 effects
- **AND** completedFocusIds 加入该 focusId
- **AND** activeFocusId 清空，refreshInTicks 重置 600
- **AND** 发 focusCompleted 事件

#### Scenario: 政治点不足无法选焦点
- **WHEN** 玩家 pickFocus 但政治点 < focus.cost
- **THEN** 操作拒绝（不扣点、不设 activeFocusId）

### Requirement: 科研系统

系统 SHALL 实现科研槽位分配、线性推进、节点解锁、bonus 查询。

- assignSlot：校验 slot 在 0..maxSlots-1、lineId 有效；设置该槽位指向 lineId
- advanceTick：对每个已分配槽位的线推进 progress（按节点 cost 与 90s 基准，progress += dtMs / 90000）；完成时 currentNode 前进到下一节点、progress=0、发 researchCompleted 事件
- getBonus：查询某 bonusType 的累计加成（所有已完成节点的 bonus 累加）
- isUnlocked：查询某 nodeId 是否在已完成节点集合
- maxSlots：默认 2（M1 简化，后续可由焦点/科技扩展）

#### Scenario: 科研推进
- **WHEN** 槽位已分配 lineId 且 dtMs > 0
- **THEN** 该线 progress 增加 dtMs/90000
- **AND** 达到 1 时 currentNode 前进、发 researchCompleted 事件

#### Scenario: bonus 查询
- **WHEN** 调用 getBonus(state, countryId, 'armor')
- **THEN** 返回所有已完成科研节点中 bonusType='armor' 的 value 累加值（Fixed）

### Requirement: 焦点/科研接入 tick 循环

系统 SHALL 在 DefaultSimulation.tick 中处理 pickFocus/pickResearch 并推进焦点/科研。

- pickFocus action：调用 focusSystem.pickFocus(state, playerCountryId, focusId)
- pickResearch action：调用 researchSystem.assignSlot(state, playerCountryId, lineId, slot)（slot 默认 0，或从 action 扩展——本 spec pickResearch 仅含 lineId，slot 取第一个空闲槽）
- tick 推进（speed>0）：遍历国家调用 focusSystem.advanceTick + researchSystem.advanceTick
- 事件收集：focusCompleted / researchCompleted 加入 TickResult.events
- 政治点每日产出：tick 中按国家累加（baseRate + buff）

#### Scenario: tick 推进焦点
- **WHEN** 玩家有 activeFocus 且 speed=1
- **THEN** 每 tick activeProgress 增加 100/60000 ≈ 0.00167
- **AND** 约 600 tick（60s）后完成

---

## MODIFIED Requirements

### Requirement: GameEvent 新增 researchCompleted

**原需求**：GameEvent 联合类型含 buildingCompleted/factoryIdle/resourceDepleted/focusCompleted/disputeResolved/provinceControlled/hashMismatch。

**修改后**：新增 `researchCompleted` 事件：

```typescript
| { kind: 'researchCompleted'; countryId: string; lineId: string; nodeId: string }
```

注：GameEvent 类型在 `simulation/types.ts` 定义，本 spec 新增一个 union 成员，不影响既有编码值（仅类型层面新增，无二进制协议破坏）。

---

## REMOVED Requirements

无删除项。
