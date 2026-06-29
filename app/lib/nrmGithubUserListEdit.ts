import { getNrmAppSerialNo } from '@/lib/nrmAppSerialNo';
import { logNrmDev, logNrmRunError } from '@/lib/nrmDevLog';
import { nrmSbRpc } from '@/lib/nrmSupabaseCrud';

export async function resetDeviceIdOnGithub(entryId: number): Promise<void> {
  const tag = 'supabase-userlist-edit';
  logNrmDev(tag, { event: 'reset-device-start', entryId });
  const t0 = Date.now();
  try {
    const callerSerial = await getNrmAppSerialNo();
    await nrmSbRpc<void>('nrm_rpc_reset_user_list_device', {
      p_caller_serial: callerSerial ?? '',
      p_entry_id: entryId,
    });
    logNrmDev(tag, { event: 'reset-device-ok', entryId, elapsedMs: Date.now() - t0 });
  } catch (e) {
    if (e instanceof Error && e.message.includes('user_list row not found')) {
      throw new Error('해당 사용자를 찾을 수 없습니다.');
    }
    logNrmRunError(tag, e, { event: 'reset-device-error', entryId, elapsedMs: Date.now() - t0 });
    throw e;
  }
}
