import { getNrmAppSerialNo, getNrmAppUserName } from '@/lib/nrmAppSerialNo';
import { getNrmAppVersion } from '@/lib/nrmAppInfo';
import {
  fetchGithubJsonDocument,
  putGithubContents,
  resolveGithubDataPat,
  utf8ToBase64,
} from '@/lib/nrmGithubContentsApi';
import { readInquiryAttachmentBase64, type NrmInquiryAttachmentPick } from '@/lib/nrmInquiryAttachment';
import {
  NRM_INQUIRY_ATTACH_DIR_API,
  NRM_INQUIRY_JSON_API_PATH,
} from '@/lib/nrmRemoteDataConfig';
import { logNrmDev, logNrmRunError } from '@/lib/nrmDevLog';

export type NrmInquiryRegisterInput = {
  content: string;
  attachment: NrmInquiryAttachmentPick | null;
};

type InquiryJson = {
  inquiry: Array<{
    id: number;
    userName: string;
    SerialNo: string;
    version: string;
    content: string;
    attachedFile: string;
    isAnswered: boolean;
    Createddate: string;
  }>;
};

function formatInquiryCreatedDate(d: Date): string {
  const pad = (n: number, w = 2) => String(n).padStart(w, '0');
  const ms = String(d.getMilliseconds()).padStart(3, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}.${ms}`;
}

function sanitizeFileStem(name: string): string {
  const base = name.replace(/[/\\?%*:|"<>]/g, '_').trim();
  const dot = base.lastIndexOf('.');
  const stem = dot > 0 ? base.slice(0, dot) : base;
  const ext = dot > 0 ? base.slice(dot) : '';
  const id = `${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
  return `${stem || 'file'}_${id}${ext}`;
}

function formatInquiryJson(doc: InquiryJson): string {
  return `${JSON.stringify(doc, null, '\t')}\n`;
}

export async function registerInquiryToGithub(input: NrmInquiryRegisterInput): Promise<void> {
  const tag = 'github-inquiry';
  logNrmDev(tag, { event: 'register-start', hasAttachment: !!input.attachment });
  const t0 = Date.now();

  try {
    const pat = await resolveGithubDataPat();
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
      const apiPath = `${NRM_INQUIRY_ATTACH_DIR_API}/${encodeURIComponent(storedName)}`;
      await putGithubContents(
        apiPath,
        pat,
        b64,
        `inquiry: attach ${storedName}`,
      );
      logNrmDev(tag, { event: 'attach-ok', storedName });
      attachedFile = storedName;
    }

    const { doc, sha } = await fetchGithubJsonDocument<InquiryJson>(
      NRM_INQUIRY_JSON_API_PATH,
      pat,
      { inquiry: [] },
    );
    let maxId = 0;
    for (const row of doc.inquiry) {
      if (typeof row.id === 'number' && row.id > maxId) maxId = row.id;
    }
    const entry = {
      id: maxId + 1,
      userName,
      SerialNo: serialNo,
      version,
      content: input.content,
      attachedFile,
      isAnswered: false,
      Createddate: formatInquiryCreatedDate(new Date()),
    };
    doc.inquiry.push(entry);
    await putGithubContents(
      NRM_INQUIRY_JSON_API_PATH,
      pat,
      utf8ToBase64(formatInquiryJson(doc)),
      `inquiry: register id=${entry.id}`,
      sha || undefined,
    );
    logNrmDev(tag, { event: 'register-ok', inquiryId: entry.id, version, elapsedMs: Date.now() - t0 });
  } catch (e) {
    logNrmRunError(tag, e, { event: 'register-error', elapsedMs: Date.now() - t0 });
    throw e;
  }
}
