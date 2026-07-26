# Tasks（optimize-for-launch）

> 按 S/A/B/C 优先级组织。S 级生死线优先，A 级 MVP 核心，B 级体验变现，C 级后期扩展。
> 文档更新任务（T0）与代码任务并行，T0 先行解锁代码任务的依赖。
> 注：落地成本（实时帧同步 / 服务器成本）相关优化暂不在本 spec 范围内，联机方案保持原设计。

---

## T0：文档基线更新（解锁代码任务依赖）

- [x] **T0.1**：更新 PROJECT.md 第 1 章项目定位——加入双模式分层定位、玩法重心倾斜（工业经营为核心卖点）
- [x] **T0.2**：更新 PROJECT.md 第 3 章玩法设计——新增 3.11 双模式分层、3.12 助理模式、3.13 新手引导、3.14 单次会话目标、3.15 每日任务体系
- [x] **T0.3**：更新 PROJECT.md 第 4 章世界观——删除意识形态标签，替换为发展路线（工业集权/公社共治/联邦共和）；弱化历史强暗示
- [x] **T0.4**：更新 PROJECT.md 第 3.7/3.9 节 + 全文术语——宣战→区域争端、占领→管控、伤亡→撤离、战争支持度→争端决心
- [x] **T0.5**：更新 PROJECT.md 第 8 章商业化——新增每日补给箱、离线收益双倍广告位
- [x] **T0.6**：更新 PROJECT.md 第 9 章审核合规——保留真实国界（用户明确要求），补充题材脱敏清单（意识形态/战争术语/历史强关联元素）
- [x] **T0.7**：更新 PROJECT.md 第 10 章开发里程碑——重排为 M1 单机核心（含助理/快速对局/新手引导）→ M2 系统补全+每日任务+广告 → M3 实时联机 → M4 联机存档 → M5 商业化 → M6 审核
- [x] **T0.8**：更新技术设计文档第 1 章架构——新增 `core/simulation/assistant.ts`、`core/simulation/daily_task.ts`、`game/modes/`、`game/onboarding/`、`platform/notify/` 到目录结构
- [x] **T0.9**：更新技术设计文档第 7.3 节包体管控——主包目标 ≤3MB（预留 ≥1MB 冗余），UI 代码绘制为主
- [x] **T0.10**：更新技术设计文档第 10 章开发里程碑——与 PROJECT.md 同步重排

---

## S 级：审核合规优化（生死线）

- [x] **S.1**：重构 `Country.ideology` 枚举——删除 `'fascist' | 'communist' | 'democratic'`，替换为 `developmentPath: 'industrial_authoritarian' | 'communal' | 'federal_republic'`
  - [x] S.1.1：更新 core/state/world_state.ts 的 Country 接口
  - [x] S.1.2：更新所有引用 ideology 的代码（焦点树分支条件、AI 决策、外交）
  - [x] S.1.3：更新配置文件 schema（焦点树、国家初始属性）
- [x] **S.2**：战争术语全局替换
  - [x] S.2.1：替换 PlayerAction 联合类型中的 `declareWar` → `initiateDispute`、字段 `targetCountryId` 保留
  - [x] S.2.2：替换 GameEvent 中的 `provinceOccupied` → `provinceControlled`、`combatResolved` → `disputeResolved`
  - [x] S.2.3：替换 UI 文案（宣战→区域争端、占领→管控、伤亡→撤离、战争支持度→争端决心）— UI 层待 A 级实现时落地
  - [x] S.2.4：更新附录 C.2 二进制编码的 kind 枚举注释 — types.ts 注释已说明编码值不变
- [x] **S.3**：弱化历史强暗示
  - [x] S.3.1：审查 PROJECT.md 4.3 领袖代号、4.4 装备命名，删除可直接对应真实历史的强关联元素（保留风格）— T0.3 已完成
  - [x] S.3.2：更新配置文件中的领袖/装备 flavor 文本 — configs/countries.json 已落实
