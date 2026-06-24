import { getNrmGithubDataPat } from '@/lib/nrmGithubDataPat';
import { logNrmDev, logNrmRunError } from '@/lib/nrmDevLog';

const GITHUB_API = 'https://api.github.com';

export type GithubContentsResponse = {
  sha?: string;
  content?: string;
};

export function utf8ToBase64(value: string): string {
  const binary = unescape(encodeURIComponent(value));
  if (typeof globalThis.btoa !== 'function') {
    throw new Error('base64 unavailable');
  }
  return globalThis.btoa(binary);
}

export function base64ToUtf8(b64: string): string {
  const cleaned = b64.replace(/\s/g, '');
  const binary = globalThis.atob(cleaned);
  return decodeURIComponent(escape(binary));
}

function githubHeaders(pat: string, json = true): Record<string, string> {
  const h: Record<string, string> = {
    Accept: 'application/vnd.github+json',
    Authorization: `Bearer ${pat}`,
    'X-GitHub-Api-Version': '2022-11-28',
    'Cache-Control': 'no-cache, no-store',
    Pragma: 'no-cache',
  };
  if (json) h['Content-Type'] = 'application/json';
  return h;
}

export async function fetchGithubJsonDocument<T>(
  apiPath: string,
  pat: string,
  emptyDoc: T,
): Promise<{ doc: T; sha: string }> {
  const tag = 'github-data';
  logNrmDev(tag, { event: 'fetch-start', path: apiPath });
  const t0 = Date.now();
  try {
    const res = await fetch(apiPath, { headers: githubHeaders(pat, false) });
    const elapsedMs = Date.now() - t0;
    if (res.status === 404) {
      logNrmDev(tag, { event: 'fetch-not-found', path: apiPath, elapsedMs });
      return { doc: emptyDoc, sha: '' };
    }
    if (!res.ok) {
      const err = new Error(`GitHub read failed (${res.status})`);
      logNrmRunError(tag, err, { path: apiPath, status: res.status, elapsedMs });
      throw err;
    }
    const body = (await res.json()) as GithubContentsResponse;
    const sha = String(body.sha ?? '');
    if (!body.content) {
      logNrmDev(tag, { event: 'fetch-empty', path: apiPath, sha, elapsedMs });
      return { doc: emptyDoc, sha };
    }
    logNrmDev(tag, { event: 'fetch-ok', path: apiPath, sha, elapsedMs });
    return { doc: JSON.parse(base64ToUtf8(body.content)) as T, sha };
  } catch (e) {
    if (e instanceof Error && e.message.startsWith('GitHub read failed')) throw e;
    logNrmRunError(tag, e, { event: 'fetch-error', path: apiPath, elapsedMs: Date.now() - t0 });
    throw e;
  }
}

export async function putGithubContents(
  apiPath: string,
  pat: string,
  contentBase64: string,
  message: string,
  sha?: string,
): Promise<void> {
  const tag = 'github-data';
  logNrmDev(tag, { event: 'put-start', path: apiPath, message, hasSha: !!sha });
  const t0 = Date.now();
  const body: Record<string, string> = {
    message,
    content: contentBase64,
    branch: 'main',
  };
  if (sha) body.sha = sha;
  try {
    const res = await fetch(apiPath, {
      method: 'PUT',
      headers: githubHeaders(pat),
      body: JSON.stringify(body),
    });
    const elapsedMs = Date.now() - t0;
    if (!res.ok) {
      const err = new Error(`GitHub write failed (${res.status})`);
      logNrmRunError(tag, err, { path: apiPath, status: res.status, elapsedMs });
      throw err;
    }
    logNrmDev(tag, { event: 'put-ok', path: apiPath, status: res.status, elapsedMs });
  } catch (e) {
    if (e instanceof Error && e.message.startsWith('GitHub write failed')) throw e;
    logNrmRunError(tag, e, { event: 'put-error', path: apiPath, elapsedMs: Date.now() - t0 });
    throw e;
  }
}

export async function resolveGithubDataPat(): Promise<string> {
  const pat = await getNrmGithubDataPat();
  if (!pat) {
    logNrmRunError('github-data', new Error('GitHub PAT not configured'), { event: 'pat-missing' });
    throw new Error('GitHub 등록 토큰이 설정되지 않았습니다.');
  }
  return pat;
}

export { GITHUB_API };
