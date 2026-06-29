import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useState } from 'react';

import { getNrmBrandDisplayNameForUi } from '@/lib/nrmAppBrand';

const STORAGE_KEY = 'nrm_main_logo_display_name_v1';

export const NRM_MAIN_LOGO_DISPLAY_NAME_MAX_LENGTH = 50;

type MainLogoDisplayNameListener = (effectiveName: string) => void;

const mainLogoDisplayNameListeners = new Set<MainLogoDisplayNameListener>();

export function subscribeMainLogoDisplayNameListener(
  fn: MainLogoDisplayNameListener,
): () => void {
  mainLogoDisplayNameListeners.add(fn);
  return () => {
    mainLogoDisplayNameListeners.delete(fn);
  };
}

export function notifyMainLogoDisplayNameChanged(effectiveName: string): void {
  for (const fn of mainLogoDisplayNameListeners) {
    fn(effectiveName);
  }
}

/** APK에 내장된 displayName — 메인 CI 로고 기본값 */
export function getNrmMainLogoDefaultDisplayName(): string {
  return getNrmBrandDisplayNameForUi();
}

export async function loadMainLogoDisplayNameOverride(): Promise<string | null> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    const trimmed = raw?.trim() ?? '';
    return trimmed.length > 0 ? trimmed : null;
  } catch {
    return null;
  }
}

export async function loadEffectiveMainLogoDisplayName(): Promise<string> {
  const override = await loadMainLogoDisplayNameOverride();
  return override ?? getNrmBrandDisplayNameForUi();
}

export function validateMainLogoDisplayNameInput(name: string): string | null {
  if (name.length > NRM_MAIN_LOGO_DISPLAY_NAME_MAX_LENGTH) {
    return '앱이름이 너무 길어요';
  }
  const trimmed = name.trim();
  if (!trimmed) {
    return '앱 이름을 입력해 주세요.';
  }
  return null;
}

export async function saveMainLogoDisplayNameOverride(name: string | null): Promise<void> {
  const trimmed = name?.trim() ?? '';
  if (trimmed.length > NRM_MAIN_LOGO_DISPLAY_NAME_MAX_LENGTH) {
    throw new Error('앱이름이 너무 길어요');
  }
  const defaultName = getNrmBrandDisplayNameForUi();
  if (!trimmed || trimmed === defaultName) {
    await AsyncStorage.removeItem(STORAGE_KEY);
    notifyMainLogoDisplayNameChanged(defaultName);
    return;
  }
  await AsyncStorage.setItem(STORAGE_KEY, trimmed);
  notifyMainLogoDisplayNameChanged(trimmed);
}

export function formatNrmAppExitConfirmMessage(displayName: string): string {
  return `${displayName.trim()}을 종료할까요?`;
}

export function useNrmMainLogoDisplayName(): string {
  const [name, setName] = useState(() => getNrmBrandDisplayNameForUi());

  useEffect(() => {
    let cancelled = false;
    void loadEffectiveMainLogoDisplayName().then((effective) => {
      if (!cancelled) setName(effective);
    });
    const unsubscribe = subscribeMainLogoDisplayNameListener(setName);
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, []);

  return name;
}
