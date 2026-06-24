/** GitHub Contents API로 repository에 올릴 수 있는 문의 첨부 확장자 */
export const NRM_INQUIRY_ATTACHMENT_EXTENSIONS = [
  '.txt',
  '.md',
  '.json',
  '.log',
  '.csv',
  '.xml',
  '.yaml',
  '.yml',
  '.html',
  '.htm',
  '.pdf',
  '.png',
  '.jpg',
  '.jpeg',
  '.gif',
  '.webp',
  '.zip',
] as const;

export function isAllowedInquiryAttachmentName(fileName: string): boolean {
  const lower = fileName.trim().toLowerCase();
  if (!lower) return false;
  return NRM_INQUIRY_ATTACHMENT_EXTENSIONS.some((ext) => lower.endsWith(ext));
}

/** 문의하기 UI 첨부 안내용 짧은 라벨 */
export function inquiryAttachmentExtensionLabel(): string {
  return 'txt, md, json, pdf, png, jpg, gif, webp, zip 등';
}
