import AsyncStorage from '@react-native-async-storage/async-storage';

import { clearMelonHtmlCache } from '@/lib/nrmMelonHtmlCache';

const SESSION_KEY = 'nrmMelonAdultSession_v1';

export type NrmMelonAdultSession = {
  /** 멜론 HTTP Cookie 헤더 값 (MLCP·JSESSIONID 등) */
  cookieHeader: string;
  savedAt: number;
};

function normalizeCookieHeader(raw: string): string {
  return raw.trim().replace(/\s*;\s*/g, '; ').replace(/;\s*$/, '');
}

function normalizeSession(parsed: Partial<NrmMelonAdultSession>): NrmMelonAdultSession | null {
  const cookieHeader = normalizeCookieHeader(parsed.cookieHeader ?? '');
  if (!cookieHeader) return null;
  const savedAt =
    typeof parsed.savedAt === 'number' && Number.isFinite(parsed.savedAt)
      ? parsed.savedAt
      : Date.now();
  return { cookieHeader, savedAt };
}

export async function getMelonAdultSession(): Promise<NrmMelonAdultSession | null> {
  try {
    const raw = await AsyncStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<NrmMelonAdultSession>;
    return normalizeSession(parsed);
  } catch {
    return null;
  }
}

export async function getMelonAdultCookieHeader(): Promise<string | null> {
  const session = await getMelonAdultSession();
  return session?.cookieHeader ?? null;
}

export async function saveMelonAdultSession(cookieHeader: string): Promise<void> {
  const normalized = normalizeCookieHeader(cookieHeader);
  if (!normalized) {
    await clearMelonAdultSession();
    return;
  }
  const payload: NrmMelonAdultSession = {
    cookieHeader: normalized,
    savedAt: Date.now(),
  };
  await AsyncStorage.setItem(SESSION_KEY, JSON.stringify(payload));
  clearMelonHtmlCache();
}

export async function clearMelonAdultSession(): Promise<void> {
  await AsyncStorage.removeItem(SESSION_KEY);
  clearMelonHtmlCache();
}

export async function hasMelonAdultSession(): Promise<boolean> {
  const session = await getMelonAdultSession();
  return session != null;
}

/** MLCP(멜론 로그인) 쿠키 포함 여부 — 저장 전 검증용 */
export function melonCookieHeaderHasLogin(cookieHeader: string | undefined): boolean {
  const raw = normalizeCookieHeader(cookieHeader ?? '');
  if (!raw) return false;
  return /(?:^|;\s*)MLCP=/i.test(raw);
}
