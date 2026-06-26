import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useState } from 'react';

import { NRM_BRAND_DISPLAY_NAME } from '@/lib/nrmAppBrand';

const STORAGE_KEY = 'nrm_main_logo_display_name_v1';

type MainLogoDisplayNameListener = (effectiveName: string) => void;

let mainLogoDisplayNameListener: MainLogoDisplayNameListener | null = null;

/** APK에 내장된 displayName — 메인 CI 로고 기본값 */
export function getNrmMainLogoDefaultDisplayName(): string {
  return NRM_BRAND_DISPLAY_NAME;
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
  return override ?? NRM_BRAND_DISPLAY_NAME;
}

export async function saveMainLogoDisplayNameOverride(name: string | null): Promise<void> {
  const trimmed = name?.trim() ?? '';
  if (!trimmed || trimmed === NRM_BRAND_DISPLAY_NAME) {
    await AsyncStorage.removeItem(STORAGE_KEY);
    notifyMainLogoDisplayNameChanged(NRM_BRAND_DISPLAY_NAME);
    return;
  }
  await AsyncStorage.setItem(STORAGE_KEY, trimmed);
  notifyMainLogoDisplayNameChanged(trimmed);
}

export function registerMainLogoDisplayNameListener(
  fn: MainLogoDisplayNameListener | null,
): void {
  mainLogoDisplayNameListener = fn;
}

export function notifyMainLogoDisplayNameChanged(effectiveName: string): void {
  mainLogoDisplayNameListener?.(effectiveName);
}

export function useNrmMainLogoDisplayName(): string {
  const [name, setName] = useState(NRM_BRAND_DISPLAY_NAME);

  useEffect(() => {
    let cancelled = false;
    void loadEffectiveMainLogoDisplayName().then((effective) => {
      if (!cancelled) setName(effective);
    });
    registerMainLogoDisplayNameListener(setName);
    return () => {
      cancelled = true;
      registerMainLogoDisplayNameListener(null);
    };
  }, []);

  return name;
}
