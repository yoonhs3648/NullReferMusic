import * as AuthSession from 'expo-auth-session';
import * as WebBrowser from 'expo-web-browser';
import Constants from 'expo-constants';
import { Platform } from 'react-native';

import oauthConfig from '../nrm-oauth.config.json';
import type { NrmAppKind, NrmOAuthPendingProfile } from '@/lib/nrmAuthSession';
import { logNrmDev, logNrmRunError } from '@/lib/nrmDevLog';

WebBrowser.maybeCompleteAuthSession();

const REDIRECT_SCHEME = 'nullrefermusic';
const REDIRECT_PATH = 'oauth';

function extraString(key: string): string {
  const extra = Constants.expoConfig?.extra as Record<string, unknown> | undefined;
  const v = extra?.[key];
  return typeof v === 'string' ? v.trim() : '';
}

function configString(key: keyof typeof oauthConfig): string {
  return String(oauthConfig[key] ?? '').trim();
}

function getGoogleClientId(): string {
  if (Platform.OS === 'android') {
    return extraString('oauthGoogleAndroidClientId') || configString('googleAndroidClientId');
  }
  if (Platform.OS === 'ios') {
    return extraString('oauthGoogleIosClientId') || configString('googleIosClientId');
  }
  return extraString('oauthGoogleWebClientId') || configString('googleWebClientId');
}

function getGoogleWebClientId(): string {
  return extraString('oauthGoogleWebClientId') || configString('googleWebClientId');
}

function getKakaoRestApiKey(): string {
  return (
    extraString('oauthKakaoRestApiKey') ||
    String(oauthConfig.kakaoRestApiKey ?? '').trim()
  );
}

function getKakaoNativeAppKey(): string {
  return (
    extraString('oauthKakaoNativeAppKey') ||
    String(oauthConfig.kakaoNativeAppKey ?? '').trim()
  );
}

function redirectUri(): string {
  return AuthSession.makeRedirectUri({
    scheme: REDIRECT_SCHEME,
    path: REDIRECT_PATH,
    native: `${REDIRECT_SCHEME}://${REDIRECT_PATH}`,
  });
}

function googleRedirectUri(clientId: string): string {
  if (Platform.OS === 'web') return redirectUri();
  const suffix = '.apps.googleusercontent.com';
  if (!clientId.endsWith(suffix)) {
    throw new Error('Google OAuth 클라이언트 ID 형식이 올바르지 않습니다.');
  }
  const reverseScheme = `com.googleusercontent.apps.${clientId.slice(0, -suffix.length)}`;
  return `${reverseScheme}:/oauthredirect`;
}

function oauthResultError(
  provider: NrmAppKind,
  result: AuthSession.AuthSessionResult,
): Error {
  const params = result.type === 'error' ? result.params : undefined;
  const description = String(params?.error_description ?? '').trim();
  const code = String(params?.error ?? result.type).trim();
  logNrmRunError(`oauth.${provider}.authorize`, new Error(description || code), {
    provider,
    stage: 'authorize',
    resultType: result.type,
    errorCode: code,
  });
  if (result.type === 'cancel' || result.type === 'dismiss') return new Error('cancelled');
  return new Error(description || `${provider === 'google' ? 'Google' : '카카오'} 로그인에 실패했습니다.`);
}

function decodeJwtPayload(idToken: string): Record<string, unknown> {
  const parts = idToken.split('.');
  if (parts.length < 2) throw new Error('invalid id_token');
  const b64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
  const padded = b64 + '='.repeat((4 - (b64.length % 4)) % 4);
  const json = typeof atob === 'function' ? atob(padded) : Buffer.from(padded, 'base64').toString('utf8');
  return JSON.parse(json) as Record<string, unknown>;
}

