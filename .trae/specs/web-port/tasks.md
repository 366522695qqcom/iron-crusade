# HOI4-Mini 网页版改造 - The Implementation Plan (Decomposed and Prioritized Task List)

## [x] Task 1: 项目基础架构搭建
- **Priority**: high
- **Depends On**: None
- **Description**: 
  - 初始化 Vite + React + TypeScript 项目配置
  - 配置 package.json 脚本（dev/build/test/preview）
  - 配置 tsconfig.json 支持 React 和现有路径别名
  - 配置 vitest 集成现有测试
  - 创建基础目录结构
  - 创建 HTML 入口文件
- **Acceptance Criteria Addressed**: AC-1, AC-2
- **Test Requirements**:
  - `programmatic` TR-1.1: `npm install` 成功安装依赖
  - `programmatic` TR-1.2: `npm run dev` 启动 Vite 服务器无报错
  - `programmatic` TR-1.3: `npm run typecheck` TypeScript 类型检查通过
  - `programmatic` TR-1.4: `npm test` 现有核心逻辑测试全部通过
- **Notes**: 将 web 相关代码放在 `web/` 目录下，或重构目录结构使核心逻辑和 web 代码分离；建议在根目录配置，src/ 下分 core/ 和 web/

## [x] Task 2: 网页平台适配层实现
- **Priority**: high
- **Depends On**: Task 1
- **Description**: 
  - 实现网页版存储（LocalStorage）替代抖音 tt.setStorage
  - 实现游客用户认证（无需登录，直接创建游客身份）
  - 创建平台适配层接口，供 GameRunner 调用
  - 适配 game_runner.ts 以使用新的平台接口
- **Acceptance Criteria Addressed**: AC-7, AC-10, FR-7, FR-8
- **Test Requirements**:
  - `programmatic` TR-2.1: LocalStorage 存储读写正常，存档可持久化
  - `programmatic` TR-2.2: 游戏启动后默认使用游客身份
  - `human-judgement` TR-2.3: 代码审查确认平台层接口清晰，无抖音 API 残留

## [x] Task 3: 游戏状态管理与主循环
- **Priority**: high
- **Depends On**: Task 2
- **Description**: 
  - 创建 React Context/Zustand 游戏状态存储
  - 实现 GameRunner 的网页版本（或适配现有 GameRunner）
  - 使用 requestAnimationFrame 实现游戏主循环
  - 实现时间控制系统（暂停/1x/2x/5x）
  - 连接核心 Simulation 与 React 状态
- **Acceptance Criteria Addressed**: AC-3, AC-7, FR-6
- **Test Requirements**:
  - `programmatic` TR-3.1: 游戏启动后 tick 正常推进，frameId 递增
  - `programmatic` TR-3.2: 暂停时 tick 停止，速度切换时 tick 频率变化
  - `human-judgement` TR-3.3: 游戏循环稳定，无明显内存泄漏

## [x] Task 4: Canvas 地图渲染基础
- **Priority**: high
- **Depends On**: Task 3
- **Description**: 
  - 创建 MapCanvas React 组件
  - 实现 Canvas 初始化和 resize 处理
  - 生成简化的省份网格/占位地图（使用矩形/六边形网格）
  - 实现基础的省份渲染（不同国家颜色区分）
  - 实现地图缩放和平移功能
- **Acceptance Criteria Addressed**: AC-4, AC-5, FR-3, FR-4
- **Test Requirements**:
  - `human-judgement` TR-4.1: Canvas 渲染出省份网格，颜色区分不同控制方
  - `human-judgement` TR-4.2: 鼠标滚轮缩放、拖拽平移流畅
  - `human-judgement` TR-4.3: Canvas 自适应容器大小

## [x] Task 5: 地图交互实现
- **Priority**: high
- **Depends On**: Task 4
- **Description**: 
  - 实现省份点击检测和选中状态
  - 实现省份悬停高亮效果
  - 实现建造模式省份高亮（可建/不可建视觉反馈）
  - 实现部队标记渲染
  - 实现战斗气泡渲染
- **Acceptance Criteria Addressed**: AC-5, AC-9, FR-4
- **Test Requirements**:
  - `human-judgement` TR-5.1: 点击省份正确选中，显示选中高亮
  - `human-judgement` TR-5.2: 建造模式下省份正确高亮（己方绿色、管控黄色、不可建灰色）
  - `human-judgement` TR-5.3: 部队/战斗标记正确显示在地图上