- [x] **S.4**：玩法重心倾斜（延后至 A 级 UI 阶段，依赖 UI 代码骨架）
  - [x] S.4.1：调整新手引导顺序，工业与资源优先教学，战斗延后 — A.3 Day1(资源工厂)/Day2(生产部署)/Day3(作战外交) 按日拆解已落实
  - [x] S.4.2：调整主界面入口，工业建设模块视觉权重高于作战模块 — `src/render/ui/bottom_bar.ts` 读取 `BOTTOM_BAR_ENTRIES` 视觉权重表（`src/render/core/ui_theme.ts`）：工业类（建造/工厂/资源/科研）宽 ×1.3、字号 INDUSTRY_LABEL(28px)、INDUSTRY_PALETTE 暖色高饱和；作战类（作战/外交）宽 ×1.0、字号 COMBAT_LABEL(20px)、COMBAT_PALETTE 冷色低饱和；顺序工业在前作战在后；`setCombatEntriesEnabled(false)` 支持 Day1/Day2 战斗入口禁用（链 S.4.1）；`MainUi._wireBottomBar()` 将 7 个入口点击事件接线到对应面板 toggle（build→building, factory→factory, resource→resource, research→research, focus→focus, combat→combat, diplomacy→diplomacy）

---

## A 级：MVP 核心玩法体验

- [x] **A.1**：实现快速对局模式
  - [x] A.1.1：设计快速对局存档结构（独立于经典存档，单局结束即归档）— `game/modes/quick_battle.ts` QuickBattleSave
  - [x] A.1.2：实现快速对局预设建筑与发展路线配置 — `configs/quick_battle_presets.json`
  - [x] A.1.3：实现模式切换 UI 与存档隔离逻辑 — `game/modes/mode_manager.ts` DefaultModeManager（存档隔离已实现，UI 部分延后至 UI 阶段）
  - [x] A.1.4：实现首局完成后的经典模式导流引导 — `QuickBattleMode.markClassicGuideShown` + `ModeManager.shouldShowClassicGuide`
- [x] **A.2**：实现助理模式
  - [x] A.2.1：扩展 core/ai/ 行为树，新增 AssistantBehaviorTree（复用附录 B.2 联机 AI 接管核心，参数更保守）— `core/ai/assistant_behavior_tree.ts`
  - [x] A.2.2：实现 core/simulation/assistant.ts 接口（enable/disable/autoAssignFactories/autoScheduleSupply/autoDefend）— `core/simulation/assistant.ts` DefaultAssistantSystem
  - [x] A.2.3：实现助理操作的可撤销机制（记录助理操作日志，玩家可回退）— `DefaultAssistantSystem.undo` + rollback 字段
  - [x] A.2.4：实现助理模式开关 UI 与「助理已分配 X 座工厂」提示 — `src/render/ui/panels/assistant_panel.ts`：开关按钮（toggle 当前态切换 enable/disable）+ 状态标签「助理已分配 X 座工厂」+ 三项统计卡（空闲工厂/调度补给/待布防）+ 4 行操作日志（每行带撤销按钮，回调 `onToggle` / `onUndo`）；`AssistantPanelShadow` 由 game 层从 `AssistantSystem.getOperationLog()` 转换注入；MainUi 已挂载并通过 `updateAssistant()` 单独刷新
- [x] **A.3**：实现阶梯式新手引导
  - [x] A.3.1：设计 Day1/Day2/Day3 任务配置 schema — `configs/onboarding_day{1,2,3}.json` + `game/onboarding/onboarding_schema.ts`
  - [x] A.3.2：实现 game/onboarding/ 引导流程控制器 — `game/onboarding/onboarding_controller.ts` DefaultOnboardingController
  - [x] A.3.3：实现功能锁定/解锁逻辑（未到 Day 不解锁）— `unlockedFeatures` Set + `canUnlock` 链式校验
  - [x] A.3.4：实现引导 UI（高亮、气泡、遮罩）— `src/render/ui/overlays/onboarding_overlay.ts` 实现：`drawOverlay` 半透明全屏遮罩（0.55 alpha）+ `drawHighlightFrame` 高亮目标框（4px INDUSTRY_PALETTE.primary 描边）+ 引导气泡面板（标题/正文/步骤/下一步/跳过）；`show(text, target?)` 接受 OnboardingGuideText + HighlightRect；与 `game/onboarding/onboarding_controller.ts` 的 getGuideText 接口对接
