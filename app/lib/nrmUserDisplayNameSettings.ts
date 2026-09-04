/**
 * 메뉴 > 앱 설정 > 사용자 이름 변경.
 * OAuth user_name을 기본값으로 쓰고 계정별 user_custom_name을 Supabase에 저장한다.
 */
import { useEffect, useState } from 'react';

import {
  getEffectiveNrmAuthSessionUserName,
  getNrmAuthSessionSnapshot,
  loadNrmAuthSession,
  setNrmAuthSessionUserCustomName,
  subscribeNrmAuthSessionListener,
} from '@/lib/nrmAuthSession';
import {
  applyNrmLoggedInIdentity,
  getResolvedNrmBrandUserName,
} from '@/lib/nrmBrandIdentity';
import { clearNrmAppSerialCache } from '@/lib/nrmAppSerialNo';
import { nrmSbRpc } from '@/lib/nrmSupabaseCrud';

export const NRM_USER_DISPLAY_NAME_MAX_LENGTH = 30;

type UserDisplayNameListener = (effectiveName: string) => void;

const listeners = new Set<UserDisplayNameListener>();

export function subscribeUserDisplayNameListener(fn: UserDisplayNameListener): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

export function notifyUserDisplayNameChanged(effectiveName: string): void {
  for (const fn of listeners) {
    fn(effectiveName);
  }
}

/** 현재 OAuth 계정의 원본 user_name — 설정 기본값·초기화 대상 */
export function getNrmUserDisplayNameDefault(): string {
  return getNrmAuthSessionSnapshot()?.userName.trim() || '사용자';
}

export async function loadNrmUserDisplayNameDefault(): Promise<string> {
  const session = await loadNrmAuthSession();
  return session?.userName.trim() || '사용자';
}

export async function loadUserDisplayNameOverride(): Promise<string | null> {
  const session = await loadNrmAuthSession();
  return session?.userCustomName?.trim() || null;
}

export async function loadEffectiveUserDisplayName(): Promise<string> {
  const session = await loadNrmAuthSession();
  return (
    getEffectiveNrmAuthSessionUserName(session) ||
    getResolvedNrmBrandUserName() ||
    '사용자'
  );
}

export function validateUserDisplayNameInput(name: string): string | null {
  if (name.length > NRM_USER_DISPLAY_NAME_MAX_LENGTH) {
    return '사용자 이름이 너무 길어요';
  }
  const trimmed = name.trim();
  if (!trimmed) {
    return '사용자 이름을 입력해 주세요.';
  }
  return null;
}

export async function saveUserDisplayNameOverride(name: string | null): Promise<void> {
  const trimmed = name?.trim() ?? '';
  if (trimmed.length > NRM_USER_DISPLAY_NAME_MAX_LENGTH) {
    throw new Error('사용자 이름이 너무 길어요');
  }
  const session = await loadNrmAuthSession();
  if (!session?.serialNo.trim()) {
    throw new Error('로그인 정보를 확인할 수 없습니다.');
  }
  const customName = !trimmed || trimmed === session.userName.trim() ? null : trimmed;
  const row = await nrmSbRpc<{
    user_name: string;
    user_custom_name: string | null;
  }>('nrm_rpc_set_user_custom_name', {
    p_serial_no: session.serialNo,
    p_user_custom_name: customName,
  });
  const savedCustomName = String(row.user_custom_name ?? '').trim() || null;
  const next = await setNrmAuthSessionUserCustomName(savedCustomName);
  const effectiveName =
    getEffectiveNrmAuthSessionUserName(next) ||
    String(row.user_name ?? session.userName).trim() ||
    '사용자';
  await applyNrmLoggedInIdentity(session.serialNo, effectiveName);
  clearNrmAppSerialCache();
  notifyUserDisplayNameChanged(effectiveName);
}

/** AI Lab 인사 등 모든 사용자 표시명 경로 */
export function useNrmUserDisplayName(): string {
  const [name, setName] = useState(
    () =>
      getEffectiveNrmAuthSessionUserName(getNrmAuthSessionSnapshot()) ||
      getResolvedNrmBrandUserName() ||
      '사용자',
  );

  useEffect(() => {
    let cancelled = false;
    void loadEffectiveUserDisplayName().then((effective) => {
      if (!cancelled) setName(effective);
    });
    const unsubscribe = subscribeUserDisplayNameListener(setName);
    const unsubscribeSession = subscribeNrmAuthSessionListener((session) => {
      setName(
        getEffectiveNrmAuthSessionUserName(session) ||
          getResolvedNrmBrandUserName() ||
          '사용자',
      );
    });
    return () => {
      cancelled = true;
      unsubscribe();
      unsubscribeSession();
    };
  }, []);

  return name;
}
