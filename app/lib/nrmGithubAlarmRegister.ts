import { getResolvedApiBaseUrl } from '@/lib/apiBaseUrl';
import { getNrmGithubDataPat } from '@/lib/nrmGithubDataPat';
import {
  NRM_ALARM_JSON_API_PATH,
  NRM_ALARM_JSON_RAW_URL,
} from '@/lib/nrmRemoteDataConfig';
import { invalidateAlarmCache } from '@/lib/nrmAlarmClient';
import { fetchGithubRawJson } from '@/lib/nrmGithubRawFetch';
import { logNrmDev, logNrmRunError } from '@/lib/nrmDevLog';

export type NrmAlarmRegisterInput = {
  isNoti: boolean;
  title: string;
  content: string;
  serialNo: string;
};

type AlarmJson = {
  alarm: Array<{
    id: number;
    isNoti: boolean;
    title: string;
    content: string;
    SerialNo: string;
    date: string;
  }>;
};

type GithubContentsResponse = {
  sha?: string;
  content?: string;
};

function utf8ToBase64(value: string): string {
  const binary = unescape(encodeURIComponent(value));
  if (typeof globalThis.btoa === 'function') {
    return globalThis.btoa(binary);
  }
  throw new Error('base64 unavailable');
}

function base64ToUtf8(b64: string): string {
  const cleaned = b64.replace(/\s/g, '');
  const binary = globalThis.atob(cleaned);
  return decodeURIComponent(escape(binary));
}

function formatAlarmJson(doc: AlarmJson): string {
  return `${JSON.stringify(doc, null, '\t')}\n`;
}

function todayYmd(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

async function fetchAlarmDocumentFromGithub(
  pat: string,
): Promise<{ doc: AlarmJson; sha: string }> {
  const res = await fetch(NRM_ALARM_JSON_API_PATH, {
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${pat}`,
      'X-GitHub-Api-Version': '2022-11-28',
    },
  });
  if (res.status === 404) {
    return { doc: { alarm: [] }, sha: '' };
  }
  if (!res.ok) {
    throw new Error(`GitHub alarm.json read failed (${res.status})`);
  }
  const body = (await res.json()) as GithubContentsResponse;
  const sha = String(body.sha ?? '');
  if (!body.content) {
    return { doc: { alarm: [] }, sha };
  }
  const parsed = JSON.parse(base64ToUtf8(body.content)) as AlarmJson;
  return { doc: { alarm: Array.isArray(parsed.alarm) ? parsed.alarm : [] }, sha };
}

async function putAlarmDocumentToGithub(
  pat: string,
  doc: AlarmJson,
  sha: string,
  message: string,
): Promise<void> {
  const body: Record<string, string> = {
    message,
    content: utf8ToBase64(formatAlarmJson(doc)),
    branch: 'main',
  };
  if (sha) body.sha = sha;
  const res = await fetch(NRM_ALARM_JSON_API_PATH, {
    method: 'PUT',
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${pat}`,
      'Content-Type': 'application/json',
      'X-GitHub-Api-Version': '2022-11-28',
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new Error(`GitHub alarm.json write failed (${res.status})`);
  }
}

async function registerViaBackend(input: NrmAlarmRegisterInput): Promise<boolean> {
  const base = await getResolvedApiBaseUrl();
  if (!base) return false;
  try {
    const res = await fetch(`${base}/api/nrm-data/alarm`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        isNoti: input.isNoti,
        title: input.title.trim(),
        content: input.content,
        serialNo: input.serialNo.trim(),
      }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export async function registerAlarmToGithub(input: NrmAlarmRegisterInput): Promise<void> {
  const tag = 'github-alarm';
  logNrmDev(tag, { event: 'register-start', isNoti: input.isNoti });
  const t0 = Date.now();

  try {
    const viaBackend = await registerViaBackend(input);
    if (viaBackend) {
      logNrmDev(tag, { event: 'register-ok-backend', elapsedMs: Date.now() - t0 });
      invalidateAlarmCache();
      return;
    }

    logNrmDev(tag, { event: 'backend-unavailable-fallback-github' });

    const pat = await getNrmGithubDataPat();
    if (!pat) {
      const err = new Error('GitHub 등록 토큰이 설정되지 않았습니다.');
      logNrmRunError(tag, err, { event: 'pat-missing' });
      throw err;
    }

    const { doc, sha } = await fetchAlarmDocumentFromGithub(pat);
    let maxId = 0;
    for (const row of doc.alarm) {
      if (typeof row.id === 'number' && row.id > maxId) maxId = row.id;
    }
    const entry = {
      id: maxId + 1,
      isNoti: input.isNoti,
      title: input.title.trim(),
      content: input.content,
      SerialNo: input.serialNo.trim(),
      date: todayYmd(),
    };
    doc.alarm.push(entry);
    await putAlarmDocumentToGithub(
      pat,
      doc,
      sha,
      `admin: register alarm id=${entry.id}`,
    );
    logNrmDev(tag, { event: 'register-ok-github', alarmId: entry.id, elapsedMs: Date.now() - t0 });
    invalidateAlarmCache();
  } catch (e) {
    logNrmRunError(tag, e, { event: 'register-error', elapsedMs: Date.now() - t0 });
    throw e;
  }
}

/** raw URL로 현재 문서 읽기 (등록 전 id 계산용 폴백) */
export async function peekAlarmJsonFromRaw(): Promise<AlarmJson> {
  try {
    const parsed = await fetchGithubRawJson<AlarmJson>(NRM_ALARM_JSON_RAW_URL);
    return { alarm: Array.isArray(parsed.alarm) ? parsed.alarm : [] };
  } catch {
    return { alarm: [] };
  }
}
