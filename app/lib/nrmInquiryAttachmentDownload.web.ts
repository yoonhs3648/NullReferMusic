import {
  buildInquiryAttachmentRawUrl,
  inquiryAttachmentRepoPath,
  openInquiryAttachmentOnWeb,
} from '@/lib/nrmInquiryAttachmentDownload';

export { buildInquiryAttachmentRawUrl, inquiryAttachmentRepoPath, openInquiryAttachmentOnWeb };

export async function downloadInquiryAttachmentFile(fileName: string): Promise<void> {
  await openInquiryAttachmentOnWeb(fileName);
}
