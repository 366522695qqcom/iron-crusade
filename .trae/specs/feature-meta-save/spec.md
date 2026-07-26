# Spec: 元游戏与存档系统补全（feature-meta-save）

> 变更类型：功能补全（填补 M1 占位 + 存档系统增强）
> 前置依赖：core-simulation / optimize-for-launch 已完成
> 目标：实现 B4 奖励发放、B5 trade 精确计数、B6 快速对局归档持久化、B7 经典增量存档、B9 state_manager patches 字段级回滚

## Why

当前元游戏层（Meta）和存档层存在若干未完成项：

1. **B4 奖励未发放**：会话目标（session_goal_card）点击"领取"只返回 reward 对象但不 apply 到 WorldState，玩家拿不到政治点/资源；每日任务（daily_task）虽注释说"已由 DailyTaskSystem 应用"但需要验证一致性
2. **B5 trade 计数粗糙**：会话目标的 `gather_resource` 用一次 trade action 固定 +1，未按实际交易量更新
3. **B6 QuickBattle 归档未持久化**：单局结束后只在内存标记，未写入 platform 存储（刷新页面丢失）
4. **B7 Classic 全量快照**：每次存档都是全量 JSON 序列化，随着游戏时长增长存档体积和 IO 时间线性增长
5. **B9 state_manager patches 占位**：`applyPatches` 方法只有 M1 占位注释，字段级 diff/patch 未实现，助理 undo 回滚只能整状态 restore

这些问题不影响核心玩法但影响游戏体验的完整性：奖励无法领取会让玩家困惑、存档丢失会让玩家愤怒、patches 不实现让助理撤销无法做细粒度回滚。

## What Changes

### B4: SessionGoal/DailyTask 奖励应用到 WorldState

