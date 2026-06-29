import { invalidateAlarmCache } from '@/lib/nrmAlarmClient';
import { getNrmAppSerialNo } from '@/lib/nrmAppSerialNo';
import { logNrmDev, logNrmRunError } from '@/lib/nrmDevLog';
import { nrmSbRpc } from '@/lib/nrmSupabaseCrud';
import { todayYmd } from '@/lib/nrmSupabaseRows';

const INQUIRY_REPLY_ALARM_TEXT = '문의답변이 도착했습니다.';

async function registerInquiryReplyAlarm(serialNo: string): Promise<void> {
  const targetSerial = serialNo.trim();
  if (!targetSerial) return;

  await nrmSbRpc<number>('nrm_rpc_insert_alarm', {
    p_is_noti: false,
    p_title: INQUIRY_REPLY_ALARM_TEXT,
    p_content: INQUIRY_REPLY_ALARM_TEXT,
    p_serial_no: targetSerial,
    p_alarm_date: todayYmd(),
  });
  invalidateAlarmCache();
}

export async function submitInquiryReplyToGithub(
  inquiryId: number,
  replyContent: string,
): Promise<void> {
  const tag = 'supabase-inquiry-reply';
  logNrmDev(tag, { event: 'reply-start', inquiryId });
  const t0 = Date.now();

  try {
    const callerSerial = await getNrmAppSerialNo();
    const serialNo = await nrmSbRpc<string>('nrm_rpc_reply_inquiry', {
      p_caller_serial: callerSerial ?? '',
      p_inquiry_id: inquiryId,
      p_reply_content: replyContent,
    });

    await registerInquiryReplyAlarm(serialNo);
    logNrmDev(tag, { event: 'reply-ok', inquiryId, elapsedMs: Date.now() - t0 });
  } catch (e) {
    if (e instanceof Error) {
      if (e.message.includes('inquiry not found')) {
        throw new Error('문의를 찾을 수 없습니다.');
      }
      if (e.message.includes('already answered')) {
        throw new Error('이미 답변이 완료된 문의입니다.');
      }
    }
    logNrmRunError(tag, e, { event: 'reply-error', inquiryId, elapsedMs: Date.now() - t0 });
    throw e;
  }
}
