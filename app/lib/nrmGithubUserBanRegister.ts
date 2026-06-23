import {
  fetchGithubJsonDocument,
  putGithubContents,
  resolveGithubDataPat,
  utf8ToBase64,
} from '@/lib/nrmGithubContentsApi';
import { NRM_USER_BAN_LIST_JSON_API_PATH } from '@/lib/nrmRemoteDataConfig';
import type { NrmUserBanItem } from '@/lib/nrmUserBanClient';
import { logNrmDev, logNrmRunError } from '@/lib/nrmDevLog';

type UserBanListJson = {
  userBanList: Array<{
    id: number;
    userName: string;
    SerialNo: string;
    content: string;
    isBanned: boolean;
    date: string;
  }>;
};

function formatUserBanJson(doc: UserBanListJson): string {
  return `${JSON.stringify(doc, null, '\t')}\n`;
}

function todayYmd(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

async function putUserBanDocument(
  pat: string,
  doc: UserBanListJson,
  sha: string,
  message: string,
): Promise<void> {
  await putGithubContents(
    NRM_USER_BAN_LIST_JSON_API_PATH,
    pat,
    utf8ToBase64(formatUserBanJson(doc)),
    message,
    sha || undefined,
  );
}

export type NrmUserBanRegisterInput = {
  userName: string;
  serialNo: string;
  content: string;
};

export async function registerUserBanToGithub(input: NrmUserBanRegisterInput): Promise<void> {
  const tag = 'github-userban';
  logNrmDev(tag, { event: 'ban-start' });
  const t0 = Date.now();
  try {
    const pat = await resolveGithubDataPat();
    const { doc, sha } = await fetchGithubJsonDocument<UserBanListJson>(NRM_USER_BAN_LIST_JSON_API_PATH, pat, {
      userBanList: [],
    });
    let maxId = 0;
    for (const row of doc.userBanList) {
      if (typeof row.id === 'number' && row.id > maxId) maxId = row.id;
    }
    const entry = {
      id: maxId + 1,
      userName: input.userName.trim(),
      SerialNo: input.serialNo.trim(),
      content: input.content,
      isBanned: true,
      date: todayYmd(),
    };
    doc.userBanList.push(entry);
    await putUserBanDocument(pat, doc, sha, `admin: ban user id=${entry.id}`);
    logNrmDev(tag, { event: 'ban-ok', banId: entry.id, elapsedMs: Date.now() - t0 });
  } catch (e) {
    logNrmRunError(tag, e, { event: 'ban-error', elapsedMs: Date.now() - t0 });
    throw e;
  }
}

export async function unbanUserOnGithub(entry: NrmUserBanItem): Promise<void> {
  const tag = 'github-userban';
  logNrmDev(tag, { event: 'unban-start', banId: entry.id });
  const t0 = Date.now();
  try {
    const pat = await resolveGithubDataPat();
    const { doc, sha } = await fetchGithubJsonDocument<UserBanListJson>(NRM_USER_BAN_LIST_JSON_API_PATH, pat, {
      userBanList: [],
    });
    const idx = doc.userBanList.findIndex((row) => row.id === entry.id);
    if (idx < 0) {
      const err = new Error('차단 기록을 찾을 수 없습니다.');
      logNrmRunError(tag, err, { event: 'unban-not-found', banId: entry.id });
      throw err;
    }
    doc.userBanList[idx] = {
      ...doc.userBanList[idx],
      isBanned: false,
    };
    await putUserBanDocument(pat, doc, sha, `admin: unban user id=${entry.id}`);
    logNrmDev(tag, { event: 'unban-ok', banId: entry.id, elapsedMs: Date.now() - t0 });
  } catch (e) {
    if (e instanceof Error && (e.message === '차단 기록을 찾을 수 없습니다.' || e.message.startsWith('GitHub'))) throw e;
    logNrmRunError(tag, e, { event: 'unban-error', banId: entry.id, elapsedMs: Date.now() - t0 });
    throw e;
  }
}
