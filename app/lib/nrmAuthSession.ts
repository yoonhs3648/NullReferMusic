import AsyncStorage from '@react-native-async-storage/async-storage';

import { grantAdminSession, revokeAdminSession } from '@/lib/nrmAdminSession';
import { logNrmDev, logNrmRunError } from '@/lib/nrmDevLog';

const SESSION_KEY = 'nrm_auth_session_v1';
const PENDING_KEY = 'nrm_oauth_pending_v1';

export type NrmAppKind = 'google' | 'kakao';

export type NrmAuthSession = {
  serialNo: string;
  userName: string;
  userEmail: string;
  appKind: NrmAppKind;
  isAdmin: boolean;
};

export type NrmOAuthPendingProfile = {
  appKind: NrmAppKind;
  userName: string;
  userEmail: string;
};

let sessionCache: NrmAuthSession | null | undefined;
let pendingCache: NrmOAuthPendingProfile | null | undefined;
let sessionListener: ((session: NrmAuthSession | null) => void) | null = null;

export function registerNrmAuthSessionListener(
  listener: ((session: NrmAuthSession | null) => void) | null,
): void {
  sessionListener = listener;
}

function parseSession(raw: string | null): NrmAuthSession | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<NrmAuthSession>;
    const serialNo = String(parsed.serialNo ?? '').trim();
    const userEmail = String(parsed.userEmail ?? '').trim();
    const appKind = parsed.appKind === 'kakao' ? 'kakao' : parsed.appKind === 'google' ? 'google' : '';
    if (!serialNo || !userEmail || !appKind) return null;
    return {
      serialNo,
      userName: String(parsed.userName ?? '').trim(),
      userEmail,
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
    const appKind = parsed.appKind === 'kakao' ? 'kakao' : parsed.appKind === 'google' ? 'google' : '';
    if (!userEmail || !appKind) return null;
    return {
      appKind,
      userName: String(parsed.userName ?? '').trim(),
      userEmail,
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
  sessionListener?.(session);
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
  sessionListener?.(null);
}

export async function getNrmAuthSessionSerialNo(): Promise<string> {
  const session = await loadNrmAuthSession();
  return session?.serialNo.trim() ?? '';
}

export async function getNrmAuthSessionUserName(): Promise<string> {
  const session = await loadNrmAuthSession();
  return session?.userName.trim() ?? '';
}

export async function syncNrmAdminSessionFromAuth(): Promise<void> {
  const session = await loadNrmAuthSession();
  if (session?.isAdmin) {
    await grantAdminSession();
  } else {
    await revokeAdminSession();
  }
}
