import {
  getNrmSupabaseStoragePublicUrl,
  NRM_SUPABASE_INQUIRY_BUCKET,
} from '@/lib/nrmSupabaseConfig';
import { normalizeInquiryAttachmentObjectName } from '@/lib/nrmSupabaseRows';

export function buildInquiryAttachmentRawUrl(fileName: string): string {
  const name = normalizeInquiryAttachmentObjectName(fileName);
  if (!name) {
    throw new Error('첨부 파일명이 없습니다.');
  }
  return getNrmSupabaseStoragePublicUrl(name);
}

export function inquiryAttachmentRepoPath(fileName: string): string {
  const name = normalizeInquiryAttachmentObjectName(fileName);
  return `${NRM_SUPABASE_INQUIRY_BUCKET}/${name}`;
}

export async function openInquiryAttachmentOnWeb(fileName: string): Promise<void> {
  const url = buildInquiryAttachmentRawUrl(fileName);
  if (typeof globalThis.open === 'function') {
    globalThis.open(url, '_blank', 'noopener,noreferrer');
    return;
  }
  throw new Error('다운로드를 열 수 없습니다.');
}
