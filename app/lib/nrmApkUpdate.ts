import { getNrmAppVersion } from '@/lib/nrmAppInfo';
import { logNrmDev, logNrmRunError } from '@/lib/nrmDevLog';
import { getNrmApkReleaseDownloadUrl } from '@/lib/nrmRemoteDataConfig';
import { NRM_SUPABASE_TABLES } from '@/lib/nrmSupabaseConfig';
import { nrmSbMaybeSingle } from '@/lib/nrmSupabaseCrud';
import { mapApkVersionRow } from '@/lib/nrmSupabaseRows';
import type { NrmSupabaseApkVersionRow } from '@/lib/nrmSupabaseDatabase.types';

export type NrmApkVersionJson = {
  version?: string;
  createdDate?: string;
};

export function isNrmSemverOutdated(current: string, required: string): boolean {
  const parse = (v: string) => v.trim().split('.').map((n) => parseInt(n, 10) || 0);
  const [cMaj, cMin, cPat] = parse(current);
  const [rMaj, rMin, rPat] = parse(required);
  if (rMaj !== cMaj) return rMaj > cMaj;
  if (rMin !== cMin) return rMin > cMin;
  return rPat > cPat;
}

export type NrmApkUpdateCheckResult =
  | { status: 'up_to_date' }
  | { status: 'update_available'; requiredVersion: string; downloadUrl: string }
  | { status: 'error'; message: string };

export async function checkNrmApkUpdate(): Promise<NrmApkUpdateCheckResult> {
  const tag = 'apk-update.check';
  const currentVersion = getNrmAppVersion();

  try {
    const data = await nrmSbMaybeSingle<Pick<NrmSupabaseApkVersionRow, 'version' | 'created_date'>>(
      NRM_SUPABASE_TABLES.apkVersion,
      (q) =>
        q
          .select('version,created_date')
          .order('created_date', { ascending: false })
          .order('id', { ascending: false })
          .limit(1)
          .maybeSingle(),
    );
    if (!data) {
      return { status: 'error', message: '원격 APK 버전 정보가 없습니다.' };
    }
    const mapped = mapApkVersionRow(data as NrmSupabaseApkVersionRow);
    const requiredVersion = mapped.version;
    if (!requiredVersion) {
      return { status: 'error', message: '원격 APK version이 비어 있습니다.' };
    }

    logNrmDev(tag, { currentVersion, requiredVersion, createdDate: mapped.createdDate });

    if (!isNrmSemverOutdated(currentVersion, requiredVersion)) {
      return { status: 'up_to_date' };
    }

    return {
      status: 'update_available',
      requiredVersion,
      downloadUrl: getNrmApkReleaseDownloadUrl(requiredVersion),
    };
  } catch (e) {
    logNrmRunError(tag, e);
    const msg = e instanceof Error ? e.message : String(e);
    return { status: 'error', message: msg };
  }
}
