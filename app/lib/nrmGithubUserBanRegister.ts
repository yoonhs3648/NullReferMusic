import { getNrmAppSerialNo } from '@/lib/nrmAppSerialNo';
import { logNrmDev, logNrmRunError } from '@/lib/nrmDevLog';
import { nrmSbRpc } from '@/lib/nrmSupabaseCrud';
import { todayYmd } from '@/lib/nrmSupabaseRows';
import type { NrmUserBanItem } from '@/lib/nrmUserBanClient';

export type NrmUserBanRegisterInput = {
  userName: string;
  serialNo: string;
  content: string;
};

export async function registerUserBanToGithub(input: NrmUserBanRegisterInput): Promise<void> {
  const tag = 'supabase-userban';
  logNrmDev(tag, { event: 'ban-start' });
  const t0 = Date.now();
  try {
    const callerSerial = await getNrmAppSerialNo();
    await nrmSbRpc<number>('nrm_rpc_insert_user_ban', {
      p_caller_serial: callerSerial ?? '',
      p_user_name: input.userName.trim(),
      p_serial_no: input.serialNo.trim(),
      p_content: input.content,
      p_ban_date: todayYmd(),
    });
    logNrmDev(tag, { event: 'ban-ok', elapsedMs: Date.now() - t0 });
  } catch (e) {
    logNrmRunError(tag, e, { event: 'ban-error', elapsedMs: Date.now() - t0 });
    throw e;
  }
}

export async function unbanUserOnGithub(entry: NrmUserBanItem): Promise<void> {
  const tag = 'supabase-userban';
  logNrmDev(tag, { event: 'unban-start', banId: entry.id });
  const t0 = Date.now();
  try {
    const callerSerial = await getNrmAppSerialNo();
    await nrmSbRpc<void>('nrm_rpc_unban_user', {
      p_caller_serial: callerSerial ?? '',
      p_ban_id: entry.id,
    });
    logNrmDev(tag, { event: 'unban-ok', banId: entry.id, elapsedMs: Date.now() - t0 });
  } catch (e) {
    if (e instanceof Error && e.message.includes('ban row not found')) {
      throw new Error('차단 기록을 찾을 수 없습니다.');
    }
    logNrmRunError(tag, e, { event: 'unban-error', banId: entry.id, elapsedMs: Date.now() - t0 });
    throw e;
  }
}
