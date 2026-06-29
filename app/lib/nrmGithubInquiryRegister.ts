import { NRM_ALARM_ADMIN_SERIAL } from '@/lib/nrmAdminAlarmReceiver';
import { getNrmAppSerialNo, getNrmAppUserName } from '@/lib/nrmAppSerialNo';
import { getNrmAppVersion } from '@/lib/nrmAppInfo';
import { invalidateAlarmCache } from '@/lib/nrmAlarmClient';
import { readInquiryAttachmentBase64, type NrmInquiryAttachmentPick } from '@/lib/nrmInquiryAttachment';
import { logNrmDev, logNrmRunError } from '@/lib/nrmDevLog';
import {
  NRM_SUPABASE_INQUIRY_BUCKET,
} from '@/lib/nrmSupabaseConfig';
import { nrmSbRpc, nrmSbStorageUpload } from '@/lib/nrmSupabaseCrud';
import { formatNrmTimestamp, inquiryAlarmTitle, todayYmd } from '@/lib/nrmSupabaseRows';

export type NrmInquiryRegisterInput = {
  content: string;
  attachment: NrmInquiryAttachmentPick | null;
};

function sanitizeFileStem(name: string): string {
  const base = name.replace(/[/\\?%*:|"<>]/g, '_').trim();
  const dot = base.lastIndexOf('.');
  const stem = dot > 0 ? base.slice(0, dot) : base;
  const ext = dot > 0 ? base.slice(dot) : '';
  const id = `${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
  return `${stem || 'file'}_${id}${ext}`;
}

function base64ToUint8Array(b64: string): Uint8Array {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function registerInquiryAdminAlarm(createdDate: string, userName: string): Promise<void> {
  await nrmSbRpc<number>('nrm_rpc_insert_alarm', {
    p_is_noti: false,
    p_title: inquiryAlarmTitle(userName),
    p_content: createdDate,
    p_serial_no: NRM_ALARM_ADMIN_SERIAL,
    p_alarm_date: todayYmd(),
  });
  invalidateAlarmCache();
}

export async function registerInquiryToGithub(input: NrmInquiryRegisterInput): Promise<void> {
  const tag = 'supabase-inquiry';
  logNrmDev(tag, { event: 'register-start', hasAttachment: !!input.attachment });
  const t0 = Date.now();

  try {
    const [userName, serialNo, version] = await Promise.all([
      getNrmAppUserName(),
      getNrmAppSerialNo(),
      Promise.resolve(getNrmAppVersion()),
    ]);

    let attachedFile = '';
    if (input.attachment) {
      const storedName = sanitizeFileStem(input.attachment.name);
      logNrmDev(tag, { event: 'attach-start', storedName });
      const b64 = await readInquiryAttachmentBase64(input.attachment.uri);
      await nrmSbStorageUpload(
        NRM_SUPABASE_INQUIRY_BUCKET,
        storedName,
        base64ToUint8Array(b64),
        { upsert: true },
      );
      logNrmDev(tag, { event: 'attach-ok', storedName });
      attachedFile = storedName;
    }

    const createdDate = formatNrmTimestamp(new Date());
    const inquiryId = await nrmSbRpc<number>('nrm_rpc_insert_inquiry', {
      p_user_name: userName,
      p_serial_no: serialNo,
      p_version: version,
      p_content: input.content,
      p_attached_file: attachedFile,
      p_created_date: createdDate,
    });

    await registerInquiryAdminAlarm(createdDate, userName);
    logNrmDev(tag, { event: 'register-ok', inquiryId, version, elapsedMs: Date.now() - t0 });
  } catch (e) {
    logNrmRunError(tag, e, { event: 'register-error', elapsedMs: Date.now() - t0 });
    throw e;
  }
}
