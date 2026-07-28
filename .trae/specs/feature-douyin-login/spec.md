# Spec: 抖音账号登录系统（feature-douyin-login）

> 变更类型：新增平台层功能
> 前置依赖：optimize-for-launch 平台层架构已落地
> 目标：实现抖音小游戏账号登录能力，包含匿名登录、用户信息授权、服务端会话占位、登录状态持久化

## Why

当前游戏启动直接进入新游戏，缺少用户身份识别能力：
1. 无法区分不同玩家，存档无法与用户绑定
2. 没有用户信息（昵称/头像），无法提供个性化体验
3. 无法为未来联机、排行榜、云存档等功能预留身份基础
4. 非抖音环境（Web调试/测试）需要游客模式降级

## What Changes

### 1. 平台层新增 auth 模块 (`src/platform/auth/`)

按照现有 platform/ads、platform/notify 的模式，新增 auth 子模块：

**文件结构**：
```
src/platform/auth/
├── index.ts              # 统一导出
├── auth_types.ts         # 共享类型定义
└── douyin_auth.ts        # 抖音登录渠道默认实现
```

**类型定义** (`auth_types.ts`)：

```typescript
/** 登录状态 */
export type LoginStatus = 'idle' | 'loggingIn' | 'loggedIn' | 'failed';

/** 用户信息 */
export interface UserInfo {
  /** 抖音匿名openid（同一用户同一游戏稳定不变，单机主要标识） */
  anonymousOpenId: string;
  /** 用户昵称（getUserInfo授权后才有） */
  nickName?: string;
  /** 用户头像URL（getUserInfo授权后才有） */
  avatarUrl?: string;
  /** 抖音登录code（有效期5分钟，用于服务端code2Session） */
  code?: string;
  /** 登录时间戳 */
  loginTime: number;
}

/** 登录结果 */
export interface LoginResult {
  success: boolean;
  user?: UserInfo;
  errorMsg?: string;
}
```

**AuthChannel 接口**：
```typescript
export interface DouyinAuthChannel {
  /** 获取当前登录状态 */
  getStatus(): LoginStatus;
  /** 获取当前缓存的用户信息（未登录返回null） */
  getCurrentUser(): UserInfo | null;
  /**
   * 发起登录流程
   * - 抖音环境：调用tt.login()获取code和anonymousOpenId
   * - 非抖音环境：生成guest_<random>作为游客ID
   * - 登录成功后将UserInfo缓存到本地存储
   */
  login(forceRefresh?: boolean): Promise<LoginResult>;
  /**
   * 请求用户授权获取昵称头像（需用户主动点击触发）
   * - 抖音环境：调用tt.getUserInfo()
   * - 非抖音环境：返回默认游客信息
   */
  requestUserInfo(): Promise<UserInfo | null>;
  /**
   * 检查登录态是否有效
   * - 抖音环境：调用tt.checkSession()
   * - 非抖音环境：始终返回true
   */
  checkSession(): Promise<boolean>;
  /**
   * 退出登录（清除缓存，仅用于调试/切换账号）
   */
  logout(): void;
}
```

**DefaultDouyinAuthChannel 实现要点**：

1. **平台隔离**：所有 `tt` API 调用前检测 `typeof tt !== 'undefined'`，非抖音环境降级为游客模式
2. **游客模式**：非抖音环境生成 `guest_<timestamp>_<random>` 格式ID，仅保存在内存
3. **本地缓存**：
   - 登录成功后 UserInfo 持久化到 `tt.setStorageSync('user_info', JSON.stringify(user))`
   - 启动时自动尝试从 `tt.getStorageSync('user_info')` 恢复
   - checkSession失败或用户登出时清除缓存
4. **服务端占位**：
   - login() 返回的code字段保留，供未来服务端code2Session使用
   - 预留 `code2Session(code: string): Promise<{ openId?: string; sessionKey?: string }>` 方法空实现
   - 当前阶段客户端不实际调用服务端，只保留接口契约
5. **错误处理**：所有tt API调用包裹try/catch，失败时返回{success: false, errorMsg}，不抛异常

### 2. 游戏启动流程改造

**修改 `src/main.ts`**：
- bootstrap() 改为异步流程：先初始化AuthChannel → 尝试登录 → 登录成功后创建WorldState和Simulation
- 登录过程显示加载状态
- 登录失败允许重试或进入游客模式

**修改 `src/game/game_runner.ts`**：
- 构造函数接收UserInfo参数
- 将用户ID关联到存档key（经典模式存档key从`classic_save`改为`save_${anonymousOpenId}`）
- 新增getCurrentUser()方法供UI查询

