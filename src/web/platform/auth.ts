import type { UserInfo } from '../../platform/auth/auth_types';

export function createGuestUser(): UserInfo {
  const guestId = `guest_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  return {
    anonymousOpenId: guestId,
    loginTime: Date.now(),
    isGuest: true,
    nickName: '游客',
  };
}
