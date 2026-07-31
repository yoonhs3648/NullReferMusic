/**
 * 메뉴 > 앱 설정 > 사용자 이름 변경.
 * bake userName을 기본/초기화값으로 쓰고, AI Lab 인사(`~~님 안녕하세요`)에만 반영한다.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useState } from 'react';

import { getResolvedNrmBrandUserName } from '@/lib/nrmBrandIdentity';

const STORAGE_KEY = 'nrm_user_display_name_v1';

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

/** APK bake userName — 설정 기본값·초기화 대상 */
export function getNrmUserDisplayNameDefault(): string {
  return getResolvedNrmBrandUserName() || '사용자';
}

export async function loadUserDisplayNameOverride(): Promise<string | null> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    const trimmed = raw?.trim() ?? '';
    return trimmed.length > 0 ? trimmed : null;
  } catch {
    return null;
  }
}

export async function loadEffectiveUserDisplayName(): Promise<string> {
  const override = await loadUserDisplayNameOverride();
  return override ?? getNrmUserDisplayNameDefault();
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
  const defaultName = getNrmUserDisplayNameDefault();
  if (!trimmed || trimmed === defaultName) {
    await AsyncStorage.removeItem(STORAGE_KEY);
    notifyUserDisplayNameChanged(defaultName);
    return;
  }
  await AsyncStorage.setItem(STORAGE_KEY, trimmed);
  notifyUserDisplayNameChanged(trimmed);
}

/** AI Lab 인사 등 — 사용자 표시명만 */
export function useNrmUserDisplayName(): string {
  const [name, setName] = useState(() => getNrmUserDisplayNameDefault());

  useEffect(() => {
    let cancelled = false;
    void loadEffectiveUserDisplayName().then((effective) => {
      if (!cancelled) setName(effective);
    });
    const unsubscribe = subscribeUserDisplayNameListener(setName);
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, []);

  return name;
}