## [x] Task 6: UI 基础组件与布局
- **Priority**: high
- **Depends On**: Task 3
- **Description**: 
  - 创建基础 UI 组件（Button、Panel、ProgressBar 等）
  - 实现游戏主界面布局（顶部栏、底部栏、地图区域、侧边面板）
  - 实现响应式容器
  - 添加基础样式（CSS/Tailwind）
- **Acceptance Criteria Addressed**: AC-11, FR-5, FR-14, NFR-6
- **Test Requirements**:
  - `human-judgement` TR-6.1: 基础 UI 组件视觉统一，交互有反馈
  - `human-judgement` TR-6.2: 主界面布局正确，各区域定位准确
  - `human-judgement` TR-6.3: 窗口大小变化时布局自适应

## [x] Task 7: 顶部资源条实现
- **Priority**: high
- **Depends On**: Task 6
- **Description**: 
  - 实现 TopBar 组件
  - 显示 6 种资源（钢铁、石油、钨、橡胶、铝、政治点）
  - 显示当前数量/上限
  - 实现资源状态指示（满高亮、低红色脉冲）
  - 显示国家信息和日期
- **Acceptance Criteria Addressed**: AC-6, FR-5
- **Test Requirements**:
  - `human-judgement` TR-7.1: 6 种资源正确显示，数值随游戏更新
  - `human-judgement` TR-7.2: 资源满/低状态有正确视觉反馈
  - `programmatic` TR-7.3: 资源数值与核心模拟状态一致

## [x] Task 8: 底部时间控制栏实现
- **Priority**: high
- **Depends On**: Task 6, Task 3
- **Description**: 
  - 实现 BottomBar 组件
  - 实现时间控制按钮（暂停、1x、2x、5x）
  - 显示当前游戏速度状态
  - 实现建造模式、其他模式切换按钮
  - 连接到游戏速度控制系统
- **Acceptance Criteria Addressed**: AC-7, FR-5
- **Test Requirements**:
  - `human-judgement` TR-8.1: 时间控制按钮点击正确切换游戏速度
  - `human-judgement` TR-8.2: 当前速度状态有视觉指示
  - `programmatic` TR-8.3: 点击按钮后 GameRunner 速度确实改变

## [x] Task 9: 登录/欢迎覆盖层
- **Priority**: medium
- **Depends On**: Task 6
- **Description**: 
  - 实现 LoginOverlay 组件
  - 实现 loggingIn/welcome/failed 状态界面
  - 实现"开始游戏"按钮逻辑
  - 默认直接进入欢迎状态（游客模式）
- **Acceptance Criteria Addressed**: FR-9
- **Test Requirements**:
  - `human-judgement` TR-9.1: 页面加载后显示欢迎界面
  - `human-judgement` TR-9.2: 点击"开始游戏"后覆盖层隐藏，进入游戏

## [x] Task 10: 工厂面板实现
- **Priority**: high
- **Depends On**: Task 6
- **Description**: 
  - 实现 FactoryPanel 组件
  - 显示民用/军用工厂列表和状态
  - 实现生产任务分配界面
  - 显示空闲工厂数量
  - 实现生产线分配交互
- **Acceptance Criteria Addressed**: AC-8, FR-5
- **Test Requirements**:
  - `human-judgement` TR-10.1: 工厂列表正确显示，状态（工作/空闲/建造中）清晰
  - `human-judgement` TR-10.2: 可分配工厂到生产任务
  - `programmatic` TR-10.3: 工厂状态与核心模拟一致

## [x] Task 11: 建造模式与建筑面板
- **Priority**: high
- **Depends On**: Task 5, Task 6
- **Description**: 
  - 实现 BuildingPanel 组件
  - 实现建筑选择栏（民厂/军厂/船坞/基建/开采井/仓储等）
  - 实现建造队列显示
  - 实现建造模式与地图交互联动
  - 实现建筑放置逻辑
- **Acceptance Criteria Addressed**: AC-9, FR-5
- **Test Requirements**:
  - `human-judgement` TR-11.1: 进入建造模式后建筑选择栏显示
  - `human-judgement` TR-11.2: 选择建筑类型后点击省份可放置建筑
  - `human-judgement` TR-11.3: 建造队列正确显示当前建造任务和进度

## [x] Task 12: 焦点面板实现
- **Priority**: medium
- **Depends On**: Task 6
- **Description**: 
  - 实现 FocusPanel 组件
  - 显示三选一焦点卡牌
  - 实现焦点选择交互
  - 显示焦点进度
