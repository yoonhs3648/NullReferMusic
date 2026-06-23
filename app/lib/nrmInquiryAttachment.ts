export type NrmInquiryAttachmentPick = {
  name: string;
  uri: string;
  sizeBytes: number;
};

export async function listInquiryLogFolderFiles(): Promise<NrmInquiryAttachmentPick[]> {
  return [];
}

export async function pickInquiryAttachmentFile(): Promise<NrmInquiryAttachmentPick | null> {
  return null;
}

export async function readInquiryAttachmentBase64(_uri: string): Promise<string> {
  throw new Error('첨부 파일은 Android 앱에서만 지원합니다.');
}
