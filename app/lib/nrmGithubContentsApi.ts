import { getNrmGithubDataPat } from '@/lib/nrmGithubDataPat';

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
  };
  if (json) h['Content-Type'] = 'application/json';
  return h;
}

export async function fetchGithubJsonDocument<T>(
  apiPath: string,
  pat: string,
  emptyDoc: T,
): Promise<{ doc: T; sha: string }> {
  const res = await fetch(apiPath, { headers: githubHeaders(pat, false) });
  if (res.status === 404) return { doc: emptyDoc, sha: '' };
  if (!res.ok) throw new Error(`GitHub read failed (${res.status})`);
  const body = (await res.json()) as GithubContentsResponse;
  const sha = String(body.sha ?? '');
  if (!body.content) return { doc: emptyDoc, sha };
  return { doc: JSON.parse(base64ToUtf8(body.content)) as T, sha };
}

export async function putGithubContents(
  apiPath: string,
  pat: string,
  contentBase64: string,
  message: string,
  sha?: string,
): Promise<void> {
  const body: Record<string, string> = {
    message,
    content: contentBase64,
    branch: 'main',
  };
  if (sha) body.sha = sha;
  const res = await fetch(apiPath, {
    method: 'PUT',
    headers: githubHeaders(pat),
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`GitHub write failed (${res.status})`);
}

export async function resolveGithubDataPat(): Promise<string> {
  const pat = await getNrmGithubDataPat();
  if (!pat) throw new Error('GitHub 등록 토큰이 설정되지 않았습니다.');
  return pat;
}

export { GITHUB_API };
