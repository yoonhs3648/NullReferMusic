import {
  NRM_GITHUB_BRANCH,
  NRM_GITHUB_REPO,
  NRM_INQUIRY_ATTACH_RAW_BASE,
} from '@/lib/nrmRemoteDataConfig';

export function buildInquiryAttachmentRawUrl(fileName: string): string {
  const name = fileName.trim();
  return `${NRM_INQUIRY_ATTACH_RAW_BASE}/${encodeURIComponent(name)}`;
}

export async function downloadInquiryAttachmentFile(_fileName: string): Promise<void> {
  throw new Error('첨부 파일 다운로드는 Android 앱에서만 지원합니다.');
}

export async function openInquiryAttachmentOnWeb(fileName: string): Promise<void> {
  const url = buildInquiryAttachmentRawUrl(fileName);
  if (typeof globalThis.open === 'function') {
    globalThis.open(url, '_blank', 'noopener,noreferrer');
    return;
  }
  throw new Error('다운로드를 열 수 없습니다.');
}

/** GitHub raw 경로 (표시용) */
export function inquiryAttachmentRepoPath(fileName: string): string {
  return `${NRM_GITHUB_REPO}/${NRM_GITHUB_BRANCH}/data/inquiryAttachFile/${fileName.trim()}`;
}
