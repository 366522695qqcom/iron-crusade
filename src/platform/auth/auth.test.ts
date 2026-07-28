/**
 * DefaultDouyinAuthChannel 单元测试（feature-douyin-login）
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { DefaultDouyinAuthChannel } from './douyin_auth';
import { LoginStatus } from './auth_types';

describe('DefaultDouyinAuthChannel', () => {
  let originalTt: any;

  beforeEach(() => {
    originalTt = (globalThis as any).tt;
  });

  afterEach(() => {
    (globalThis as any).tt = originalTt;
  });

  it('非抖音环境自动游客登录', async () => {
    delete (globalThis as any).tt;
    const auth = new DefaultDouyinAuthChannel();
    expect(auth.getStatus()).toBe('idle');

    const result = await auth.login();
    expect(result.success).toBe(true);
    expect(result.user).toBeTruthy();
    expect(result.user!.isGuest).toBe(true);
    expect(result.user!.anonymousOpenId.startsWith('guest_')).toBe(true);
    expect(auth.getStatus()).toBe('loggedIn');
    expect(auth.getCurrentUser()?.anonymousOpenId).toBe(result.user!.anonymousOpenId);
  });

  it('抖音环境tt.login成功返回anonymousOpenId', async () => {
    const mockTt = {
      login: (opts: any) => {
        setTimeout(() => opts.success({ anonymousOpenId: 'test_openid_123', code: 'test_code_abc' }), 0);
      },
      getStorageSync: () => null,
      setStorageSync: () => {},
      removeStorageSync: () => {},
      checkSession: (opts: any) => opts.success(),
    };
    (globalThis as any).tt = mockTt;

    const auth = new DefaultDouyinAuthChannel();
    const result = await auth.login();
    expect(result.success).toBe(true);
    expect(result.user!.anonymousOpenId).toBe('test_openid_123');
    expect(result.user!.code).toBe('test_code_abc');
    expect(result.user!.isGuest).toBe(false);
  });

  it('抖音环境tt.login失败返回错误', async () => {
    const mockTt = {
      login: (opts: any) => {
        setTimeout(() => opts.fail({ errMsg: 'user cancel' }), 0);
      },
      getStorageSync: () => null,
      setStorageSync: () => {},
      removeStorageSync: () => {},
    };
    (globalThis as any).tt = mockTt;

    const auth = new DefaultDouyinAuthChannel();
    const result = await auth.login();
    expect(result.success).toBe(false);
    expect(result.errorMsg).toBeTruthy();
    expect(auth.getStatus()).toBe('failed');
  });

  it('已登录checkSession有效时直接返回缓存用户', async () => {
    delete (globalThis as any).tt;
    const auth = new DefaultDouyinAuthChannel();
    await auth.login();
    const user1 = auth.getCurrentUser();
    const result = await auth.login();
    expect(result.success).toBe(true);
    expect(result.user!.anonymousOpenId).toBe(user1!.anonymousOpenId);
  });

  it('forceRefresh强制重新登录', async () => {
    delete (globalThis as any).tt;
    const auth = new DefaultDouyinAuthChannel();
    const r1 = await auth.login();
    const r2 = await auth.login(true);
    expect(r2.success).toBe(true);
    expect(r2.user!.anonymousOpenId).not.toBe(r1.user!.anonymousOpenId);
  });

  it('logout清除当前用户', async () => {
    delete (globalThis as any).tt;
    const auth = new DefaultDouyinAuthChannel();
    await auth.login();
    expect(auth.getCurrentUser()).toBeTruthy();
    auth.logout();
    expect(auth.getCurrentUser()).toBeNull();
    expect(auth.getStatus()).toBe('idle');
  });

  it('requestUserInfo游客模式返回默认昵称', async () => {
    delete (globalThis as any).tt;
    const auth = new DefaultDouyinAuthChannel();
    await auth.login();
    const user = await auth.requestUserInfo();
    expect(user).toBeTruthy();
    expect(user!.nickName).toBe('游客');
  });

  it('requestUserInfo抖音环境调用tt.getUserInfo', async () => {
    let getUserInfoCalled = false;
    const mockTt = {
      login: (opts: any) => opts.success({ anonymousOpenId: 'oid', code: 'c' }),
      getUserInfo: (opts: any) => {
        getUserInfoCalled = true;
        opts.success({ userInfo: { nickName: '测试用户', avatarUrl: 'http://example.com/a.jpg' } });
      },
      getStorageSync: () => null,
      setStorageSync: () => {},
      removeStorageSync: () => {},
      checkSession: (opts: any) => opts.success(),
    };
    (globalThis as any).tt = mockTt;

    const auth = new DefaultDouyinAuthChannel();
    await auth.login();
    const user = await auth.requestUserInfo();
    expect(getUserInfoCalled).toBe(true);
    expect(user!.nickName).toBe('测试用户');
    expect(user!.avatarUrl).toBe('http://example.com/a.jpg');
  });

  it('checkSession失败自动清除登录态', async () => {
    let checkSessionShouldFail = false;
    const mockTt = {
      login: (opts: any) => opts.success({ anonymousOpenId: 'oid', code: 'c' }),
      checkSession: (opts: any) => {
        if (checkSessionShouldFail) opts.fail();
        else opts.success();
      },
      getStorageSync: () => null,
      setStorageSync: () => {},
      removeStorageSync: () => {},
    };
    (globalThis as any).tt = mockTt;

    const auth = new DefaultDouyinAuthChannel();
    await auth.login();
    expect(auth.getCurrentUser()).toBeTruthy();

    checkSessionShouldFail = true;
    const ok = await auth.checkSession();
    expect(ok).toBe(false);
    expect(auth.getCurrentUser()).toBeNull();
    expect(auth.getStatus()).toBe('idle');
  });
});