async function loginWithGoogleNative(): Promise<NrmOAuthPendingProfile> {
  const webClientId = getGoogleWebClientId();
  if (!webClientId) {
    throw new Error('Google 로그인 설정(googleWebClientId)이 없습니다.');
  }
  const {
    GoogleSignin,
    isErrorWithCode,
    statusCodes,
  } = await import('@react-native-google-signin/google-signin');
  GoogleSignin.configure({ webClientId });
  logNrmDev('oauth.google.start', {
    provider: 'google',
    platform: Platform.OS,
    method: 'native',
  });
  try {
    await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
    const response = await GoogleSignin.signIn();
    if (response.type !== 'success') throw new Error('cancelled');
    const providerUserId = String(response.data.user.id ?? '').trim();
    const email = String(response.data.user.email ?? '').trim();
    const name = String(
      response.data.user.name ?? response.data.user.givenName ?? '',
    ).trim();
    if (!email) {
      throw new Error('Google 계정 이메일을 확인할 수 없습니다.');
    }
    logNrmDev('oauth.google.success', {
      provider: 'google',
      stage: 'profile',
      method: 'native',
    });
    return {
      appKind: 'google',
      userName: name || email.split('@')[0],
      userEmail: email.toLowerCase(),
      providerUserId,
    };
  } catch (e) {
    if (
      (e instanceof Error && e.message === 'cancelled') ||
      (isErrorWithCode(e) && e.code === statusCodes.SIGN_IN_CANCELLED)
    ) {
      throw new Error('cancelled');
    }
    logNrmRunError('oauth.google.native-login', e, {
      provider: 'google',
      stage: 'native-login',
    });
    const errorCode = isErrorWithCode(e) ? String(e.code) : '';
    if (errorCode === '10' || errorCode === 'DEVELOPER_ERROR') {
      throw new Error(
        'Google Cloud에서 패키지명과 앱 서명 SHA-1이 등록되지 않았습니다.',
      );
    }
    throw new Error('Google 로그인에 실패했습니다.');
  }
}

async function loginWithGoogleBrowser(): Promise<NrmOAuthPendingProfile> {
  const clientId = getGoogleClientId();
  if (!clientId) {
    throw new Error(
      Platform.OS === 'android'
        ? 'Google 로그인 설정(googleAndroidClientId)이 없습니다.'
        : 'Google 로그인 클라이언트 ID 설정이 없습니다.',
    );
  }
  const callbackUri = googleRedirectUri(clientId);
  const discovery: AuthSession.DiscoveryDocument = {
    authorizationEndpoint: 'https://accounts.google.com/o/oauth2/v2/auth',
    tokenEndpoint: 'https://oauth2.googleapis.com/token',
  };
  const request = new AuthSession.AuthRequest({
    clientId,
    redirectUri: callbackUri,
    scopes: ['openid', 'profile', 'email'],
    responseType: AuthSession.ResponseType.Code,
    usePKCE: true,
    extraParams: { nonce: `${Date.now()}` },
  });
  logNrmDev('oauth.google.start', {
    provider: 'google',
    platform: Platform.OS,
    redirectScheme: callbackUri.split(':')[0],
    pkce: true,
  });
  const result = await request.promptAsync(discovery);
  if (result.type !== 'success') throw oauthResultError('google', result);
  const code = result.params.code;
  if (!code) {
    throw new Error('Google 인증 코드를 받지 못했습니다.');
  }
  let token: AuthSession.TokenResponse;
  try {
    token = await AuthSession.exchangeCodeAsync(
      {
        clientId,
        code,
        redirectUri: callbackUri,
        extraParams: request.codeVerifier
          ? { code_verifier: request.codeVerifier }
          : undefined,
      },
      discovery,
    );
  } catch (e) {
    logNrmRunError('oauth.google.token', e, {
      provider: 'google',
      stage: 'token',
    });
    throw e;
  }
  const idToken = token.idToken;
  if (!idToken) {
    throw new Error('Google 계정 정보를 받지 못했습니다.');
  }
  const payload = decodeJwtPayload(idToken);
  const providerUserId = String(payload.sub ?? '').trim();
  const email = String(payload.email ?? '').trim();
  const name = String(payload.name ?? payload.given_name ?? '').trim();
  if (!email) {
    throw new Error('Google 계정 이메일을 확인할 수 없습니다.');
  }
  logNrmDev('oauth.google.success', {
    provider: 'google',
    stage: 'profile',
  });
  return {
    appKind: 'google',
    userName: name || email.split('@')[0],
    userEmail: email.toLowerCase(),
    providerUserId,
  };
}

