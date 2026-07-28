/**
 * 抖音登录系统类型定义（feature-douyin-login）
 */

/** 登录状态 */
export type LoginStatus = 'idle' | 'loggingIn' | 'loggedIn' | 'failed';

/** 用户信息 */
export interface UserInfo {
  /** 抖音匿名openid（同一用户同一游戏稳定不变，单机主要标识）；游客模式为guest_xxx */
  anonymousOpenId: string;
  /** 用户昵称（getUserInfo授权后才有） */
  nickName?: string;
  /** 用户头像URL（getUserInfo授权后才有） */
  avatarUrl?: string;
  /** 抖音登录code（有效期5分钟，用于服务端code2Session） */
  code?: string;
  /** 登录时间戳 */
  loginTime: number;
  /** 是否为游客模式 */
  isGuest: boolean;
}

/** 登录结果 */
export interface LoginResult {
  success: boolean;
  user?: UserInfo;
  errorMsg?: string;
}

/**
 * 抖音登录渠道接口
 */
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

/** 本地存储key */
export const USER_INFO_STORAGE_KEY = 'user_info';