- [x] **A.4**：实现单次会话目标
  - [x] A.4.1：实现会话目标动态生成算法（基于存档进度）— `game/session/session_goal.ts` DefaultSessionGoalGenerator
  - [x] A.4.2：实现目标卡片 UI 与完成奖励发放 — `game/session/session_goal_tracker.ts` claimReward（奖励发放逻辑）+ `src/render/ui/panels/session_goal_card.ts`（UI 卡片：3 个并列目标卡，含描述/进度条/数值/奖励摘要/领取按钮，`updateGoals(views)` 接受 SessionGoalCardView[]）
- [x] **A.5**：实现关键事件召回推送
  - [x] A.5.1：封装 platform/notify/ 抖音订阅消息推送 — `platform/notify/douyin_notify.ts` DefaultDouyinNotifyChannel
  - [x] A.5.2：实现推送触发条件检测（焦点完成/工厂空闲 30min/遭遇争端）— `platform/notify/notify_trigger.ts` DefaultNotifyTriggerDetector
  - [x] A.5.3：实现推送频率限制（每日 ≤2 条）— `platform/notify/notify_scheduler.ts` DefaultNotifyScheduler（含北京时间切日 + 4h 去重）
  - [x] A.5.4：实现推送点击直达对应界面 — `NotifyRequest.deepLinkTarget` + `decodeDeepLinkTarget`（UI 路由部分延后）

---

## B 级：体验变现

- [x] **B.1**：实现每日任务体系
  - [x] B.1.1：设计每日任务配置 schema（建造/生产/作战三类）— `configs/daily_tasks.json` + `DailyTaskPoolConfig` 类型
  - [x] B.1.2：实现 core/simulation/daily_task.ts（刷新/进度/完成/奖励）— `DefaultDailyTaskSystem`
  - [x] B.1.3：实现北京时间 0:00 刷新逻辑 — `static beijingDateKey` + `checkRefresh` + 未完成不累计
  - [x] B.1.4：实现任务 UI（进度条、领取奖励）— `src/render/ui/panels/daily_task_panel.ts`：3 张任务卡（建造/生产/作战各 1），每张含类型标签/标题/进度数值/进度条/奖励摘要/领取按钮；S.4.2 类型配色（建造/生产用 INDUSTRY_PALETTE，作战用 COMBAT_PALETTE）；完成态进度条转 success 绿，已领奖按钮显示「已领」；`updateDate(dateKey)` + `updateTasks(views)` 双刷新；MainUi 已挂载并通过 `updateDailyTasks()` 单独刷新
- [x] **B.2**：广告位温和化
  - [x] B.2.1：实现「每日补给箱」广告位（看广告领随机资源，每日 1 次）— `platform/ads/daily_supply_box.ts` DefaultDailySupplyBox
  - [x] B.2.2：实现「离线收益双倍」广告位（看广告使离线期间资源产出翻倍）— `platform/ads/offline_double.ts` DefaultOfflineDoubleBonus
  - [x] B.2.3：更新 platform/ads/ 适配新广告位 — `platform/ads/ads_manager.ts` DefaultAdsManager 单例 + ads_types + setEnabled 联机无广告开关

> **REMOVED（被 commerce-redesign spec 取代）**：B.2.1 / B.2.2 的「每日补给箱」「离线收益双倍」代码已删除（违反「不卖数值」原则）；B.2.3 的 AdsManager 单例 + setEnabled 联机开关保留并复用。商业化策略已重设计为「全面不卖数值、局内无任何广告、局外通过外观/内容广告变现」，详见 `commerce-redesign` spec。
- [x] **B.3**：联机奖励回流（沿用 PROJECT.md 5.3 现有设计）
  - [x] B.3.1：校验联机胜利奖励发放到单机存档的逻辑（+500 政治点）— 修复双写不一致（仅写 `stockpile.political`）+ 补 clamp 到 `caps.*` + `simulation/index.ts` 导出

---