async function loginWithKakaoNative(): Promise<NrmOAuthPendingProfile> {
  const nativeAppKey = getKakaoNativeAppKey();
  if (!nativeAppKey) {
    throw new Error(
      '카카오 로그인 설정(kakaoNativeAppKey)이 없습니다. 카카오 네이티브 앱 키를 설정해 주세요.',
    );
  }
  const [{ initializeKakaoSDK }, kakaoUser] = await Promise.all([
    import('@react-native-kakao/core'),
    import('@react-native-kakao/user'),
  ]);
  await initializeKakaoSDK(nativeAppKey);
  const available = await kakaoUser.isKakaoTalkLoginAvailable();
  if (!available) {
    throw new Error(
      '카카오톡 앱이 설치되어 있어야 로그인할 수 있습니다. 카카오톡을 설치한 뒤 다시 시도해 주세요.',
    );
  }

  logNrmDev('oauth.kakao.start', {
    provider: 'kakao',
    platform: Platform.OS,
    method: 'kakaotalk',
  });
  try {
    await kakaoUser.login();
  } catch (e) {
    const raw = e instanceof Error ? e.message : String(e);
    if (/cancel|canceled|cancelled|user_cancel/i.test(raw)) {
      throw new Error('cancelled');
    }
    logNrmRunError('oauth.kakao.native-login', e, {
      provider: 'kakao',
      stage: 'native-login',
    });
    throw new Error('카카오톡 로그인에 실패했습니다.');
  }

  let user: Awaited<ReturnType<typeof kakaoUser.me>>;
  try {
    user = await kakaoUser.me();
    if (user.emailNeedsAgreement || !String(user.email ?? '').trim()) {
      await kakaoUser.scopes(['account_email']);
      user = await kakaoUser.me();
    }
  } catch (e) {
    logNrmRunError('oauth.kakao.profile', e, {
      provider: 'kakao',
      stage: 'profile',
    });
    throw new Error('카카오 계정 정보를 가져오지 못했습니다.');
  }
  const providerUserId = String(user.id ?? '').trim();
  const email = String(user.email ?? '').trim();
  const name = String(user.nickname ?? user.name ?? '').trim();
  if (!providerUserId) {
    throw new Error('카카오 계정 식별 정보를 받지 못했습니다.');
  }
  if (!email) {
    throw new Error('카카오 로그인에는 이메일 사용 동의가 필요합니다.');
  }
  logNrmDev('oauth.kakao.success', {
    provider: 'kakao',
    stage: 'profile',
    method: 'kakaotalk',
  });
  return {
    appKind: 'kakao',
    userName: name || email.split('@')[0],
    userEmail: email.toLowerCase(),
    providerUserId,
  };
}