**新增登录UI覆盖层**：
- 在MainScene上新增简单的登录状态覆盖层（复用现有overlay模式）
- 三种状态：
  1. 登录中：显示"正在登录..."加载提示
  2. 登录成功：首次登录显示欢迎界面（包含游客/抖音用户标识、"开始游戏"按钮）
  3. 登录失败：显示"登录失败，点击重试"按钮
- 登录成功后自动 fade out 覆盖层，进入游戏主界面
- 非抖音环境直接显示"游客模式"提示，无需登录按钮

### 3. 存档隔离

**修改存档逻辑**：
- QuickBattle归档key改为`qb_archives_${anonymousOpenId}`
- Classic模式存档key改为`classic_save_${anonymousOpenId}`
- content_unlocked、cosmetics等用户绑定数据也按anonymousOpenId隔离key
- 游客模式使用固定key`guest_<random>`，刷新页面会丢失（符合预期）

### 4. 用户信息UI集成

**修改TopBar** (`src/render/ui/top_bar.ts`)：
- 右上角显示用户头像（如果有）或默认头像占位
- 点击头像区域弹出简单用户卡片（显示昵称、anonymousOpenId脱敏显示）
- 提供"重新登录"调试按钮（开发模式可见）

## Impact

- **Affected files**：
  - 新增 `src/platform/auth/` 目录及三个文件
  - 修改 [main.ts](file:///workspace/src/main.ts)：启动流程改造为异步登录
  - 修改 [game_runner.ts](file:///workspace/src/game/game_runner.ts)：接收UserInfo，存档key按用户隔离
  - 新增 `src/render/ui/overlays/login_overlay.ts`：登录UI覆盖层
  - 修改 [main_scene.ts](file:///workspace/src/render/main_scene.ts)：集成登录覆盖层
  - 修改 [top_bar.ts](file:///workspace/src/render/ui/top_bar.ts)：显示用户头像入口
  - 修改 [quick_battle.ts](file:///workspace/src/game/modes/quick_battle.ts)：存档key按用户隔离
  - 修改 [content_unlock.ts](file:///workspace/src/platform/ads/content_unlock.ts)、[cosmetics.ts](file:///workspace/src/platform/ads/cosmetics.ts)：存储key按用户隔离（可选，M1简化可暂不做）
- **Interface changes**：
  - DefaultSimulation.create() 不变，GameRunner构造函数新增userInfo参数
  - MainScene新增setLoginOverlay()/showLoginStatus()方法
- **Determinism**：登录流程在Simulation创建之前完成，不影响核心模拟确定性；UserInfo不进入WorldState
- **Platform**：严格遵循现有平台隔离模式，非抖音环境优雅降级为游客模式
- **Tests**：
  - DefaultDouyinAuthChannel 单元测试（mock tt对象，覆盖成功/失败/游客模式/本地缓存）
  - 启动流程测试（登录成功→进入游戏；登录失败→重试）

---

## Requirements

### Requirement: 抖音环境匿名登录
- **WHEN** 游戏在抖音环境启动
- **THEN** 自动调用tt.login()获取anonymousOpenId和code
- **AND** 登录成功用户信息缓存到本地存储
- **AND** 下次启动优先从缓存恢复，checkSession失效时自动重新登录

### Requirement: 用户信息授权（可选）
- **WHEN** 用户点击头像区域的"授权头像昵称"按钮
- **THEN** 调用tt.getUserInfo()请求用户授权
- **AND** 授权成功后更新本地用户信息缓存，UI显示昵称和头像
- **AND** 用户拒绝授权不影响核心游戏功能

### Requirement: 非抖音环境游客模式
- **WHEN** 游戏在Web/测试环境启动（typeof tt === 'undefined'）
- **THEN** 自动生成游客ID进入游戏
- **AND** 游客模式标识明确显示，提示用户在抖音客户端打开获得完整体验
- **AND** 游客数据仅内存保存，刷新页面重置

### Requirement: 登录状态UI反馈
- **WHEN** 登录流程进行中
- **THEN** 显示加载状态提示
- **AND** 登录失败显示重试按钮
- **AND** 首次登录成功显示欢迎界面，点击"开始游戏"进入主界面
- **AND** 非首次登录自动跳过欢迎界面直接进入

### Requirement: 用户存档隔离
- **WHEN** 不同用户登录同一设备
- **THEN** 各自的快速对局归档、经典存档数据互相隔离
- **AND** 不会读取到其他用户的存档数据

### Requirement: 服务端接口占位
- **WHEN** 未来需要接入服务端
- **THEN** login()返回的code可直接用于code2Session
- **AND** AuthChannel预留code2Session方法签名，无需重构调用方
