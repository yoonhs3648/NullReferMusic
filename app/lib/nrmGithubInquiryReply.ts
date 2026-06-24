import { invalidateAlarmCache } from '@/lib/nrmAlarmClient';
import {
  fetchGithubJsonDocument,
  putGithubContents,
  resolveGithubDataPat,
  utf8ToBase64,
} from '@/lib/nrmGithubContentsApi';
import { logNrmDev, logNrmRunError } from '@/lib/nrmDevLog';
import {
  NRM_ALARM_JSON_API_PATH,
  NRM_INQUIRY_JSON_API_PATH,
} from '@/lib/nrmRemoteDataConfig';

const INQUIRY_REPLY_ALARM_TEXT = '문의답변이 도착했습니다.';

type InquiryJson = {
  inquiry: Array<{
    id: number;
    userName: string;
    SerialNo: string;
    version: string;
    content: string;
    attachedFile: string;
    isAnswered: boolean;
    replyContent: string;
    Createddate: string;
  }>;
};

type AlarmJson = {
  alarm: Array<{
    id: number;
    isNoti: boolean;
    title: string;
    content: string;
    SerialNo: string;
    date: string;
  }>;
};

function formatInquiryJson(doc: InquiryJson): string {
  return `${JSON.stringify(doc, null, '\t')}\n`;
}

function formatAlarmJson(doc: AlarmJson): string {
  return `${JSON.stringify(doc, null, '\t')}\n`;
}

function todayYmd(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

async function registerInquiryReplyAlarm(pat: string, serialNo: string): Promise<void> {
  const targetSerial = serialNo.trim();
  if (!targetSerial) return;

  const { doc, sha } = await fetchGithubJsonDocument<AlarmJson>(
    NRM_ALARM_JSON_API_PATH,
    pat,
    { alarm: [] },
  );
  let maxId = 0;
  for (const row of doc.alarm) {
    if (typeof row.id === 'number' && row.id > maxId) maxId = row.id;
  }
  const entry = {
    id: maxId + 1,
    isNoti: false,
    title: INQUIRY_REPLY_ALARM_TEXT,
    content: INQUIRY_REPLY_ALARM_TEXT,
    SerialNo: targetSerial,
    date: todayYmd(),
  };
  doc.alarm.push(entry);
  await putGithubContents(
    NRM_ALARM_JSON_API_PATH,
    pat,
    utf8ToBase64(formatAlarmJson(doc)),
    `inquiry-reply: alarm id=${entry.id} serial=${targetSerial}`,
    sha || undefined,
  );
  invalidateAlarmCache();
}

export async function submitInquiryReplyToGithub(
  inquiryId: number,
  replyContent: string,
): Promise<void> {
  const tag = 'github-inquiry-reply';
  logNrmDev(tag, { event: 'reply-start', inquiryId });
  const t0 = Date.now();

  try {
    const pat = await resolveGithubDataPat();
    const { doc, sha } = await fetchGithubJsonDocument<InquiryJson>(
      NRM_INQUIRY_JSON_API_PATH,
      pat,
      { inquiry: [] },
    );
    const idx = doc.inquiry.findIndex((row) => row.id === inquiryId);
    if (idx < 0) {
      throw new Error('문의를 찾을 수 없습니다.');
    }
    const entry = doc.inquiry[idx];
    if (entry.isAnswered) {
      throw new Error('이미 답변이 완료된 문의입니다.');
    }
    const serialNo = String(entry.SerialNo ?? '').trim();
    doc.inquiry[idx] = {
      ...entry,
      replyContent,
      isAnswered: true,
    };
    await putGithubContents(
      NRM_INQUIRY_JSON_API_PATH,
      pat,
      utf8ToBase64(formatInquiryJson(doc)),
      `inquiry-reply: id=${inquiryId}`,
      sha || undefined,
    );
    await registerInquiryReplyAlarm(pat, serialNo);
    logNrmDev(tag, { event: 'reply-ok', inquiryId, elapsedMs: Date.now() - t0 });
  } catch (e) {
    logNrmRunError(tag, e, { event: 'reply-error', inquiryId, elapsedMs: Date.now() - t0 });
    throw e;
  }
}
