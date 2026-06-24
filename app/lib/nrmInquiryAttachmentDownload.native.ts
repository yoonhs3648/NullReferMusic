import * as FileSystem from 'expo-file-system/src/legacy/FileSystem';
import { StorageAccessFramework } from 'expo-file-system/src/legacy/FileSystem';
import { EncodingType } from 'expo-file-system/src/legacy/FileSystem.types';
import { Linking, Platform } from 'react-native';

import {
  buildInquiryAttachmentRawUrl,
  inquiryAttachmentRepoPath,
  openInquiryAttachmentOnWeb,
} from '@/lib/nrmInquiryAttachmentDownload';
import { notifyUser } from '@/lib/nrmUserNotify';

export { buildInquiryAttachmentRawUrl, inquiryAttachmentRepoPath, openInquiryAttachmentOnWeb };

function guessMimeType(fileName: string): string {
  const lower = fileName.toLowerCase();
  if (lower.endsWith('.pdf')) return 'application/pdf';
  if (lower.endsWith('.png')) return 'image/png';
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg';
  if (lower.endsWith('.gif')) return 'image/gif';
  if (lower.endsWith('.webp')) return 'image/webp';
  if (lower.endsWith('.zip')) return 'application/zip';
  if (lower.endsWith('.json')) return 'application/json';
  if (lower.endsWith('.html') || lower.endsWith('.htm')) return 'text/html';
  return 'application/octet-stream';
}

export async function downloadInquiryAttachmentFile(fileName: string): Promise<void> {
  const name = fileName.trim();
  if (!name) {
    throw new Error('첨부 파일명이 없습니다.');
  }
  const url = buildInquiryAttachmentRawUrl(name);
  const cacheRoot = FileSystem.cacheDirectory;
  if (!cacheRoot) {
    throw new Error('캐시 경로를 사용할 수 없습니다.');
  }
  const tempUri = `${cacheRoot}nrm-inquiry-attach-${Date.now()}-${name.replace(/[/\\?%*:|"<>]/g, '_')}`;
  const dl = await FileSystem.downloadAsync(url, tempUri);
  if (dl.status !== 200) {
    await FileSystem.deleteAsync(tempUri, { idempotent: true }).catch(() => {});
    throw new Error(`첨부 파일을 받지 못했습니다. (HTTP ${dl.status})`);
  }

  if (Platform.OS === 'android') {
    const perm = await StorageAccessFramework.requestDirectoryPermissionsAsync();
    if (!perm.granted) {
      await FileSystem.deleteAsync(tempUri, { idempotent: true }).catch(() => {});
      throw new Error('저장할 폴더를 선택하지 않았습니다.');
    }
    const destUri = await StorageAccessFramework.createFileAsync(
      perm.directoryUri,
      name,
      guessMimeType(name),
    );
    const b64 = await FileSystem.readAsStringAsync(tempUri, { encoding: EncodingType.Base64 });
    await FileSystem.writeAsStringAsync(destUri, b64, { encoding: EncodingType.Base64 });
    await FileSystem.deleteAsync(tempUri, { idempotent: true }).catch(() => {});
    void notifyUser('첨부 파일을 저장했습니다.');
    return;
  }

  if (Platform.OS === 'ios') {
    const docRoot = FileSystem.documentDirectory;
    if (!docRoot) {
      await Linking.openURL(url);
      return;
    }
    const destUri = `${docRoot}${name.replace(/[/\\?%*:|"<>]/g, '_')}`;
    await FileSystem.copyAsync({ from: tempUri, to: destUri });
    await FileSystem.deleteAsync(tempUri, { idempotent: true }).catch(() => {});
    void notifyUser('첨부 파일을 앱 문서 폴더에 저장했습니다.');
    return;
  }

  await Linking.openURL(url);
}
