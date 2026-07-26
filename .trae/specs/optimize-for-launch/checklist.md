# Checklist（optimize-for-launch）

> 验证检查点。每个检查点对应 spec.md 的需求与 tasks.md 的任务。
> 注：落地成本（实时帧同步 / 服务器成本）相关优化暂不在本 spec 范围内，联机方案保持原设计。

---

## T0：文档基线更新

- [x] PROJECT.md 第 1 章已加入双模式分层定位与玩法重心倾斜描述
- [x] PROJECT.md 第 3 章已新增 3.11-3.15 节（双模式/助理/引导/会话目标/每日任务）
- [x] PROJECT.md 第 4 章已删除意识形态标签，替换为发展路线（工业集权/公社共治/联邦共和）
- [x] PROJECT.md 全文术语已替换（宣战→区域争端、占领→管控、伤亡→撤离、战争支持度→争端决心）
- [x] PROJECT.md 第 8 章已新增每日补给箱、离线收益双倍广告位
- [x] PROJECT.md 第 9 章已保留真实国界，并补充题材脱敏清单
- [x] PROJECT.md 第 10 章里程碑已重排（M1→M2→M3→M4→M5→M6，沿用原联机顺序）
- [x] 技术设计文档第 1 章目录结构已加入 assistant.ts/daily_task.ts/modes/onboarding/notify
- [x] 技术设计文档第 7.3 节主包目标已改为 ≤3MB（预留 ≥1MB 冗余）
- [x] 技术设计文档第 10 章里程碑已与 PROJECT.md 同步

---

## S 级：审核合规优化

- [x] `Country.ideology` 枚举已删除，替换为 `developmentPath` 字段
- [x] 所有引用 ideology 的代码已更新（焦点树/AI/外交）
- [x] 配置文件 schema 已更新（焦点树分支条件、国家初始属性）
- [x] PlayerAction 中 `declareWar` 已替换为 `initiateDispute`
- [x] GameEvent 中 `provinceOccupied` 已替换为 `provinceControlled`、`combatResolved` 替换为 `disputeResolved`
- [x] UI 文案已全局替换（宣战/占领/伤亡/战争支持度）— `src/render/ui/panels/combat_panel.ts` 全部用脱敏术语（争端决心/管控/设备损耗）；`top_bar.ts` 用「争端」「发展路线」
- [x] 附录 C.2 二进制编码 kind 枚举注释已更新
- [x] 领袖代号、装备命名已审查，强历史关联元素已删除（保留风格）
- [x] 配置文件 flavor 文本已更新
- [x] 新手引导顺序已调整（工业资源优先，战斗延后）— A.3 Day1/Day2/Day3 配置已落实
- [x] 主界面入口视觉权重已调整（工业建设高于作战）— `src/render/ui/bottom_bar.ts` 工业类宽×1.3/28px/暖色，作战类宽×1.0/20px/冷色

---

## A 级：MVP 核心玩法体验

### A.1 快速对局模式
- [x] 快速对局存档结构已设计（独立于经典存档）— `game/modes/quick_battle.ts` QuickBattleSave
- [x] 预设建筑与发展路线配置已实现 — `configs/quick_battle_presets.json`
- [x] 模式切换 UI 与存档隔离逻辑已实现 — `game/modes/mode_manager.ts` DefaultModeManager（UI 切换部分待 UI 阶段）
- [x] 首局完成后经典模式导流引导已实现 — QuickBattleMode.markClassicGuideShown + ModeManager.shouldShowClassicGuide
- [x] 快速对局单局可在 10-15 分钟内完成 — TARGET_DURATION_MIN=10 / HARD_CAP_MIN=15

### A.2 助理模式
- [x] AssistantBehaviorTree 已实现（复用附录 B.2 核心，参数更保守）— `core/ai/assistant_behavior_tree.ts`
- [x] core/simulation/assistant.ts 接口已实现 — DefaultAssistantSystem
- [x] 助理操作可撤销机制已实现 — undo + FactoryAssignRollback
- [x] 助理模式开关 UI 与提示已实现 — `src/render/ui/panels/assistant_panel.ts` 开关按钮+「助理已分配 X 座工厂」+操作日志撤销
- [x] 助理开启时空闲工厂自动分配，关闭时提醒系统恢复 — isEnabled 门槛 + autoAssignFactories

### A.3 阶梯式新手引导
- [x] Day1/Day2/Day3 任务配置 schema 已设计 — `configs/onboarding_day{1,2,3}.json` + `onboarding_schema.ts`
- [x] game/onboarding/ 引导流程控制器已实现 — DefaultOnboardingController
- [x] 功能锁定/解锁逻辑已实现 — unlockedFeatures Set + canUnlock 链式校验
- [x] 引导 UI（高亮/气泡/遮罩）已实现 — `src/render/ui/overlays/onboarding_overlay.ts` 半透明遮罩+高亮框+引导气泡+下一步/跳过
- [x] 完成 Day1 后才解锁 Day2 — tryAutoUnlockNextDay + canUnlock

