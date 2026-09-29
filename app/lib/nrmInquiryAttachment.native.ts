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
  if (Platform.OS === 'ios') {
    const FileSystem = await import('expo-file-system/src/legacy/FileSystem');
    const { NRM_BRAND_STORAGE_FOLDER_NAME } = await import('@/lib/nrmAppBrand');
    const root = FileSystem.documentDirectory;
    if (!root) return [];
    const folder = `${root}${NRM_BRAND_STORAGE_FOLDER_NAME}/logs/`;
    const names = await FileSystem.readDirectoryAsync(folder).catch(() => []);
    const rows: NrmInquiryAttachmentPick[] = [];
    for (const name of names) {
      if (!name.endsWith('.txt') && !name.endsWith('.log')) continue;
      const uri = `${folder}${name}`;
      const info = await FileSystem.getInfoAsync(uri);
      rows.push({
        name,
        uri,
        sizeBytes: info.exists && 'size' in info ? Number(info.size ?? 0) : 0,
      });
    }
    return rows;
  }
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
  if (Platform.OS === 'ios') {
    const { pickIosDocument } = await import('@/lib/nrmIosDeviceAudio');
    return pickIosDocument();
  }
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
  if (Platform.OS === 'ios') {
    const FileSystem = await import('expo-file-system/src/legacy/FileSystem');
    const { EncodingType } = await import('expo-file-system/src/legacy/FileSystem.types');
    return FileSystem.readAsStringAsync(uri, { encoding: EncodingType.Base64 });
  }
  const m = mod();
  if (!m?.readAttachmentBase64) throw new Error('첨부 파일을 읽을 수 없습니다.');
  return String(await m.readAttachmentBase64(uri));
}
