import { NativeModules, Platform } from 'react-native';

type NrmSiteCookieModule = {
  getMelonLoginCookieHeader?: () => Promise<string | null>;
  clearMelonLoginCookies?: () => Promise<boolean>;
};

const nrmNative = NativeModules.NrmSiteCookie as NrmSiteCookieModule | undefined;

export function hasNrmMelonCookieNativeModule(): boolean {
  if (Platform.OS === 'ios') {
    const ios = NativeModules.NrmAudioMetadata as
      | { readMelonCookieHeader?: () => Promise<string> }
      | undefined;
    return typeof ios?.readMelonCookieHeader === 'function';
  }
  return (
    Platform.OS === 'android' &&
    typeof nrmNative?.getMelonLoginCookieHeader === 'function'
  );
}

export async function readMelonLoginCookieHeader(): Promise<string | null> {
  if (Platform.OS === 'ios') {
    const ios = NativeModules.NrmAudioMetadata as
      | { readMelonCookieHeader?: () => Promise<string> }
      | undefined;
    if (!ios?.readMelonCookieHeader) return null;
    try {
      const value = String(await ios.readMelonCookieHeader()).trim();
      return value.length > 0 ? value : null;
    } catch {
      return null;
    }
  }
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
  if (Platform.OS === 'ios') {
    const ios = NativeModules.NrmAudioMetadata as
      | { clearMelonCookies?: () => Promise<null> }
      | undefined;
    try {
      await ios?.clearMelonCookies?.();
    } catch {
      /* ignore */
    }
    return;
  }
  if (!hasNrmMelonCookieNativeModule()) return;
  try {
    await nrmNative!.clearMelonLoginCookies!();
  } catch {
    /* ignore */
  }
}
