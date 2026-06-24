import {
  NRM_GITHUB_BRANCH,
  NRM_GITHUB_REPO,
  NRM_INQUIRY_ATTACH_RAW_BASE,
} from '@/lib/nrmRemoteDataConfig';
import { nrmGithubRawCacheBustUrl } from '@/lib/nrmGithubRawFetch';

export function buildInquiryAttachmentRawUrl(fileName: string): string {
  const name = fileName.trim();
  const base = `${NRM_INQUIRY_ATTACH_RAW_BASE}/${encodeURIComponent(name)}`;
  return nrmGithubRawCacheBustUrl(base);
}

/** GitHub raw 경로 (표시용) */
export function inquiryAttachmentRepoPath(fileName: string): string {
  return `${NRM_GITHUB_REPO}/${NRM_GITHUB_BRANCH}/data/inquiryAttachFile/${fileName.trim()}`;
}

export async function openInquiryAttachmentOnWeb(fileName: string): Promise<void> {
  const url = buildInquiryAttachmentRawUrl(fileName);
  if (typeof globalThis.open === 'function') {
    globalThis.open(url, '_blank', 'noopener,noreferrer');
    return;
  }
  throw new Error('다운로드를 열 수 없습니다.');
}
