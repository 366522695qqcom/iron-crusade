/**
 * 抖音登录渠道默认实现（feature-douyin-login）
 *
 * 实现依据：
 * - 抖音小游戏登录 API：https://developer.open-douyin.com/docs/game/develop/sdk/interface/login/
 * - 平台隔离模式：参照 platform/notify/douyin_notify.ts
 *
 * 设计要点：
 * - 所有 tt API 调用前检测 typeof tt !== 'undefined'，非抖音环境降级为游客模式
 * - 登录成功 UserInfo 缓存到 tt.setStorageSync，启动时优先从缓存恢复
 * - checkSession 失败时自动清除缓存并重新登录
 * - code2Session 预留空实现，未来服务端接入时扩展
 *
 * 平台隔离：本文件不 import cc，通过全局 `tt` 访问 StarkSDK。
 */
import {
  DouyinAuthChannel,
  LoginStatus,
  UserInfo,
  LoginResult,
  USER_INFO_STORAGE_KEY,
} from './auth_types';

declare const tt: any;

/**
 * 默认抖音登录渠道实现
 */
export class DefaultDouyinAuthChannel implements DouyinAuthChannel {
  private _status: LoginStatus = 'idle';
  private _currentUser: UserInfo | null = null;

  constructor() {
    this.tryLoadFromCache();
  }

  private isDouyin(): boolean {
    return typeof tt !== 'undefined' && tt !== null;
  }

  private tryLoadFromCache(): void {
    try {
      if (this.isDouyin() && typeof tt.getStorageSync === 'function') {
        const raw = tt.getStorageSync(USER_INFO_STORAGE_KEY);
        if (raw) {
          const parsed = JSON.parse(raw);
          if (parsed && parsed.anonymousOpenId) {
            this._currentUser = parsed;
            this._status = 'loggedIn';
          }
        }
      }
    } catch {
      this._currentUser = null;
      this._status = 'idle';
    }
  }

  private saveToCache(user: UserInfo): void {
    try {
      if (this.isDouyin() && typeof tt.setStorageSync === 'function') {
        tt.setStorageSync(USER_INFO_STORAGE_KEY, JSON.stringify(user));
      }
    } catch {
      // ignore cache errors
    }
  }

  private clearCache(): void {
    try {
      if (this.isDouyin() && typeof tt.removeStorageSync === 'function') {
        tt.removeStorageSync(USER_INFO_STORAGE_KEY);
      }
    } catch {
      // ignore
    }
  }

  private generateGuestId(): string {
    const timestamp = Date.now();
    const rand = Math.floor(Math.random() * 1000000);
    return `guest_${timestamp}_${rand}`;
  }

  getStatus(): LoginStatus {
    return this._status;
  }

  getCurrentUser(): UserInfo | null {
    return this._currentUser ? { ...this._currentUser } : null;
  }

  async login(forceRefresh?: boolean): Promise<LoginResult> {
    if (this._status === 'loggingIn') {
      return { success: false, errorMsg: 'already logging in' };
    }

    if (!forceRefresh && this._currentUser && this._status === 'loggedIn') {
      const sessionValid = await this.checkSession();
      if (sessionValid) {
        return { success: true, user: { ...this._currentUser } };
      }
    }

    this._status = 'loggingIn';

    if (!this.isDouyin()) {
      const guestUser: UserInfo = {
        anonymousOpenId: this.generateGuestId(),
        loginTime: Date.now(),
        isGuest: true,
        nickName: '游客',
      };
      this._currentUser = guestUser;
      this._status = 'loggedIn';
      return { success: true, user: { ...guestUser } };
    }

    return new Promise<LoginResult>((resolve) => {
      try {
        if (typeof tt.login !== 'function') {
          const guestUser: UserInfo = {
            anonymousOpenId: this.generateGuestId(),
            loginTime: Date.now(),
            isGuest: true,
            nickName: '游客',
          };
          this._currentUser = guestUser;
          this._status = 'loggedIn';
          resolve({ success: true, user: { ...guestUser } });
          return;
        }

        tt.login({
          success: (res: { code?: string; anonymousOpenId?: string; errMsg?: string }) => {
            try {
              if (!res || (!res.anonymousOpenId && !res.code)) {
                this._status = 'failed';
                resolve({ success: false, errorMsg: res?.errMsg || 'login failed: no openid' });
                return;
              }

              const openId = res.anonymousOpenId || `douyin_${res.code}`;
              const user: UserInfo = {
                anonymousOpenId: openId,
                code: res.code,
                loginTime: Date.now(),
                isGuest: false,
              };

              if (this._currentUser && this._currentUser.nickName) {
                user.nickName = this._currentUser.nickName;
                user.avatarUrl = this._currentUser.avatarUrl;
              }

              this._currentUser = user;
              this._status = 'loggedIn';
              this.saveToCache(user);
              resolve({ success: true, user: { ...user } });
            } catch (e) {
              this._status = 'failed';
              resolve({ success: false, errorMsg: 'login parse error' });
            }
          },
          fail: (err: { errMsg?: string }) => {
            this._status = 'failed';
            resolve({ success: false, errorMsg: err?.errMsg || 'login failed' });
          },
        });
      } catch (e) {
        this._status = 'failed';
        resolve({ success: false, errorMsg: 'login exception' });
      }
    });
  }

  async requestUserInfo(): Promise<UserInfo | null> {
    if (!this._currentUser) return null;

    if (!this.isDouyin() || this._currentUser.isGuest) {
      if (!this._currentUser.nickName) {
        this._currentUser.nickName = '游客';
      }
      return { ...this._currentUser };
    }

    return new Promise<UserInfo | null>((resolve) => {
      try {
        if (typeof tt.getUserInfo !== 'function') {
          resolve({ ...this._currentUser! });
          return;
        }

        tt.getUserInfo({
          success: (res: { userInfo?: { nickName?: string; avatarUrl?: string } }) => {
            try {
              if (res?.userInfo) {
                this._currentUser!.nickName = res.userInfo.nickName;
                this._currentUser!.avatarUrl = res.userInfo.avatarUrl;
                this.saveToCache(this._currentUser!);
              }
              resolve({ ...this._currentUser! });
            } catch {
              resolve({ ...this._currentUser! });
            }
          },
          fail: () => {
            resolve({ ...this._currentUser! });
          },
        });
      } catch {
        resolve({ ...this._currentUser! });
      }
    });
  }

  async checkSession(): Promise<boolean> {
    if (!this._currentUser) return false;
    if (this._currentUser.isGuest) return true;
    if (!this.isDouyin()) return true;

    return new Promise<boolean>((resolve) => {
      try {
        if (typeof tt.checkSession !== 'function') {
          resolve(true);
          return;
        }
        tt.checkSession({
          success: () => resolve(true),
          fail: () => {
            this.clearCache();
            this._currentUser = null;
            this._status = 'idle';
            resolve(false);
          },
        });
      } catch {
        resolve(true);
      }
    });
  }

  logout(): void {
    this.clearCache();
    this._currentUser = null;
    this._status = 'idle';
  }

  /**
   * 服务端code2Session占位方法
   * 未来接入服务端时实现：向服务端发送code换取openId/sessionKey
   */
  async code2Session(_code: string): Promise<{ openId?: string; sessionKey?: string }> {
    return {};
  }
}
