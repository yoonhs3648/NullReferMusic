/**
 * iOS/Android: Metro가 `expo-file-system/legacy` 패키지 서브패스를 못 풀면 소스 경로로 연결.
 * - iOS: 공용 다운로드 경로가 없으므로 앱 Documents 아래 `nullreference/` 폴더에 저장합니다.
 *   «파일» 앱에서 보려면 `app.config`의 UIFileSharingEnabled가 필요합니다.
 * - Android: 미디어 라이브러리 앨범 `nullreference`(및 공용 Downloads 하위 동일 이름 폴더 사용 시)와 맞춥니다.
 */
import { NRM_MEDIA_LIBRARY_ALBUM_SLUG } from '@/constants/nrmNativeDownload';
import { sanitizeFileBase } from '@/lib/nrmYoutubeDownloadMeta';
import { getAndroidMediaGranularPermissions } from '@/lib/nrmRequiredPermissions';
import Constants from 'expo-constants';
import * as FileSystem from 'expo-file-system/src/legacy/FileSystem';
import * as MediaLibrary from 'expo-media-library';
import { Platform } from 'react-native';

export const NRM_DOWNLOAD_PUBLIC_FOLDER_NAME = NRM_MEDIA_LIBRARY_ALBUM_SLUG;

/** @deprecated 웹 `NRM_DOWNLOAD_DIR_NAME` 와 별개 — 네이티브는 `NRM_MEDIA_LIBRARY_ALBUM_SLUG` 사용 */
export const NRM_DOWNLOAD_DIR_NAME = NRM_MEDIA_LIBRARY_ALBUM_SLUG;

function normalizedApiBase(base: string): string {
  return base.trim().replace(/\/+$/, '');
}

