import {
  fetchGithubJsonDocument,
  putGithubContents,
  resolveGithubDataPat,
  utf8ToBase64,
} from '@/lib/nrmGithubContentsApi';
import { NRM_USER_LIST_JSON_API_PATH } from '@/lib/nrmRemoteDataConfig';
import { logNrmDev, logNrmRunError } from '@/lib/nrmDevLog';

type UserListJson = {
  userList: Array<{
    id: number;
    appName: string;
    userName: string;
    SerialNo: string;
    version: string;
    Createddate: string;
    deviceId: string | null;
    lastAccessDate: string | null;
    [key: string]: unknown;
  }>;
};

function formatUserListJson(doc: UserListJson): string {
  return `${JSON.stringify(doc, null, '\t')}\n`;
}

/** 특정 사용자의 deviceId를 빈 문자열("")로 초기화 */
export async function resetDeviceIdOnGithub(entryId: number): Promise<void> {
  const tag = 'github-userlist-edit';
  logNrmDev(tag, { event: 'reset-device-start', entryId });
  const t0 = Date.now();
  try {
    const pat = await resolveGithubDataPat();
    const { doc, sha } = await fetchGithubJsonDocument<UserListJson>(
      NRM_USER_LIST_JSON_API_PATH,
      pat,
      { userList: [] },
    );
    const idx = doc.userList.findIndex((row) => row.id === entryId);
    if (idx < 0) {
      throw new Error('해당 사용자를 찾을 수 없습니다.');
    }
    doc.userList[idx] = { ...doc.userList[idx], deviceId: '' };
    await putGithubContents(
      NRM_USER_LIST_JSON_API_PATH,
      pat,
      utf8ToBase64(formatUserListJson(doc)),
      `admin: reset deviceId for id=${entryId}`,
      sha || undefined,
    );
    logNrmDev(tag, { event: 'reset-device-ok', entryId, elapsedMs: Date.now() - t0 });
  } catch (e) {
    logNrmRunError(tag, e, { event: 'reset-device-error', entryId, elapsedMs: Date.now() - t0 });
    throw e;
  }
}
