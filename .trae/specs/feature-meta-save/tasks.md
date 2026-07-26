# Tasks（feature-meta-save）

> B4 奖励发放 + B5 trade 计数 + B6 归档持久化 + B7 增量存档 + B9 patches 回滚
> 回归红线：每步后 `npx tsc --noEmit`（零错）+ `npx vitest run`（全过）。

---

## T0：RewardApplier 统一工具（B4 基础）

- [ ] **T0.1**：新建 `src/game/session/reward_applier.ts`
  - 定义 `SessionGoalReward` 已有，无需新类型
  - 实现 `applyReward(state: WorldState, countryId: string, reward: { political?: Fixed; resources?: Partial<Record<ResourceType, Fixed>> }): void`
  - 逻辑：取 stockpile，political += reward.political（clamp 到 caps.political）；resources 逐项 +=（clamp 到对应 cap）
  - 使用 reserveCap 取 cap？M1 简化：直接用 stockpile.caps（不含仓储加成）
- [ ] **T0.2**：新建 `src/game/session/reward_applier.test.ts` 验证 clamp/累加正确
- [ ] **T0.3**：运行测试通过

---

## T1：B4 奖励发放到 WorldState

- [ ] **T1.1**：SessionGoalTracker.claimReward 签名改为 `claimReward(goalId: string, state: WorldState): SessionGoalReward | null`
  - 调用 RewardApplier.applyReward 发奖
  - 标记 goal.claimed = true
- [ ] **T1.2**：game_runner.ts onClaim 回调改为 `this.sessionTracker.claimReward(goalId, this.state)`
- [ ] **T1.3**：检查 daily_task.complete 方法当前是否已发奖
  - 若已发：保持一致（也用 RewardApplier 避免重复代码）
  - 若未发：同样改为用 RewardApplier
  - game_runner.ts onClaim 回调去掉冗余注释
- [ ] **T1.4**：运行现有测试全部通过

---

## T2：B5 trade 目标精确计数

- [ ] **T2.1**：检查 types.ts 中 trade PlayerAction 定义，确认 amount 字段类型
  - 若有 amount 字段（Fixed/number）：直接用
  - 若无：添加 `amount: Fixed`（资源量）字段到 trade action
- [ ] **T2.2**：simulation.applyAction case 'trade' 中，构造 action 时填实际交易量
  - 交易量为 Fixed.fromInt(50)（对应 TRADE_OUTPUT 常量，与 feature-factory-economy 对齐）
  - 注：feature-factory-economy 的 autoTrade 是自动任务，不经过 PlayerAction；手动 trade action 才计数
- [ ] **T2.3**：session_goal_tracker.updateProgress case 'trade'：
  - 改为 `goal.current += action.amount.toInt()`（或按 Fixed 累加，根据 target 单位）
  - M1 简化：target 单位是"资源单位整数"，用 toInt() 累加
- [ ] **T2.4**：更新 SessionGoal 类型中 current/target 的类型说明
- [ ] **T2.5**：运行回归

---

## T3：B6 QuickBattle 归档持久化

- [ ] **T3.1**：查看 quick_battle.ts 当前 archiveGame 方法和 QuickBattleSave 结构
- [ ] **T3.2**：添加持久化方法：
  - `private persistArchive(save: QuickBattleSave): void`
  - key = `qb_${save.id}`
  - 使用 tt.setStorageSync（try/catch 包裹，非 tt 环境静默 noop）
  - 参考 cosmetics.ts 的持久化模式
- [ ] **T3.3**：添加 `loadArchives(): QuickBattleSave[]` 方法
  - 遍历 tt.getStorageInfoSync().keys，过滤前缀 `qb_`，批量 tt.getStorageSync
  - 反序列化为 QuickBattleSave[]
  - 非 tt 环境返回内存数组
- [ ] **T3.4**：archiveGame 末尾调用 persistArchive
- [ ] **T3.5**：ModeManager/QuickBattleMode 启动时调用 loadArchives 填充历史
- [ ] **T3.6**：运行回归

---

## T4：B7 Classic 存档策略

- [ ] **T4.1**：查看 classic.ts 当前 save/load 实现
- [ ] **T4.2**：添加自动存档节流：
  - 私有字段 `ticksSinceLastSave = 0`
  - AUTO_SAVE_INTERVAL = 60（每 60 tick 存一次，约 6 秒@10Hz × speed=1）
  - 关键事件即时存档：focusCompleted/disputeInitiated/provinceControlled 事件触发时 ticksSinceLastSave = AUTO_SAVE_INTERVAL 强制触发
- [ ] **T4.3**：环形缓冲：
  - 存档 key 用 `classic_${slotId}_${index}`，index 循环 0-9
  - 保存时写入 `classic_${slotId}_${currentIndex}` 后 currentIndex = (currentIndex+1) % 10
  - 加载时遍历所有 key 取最新（读 timestamp 字段）
- [ ] **T4.4**：删除 TODO 注释，补全关键事件触发存档逻辑
  - 在 classic.ts 的 update/step 循环中检测 events 列表中是否包含关键 kind
- [ ] **T4.5**：运行回归

---

## T5：B9 state_manager patches 字段级回滚

- [ ] **T5.1**：新建 `src/core/simulation/patch.ts`（或放 state_manager.ts 内）定义 StatePatch 类型：
  ```typescript
  export interface StatePatch {
    op: 'set' | 'delete';
    path: string[];
    value?: unknown;
  }
  ```
- [ ] **T5.2**：DefaultStateManager 添加 `applyPatches(patches: StatePatch[]): void` 方法
  - 循环 patches，根据 op 和 path 写入 state
  - 路径解析支持：
    - ['countries', cid, 'stability'] → state.countries.get(cid).stability = value
    - ['stockpiles', cid, 'political'] → state.stockpiles.get(cid).political = value as Fixed
    - ['stockpiles', cid, 'resources', 'steel'] → 同上（resources 是内嵌对象还是字段？看 Stockpile 定义）
    - ['buildings', bid] 配合 op:'delete' → state.buildings.delete(Number(bid))
    - ['factories', fid, 'taskId'] → state.factories.get(Number(fid)).taskId = value as string | null
    - ['constructionQueues', cid, 'items', idx, ...] → 深层字段
  - M1 简化：只支持本 spec 需要的路径（stockpile political/resources、factory taskId/state、constructionQueue items），其他路径抛错或 noop
- [ ] **T5.3**：在 interfaces.ts StateManager 接口添加 applyPatches 方法签名
- [ ] **T5.4**：state_manager.test.ts（新建或追加）测试：
  - set stockpile.political 生效
  - set factory.taskId 生效
  - delete building 生效
  - 多 patches 按顺序应用
- [ ] **T5.5**：运行回归（确定性测试必须通过，patches 本身不参与 hash，hash 是基于最终 state）

---

## T6：最终验证

- [ ] **T6.1**：`npx tsc --noEmit` 零错
- [ ] **T6.2**：`npx vitest run` 全过（含新增测试）
- [ ] **T6.3**：快速对战 smoke：完成一个会话目标→领奖励→stockpile 正确增加
- [ ] **T6.4**：刷新页面后快速对战归档仍可见（tt 环境）
- [ ] **T6.5**：助理操作撤销（如果已使用 patches）能正确回滚
