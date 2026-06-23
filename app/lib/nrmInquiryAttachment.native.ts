import { NativeModules, Platform } from 'react-native';

export type NrmInquiryAttachmentPick = {
  name: string;
  uri: string;
  sizeBytes: number;
};

type NrmFileLoggerNative = {
  listLogFolderFiles?: () => Promise<NrmInquiryAttachmentPick[]>;
  pickAttachmentFile?: () => Promise<NrmInquiryAttachmentPick | null>;
  readAttachmentBase64?: (uri: string) => Promise<string>;
};

function mod(): NrmFileLoggerNative | undefined {
  if (Platform.OS !== 'android') return undefined;
  return NativeModules.NrmFileLogger as NrmFileLoggerNative | undefined;
}

export async function listInquiryLogFolderFiles(): Promise<NrmInquiryAttachmentPick[]> {
  const m = mod();
  if (!m?.listLogFolderFiles) return [];
  const rows = await m.listLogFolderFiles();
  return rows.map((r) => ({
    name: String(r.name ?? ''),
    uri: String(r.uri ?? ''),
    sizeBytes: Number(r.sizeBytes ?? 0),
  }));
}

export async function pickInquiryAttachmentFile(): Promise<NrmInquiryAttachmentPick | null> {
  const m = mod();
  if (!m?.pickAttachmentFile) return null;
  const row = await m.pickAttachmentFile();
  if (!row) return null;
  return {
    name: String(row.name ?? ''),
    uri: String(row.uri ?? ''),
    sizeBytes: Number(row.sizeBytes ?? 0),
  };
}

export async function readInquiryAttachmentBase64(uri: string): Promise<string> {
  const m = mod();
  if (!m?.readAttachmentBase64) throw new Error('첨부 파일을 읽을 수 없습니다.');
  return String(await m.readAttachmentBase64(uri));
}
