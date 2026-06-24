import brandConfig from '../nrm-brand.config.json';

import { getNrmAppSerialNo } from '@/lib/nrmAppSerialNo';
import { fetchDedupedUserListEntries } from '@/lib/nrmUserListClient';

/** 문의 등록 시 관리자에게 보내는 알람의 SerialNo */
export const NRM_ALARM_ADMIN_SERIAL = 'Admin';

let cachedUserListIsAdmin: boolean | null = null;
let inflightAdminCheck: Promise<boolean> | null = null;

/** deviceBinding 등에서 userList 항목의 isAdmin 값을 캐시 */
export function setCachedUserListIsAdmin(isAdmin: boolean): void {
  cachedUserListIsAdmin = isAdmin;
}

export function peekIsAdminAlarmReceiver(): boolean {
  if (brandConfig.versionInfoAdminBuild === true) return true;
  return cachedUserListIsAdmin === true;
}

/**
 * Admin 전용 알람(SerialNo=Admin)을 받을 수 있는 앱인지.
 * - 기본 admin APK (versionInfoAdminBuild)
 * - userList에 isAdmin=true 로 등록된 커스텀 APK
 */
export async function resolvesAdminTargetedAlarms(): Promise<boolean> {
  if (brandConfig.versionInfoAdminBuild === true) return true;
  if (cachedUserListIsAdmin !== null) return cachedUserListIsAdmin;

  if (inflightAdminCheck) return inflightAdminCheck;

  inflightAdminCheck = (async () => {
    const serial = (await getNrmAppSerialNo()).trim();
    if (!serial) {
      cachedUserListIsAdmin = false;
      return false;
    }
    try {
      const entries = await fetchDedupedUserListEntries();
      const entry = entries.find((e) => e.SerialNo === serial);
      cachedUserListIsAdmin = entry?.isAdmin === true;
    } catch {
      cachedUserListIsAdmin = false;
    }
    return cachedUserListIsAdmin;
  })();

  try {
    return await inflightAdminCheck;
  } finally {
    inflightAdminCheck = null;
  }
}
