import * as FileSystem from 'expo-file-system/src/legacy/FileSystem';
import { Platform } from 'react-native';

import { saveLocalFileToAppDownloads } from '@/lib/onDeviceDownload';
import { logNrmDev } from '@/lib/nrmDevLog';
import { buildInquiryAttachmentRawUrl } from '@/lib/nrmInquiryAttachmentDownload.shared';
import {
  nrmNotifyAttachmentDownloadFinished,
  nrmNotifyAttachmentDownloadStarted,
} from '@/lib/nrmMobileDownloadNotifications';

export {
  buildInquiryAttachmentRawUrl,
  inquiryAttachmentRepoPath,
  openInquiryAttachmentOnWeb,
} from '@/lib/nrmInquiryAttachmentDownload.shared';

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
  if (Platform.OS !== 'android') {
    throw new Error('첨부 파일 다운로드는 Android 앱에서만 지원합니다.');
  }

  await nrmNotifyAttachmentDownloadStarted(name);
  const cacheRoot = FileSystem.cacheDirectory;
  if (!cacheRoot) {
    await nrmNotifyAttachmentDownloadFinished(name, false);
    throw new Error('캐시 경로를 사용할 수 없습니다.');
  }

  const safeLocalName = name.replace(/[/\\?%*:|"<>]/g, '_');
  const tempUri = `${cacheRoot}nrm-inquiry-attach-${Date.now()}-${safeLocalName}`;

  try {
    const url = buildInquiryAttachmentRawUrl(name);
    const dl = await FileSystem.downloadAsync(url, tempUri);
    if (dl.status !== 200) {
      throw new Error(`첨부 파일을 받지 못했습니다. (HTTP ${dl.status})`);
    }

    const displayPath = await saveLocalFileToAppDownloads(tempUri, name, guessMimeType(name));
    logNrmDev('inquiry.attachDownload', { path: displayPath });
    await nrmNotifyAttachmentDownloadFinished(name, true);
  } catch (e) {
    await nrmNotifyAttachmentDownloadFinished(name, false);
    throw e;
  } finally {
    await FileSystem.deleteAsync(tempUri, { idempotent: true }).catch(() => {});
  }
}
