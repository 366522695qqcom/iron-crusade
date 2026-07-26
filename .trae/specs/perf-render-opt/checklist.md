# Checklist（perf-render-opt）

## 编译与测试
- [ ] `npx tsc --noEmit` 零错误
- [ ] `npx vitest run` 全部 39 个用例通过
- [ ] hash 确定性测试通过（渲染层改动不影响 hash）
- [ ] simulation 联机一致性测试通过（200 帧两实例 hash 相等）

## 脏标记覆盖率
- [ ] top_bar 资源条进度条有 lastRatio 脏检查
- [ ] top_bar update 路径不调用 drawResourceIcon
- [ ] factory_panel 卡片有 lastAccent 检查（accent 不变不重绘整卡）
- [ ] 其余 6 个面板进度条/数值均有脏检查
- [ ] colorEquals 工具函数被使用（至少 combat_panel/factory_panel 的 accent 比较用它）

## Label 缓存
- [ ] 每个数值型 Label（资源数、进度%、tick、统计数）赋值前有文本比对
- [ ] 静态标题 Label（如 "工厂"、"建造"）不做缓存（不变化的跳过即可，不强制）

## Shadow 对象池
- [ ] 所有 readXxxShadow 支持 out 参数原地写入
- [ ] game_runner.pushShadows 使用 pooled shadow 实例
- [ ] grep `new\s+FactoryShadow|new\s+MainUiShadow|new\s+CombatPanelShadow` 在 render 层无残留（测试代码除外）
- [ ] panel.update 中无 `this.xxx = shadow` 跨帧持有

## 脉冲动画
- [ ] 建造面板打开时脉冲播放，关闭时停止
- [ ] stop 时所有省份边框恢复正常 alpha
- [ ] 动画不影响非建造面板的帧率

## 行为零变化
- [ ] 快速对局 200 tick 后 UI 显示数值与优化前一致
- [ ] 面板切换无视觉闪烁
- [ ] 助理开关/建造/工厂分配等交互反馈无延迟
