/**
 * 파일 로그에 기록 전 민감정보를 마스킹하는 유틸리티.
 *
 * 규칙:
 *  - 로그 출력 텍스트만 변환하며, 실제 네트워크 요청·응답·로직에는 영향 없음.
 *  - 민감 필드는 "[MASKED:Nchars]" 또는 "Bearer [MASKED]" 형태로 대체.
 */

/** URL 쿼리스트링에서 마스킹할 파라미터 이름 (소문자) */
const SENSITIVE_QUERY_PARAMS = new Set([
  'api_key',
  'apikey',
  'token',
  'access_token',
  'accesstoken',
  'secret',
  'client_secret',
  'clientsecret',
  'password',
  'passwd',
  'auth',
  'key',
  'refresh_token',
  'refreshtoken',
  'api_secret',
  'apisecret',
  'shared_secret',
  'sharedsecret',
]);

/** HTTP 헤더 중 민감 헤더 이름 (소문자, Authorization은 별도 처리) */
const SENSITIVE_HEADER_KEYS = new Set([
  'cookie',
  'set-cookie',
  'x-api-key',
  'x-auth-token',
  'x-access-token',
  'x-session-token',
  'x-csrf-token',
]);

/** JSON body / response body 에서 마스킹할 키 이름 (소문자) */
const SENSITIVE_BODY_KEYS = new Set([
  'apikey',
  'api_key',
  'clientsecret',
  'client_secret',
  'sharedsecret',
  'shared_secret',
  'apisecret',
  'api_secret',
  'password',
  'passwd',
  'accesstoken',
  'access_token',
  'refreshtoken',
  'refresh_token',
  'idtoken',
  'id_token',
  'token',
  'secret',
  'authorization',
  'cookie',
  'cookievalue',
  'cookie_value',
  'sessionkey',
  'session_key',
  'authtoken',
  'auth_token',
  'pat',
  'github_pat',
  'github_token',
]);

/**
 * 개별 HTTP 헤더 값 마스킹.
 * - Authorization: scheme 접두어만 남기고 토큰 부분 마스킹 ("Bearer [MASKED]")
 * - Cookie / X-Api-Key 등: 전체 길이만 표시 ("[MASKED:Nchars]")
 */
export function maskSensitiveHeader(key: string, value: string): string {
  const lk = key.toLowerCase();
  if (lk === 'authorization') {
    const trimmed = value.trim();
    const spaceIdx = trimmed.indexOf(' ');
    if (spaceIdx > 0) {
      const scheme = trimmed.slice(0, spaceIdx);
      return `${scheme} [MASKED]`;
    }
    return '[MASKED]';
  }
  if (SENSITIVE_HEADER_KEYS.has(lk)) {
    return `[MASKED:${value.length}chars]`;
  }
  return value;
}

/**
 * URL 쿼리스트링에서 민감 파라미터 값을 "[MASKED]"로 치환.
 * 파싱 실패 시 원본 URL 반환.
 */
export function maskUrl(url: string): string {
  try {
    const u = new URL(url);
    let changed = false;
    u.searchParams.forEach((_, key) => {
      if (SENSITIVE_QUERY_PARAMS.has(key.toLowerCase())) {
        u.searchParams.set(key, '[MASKED]');
        changed = true;
      }
    });
    return changed ? u.toString() : url;
  } catch {
    return url;
  }
}

function maskJsonObjectValue(obj: unknown, depth: number): unknown {
  if (depth > 10) return obj;
  if (obj === null || typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) {
    return obj.map((item) => maskJsonObjectValue(item, depth + 1));
  }
  const result: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
    if (SENSITIVE_BODY_KEYS.has(k.toLowerCase())) {
      result[k] = typeof v === 'string' ? `[MASKED:${v.length}chars]` : '[MASKED]';
    } else {
      result[k] = maskJsonObjectValue(v, depth + 1);
    }
  }
  return result;
}

/** JSON body 또는 response body 텍스트에서 민감 필드 마스킹 */
export function maskBody(body: string): string {
  if (!body) return body;
  try {
    const parsed: unknown = JSON.parse(body);
    return JSON.stringify(maskJsonObjectValue(parsed, 0));
  } catch {
    return body.replace(
      /("(?:apiKey|api_key|clientSecret|client_secret|sharedSecret|shared_secret|apiSecret|api_secret|password|passwd|accessToken|access_token|refreshToken|refresh_token|idToken|id_token|token|secret|cookie|cookieValue|cookie_value|sessionKey|session_key|authToken|auth_token|pat|github_pat|github_token)"\s*:\s*)"([^"\\]|\\.)*"/gi,
      '$1"[MASKED]"',
    );
  }
}

/**
 * 헤더 Record 전체를 마스킹한 JSON 문자열로 변환.
 * nrmLoggedFetch.ts의 headerSnapshot 대체 역할.
 */
export function maskHeaderRecord(headers: Headers): string {
  try {
    const out: Record<string, string> = {};
    headers.forEach((v, k) => {
      out[k] = maskSensitiveHeader(k, v);
    });
    return JSON.stringify(out);
  } catch {
    return '{}';
  }
}
