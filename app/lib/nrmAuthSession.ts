import AsyncStorage from '@react-native-async-storage/async-storage';

import { grantAdminSession, revokeAdminSession } from '@/lib/nrmAdminSession';
import { logNrmDev, logNrmRunError } from '@/lib/nrmDevLog';

const SESSION_KEY = 'nrm_auth_session_v1';
const PENDING_KEY = 'nrm_oauth_pending_v1';

export type NrmAppKind = 'google' | 'kakao';

export type NrmAuthSession = {
  serialNo: string;
  /** OAuth 공급자가 제공한 원본 이름 */
  userName: string;
  /** 앱 설정에서 지정한 계정별 이름. 없으면 OAuth 원본 이름 사용 */
  userCustomName: string | null;
  userEmail: string;
  providerUserId: string;
  appKind: NrmAppKind;
  isAdmin: boolean;
};

export type NrmOAuthPendingProfile = {
  appKind: NrmAppKind;
  userName: string;
  userEmail: string;
  providerUserId: string;
};

let sessionCache: NrmAuthSession | null | undefined;
let pendingCache: NrmOAuthPendingProfile | null | undefined;
let sessionListener: ((session: NrmAuthSession | null) => void) | null = null;
const additionalSessionListeners = new Set<
  (session: NrmAuthSession | null) => void
>();

export function registerNrmAuthSessionListener(
  listener: ((session: NrmAuthSession | null) => void) | null,
): void {
  sessionListener = listener;
}

export function subscribeNrmAuthSessionListener(
  listener: (session: NrmAuthSession | null) => void,
): () => void {
  additionalSessionListeners.add(listener);
  return () => additionalSessionListeners.delete(listener);
}

function notifySessionChanged(session: NrmAuthSession | null): void {
  sessionListener?.(session);
  for (const listener of additionalSessionListeners) listener(session);
}

export function getEffectiveNrmAuthSessionUserName(
  session: NrmAuthSession | null | undefined,
): string {
  return session?.userCustomName?.trim() || session?.userName.trim() || '';
}

export function getNrmAuthSessionSnapshot(): NrmAuthSession | null {
  return sessionCache ?? null;
}

function parseSession(raw: string | null): NrmAuthSession | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<NrmAuthSession>;
    const serialNo = String(parsed.serialNo ?? '').trim();
    const userEmail = String(parsed.userEmail ?? '').trim();
    const providerUserId = String(parsed.providerUserId ?? '').trim();
    const appKind = parsed.appKind === 'kakao' ? 'kakao' : parsed.appKind === 'google' ? 'google' : '';
    if (!serialNo || (!userEmail && !providerUserId) || !appKind) return null;
    return {
      serialNo,
      userName: String(parsed.userName ?? '').trim(),
      userCustomName: String(parsed.userCustomName ?? '').trim() || null,
      userEmail,
      providerUserId,
      appKind,
      isAdmin: parsed.isAdmin === true,
    };
  } catch {
    return null;
  }
}

function parsePending(raw: string | null): NrmOAuthPendingProfile | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<NrmOAuthPendingProfile>;
    const userEmail = String(parsed.userEmail ?? '').trim();
    const providerUserId = String(parsed.providerUserId ?? '').trim();
    const appKind = parsed.appKind === 'kakao' ? 'kakao' : parsed.appKind === 'google' ? 'google' : '';
    if ((!userEmail && !providerUserId) || !appKind) return null;
    return {
      appKind,
      userName: String(parsed.userName ?? '').trim(),
      userEmail,
      providerUserId,
    };
  } catch {
    return null;
  }
}

export async function loadNrmAuthSession(): Promise<NrmAuthSession | null> {
  if (sessionCache !== undefined) return sessionCache;
  try {
    sessionCache = parseSession(await AsyncStorage.getItem(SESSION_KEY));
    logNrmDev('oauth.session.load', {
      event: sessionCache ? 'restored' : 'missing',
      provider: sessionCache?.appKind ?? null,
    });
  } catch (e) {
    sessionCache = null;
    logNrmRunError('oauth.session.load', e);
  }
  return sessionCache;
}

export async function loadNrmOAuthPendingProfile(): Promise<NrmOAuthPendingProfile | null> {
  if (pendingCache !== undefined) return pendingCache;
  try {
    pendingCache = parsePending(await AsyncStorage.getItem(PENDING_KEY));
  } catch {
    pendingCache = null;
  }
  return pendingCache;
}

export async function saveNrmOAuthPendingProfile(
  profile: NrmOAuthPendingProfile,
): Promise<void> {
  pendingCache = profile;
  await AsyncStorage.setItem(PENDING_KEY, JSON.stringify(profile));
  logNrmDev('oauth.pending.save', { provider: profile.appKind });
}

export async function clearNrmOAuthPendingProfile(): Promise<void> {
  pendingCache = null;
  await AsyncStorage.removeItem(PENDING_KEY);
}

export async function saveNrmAuthSession(session: NrmAuthSession): Promise<void> {
  sessionCache = session;
  await AsyncStorage.setItem(SESSION_KEY, JSON.stringify(session));
  if (session.isAdmin) {
    await grantAdminSession();
  } else {
    await revokeAdminSession();
  }
  logNrmDev('oauth.session.save', {
    provider: session.appKind,
    isAdmin: session.isAdmin,
  });
  notifySessionChanged(session);
}

export async function setNrmAuthSessionUserCustomName(
  userCustomName: string | null,
): Promise<NrmAuthSession | null> {
  const session = await loadNrmAuthSession();
  if (!session) return null;
  const next: NrmAuthSession = {
    ...session,
    userCustomName: userCustomName?.trim() || null,
  };
  await saveNrmAuthSession(next);
  return next;
}

export async function logoutNrmAuthSession(): Promise<void> {
  const provider = sessionCache?.appKind ?? null;
  try {
    if (provider) {
      const { logoutNrmOAuthProvider } = await import('@/lib/nrmOAuthLogin');
      await logoutNrmOAuthProvider(provider);
    }
  } catch (e) {
    logNrmRunError('oauth.session.provider-logout', e, { provider });
  }
  try {
    await AsyncStorage.multiRemove([SESSION_KEY, PENDING_KEY]);
  } catch (e) {
    logNrmRunError('oauth.session.logout', e, { provider });
    throw e;
  }
  sessionCache = null;
  pendingCache = null;
  try {
    await revokeAdminSession();
  } catch (e) {
    logNrmRunError('oauth.session.logout.admin', e, { provider });
  }
  logNrmDev('oauth.session.logout', { provider, result: 'success' });
  notifySessionChanged(null);
}

export async function getNrmAuthSessionSerialNo(): Promise<string> {
  const session = await loadNrmAuthSession();
  return session?.serialNo.trim() ?? '';
}

export async function getNrmAuthSessionUserName(): Promise<string> {
  const session = await loadNrmAuthSession();
  return getEffectiveNrmAuthSessionUserName(session);
}

export async function syncNrmAdminSessionFromAuth(): Promise<void> {
  const session = await loadNrmAuthSession();
  if (session?.isAdmin) {
    await grantAdminSession();
  } else {
    await revokeAdminSession();
  }
}