- [session_goal_tracker.ts](file:///workspace/src/game/session/session_goal_tracker.ts) 的 `claimReward` 改为接收 WorldState 参数，直接在 state 上 apply 奖励
  - politicalPower 奖励：stockpile.political += amount（clamp 到 caps.political）
  - 资源奖励：对应资源 += amount（clamp 到 cap）
  - 标记 goal.claimed = true
- [game_runner.ts](file:///workspace/src/game/game_runner.ts) onClaim 回调传入 this.state
- 同步验证 daily_task complete 确实已发放奖励（当前是 DailyTaskSystem.complete 返回 reward 但未 apply？需要检查）
- 统一：所有 reward 发放走 `RewardApplier.apply(state, countryId, reward)` 工具函数（新建 `game/session/reward_applier.ts`），避免两个系统重复实现 clamp 逻辑

### B5: trade 目标按实际交易量计数

- trade PlayerAction 目前由 Assistant 或玩家手动触发，action 上需要带 amount 字段
- 当前 trade action 定义：查看 types.ts，trade 目前带 resourceType/amount/political 字段
- session_goal_tracker.updateProgress 的 case 'trade'：用 `action.amount`（资源量）累加 current，而不是固定 +1
- current/target 统一用 Fixed 单位还是整数？M1 简化：target 用整数（目标 N 单位），current 累加资源量（也用整数，或转为 Fixed 比较）
- **M1 简化**：目标 target 以"资源单位"为单位（如"积累 200 钢铁"），current 按实际交易量累加

### B6: QuickBattle 归档持久化

- [quick_battle.ts](file:///workspace/src/game/modes/quick_battle.ts) 单局结束（归档时）调用 platform 存储
- 存储 key 前缀 `qb_` + archiveId，value 为 JSON 序列化的 QuickBattleSave（不含 WorldState，仅元信息：duration、rewards、timestamp、result）
- DefaultModeManager 启动时从 platform 存储加载归档列表，填充 quickBattleArchives 数组
- 非 tt 环境 fallback 到内存（与 cosmetics/content_unlock 一致）

### B7: Classic 增量差分存档

- 当前 [classic.ts:118](file:///workspace/src/game/modes/classic.ts#L118) 每次 save 都全量 snapshot
- 引入差分缓冲：`pendingPatches: StatePatch[]`，每 tick 累积字段级变化（只记录变化字段）
- 存档策略：每 10 次自动存档为一次全量快照 + 之前累积的 patches（M1 简化：每 60 tick 自动存档时，如果上次全量存档距今 < 10 次存档则做差分，否则全量）
- **M1 简化方案**：不做真正字段级 diff，而做"间隔全量"——每次存档保存完整 snapshot，但保持一个 snapshots 环形缓冲（最近 N 个全量快照），加载时取最新。这已经大幅降低 IO 频率（原来每 tick 可能存，改为每 60 tick 存一次）
- 关键事件（焦点完成、发起争端、管控城市）触发即时存档（全量）
- 删除 TODO 注释，补全实现

### B9: state_manager patches 字段级回滚

- [state_manager.ts:116](file:///workspace/src/core/simulation/state_manager.ts#L116) M1 占位实现 patches 应用
- Patch 格式：`{ op: 'set' | 'add' | 'del'; path: string[]; value?: any }`（JSON-patch 简化版）
- 支持路径：
  - `['countries', countryId, 'stability']` → 赋值
  - `['stockpiles', countryId, 'political']` → Fixed 赋值
  - `['buildings', id]` → 删除/新增
- DefaultStateManager 添加 `applyPatches(patches: StatePatch[]): void` 方法，遍历 patches 按路径写入 state
- 助理 undo 操作改为：记录助理每步操作产生的 inverse patch（即"撤销这次操作需要的补丁"），undo 时调用 applyPatches(inverse)
- **M1 范围**：仅实现助理操作的 inverse patch 记录（factory assign/unassign、trade），不做全状态字段级 diff（那是为联机做的）
- 本任务不实现 patch 生成（由 feature-factory-economy 或助理系统在操作时记录 inverse patch），只实现 applyPatches 基础能力

新增类型（state_manager.ts 或独立 patch.ts）：
```typescript
export interface StatePatch {
  op: 'set' | 'delete';
  path: string[];
  value?: unknown;
}
```

## Impact

- **Affected files**：
  - `src/game/session/session_goal_tracker.ts`（B4 claimReward 签名变更）
  - `src/core/simulation/daily_task.ts`（B4 验证/改造）
  - `src/game/session/reward_applier.ts`（新建，统一奖励发放）
  - `src/game/game_runner.ts`（B4/B5 传入 state/action 字段）
  - `src/core/simulation/types.ts`（B5 trade action 含 amount；B9 StatePatch 类型）
  - `src/game/modes/quick_battle.ts`（B6 归档持久化）
  - `src/game/modes/classic.ts`（B7 存档策略）
  - `src/core/simulation/state_manager.ts`（B9 applyPatches 实现）
- **Interface changes**：
  - SessionGoalTracker.claimReward 签名增加 state 参数
  - PlayerAction trade 已有 amount 字段（验证即可）
  - StateManager 接口增加 applyPatches 方法
- **Determinism**：patches 是确定性的（给定 patches 序列，应用后 state 确定），不影响主循环确定性
- **Platform**：使用 platform 存储 API（tt.setStorageSync 或 fallback 内存），非 tt 环境优雅降级
- **Tests**：
  - reward_applier 单测（clamp 逻辑正确）
  - session_goal_tracker 领取奖励后 stockpile 验证
  - state_manager patches 应用/回滚测试

---

## Requirements

### Requirement: 奖励正确发放

- **WHEN** 玩家点击领取已完成的会话目标/每日任务奖励
- **THEN** stockpile.political / 对应资源增加 reward.amount
- **AND** 超过 cap 的部分被 clamp
- **AND** goal/task 标记为 claimed，不可重复领取

### Requirement: trade 目标按交易量计数

- **WHEN** 玩家或助理触发 trade
- **THEN** gather_resource 目标的 current 按实际交易量累加
- **AND** 目标达成时 progress 显示正确比例

### Requirement: QuickBattle 归档持久化

- **WHEN** 快速对局结束
- **THEN** 归档元信息写入 platform 存储（key: `qb_<archiveId>`）
- **AND** 游戏重启后归档列表仍可见
- **AND** 非 tt 环境降级为内存存储（不抛错）

### Requirement: Classic 存档不丢失

- **WHEN** 关键事件发生或距上次存档 ≥60 tick
- **THEN** 全量快照写入 platform 存储
- **AND** 加载时取最新快照
- **AND** 环形缓冲保留最近 N=10 个存档（防存档损坏）

### Requirement: Patches 基础能力

- **WHEN** 调用 stateManager.applyPatches(patches)
- **THEN** patches 按顺序应用到 state
- **AND** set 操作支持对象路径（countries.X.stability、stockpiles.X.political 等）
- **AND** delete 操作支持移除 SortedMap 条目或对象字段
