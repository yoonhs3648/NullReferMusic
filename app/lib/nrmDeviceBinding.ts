import { getNrmAppSerialNo, getNrmAndroidIdSha256 } from '@/lib/nrmAppSerialNo';
import { logNrmDev, logNrmRunError } from '@/lib/nrmDevLog';
import { nrmSbRpc } from '@/lib/nrmSupabaseCrud';
import { formatNrmTimestamp } from '@/lib/nrmSupabaseRows';
import { fetchUserListEntryBySerialNo } from '@/lib/nrmUserListClient';
import { isNrmAdminBuild } from '@/lib/nrmBrandIdentity';

export type DeviceBindingResult =
  | { status: 'skip' | 'ok' | 'mismatch' | 'unregistered' }
  | { status: 'error'; message: string };

export async function runDeviceBindingCheck(): Promise<DeviceBindingResult> {
  const tag = 'device-binding';

  if (isNrmAdminBuild()) {
    logNrmDev(tag, { event: 'skip-admin-build' });
    return { status: 'skip' };
  }

  const serialNo = await getNrmAppSerialNo();
  if (!serialNo) {
    logNrmDev(tag, { event: 'skip-no-serial' });
    return { status: 'skip' };
  }

  logNrmDev(tag, { event: 'check-start' });

  const entry = await fetchUserListEntryBySerialNo(serialNo);
  if (!entry) {
    logNrmRunError(tag, new Error('SerialNo not registered in user_list'), { event: 'serial-not-found' });
    return { status: 'unregistered' };
  }

  const androidIdHash = await getNrmAndroidIdSha256();
  if (!androidIdHash) {
    const msg = 'ANDROID_ID unavailable';
    logNrmRunError(tag, new Error(msg), { event: 'android-id-missing' });
    return { status: 'error', message: msg };
  }

  const now = formatNrmTimestamp(new Date());

  if (entry.deviceId && entry.deviceId !== androidIdHash) {
    logNrmDev(tag, { event: 'device-mismatch', entryId: entry.id });
    return { status: 'mismatch' };
  }

  if (!entry.deviceId) {
    logNrmDev(tag, { event: 'first-install', entryId: entry.id });
    try {
      await nrmSbRpc<void>('nrm_rpc_update_user_list_device', {
        p_entry_id: entry.id,
        p_serial_no: serialNo,
        p_device_id: androidIdHash,
        p_last_access_date: now,
        p_bind_device: true,
      });
    } catch (e) {
      logNrmRunError(tag, e, { event: 'device-bind-failed', entryId: entry.id });
      const msg = e instanceof Error ? e.message : String(e);
      return { status: 'error', message: msg };
    }
    logNrmDev(tag, { event: 'device-bound', entryId: entry.id });
    return { status: 'ok' };
  }

  logNrmDev(tag, { event: 'device-matched', entryId: entry.id });
  void nrmSbRpc<void>('nrm_rpc_update_user_list_device', {
    p_entry_id: entry.id,
    p_serial_no: serialNo,
    p_device_id: androidIdHash,
    p_last_access_date: now,
    p_bind_device: false,
  }).catch((e: unknown) => {
    logNrmRunError(tag, e, { event: 'background-update-failed' });
  });
  return { status: 'ok' };
}
