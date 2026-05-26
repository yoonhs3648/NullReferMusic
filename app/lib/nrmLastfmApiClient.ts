import { nrmBackendFetch } from '@/lib/nrmBackendFetch';
import { isStandaloneApp, usesPcBackendInDev } from '@/lib/nrmDevRuntime';
import {
  getDefaultApiBaseUrl,
  getResolvedApiBaseUrl,
} from '@/lib/apiBaseUrl';
import type { NrmLastfmCredentials } from '@/lib/nrmLastfmApiSettings';

export type LastfmTokenIssueOutcome =
  | { ok: true; apiKey: string }
  | { ok: false; message: string };

// ─── Direct Last.fm key validation (Standalone APK / IPA) ────────────────────

async function validateKeyDirect(creds: NrmLastfmCredentials): Promise<LastfmTokenIssueOutcome> {
  const apiKey = creds.clientId.trim();
  if (!apiKey) return { ok: false, message: 'API Key를 입력하세요.' };
  try {
    const qs = new URLSearchParams({
      method: 'chart.gettoptracks',
      api_key: apiKey,
      format: 'json',
      limit: '1',
    });
    const res = await fetch(`https://ws.audioscrobbler.com/2.0/?${qs.toString()}`);
    if (!res.ok) return { ok: false, message: 'Last.fm API Key 확인에 실패했습니다.' };
    const data = (await res.json()) as { error?: number };
    if (typeof data.error === 'number') {
      const code = data.error;
      if (code === 10 || code === 4 || code === 26) {
        return { ok: false, message: 'API Key가 올바르지 않습니다. Last.fm 계정에서 키를 확인하세요.' };
      }
      return { ok: false, message: 'Last.fm API Key 확인에 실패했습니다.' };
    }
    return { ok: true, apiKey };
  } catch {
    return { ok: false, message: '네트워크에 연결되지 않았습니다. Wi‑Fi·데이터를 확인하세요.' };
  }
}

// ─── Backend proxy (Dev / Expo Go) ───────────────────────────────────────────

async function issueWithBase(
  base: string,
  creds: NrmLastfmCredentials,
): Promise<LastfmTokenIssueOutcome> {
  try {
    const res = await nrmBackendFetch(`${base}/api/charts/lastfm/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        apiKey: creds.clientId.trim(),
        sharedSecret: creds.clientSecret.trim(),
      }),
    });
    const rawText = await res.text();
    if (!res.ok) {
      let message = 'Last.fm API Key 확인에 실패했습니다.';
      try {
        const err = JSON.parse(rawText) as { error?: string };
        if (err.error === 'lastfm_auth_failed') {
          message = 'API Key가 올바르지 않습니다. Last.fm 계정에서 키를 확인하세요.';
        } else if (err.error === 'lastfm_not_configured') {
          message = 'API Key를 입력하세요.';
        }
      } catch {
        /* ignore */
      }
      return { ok: false, message };
    }
    const data = JSON.parse(rawText) as { apiKey?: string };
    const apiKey = data.apiKey?.trim() || creds.clientId.trim();
    return { ok: true, apiKey };
  } catch {
    return {
      ok: false,
      message: '백엔드에 연결하지 못했습니다. PC에서 서버(8787)가 실행 중인지 확인하세요.',
    };
  }
}

export async function issueLastfmAccessToken(
  creds: NrmLastfmCredentials,
): Promise<LastfmTokenIssueOutcome> {
  if (isStandaloneApp()) {
    return validateKeyDirect(creds);
  }

  const resolved = await getResolvedApiBaseUrl();
  const primary =
    resolved ?? (usesPcBackendInDev() ? getDefaultApiBaseUrl() : null);
  if (!primary) {
    return {
      ok: false,
      message: '백엔드에 연결하지 못했습니다. PC에서 서버(8787)가 실행 중인지 확인하세요.',
    };
  }

  const first = await issueWithBase(primary, creds);
  if (first.ok || !usesPcBackendInDev()) {
    return first;
  }
  const fallback = getDefaultApiBaseUrl();
  if (fallback === primary) {
    return first;
  }
  return issueWithBase(fallback, creds);
}
