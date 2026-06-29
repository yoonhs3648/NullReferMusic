import brandConfig from '../nrm-brand.config.json';
import {
  getResolvedNrmBrandDisplayName,
  getResolvedNrmBrandStorageFolderName,
  getResolvedNrmBrandUserName,
  isNrmAdminBuild,
} from '@/lib/nrmBrandIdentity';

/**
 * 앱 브랜드 문자열 단일 출처.
 * 친구용 커스텀 빌드: `app/nrm-brand.config.json` 만 수정 후 `npm run sync:brand` (APK 빌드 시 자동).
 */
export const NRM_BRAND_DISPLAY_NAME = brandConfig.displayName.trim();
export const NRM_BRAND_STORAGE_FOLDER_NAME = brandConfig.storageFolderName.trim();

/** 런타임 identity(업데이트 후 복원) 우선 — UI·경로 표시용 */
export function getNrmBrandDisplayNameForUi(): string {
  return getResolvedNrmBrandDisplayName();
}

export function getNrmBrandStorageFolderForPaths(): string {
  return getResolvedNrmBrandStorageFolderName();
}

/** 버전 정보 오버레이 상단 제품명 — 커스텀 displayName과 무관 */
export const NRM_VERSION_INFO_PRODUCT_NAME = (
  brandConfig.versionInfoProductName ?? 'NullReference Music'
).trim() || 'NullReference Music';

/** 친구용 APK 빌드 시에만 설정 (build-release-apk-custom.bat Y) */
export function getNrmVersionInfoCustomizingLine(): string | null {
  if (isNrmAdminBuild()) return null;
  const userName = getResolvedNrmBrandUserName() || String(brandConfig.userName ?? '').trim();
  return userName ? `Custom : ${userName}` : null;
}

/** admin APK 빌드 시에만 설정 (build-release-apk-custom.bat N) */
export function getNrmVersionInfoAdminLine(): string | null {
  return isNrmAdminBuild() ? 'Admin Version' : null;
}

/** 버전 정보에 Serial Number 줄을 표시할지 (admin APK는 숨김) */
export function shouldShowVersionInfoSerialNumber(): boolean {
  return !isNrmAdminBuild();
}

/** 로고 워드마크 — 마지막 단어를 accent 색으로 분리 */
export function splitNrmLogoWordmark(displayName: string): { primary: string; accent: string } {
  const normalized = displayName.trim() || NRM_BRAND_DISPLAY_NAME;
  const parts = normalized.split(/\s+/).filter(Boolean);
  if (parts.length <= 1) {
    return { primary: normalized, accent: '' };
  }
  const accent = parts.pop()!;
  return { primary: `${parts.join(' ')} `, accent };
}

export function getNrmLogoWordmark(): { primary: string; accent: string } {
  return splitNrmLogoWordmark(getNrmBrandDisplayNameForUi());
}

export function getNrmFileLogFolderDisplayPath(): string {
  return `Download/${getNrmBrandStorageFolderForPaths()}/logs/`;
}

export function getNrmDownloadsFolderDisplayPath(): string {
  return `Download/${getNrmBrandStorageFolderForPaths()}/downloads/`;
}

export function getNrmAppExitConfirmMessage(): string {
  return `${getNrmBrandDisplayNameForUi()}을 종료할까요?`;
}

export function getNrmUserAgent(appVersion: string): string {
  return `${getNrmBrandStorageFolderForPaths()}/${appVersion}`;
}

/** 다운로드·문서 저장 폴더명 (공백 없음) — 웹·레거시 import 호환 */
export const NRM_DOWNLOAD_DIR_NAME = NRM_BRAND_STORAGE_FOLDER_NAME;

export function getNrmDownloadDirName(): string {
  return getNrmBrandStorageFolderForPaths();
}
