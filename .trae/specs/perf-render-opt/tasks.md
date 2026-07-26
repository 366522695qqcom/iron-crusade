# Tasks（perf-render-opt）

> 渲染层脏标记 + Label 缓存 + Shadow 对象池 + 建造脉冲动画
> 回归红线：每个 Step 完成后 `npx tsc --noEmit`（零错误）+ `npx vitest run`（全过）。
> 核心测试：`hash.test.ts` / `simulation.test.ts` 必须保持全过（渲染层改动不触达 core 层）。

---

## T0：前置工具函数

- [ ] **T0.1**：在 `src/render/core/graphics_util.ts` 添加 `colorEquals(a: Color, b: Color): boolean`
  - 比较 a.r===b.r && a.g===b.g && a.b===b.b && a.a===b.a
  - 导出供所有 panel 使用

---

## T1：top_bar 脏标记（A1 入口样板）

- [ ] **T1.1**：查看 top_bar.ts 现有的 handle 结构和 updateResourceBar 方法
- [ ] **T1.2**：为资源条 progress 节点添加 `lastRatio` 字段，初始 -1
- [ ] **T1.3**：updateResourceBar 中仅当 ratio !== lastRatio 时调 drawProgressBar，更新 lastRatio
- [ ] **T1.4**：删除 update 路径中的 drawResourceIcon 调用（保留 mount 路径调用）
- [ ] **T1.5**：运行回归：`npx tsc --noEmit && npx vitest run`

---

## T2：7 个面板脏标记（A1 批量）

- [ ] **T2.1**：factory_panel.ts —— 每个工厂卡片 handle 添加 lastRatio/lastAccent
  - accent 未变时跳过 drawCard（drawCard 会全量重绘卡片背景、标签、按钮）
  - ratio 变化时只调 drawProgressBar（局部更新进度条，不重绘整卡）
- [ ] **T2.2**：focus_panel.ts —— handle 添加 lastProgress/lastSelected
- [ ] **T2.3**：research_panel.ts —— handle 添加 lastRatio/lastNodeName
- [ ] **T2.4**：combat_panel.ts —— handle 添加 lastAccent/lastDivisionCount
- [ ] **T2.5**：session_goal_card.ts —— handle 添加 lastRatio/lastClaimed
- [ ] **T2.6**：daily_task_panel.ts —— handle 添加 lastRatio/lastClaimed
- [ ] **T2.7**：assistant_panel.ts —— handle 添加 lastEnabled/lastIdleCount/lastSupplyCount/lastDefenseCount
- [ ] **T2.8**：运行回归：`npx tsc --noEmit && npx vitest run`

---

## T3：Label 字符串缓存（A2）

- [ ] **T3.1**：top_bar.ts 资源数 Label 添加 lastText 缓存
- [ ] **T3.2**：factory_panel.ts 工厂名/进度文本 Label 缓存
- [ ] **T3.3**：其余 6 个面板同步添加 Label 缓存
  - 模式：`if (handle.lastXxxText !== newText) { handle.lastXxxText = newText; label.string = newText; }`
- [ ] **T3.4**：运行回归：`npx tsc --noEmit && npx vitest run`

---

## T4：Shadow 对象池（A5）

- [ ] **T4.1**：确认所有 panel.update 不跨帧持有 shadow 引用
  - grep：`this\.\w*[Ss]hadow\s*=` 检查是否有 panel 把 shadow 存到实例字段
  - 如果有，改为本地变量消费
- [ ] **T4.2**：在 shadow_reader.ts 模块级创建 pooledMainUiShadow 及子结构
  - fields: country 用对象复用，factories/disputes/divisions 等数组用 `arr.length = 0; for(...) arr.push(...)` 模式
  - Fixed 值直接引用（Fixed 不可变）
- [ ] **T4.3**：重构 readMainUiShadow 签名为 `readMainUiShadow(state, countryId, out?: MainUiShadow): MainUiShadow`
  - out 存在时原地写入，不存在时 new 新对象（向后兼容）
- [ ] **T4.4**：同样重构 readFactoryPanel/readCombatPanel/readTopBar/readBuildingPanel/readResourcePanel/readFocusPanel/readResearchPanel/readAssistantPanel
- [ ] **T4.5**：game_runner.pushShadows 改为传入 pooled shadow 实例
- [ ] **T4.6**：运行回归：`npx tsc --noEmit && npx vitest run`
  - 重点关注 hash 测试不受影响（shadow_reader 不触达 hash）
  - 重点关注 simulation 确定性测试全过

---

## T5：可建造省份脉冲动画（B10）

- [ ] **T5.1**：在 province_view.ts 中为 buildable=true 的省份创建脉冲 tween
  - 目标：边框 Graphics 的 opacity（或 strokeColor.a）
  - tween 0.4s 到 alpha=0.4，再 0.4s 回 alpha=1.0，循环
  - 使用 cc.tween().repeatForever() 或 repeat(Infinity)
- [ ] **T5.2**：提供 startBuildablePulse() / stopBuildablePulse() 方法
- [ ] **T5.3**：在 building_panel open 时调用 start，close 时调用 stop
  - stop 时停止所有 tween 并恢复边框 alpha=1.0
- [ ] **T5.4**：运行回归：`npx tsc --noEmit && npx vitest run`

---

## T6：最终验证

- [ ] **T6.1**：`npx tsc --noEmit` 零错误
- [ ] **T6.2**：`npx vitest run` 全过（5 文件 39 用例，不新增测试）
- [ ] **T6.3**：grep 验证 render 层无 Graphics 无条件重绘
  - 预期：所有 panel.update 内 draw 调用前都有 if 脏检查
- [ ] **T6.4**：grep 验证 label.string 赋值前都有文本比对（数值 Label 必加，静态文本可免）
- [ ] **T6.5**：手动 smoke：快速对局运行 200 tick，观察面板显示无闪烁/数值错乱

---

# Task Dependencies

- T0（工具函数）先行
- T1/T2（脏标记）可并行，但 T1 先做作为样板
- T3（Label 缓存）依赖 T1/T2 完成（在同一 handle 结构上加字段）
- T4（对象池）相对独立，可与 T2/T3 并行，但建议在脏标记完成后做（避免同时大改文件冲突）
- T5（脉冲动画）完全独立，随时可做
- T6 依赖全部完成