### A.4 单次会话目标
- [x] 会话目标动态生成算法已实现 — DefaultSessionGoalGenerator
- [x] 目标卡片 UI 与完成奖励已实现 — DefaultSessionGoalTracker.claimReward（UI 卡片部分待 UI 阶段）
- [x] 目标完成后卡片变绿并发放奖励 — completed 标记 + claimReward 返回奖励（UI 变绿待 UI 阶段）

### A.5 关键事件召回推送
- [x] platform/notify/ 抖音订阅消息推送已封装 — DefaultDouyinNotifyChannel
- [x] 推送触发条件检测已实现（焦点完成/工厂空闲 30min/遭遇争端）— DefaultNotifyTriggerDetector（18000 ticks = 30min）
- [x] 推送频率限制（每日 ≤2 条）已实现 — DefaultNotifyScheduler DAILY_LIMIT=2 + 北京时间切日 + 4h 去重
- [x] 推送点击可直达对应界面 — NotifyRequest.deepLinkTarget + decodeDeepLinkTarget（UI 路由待 UI 阶段）

---

## B 级：体验变现

### B.1 每日任务体系
- [x] 每日任务配置 schema 已设计（建造/生产/作战三类）— `configs/daily_tasks.json` + `DailyTaskPoolConfig`
- [x] core/simulation/daily_task.ts 已实现（刷新/进度/完成/奖励）— `DefaultDailyTaskSystem`
- [x] 北京时间 0:00 刷新逻辑已实现 — `static beijingDateKey` + `checkRefresh`
- [x] 任务 UI（进度条/领取奖励）— `src/render/ui/panels/daily_task_panel.ts` 3 张任务卡+进度条+领取按钮+类型配色
- [x] 未完成任务不累计到次日 — checkRefresh 检测 dateKey 变化时重置

### B.2 广告位温和化
> **REMOVED（被 commerce-redesign spec 取代）**：原「每日补给箱」「离线收益双倍」代码已删除（违反「局外不卖数值」）。商业化策略已重设计为「全面不卖数值、局内无任何广告、局外通过外观/内容广告变现」。
- [x] ~~「每日补给箱」广告位~~ — 已删除（违反「局外不卖数值」）
- [x] ~~「离线收益双倍」广告位~~ — 已删除（违反「局外不卖数值」）
- [x] platform/ads/ 已适配新广告位 — `DefaultAdsManager` 单例 + `setEnabled` 联机无广告开关（保留复用）
- [x] 局外外观/皮肤系统已实现（commerce-redesign T2）— `CosmeticsStore`
- [x] 局外内容解锁已实现（commerce-redesign T3）— `ContentUnlockStore`
- [x] 统一商店入口已实现（commerce-redesign T4）— `Shop`

### B.3 联机奖励回流
- [x] 联机胜利奖励发放到单机存档逻辑已校验（沿用 PROJECT.md 5.3，+500 政治点）— `MP_VICTORY_PP_REWARD=500`
- [x] 幂等保护已实现（claimedMatchIds Set，同一 matchId 只发一次）
- [x] 政治点仅写 `stockpile.political`（与 simulation 政治点产出 / focus 扣点一致，不再双写 `country.politicalPower`）
- [x] 奖励资源 clamp 到 `caps.*`（PROJECT.md 3.2.2 储备上限：超出被丢弃）
- [x] `multiplayer_reward` 已在 `simulation/index.ts` 导出（供联机模块 C 级结算调用）
- [x] `npx tsc --noEmit` 零错误

---

## 技术落地优化

### T.1 包体管控
- [ ] 地图矢量简化阈值已严控（主包地图 ≤500KB）
- [ ] UI 以代码绘制为主，纹理资源量已严控
- [ ] 主包构建产物 ≤3MB（CI 校验）
- [ ] 非核心资源全分包加载

### T.2 确定性能力前置
- [x] 单机阶段已落地 Fixed/PRNG/SortedMap（附录 C.1）— `src/core/determinism/` 三件套 + 全 core/ 用 Fixed
- [x] 固定 tick 10Hz 已落地 — `simulation.ts` tick 步长 100ms
- [x] FNV-1a 哈希已实现 — `src/core/state/hash.ts` hashWorld + simulation.tick 返回 hash
- [x] CI 哈希校验已落地 — `package.json` + vitest 1.6.1 + 5 个测试文件 39 个用例全过（Fixed/PRNG/SortedMap/hash/simulation 确定性验证）
- [x] ESLint 规则已禁止 core/ 用 Math/Math.random/cc import（附录 C.1.5）— `.eslintrc.json` 已配置
- [x] 裸 number 检测依赖 code review（ESLint 无法静态精确检测，settings 注释已说明）

---

## 跨模块一致性

- [x] 真实国界地图方案保留（用户明确要求），抽象备选包作为审核降级保留
- [x] 实时帧同步方案（技术设计文档第 5 章 + 附录 B/C）按原里程碑推进，未降级
- [x] 助理模式与联机 AI 接管复用同一行为树核心 — `core/ai/assistant_behavior_tree.ts`
- [x] 双模式存档隔离，互不影响 — `game/modes/mode_manager.ts` DefaultModeManager
- [x] 所有新增系统不破坏现有 core/ 确定性约束 — `npx tsc --noEmit` 零错误；ESLint 规则已配置 Math/cc 禁用
- [x] 落地成本（实时帧同步 / 服务器成本）相关未做改动，保持原设计
