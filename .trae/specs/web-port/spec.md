# HOI4-Mini 网页版改造 - Product Requirement Document

## Overview
- **Summary**: 将现有的 Cocos Creator 抖音小游戏项目（HOI4 风格策略游戏）改造为可在浏览器中运行的网页版本。保留核心游戏逻辑和玩法，使用现代网页技术栈（React + TypeScript + Vite + Canvas）重新实现渲染层和平台适配层。
- **Purpose**: 扩大游戏的可访问性，让玩家无需抖音小游戏环境即可在桌面和移动浏览器中游玩；便于开发调试和演示。
- **Target Users**: 策略游戏爱好者、网页游戏玩家、项目开发者/测试人员

## Goals
- 复用 `src/core/` 中已有的纯 TypeScript 确定性模拟逻辑（资源、工厂、建筑、战斗、科研、焦点等系统）
- 使用 HTML5 Canvas 重新实现地图渲染和交互
- 使用 React 重新实现 UI 面板（顶部资源条、底部控制栏、各功能面板、弹窗等）
- 使用浏览器 LocalStorage 替代抖音 `tt.setStorage` 实现存档持久化
- 使用 Vite 作为构建工具，支持热更新开发和生产构建
- 保留核心游戏玩法：资源经营、工厂建设、国家焦点、科研、战斗、时间控制等
- 支持桌面浏览器（鼠标/键盘操作）和移动浏览器（触摸操作）

## Non-Goals (Out of Scope)
- 不实现联机功能（信令服务器、帧同步、Host 权威等）
- 不实现抖音登录/分享/广告等平台特有功能
- 不重写或修改核心模拟逻辑（`src/core/` 保持原样复用）
- 不实现新的游戏玩法或系统
- 不做复杂的视觉特效升级（保持现有设计风格的网页版呈现）

## Background & Context
- 现有项目是一个 HOI4 风格的策略小游戏，技术栈为 Cocos Creator 3.8 + TypeScript
- 核心逻辑位于 `src/core/`，是纯 TypeScript 实现，不依赖 Cocos 或抖音 API，可直接复用
- 渲染层位于 `src/render/`，完全依赖 Cocos Creator 引擎，需要重写
- 平台层位于 `src/platform/`，包含抖音登录、存储、广告等，需要替换为网页版实现
- 游戏玩法层位于 `src/game/`，连接核心逻辑和渲染层，需要适配新的渲染接口

## Functional Requirements
- **FR-1**: 项目基础架构 - 使用 Vite + React + TypeScript 搭建网页版项目，能够成功构建和运行
- **FR-2**: 核心逻辑复用 - 直接复用 `src/core/` 下的所有模拟系统，现有单元测试全部通过
- **FR-3**: Canvas 地图渲染 - 使用 HTML5 Canvas 渲染世界地图、省份、部队标记、战斗气泡等
- **FR-4**: 地图交互 - 支持省份点击/选中、缩放、平移、建造模式高亮等交互
- **FR-5**: React UI 系统 - 使用 React 组件实现顶部资源条、底部时间控制、各功能面板（工厂、建筑、焦点、科研、战斗、外交、资源详情、存档等）
- **FR-6**: 游戏主循环 - 使用 requestAnimationFrame 实现游戏循环，支持暂停/1x/2x/5x 速度控制
- **FR-7**: 网页版存储 - 使用 LocalStorage 实现存档保存/加载，支持 3 个存档槽
- **FR-8**: 游客模式 - 默认使用游客身份进入游戏，无需登录
- **FR-9**: 新手引导覆盖层 - 实现登录/欢迎/开始游戏的覆盖层流程
- **FR-10**: 游戏结束覆盖层 - 实现游戏结束/胜利/失败的弹窗
- **FR-11**: 空闲工厂提醒 - 实现 L1-L4 层级的空闲工厂提醒系统
- **FR-12**: 助理面板 - 实现助理模式面板，显示助理操作日志
- **FR-13**: 每日任务面板 - 实现每日任务显示和奖励领取
- **FR-14**: 响应式布局 - 适配桌面端（1280x720 基准）和移动端屏幕

## Non-Functional Requirements
- **NFR-1**: 开发体验 - Vite 热更新，修改代码后浏览器快速刷新
- **NFR-2**: 性能 - 桌面端目标 FPS ≥ 50，地图渲染流畅，UI 响应及时
- **NFR-3**: 兼容性 - 支持现代浏览器（Chrome 90+、Firefox 88+、Safari 14+、Edge 90+）
- **NFR-4**: 构建产物 - 生产构建产物可直接部署为静态网站，无需后端服务
- **NFR-5**: 代码质量 - TypeScript 类型检查通过，遵循现有代码风格
- **NFR-6**: 可访问性 - UI 元素有适当的对比度，支持键盘基础操作