- **Acceptance Criteria Addressed**: FR-5
- **Test Requirements**:
  - `human-judgement` TR-12.1: 焦点卡牌正确显示，三选一布局
  - `human-judgement` TR-12.2: 点击焦点卡牌可选择焦点
  - `programmatic` TR-12.3: 焦点选择后核心模拟状态正确更新

## [x] Task 13: 科研面板实现
- **Priority**: medium
- **Depends On**: Task 6
- **Description**: 
  - 实现 ResearchPanel 组件
  - 显示科研线列表
  - 显示当前科研进度
  - 实现科研选择交互
- **Acceptance Criteria Addressed**: FR-5
- **Test Requirements**:
  - `human-judgement` TR-13.1: 科研线列表正确显示
  - `human-judgement` TR-13.2: 可选择科研节点进行研究
  - `programmatic` TR-13.3: 科研进度与核心模拟一致

## [x] Task 14: 空闲工厂提醒系统
- **Priority**: medium
- **Depends On**: Task 7, Task 10
- **Description**: 
  - 实现 IdleAlert 组件
  - 实现 L1-L4 提醒层级（呼吸高亮→红点→浮窗建议→自动暂停）
  - 实现"一键平衡"等快捷操作按钮
  - 连接到工厂空闲状态检测
- **Acceptance Criteria Addressed**: FR-11
- **Test Requirements**:
  - `human-judgement` TR-14.1: 工厂空闲 5s 后触发 L1 高亮
  - `human-judgement` TR-14.2: 空闲 15s 后弹出建议浮窗
  - `human-judgement` TR-14.3: "一键平衡"按钮正确分配空闲工厂

## [x] Task 15: 存档面板实现
- **Priority**: medium
- **Depends On**: Task 2, Task 6
- **Description**: 
  - 实现 SavePanel 组件
  - 显示 3 个存档槽位
  - 实现保存/加载/删除存档功能
  - 显示存档元数据（国家、时间、时长等）
  - 实现自动存档逻辑（每 30s）
- **Acceptance Criteria Addressed**: AC-10, FR-7
- **Test Requirements**:
  - `programmatic` TR-15.1: 保存游戏后 LocalStorage 中有对应数据
  - `human-judgement` TR-15.2: 加载存档正确恢复游戏状态
  - `human-judgement` TR-15.3: 刷新页面后存档仍然存在

## [ ] Task 16: 其他面板与弹窗
- **Priority**: medium
- **Depends On**: Task 6
- **Description**: 
  - 实现 ResourcePanel（资源详情）
  - 实现 CombatPanel（战斗面板）
  - 实现 DiplomacyPanel（外交面板）
  - 实现 AssistantPanel（助理面板）
  - 实现 DailyTaskPanel（每日任务面板）
  - 实现 GameOverOverlay（游戏结束弹窗）
  - 实现 PauseOverlay（暂停菜单）
- **Acceptance Criteria Addressed**: FR-10, FR-12, FR-13
- **Test Requirements**:
  - `human-judgement` TR-16.1: 各面板可正常打开/关闭
  - `human-judgement` TR-16.2: 面板数据与游戏状态同步
  - `human-judgement` TR-16.3: 面板内交互操作正确响应

## [ ] Task 17: 移动端触摸适配
- **Priority**: low
- **Depends On**: Task 5, Task 8
- **Description**: 
  - 实现地图触摸交互（双指缩放、单指平移）
  - 适配 UI 按钮触摸尺寸（至少 44x44px）
  - 优化移动端面板布局
  - 测试移动浏览器兼容性
- **Acceptance Criteria Addressed**: AC-11, FR-14
- **Test Requirements**:
  - `human-judgement` TR-17.1: 触摸设备上可正常缩放平移地图
  - `human-judgement` TR-17.2: 按钮点击区域足够大，不易误触
  - `human-judgement` TR-17.3: 移动端布局合理，关键功能可用

## [x] Task 18: 生产构建与部署验证
- **Priority**: high
- **Depends On**: All previous tasks
- **Description**: 
  - 配置 Vite 生产构建优化
  - 运行 `npm run build` 生成 dist 产物
  - 使用本地 HTTP 服务器测试 dist 目录
  - 验证所有功能在生产构建中正常工作
  - 修复构建警告和错误
- **Acceptance Criteria Addressed**: AC-12, NFR-4
- **Test Requirements**:
  - `programmatic` TR-18.1: `npm run build` 成功，无错误
  - `programmatic` TR-18.2: 构建产物在 dist/ 目录生成
  - `human-judgement` TR-18.3: 通过本地服务器访问构建产物，游戏可正常游玩
  - `programmatic` TR-18.4: `npm run typecheck` 和 `npm test` 全部通过