## C 级：后期扩展（按原里程碑推进）

- [ ] **C.1**：实时帧同步联机 MVP（沿用技术设计文档第 5 章 + 附录 B/C 原设计）
  - [ ] C.1.1：搭建信令服务器（技术设计文档 9.1）
  - [ ] C.1.2：实现 Host 权威帧提交（5.2）
  - [ ] C.1.3：实现 1v1 房间 + drop in/out + AI 接管
  - [ ] C.1.4：实现断线重连
- [ ] **C.2**：联机存档（沿用技术设计文档 5.3 + 6.4 原设计）
  - [ ] C.2.1：Host 存档 + 服务器快照
  - [ ] C.2.2：host 迁移
  - [ ] C.2.3：存档续玩
- [ ] **C.3**：完整国策树（每国家完整焦点树设计）
- [ ] **C.4**：多国家剧本分包

---

## 技术落地优化（贯穿各阶段）

- [ ] **T.1**：包体管控
  - [ ] T.1.1：地图矢量简化阈值严控（附录 D.1，主包地图 ≤500KB）
  - [x] T.1.2：UI 代码绘制为主，严控纹理资源量 — `src/render/` 全部 UI 通过 `cc.Graphics` 代码绘制（drawPanel/drawButton/drawCard/drawProgressBar/drawResourceIcon/drawOverlay/drawHighlightFrame）+ `cc.Label` 文本；grep 确认 render/ 层无 SpriteFrame/Texture2D/.png/.jpg/.webp 任何纹理资源引用，主包纹理资源量=0
  - [ ] T.1.3：主包目标 ≤3MB，非核心资源全分包
  - [ ] T.1.4：构建产物体积监控（CI 校验）
- [ ] **T.2**：确定性能力前置
  - [x] T.2.1：单机阶段即落地 Fixed/PRNG/SortedMap（附录 C.1）— `src/core/determinism/{fixed,prng,sorted_map}.ts` 全部 core/ 代码使用 Fixed
  - [x] T.2.2：单机阶段即落地固定 tick + CI 哈希校验（附录 C.3.7）— `package.json` + `vitest.config.ts` 已落地（vitest 1.6.1）；`npm test` 跑 5 个测试文件 39 个用例全过：`fixed.test.ts`(11) 验 Q16.16 运算+大数边界+跨运行一致；`prng.test.ts`(8) 验 xorshift32 同 seed 同序列+零种子兜底+联机同步；`sorted_map.test.ts`(7) 验 key 升序遍历+delete 后仍升序+跨引擎一致；`hash.test.ts`(6) 验同 state 多次哈希相等+改字段必变 hash+SortedMap 插入顺序不影响 hash；`simulation.test.ts`(7) 验两独立实例同输入序列每帧 hash 相等+200 帧压力测试+snapshot/restore hash 一致
  - [x] T.2.3：ESLint 规则禁止 core/ 用浮点/Math.random（附录 C.1.5）— `.eslintrc.json` 已配置 Math 全局禁用 + Math.random 语法禁用 + cc import 禁用；裸 number 检测依赖 code review（ESLint 无法静态精确检测）

---

# Task Dependencies

- **T0（文档基线）** 必须先于所有代码任务完成，提供数据结构定义与术语规范
- **S.1（ideology 重构）** 是 BREAKING 变更，必须先于 A/B 级任务
- **S.2（术语替换）** 影响 PlayerAction/GameEvent，必须先于 A.1/A.2
- **A.2（助理模式）** 依赖附录 B.2 联机 AI 行为树已定义
- **A.3（新手引导）** 依赖 A.1（快速对局模式）作为载体
- **C.1（实时联机）** 依赖 T.2（确定性能力前置）
- **T.1/T.2（技术落地）** 贯穿所有阶段，单机阶段即开始

## 可并行任务

- T0.3/T0.4（世界观脱敏 + 术语替换）可并行
- A.1/A.2/A.3/A.4/A.5（快速对局/助理/引导/会话目标/推送）在 S 级完成后可并行
- B.1/B.2/B.3（每日任务/广告/联机回流）在 A 级完成后可并行