## Constraints
- **Technical**: 
  - 必须使用 React 18+、TypeScript 5+、Vite 5+
  - 核心逻辑 (`src/core/`) 不做任何修改，直接导入复用
  - Canvas 用于地图渲染，DOM/React 用于 UI 面板
  - 不引入重型游戏引擎（如 Phaser、PixiJS），保持轻量
- **Business**: 单机版本优先，联机功能后续迭代
- **Dependencies**: 
  - 复用现有 `vitest` 测试框架
  - 可引入必要的 React 生态库（如 Zustand 用于状态管理，如需要）

## Assumptions
- 现有核心逻辑经过测试可以在浏览器环境中直接运行（纯 TS，无 Node.js 特定 API）
- 地图数据可以使用简化的 SVG 路径或 Canvas 绘制方式呈现（暂不使用真实国界矢量数据，先用简单几何形状占位）
- 用户接受先实现核心玩法，视觉效果可以后续迭代
- 不需要后端服务器，纯前端静态网站即可运行

## Acceptance Criteria

### AC-1: 项目可构建运行
- **Given**: 开发环境已安装 Node.js 18+
- **When**: 运行 `npm install` 和 `npm run dev`
- **Then**: Vite 开发服务器启动，浏览器访问 localhost 端口可看到游戏界面
- **Verification**: `programmatic`

### AC-2: 核心逻辑测试通过
- **Given**: 网页版项目搭建完成
- **When**: 运行 `npm test`
- **Then**: 所有现有核心逻辑单元测试通过
- **Verification**: `programmatic`

### AC-3: 游戏主循环运行
- **Given**: 游戏已启动
- **When**: 点击"开始游戏"
- **Then**: 游戏进入主界面，时间开始推进，资源数字随时间变化
- **Verification**: `programmatic` + `human-judgment`

### AC-4: Canvas 地图渲染
- **Given**: 游戏主界面已加载
- **When**: 查看地图区域
- **Then**: Canvas 上渲染出省份网格/地图，不同国家有颜色区分，可看到省份边界
- **Verification**: `human-judgment`

### AC-5: 地图交互功能
- **Given**: 地图已渲染
- **When**: 点击省份、滚轮缩放、拖拽平移
- **Then**: 省份被选中高亮，地图可缩放平移，交互流畅
- **Verification**: `human-judgment`

### AC-6: 顶部资源条显示
- **Given**: 游戏运行中
- **When**: 查看屏幕顶部
- **Then**: 显示 6 种资源（钢铁、石油、钨、橡胶、铝、政治点）的当前数量和上限
- **Verification**: `human-judgment`

### AC-7: 时间控制功能
- **Given**: 游戏运行中
- **When**: 使用底部时间控制按钮（暂停/1x/2x/5x）
- **Then**: 游戏速度相应变化，暂停时时间停止推进
- **Verification**: `programmatic` + `human-judgment`

### AC-8: 工厂系统可操作
- **Given**: 游戏运行中
- **When**: 打开工厂面板，分配生产任务
- **Then**: 工厂状态更新，生产进度推进，空闲工厂提醒正常触发
- **Verification**: `human-judgment`

### AC-9: 建筑模式功能
- **Given**: 游戏运行中
- **When**: 进入建造模式，选择建筑类型，点击省份放置
- **Then**: 建筑进入建造队列，民用工厂分配后建造进度推进
- **Verification**: `human-judgment`

### AC-10: 存档功能
- **Given**: 游戏中有进度
- **When**: 打开存档面板，保存游戏，刷新页面后加载存档
- **Then**: 游戏进度正确保存和恢复
- **Verification**: `programmatic` + `human-judgment`

### AC-11: 响应式布局
- **Given**: 游戏在浏览器中运行
- **When**: 调整浏览器窗口大小或在移动设备上打开
- **Then**: UI 自适应屏幕尺寸，关键功能可正常操作
- **Verification**: `human-judgment`

### AC-12: 生产构建可部署
- **Given**: 开发完成
- **When**: 运行 `npm run build`
- **Then**: 生成 `dist/` 目录，包含可静态部署的文件，可通过本地 HTTP 服务器正常运行
- **Verification**: `programmatic`

## Open Questions
- [ ] 是否需要引入 UI 组件库（如 Headless UI、Radix UI）还是手写组件？
- [ ] 地图渲染是先用简单占位形状还是直接实现简化版本的省份？
- [ ] 状态管理是否需要 Zustand，还是使用 React Context + useReducer 即可？
