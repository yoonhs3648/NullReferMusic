import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = 'nrm_admin_session_v1';

let cached = false;
let listener: ((active: boolean) => void) | null = null;

export function registerAdminSessionListener(fn: ((active: boolean) => void) | null): void {
  listener = fn;
}

export async function isAdminSessionActive(): Promise<boolean> {
  if (cached) return true;
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    cached = raw === '1';
  } catch {
    cached = false;
  }
  return cached;
}

export async function grantAdminSession(): Promise<void> {
  cached = true;
  await AsyncStorage.setItem(STORAGE_KEY, '1');
  listener?.(true);
}

export async function revokeAdminSession(): Promise<void> {
  cached = false;
  await AsyncStorage.removeItem(STORAGE_KEY);
  listener?.(false);
}

export function peekAdminSessionActive(): boolean {
  return cached;
}
