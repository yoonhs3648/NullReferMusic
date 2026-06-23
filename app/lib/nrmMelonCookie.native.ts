import { NativeModules, Platform } from 'react-native';

type NrmSiteCookieModule = {
  getMelonLoginCookieHeader?: () => Promise<string | null>;
  clearMelonLoginCookies?: () => Promise<boolean>;
};

const nrmNative = NativeModules.NrmSiteCookie as NrmSiteCookieModule | undefined;

export function hasNrmMelonCookieNativeModule(): boolean {
  return (
    Platform.OS === 'android' &&
    typeof nrmNative?.getMelonLoginCookieHeader === 'function'
  );
}

export async function readMelonLoginCookieHeader(): Promise<string | null> {
  if (!hasNrmMelonCookieNativeModule()) return null;
  try {
    const value = await nrmNative!.getMelonLoginCookieHeader!();
    const trimmed = typeof value === 'string' ? value.trim() : '';
    return trimmed.length > 0 ? trimmed : null;
  } catch {
    return null;
  }
}

export async function clearMelonWebLoginCookies(): Promise<void> {
  if (!hasNrmMelonCookieNativeModule()) return;
  try {
    await nrmNative!.clearMelonLoginCookies!();
  } catch {
    /* ignore */
  }
}
