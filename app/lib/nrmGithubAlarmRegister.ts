import { getResolvedApiBaseUrl } from '@/lib/apiBaseUrl';
import { isStandaloneApp } from '@/lib/nrmDevRuntime';
import { invalidateAlarmCache } from '@/lib/nrmAlarmClient';
import { logNrmDev, logNrmRunError } from '@/lib/nrmDevLog';
import { NRM_SUPABASE_TABLES } from '@/lib/nrmSupabaseConfig';
import { nrmSbRpc, nrmSbSelect } from '@/lib/nrmSupabaseCrud';
import { todayYmd } from '@/lib/nrmSupabaseRows';

export type NrmAlarmRegisterInput = {
  isNoti: boolean;
  title: string;
  content: string;
  serialNo: string;
};

function isLocalhostBase(url: string): boolean {
  return /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?(\/|$)/i.test(url);
}

async function registerViaBackend(input: NrmAlarmRegisterInput): Promise<boolean> {
  if (isStandaloneApp()) return false;

  const base = await getResolvedApiBaseUrl();
  if (!base || isLocalhostBase(base)) return false;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetch(`${base}/api/nrm-data/alarm`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      signal: controller.signal,
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
  } finally {
    clearTimeout(timer);
  }
}

export async function registerAlarmToGithub(input: NrmAlarmRegisterInput): Promise<void> {
  const tag = 'supabase-alarm';
  logNrmDev(tag, { event: 'register-start', isNoti: input.isNoti });
  const t0 = Date.now();

  try {
    const viaBackend = await registerViaBackend(input);
    if (viaBackend) {
      logNrmDev(tag, { event: 'register-ok-backend', elapsedMs: Date.now() - t0 });
      invalidateAlarmCache();
      return;
    }

    await nrmSbRpc<number>('nrm_rpc_insert_alarm', {
      p_is_noti: input.isNoti,
      p_title: input.title.trim(),
      p_content: input.content,
      p_serial_no: input.serialNo.trim(),
      p_alarm_date: todayYmd(),
    });
    logNrmDev(tag, { event: 'register-ok', elapsedMs: Date.now() - t0 });
    invalidateAlarmCache();
  } catch (e) {
    logNrmRunError(tag, e, { event: 'register-error', elapsedMs: Date.now() - t0 });
    throw e;
  }
}

export async function peekAlarmJsonFromRaw(): Promise<{ alarm: unknown[] }> {
  try {
    const rows = await nrmSbSelect<unknown>(NRM_SUPABASE_TABLES.alarm, (q) =>
      q.select('*').order('id', { ascending: true }),
    );
    return { alarm: rows };
  } catch {
    return { alarm: [] };
  }
}