/** yt-dlp 등이 만든 긴 경로·`.mp4`(오디오)는 MediaLibrary가 MIME 판별에 실패하는 경우가 있어 복사·정규화합니다. */
function extensionFromBasename(pathOrUri: string): string {
  const path = pathOrUri.replace(/^file:\/\//, '');
  const base = path.split('/').pop() ?? '';
  const dot = base.lastIndexOf('.');
  return dot >= 0 ? base.slice(dot).toLowerCase() : '';
}

function mediaLibraryImportExtension(
  sourceExt: string,
  safeName: string,
): string {
  const fromYt: Record<string, string> = {
    '.mp4': '.m4a',
    '.m4a': '.m4a',
    '.mp3': '.mp3',
    '.webm': '.webm',
    '.opus': '.opus',
    '.ogg': '.ogg',
    '.aac': '.aac',
    '.flac': '.flac',
    '.wav': '.wav',
  };
  if (sourceExt && fromYt[sourceExt]) return fromYt[sourceExt];
  const snDot = safeName.lastIndexOf('.');
  const snExt =
    snDot >= 0 ? safeName.slice(snDot).toLowerCase() : '';
  if (snExt && fromYt[snExt]) return fromYt[snExt];
  return '.m4a';
}

/**
 * MediaScanner / ExpoMediaLibrary 가 경로의 공백·일부 문자에서 MIME 판별에 실패하는 경우가 있어
 * import 전용 이름은 공백 없이 짧게 만듭니다.
 */
function androidMediaImportStem(stem: string): string {
  const s = sanitizeFileBase(stem)
    .replace(/\s+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '')
    .slice(0, 80);
  return s || `t${Date.now()}`;
}

async function copyForAndroidMediaLibrary(
  tempUri: string,
  safeName: string,
): Promise<string> {
  const cacheRoot = FileSystem.cacheDirectory;
  if (!cacheRoot) {
    throw new Error('이 기기에서 임시 저장 공간을 사용할 수 없습니다.');
  }
  const prefix = cacheRoot.endsWith('/') ? cacheRoot : `${cacheRoot}/`;
  const sourceExt = extensionFromBasename(tempUri);
  const importExt = mediaLibraryImportExtension(sourceExt, safeName);
  const dot = safeName.lastIndexOf('.');
  const stemRaw = dot > 0 ? safeName.slice(0, dot) : safeName;
  const stem = androidMediaImportStem(stemRaw);
  const destUri = `${prefix}nrm-ml-import-${Date.now()}-${stem}${importExt}`;
  await FileSystem.copyAsync({ from: tempUri, to: destUri });
  return destUri;
}

/** MediaLibrary 실패 시 앱 전용 폴더에 복사 (사용자는 «내 파일» 앱에서 확인). */
async function androidFallbackSaveToAppDocuments(
  sourceUri: string,
  safeName: string,
): Promise<{ savedLabel: string }> {
  const docRoot = FileSystem.documentDirectory;
  if (!docRoot) {
    throw new Error('이 기기에서 저장 공간을 사용할 수 없습니다.');
  }
  const folderName = NRM_MEDIA_LIBRARY_ALBUM_SLUG;
  const folderUri = `${docRoot}${folderName}/`;
  await FileSystem.makeDirectoryAsync(folderUri, { intermediates: true });
  const snDot = safeName.lastIndexOf('.');
  const stem = snDot > 0 ? safeName.slice(0, snDot) : safeName;
  const ext = snDot > 0 ? safeName.slice(snDot) : '.m4a';
  const fileBase = `${androidMediaImportStem(stem)}${ext.toLowerCase()}`;
  const destUri = `${folderUri}${fileBase}`;
  await FileSystem.deleteAsync(destUri, { idempotent: true }).catch(() => {});
  await FileSystem.copyAsync({ from: sourceUri, to: destUri });
  const savedLabel = `저장했습니다. «내 파일» 또는 «파일» 앱에서 이 앱을 연 뒤 «${folderName}» 폴더를 여세요.`;
  return { savedLabel };
}

async function addAndroidAssetToLibrary(importUri: string): Promise<void> {
  const album = await MediaLibrary.getAlbumAsync(NRM_MEDIA_LIBRARY_ALBUM_SLUG);
  if (album) {
    try {
      await MediaLibrary.createAssetAsync(importUri, album);
      return;
    } catch {
      await MediaLibrary.createAssetAsync(importUri);
      return;
    }
  }
  try {
    await MediaLibrary.createAlbumAsync(
      NRM_MEDIA_LIBRARY_ALBUM_SLUG,
      undefined,
      true,
      importUri,
    );
  } catch {
    await MediaLibrary.createAssetAsync(importUri);
  }
}

/** 임시 파일을 사용자 저장 위치로 옮기고 임시 파일을 삭제합니다. */
async function moveTempAudioToUserLibrary(
  tempUri: string,
  safeName: string,
): Promise<{ savedLabel: string }> {
  if (Platform.OS === 'ios') {
    const docRoot = FileSystem.documentDirectory;
    if (!docRoot) {
      await FileSystem.deleteAsync(tempUri, { idempotent: true }).catch(() => {});
      throw new Error('이 기기에서 문서 저장 공간을 사용할 수 없습니다.');
    }
    const folderName = NRM_MEDIA_LIBRARY_ALBUM_SLUG;
    const folderUri = `${docRoot}${folderName}/`;
    await FileSystem.makeDirectoryAsync(folderUri, { intermediates: true });
    const destUri = `${folderUri}${safeName}`;
    await FileSystem.deleteAsync(destUri, { idempotent: true }).catch(() => {});
    try {
      await FileSystem.copyAsync({ from: tempUri, to: destUri });
    } finally {
      await FileSystem.deleteAsync(tempUri, { idempotent: true }).catch(() => {});
    }

    const savedLabel = `저장했습니다. iOS «파일» 앱 → 내 iPhone → 이 앱 → «${folderName}» 폴더에서 오디오를 확인할 수 있습니다.`;
    return { savedLabel };
  }

  const granular = getAndroidMediaGranularPermissions();
  /** `true`(writeOnly)이면 Android에서 읽기 권한이 없어 getAlbumAsync 가 실패할 수 있음 */
  const perm = await MediaLibrary.requestPermissionsAsync(false, granular);
  if (!perm.granted) {
    await FileSystem.deleteAsync(tempUri, { idempotent: true }).catch(() => {});
    const expoGoHint =
      Constants.appOwnership === 'expo'
        ? ' Expo Go로 실행 중이면 설정 → 앱 → Expo Go → 권한에서 음악 및 오디오(일부 기기·버전에서는 사진 및 동영상·미디어)를 찾아 허용해 주세요.'
        : '';
    throw new Error(
      `저장하려면 미디어·오디오 접근 권한이 필요합니다.${expoGoHint}`,
    );
  }

  const importUri = await copyForAndroidMediaLibrary(tempUri, safeName);
  try {
    try {
      await addAndroidAssetToLibrary(importUri);
    } catch {
      return await androidFallbackSaveToAppDocuments(importUri, safeName);
    }
  } finally {
    await FileSystem.deleteAsync(importUri, { idempotent: true }).catch(() => {});
    await FileSystem.deleteAsync(tempUri, { idempotent: true }).catch(() => {});
  }

  const folder = NRM_MEDIA_LIBRARY_ALBUM_SLUG;
  const savedLabel = `저장했습니다. 음악·파일 앱에서 오디오를 열고 앨범/폴더 이름 «${folder}»에서 찾을 수 있습니다. (일부 기기에서는 다운로드 폴더가 아니라 음악·오디오 라이브러리에 표시됩니다.)`;

  return { savedLabel };
}

/** 기기에서 생성한 임시 오디오 파일을 미디어 라이브러리·문서 폴더로 옮깁니다. */
export async function persistLocalAudioFile(
  tempUri: string,
  safeName: string,
): Promise<{ savedLabel: string }> {
  return moveTempAudioToUserLibrary(tempUri, safeName);
}

export async function persistAudioAfterServerJob(
  apiBase: string,
  jobId: string,
  options: { fileName: string },
): Promise<{ savedLabel: string }> {
  const base = normalizedApiBase(apiBase);
  const url = `${base}/api/download/file?jobId=${encodeURIComponent(jobId)}`;
  const safeName = options.fileName.endsWith('.mp3')
    ? options.fileName
    : `${options.fileName}.mp3`;

  const cacheRoot = FileSystem.cacheDirectory;
  if (!cacheRoot) {
    throw new Error('이 기기에서 임시 저장 공간을 사용할 수 없습니다.');
  }

  const tempBase =
    cacheRoot.endsWith('/') || cacheRoot.endsWith('\\')
      ? `${cacheRoot}nrm-dl-${jobId}-`
      : `${cacheRoot}/nrm-dl-${jobId}-`;
  const tempUri = `${tempBase}${safeName}`;

  const dl = await FileSystem.downloadAsync(url, tempUri);
  if (dl.status < 200 || dl.status >= 300) {
    throw new Error(`파일을 받지 못했습니다 (HTTP ${dl.status})`);
  }

  return moveTempAudioToUserLibrary(tempUri, safeName);
}