async function loginWithKakaoBrowser(): Promise<NrmOAuthPendingProfile> {
  const clientId = getKakaoRestApiKey();
  if (!clientId) {
    throw new Error('카카오 로그인 설정(kakaoRestApiKey)이 없습니다.');
  }
  const discovery: AuthSession.DiscoveryDocument = {
    authorizationEndpoint: 'https://kauth.kakao.com/oauth/authorize',
    tokenEndpoint: 'https://kauth.kakao.com/oauth/token',
  };
  const request = new AuthSession.AuthRequest({
    clientId,
    redirectUri: redirectUri(),
    scopes: ['profile_nickname', 'account_email'],
    responseType: AuthSession.ResponseType.Code,
    usePKCE: false,
  });
  logNrmDev('oauth.kakao.start', {
    provider: 'kakao',
    platform: Platform.OS,
    redirectScheme: redirectUri().split(':')[0],
  });
  const result = await request.promptAsync(discovery);
  if (result.type !== 'success') throw oauthResultError('kakao', result);
  const code = result.params.code;
  if (!code) {
    throw new Error('카카오 인증 코드를 받지 못했습니다.');
  }
  const tokenBody = new URLSearchParams({
    grant_type: 'authorization_code',
    client_id: clientId,
    redirect_uri: redirectUri(),
    code,
  });
  if (request.codeVerifier) {
    tokenBody.set('code_verifier', request.codeVerifier);
  }
  const tokenRes = await fetch('https://kauth.kakao.com/oauth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=utf-8' },
    body: tokenBody.toString(),
  });
  const tokenJson = (await tokenRes.json()) as {
    access_token?: string;
    error?: string;
    error_description?: string;
  };
  if (!tokenRes.ok || !tokenJson.access_token) {
    logNrmRunError(
      'oauth.kakao.token',
      new Error(tokenJson.error_description || tokenJson.error || 'token_failed'),
      {
        provider: 'kakao',
        stage: 'token',
        status: tokenRes.status,
        errorCode: tokenJson.error ?? null,
      },
    );
    throw new Error(tokenJson.error_description || '카카오 토큰 발급에 실패했습니다.');
  }
  const meRes = await fetch('https://kapi.kakao.com/v2/user/me', {
    headers: { Authorization: `Bearer ${tokenJson.access_token}` },
  });
  const me = (await meRes.json()) as {
    id?: number | string;
    kakao_account?: {
      email?: string;
      profile?: { nickname?: string };
    };
  };
  const providerUserId = String(me.id ?? '').trim();
  const email = String(me.kakao_account?.email ?? '').trim();
  const name = String(me.kakao_account?.profile?.nickname ?? '').trim();
  if (!providerUserId) {
    throw new Error('카카오 계정 식별 정보를 받지 못했습니다.');
  }
  if (!email) {
    throw new Error('카카오 로그인에는 이메일 사용 동의가 필요합니다.');
  }
  logNrmDev('oauth.kakao.success', {
    provider: 'kakao',
    stage: 'profile',
  });
  return {
    appKind: 'kakao',
    userName: name || email.split('@')[0],
    userEmail: email.toLowerCase(),
    providerUserId,
  };
}

export async function loginWithNrmOAuth(kind: NrmAppKind): Promise<NrmOAuthPendingProfile> {
  try {
    if (kind === 'google') {
      return Platform.OS === 'web'
        ? await loginWithGoogleBrowser()
        : await loginWithGoogleNative();
    }
    return Platform.OS === 'web'
      ? await loginWithKakaoBrowser()
      : await loginWithKakaoNative();
  } catch (e) {
    if (!(e instanceof Error && e.message === 'cancelled')) {
      logNrmRunError(`oauth.${kind}.failed`, e, { provider: kind });
    }
    throw e;
  }
}

export async function logoutNrmOAuthProvider(kind: NrmAppKind): Promise<void> {
  if (kind === 'google') {
    const webClientId = getGoogleWebClientId();
    const { GoogleSignin } = await import(
      '@react-native-google-signin/google-signin'
    );
    if (webClientId) GoogleSignin.configure({ webClientId });
    await GoogleSignin.signOut();
    return;
  }
  if (Platform.OS === 'web') return;
  const nativeAppKey = getKakaoNativeAppKey();
  if (!nativeAppKey) return;
  const [{ initializeKakaoSDK }, kakaoUser] = await Promise.all([
    import('@react-native-kakao/core'),
    import('@react-native-kakao/user'),
  ]);
  await initializeKakaoSDK(nativeAppKey);
  if (await kakaoUser.isLogined()) await kakaoUser.logout();
}
