export {
  buildInquiryAttachmentRawUrl,
  inquiryAttachmentRepoPath,
  openInquiryAttachmentOnWeb,
} from '@/lib/nrmInquiryAttachmentDownload.shared';

export async function downloadInquiryAttachmentFile(_fileName: string): Promise<void> {
  throw new Error('첨부 파일 다운로드는 Android 앱에서만 지원합니다.');
}
