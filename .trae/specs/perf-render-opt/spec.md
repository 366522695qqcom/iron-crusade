# Spec: 渲染层性能优化（perf-render-opt）

> 变更类型：纯性能优化（零行为变化）
> 前置依赖：optimize-performance P1 阶段已完成（Fixed 常量、主循环合并、Assistant 单次 tick 等）
> 目标：中端安卓机渲染帧耗时从 ~16ms 降至 ≤10ms，配合已完成的模拟层优化实现 FPS≥50

## Why

P1 阶段已把模拟层每帧 Fixed 分配、冗余遍历、无效 Map.set 等热点消除，但渲染层仍然是每帧"全量重绘"模式：
1. 每个面板的 `update()` 方法无条件调用 `drawProgressBar/drawCard/drawResourceIcon` 等 Graphics 绘制函数，即使数值未变
2. 每个 `Label.string =` 无条件赋值，即使文本未变也触发 Cocos 内部脏标记和重排
3. `readMainUiShadow` 等 shadow 读取函数每帧 new 大量 shadow 对象和中间数组，GC 压力集中在渲染帧
4. `top_bar` 中静态资源图标（颜色固定）在 update 路径中重复调用 `drawResourceIcon`

Graphics 绘制调用是 Cocos Creator 中开销最大的操作之一（每帧清空 + 重绘路径 + 顶点重建），Label 字符串赋值也会触发排版。未变化时跳过这些调用可减少 60-70% 的渲染帧 CPU 开销。

## What Changes

### A1: UI 面板 Graphics 脏标记

8 个面板各自在其 handle 结构中添加"上一次渲染值"缓存字段，`update()` 方法对比新旧值，仅在变化时才调用对应 draw 函数：

- [top_bar.ts](file:///workspace/src/render/ui/top_bar.ts)：资源条进度条 `lastRatio/lastBarColor`、面板 `lastResType`；静态资源图标在 mount 时绘制一次，update 路径移除
- [factory_panel.ts](file:///workspace/src/render/ui/panels/factory_panel.ts)：工厂卡片进度条 `lastRatio/lastAccent`；accent 未变时跳过 `drawCard` 重绘，仅更新进度条
- [focus_panel.ts](file:///workspace/src/render/ui/panels/focus_panel.ts)：焦点卡片 `lastProgress/lastSelected`
- [research_panel.ts](file:///workspace/src/render/ui/panels/research_panel.ts)：科研槽进度条 `lastRatio/lastNodeName`
- [combat_panel.ts](file:///workspace/src/render/ui/panels/combat_panel.ts)：争端卡片 `lastAccent`、师团图标 `lastCount`
- [session_goal_card.ts](file:///workspace/src/render/ui/panels/session_goal_card.ts)：目标进度条 `lastRatio/lastClaimed`
- [daily_task_panel.ts](file:///workspace/src/render/ui/panels/daily_task_panel.ts)：任务进度条 `lastRatio/lastClaimed`
- [assistant_panel.ts](file:///workspace/src/render/ui/panels/assistant_panel.ts)：状态文字、统计卡数值脏标记

脏标记粒度："整卡片重绘"和"仅进度条更新"两级，避免整个卡片每次都重绘所有 Graphics。

辅助工具：在 [graphics_util.ts](file:///workspace/src/render/core/graphics_util.ts) 添加 `colorEquals(a, b): boolean` 工具函数，避免颜色比较的样板代码。

### A2: Label 字符串缓存

同 8 个面板中所有 `label.string = xxx` 赋值前增加比对：
- 每个 handle 添加 `lastText: Map<string, string>` 或扁平 `lastXxxText` 字段
- 赋值前 `if (handle.lastXxxText === newText) return; handle.lastXxxText = newText; label.string = newText;`
- 特别关注数值类 Label（资源数、进度百分比、tick 数），它们变化频率高但很多帧是相同值

### A5: Shadow 对象池（原地复用）

在 [shadow_reader.ts](file:///workspace/src/render/core/shadow_reader.ts) 中，将每帧 new 的 shadow 对象改为模块级单例复用：

- 模块级持有 `pooledMainUiShadow: MainUiShadow`、`pooledFactoryPanelShadow: FactoryPanelShadow`、`pooledCombatPanelShadow: CombatPanelShadow` 等实例
- `readXxxShadow()` 函数接收一个"输出目标"参数，原地写入字段，不 new 新对象
- 集合类型字段（factories[]、divisions[]、disputes[] 等）采用"先清空 length=0，再 push 新元素"模式复用数组
- **安全约束**：所有 panel.update() 方法必须确认是同步消费 shadow，不把引用存到 panel 实例字段上。验证方式：grep 搜索 `this.xxxShadow = shadow` 模式，确认不存在。

提供向后兼容的函数重载：旧的 `readXxxShadow(state, countryId)` 签名仍保留（内部委托到池化版本），不破坏现有调用方。

### B10: 可建造省份脉冲动画（附随）

在 [province_view.ts](file:///workspace/src/render/map/province_view.ts#L153) 中为可建造省份（buildable=true）添加绿色脉冲动画：
- 使用 cc.tween 对边框透明度做 0.4↔1.0 的往返循环
- 替代当前静态加粗描边
- 仅在建造面板打开时激活，关闭面板时停止 tween（减少无面板时的动画开销）

## Impact

- **Affected files**：
  - `src/render/core/graphics_util.ts`（新增 colorEquals）
  - `src/render/core/shadow_reader.ts`（对象池重写）
  - `src/render/ui/top_bar.ts`
  - `src/render/ui/panels/{factory_panel,focus_panel,research_panel,combat_panel,session_goal_card,daily_task_panel,assistant_panel}.ts`
  - `src/render/map/province_view.ts`（B10 动画）
- **Behavior**：零行为变化，确定性测试（simulation/hash 测试）不受影响（不修改 core/simulation 层）
- **Performance target**：60 帧/s 设备每帧渲染耗时 ≤10ms；GC 频率从每帧 1 次降至 ≤5 帧 1 次

---

## Requirements

### Requirement: Graphics 脏标记不产生视觉差异

- **WHEN** 帧间 shadow 数值未变化
- **THEN** 对应 Graphics 节点不重新调用 draw 函数
- **AND** 屏幕视觉与全量重绘完全一致（无残留旧帧像素）

### Requirement: Label 缓存不改变显示文本

- **WHEN** 文本内容未变化
- **THEN** 不重新赋值 label.string
- **AND** Label 显示文本始终与 shadow 数据一致

### Requirement: Shadow 对象池不破坏跨帧引用

- **WHEN** panel.update(shadow) 同步消费 shadow
- **THEN** shadow 字段值在 update 返回前是稳定的
- **AND** 任何异步回调/定时器不得持有 shadow 引用

### Requirement: 可建造脉冲动画性能受控

- **WHEN** 建造面板关闭
- **THEN** 所有省份脉冲 tween 停止
- **AND** 面板打开时脉冲动画 ≤20 个省份同时播放（仅可见省份）
