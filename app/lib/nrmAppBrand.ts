import brandConfig from '../nrm-brand.config.json';
import {
  getResolvedNrmBrandStorageFolderName,
  getResolvedNrmBrandUserName,
  isNrmAdminBuild,
} from '@/lib/nrmBrandIdentity';

/**
 * 앱 브랜드 문자열 단일 출처.
 * 앱 내 상호(로고·약관·종료·런처)는 항상 NullReference Music.
 * 커스텀 빌드의 appName은 user_list legacy 기록용이며 displayName bake에 쓰지 않는다.
 */
/** 버전 정보 오버레이·앱 상호 공통 제품명 */
export const NRM_VERSION_INFO_PRODUCT_NAME = (
  brandConfig.versionInfoProductName ?? 'NullReference Music'
).trim() || 'NullReference Music';

export const NRM_BRAND_DISPLAY_NAME = NRM_VERSION_INFO_PRODUCT_NAME;
export const NRM_BRAND_STORAGE_FOLDER_NAME = brandConfig.storageFolderName.trim();

/** 앱 내 상호(로고·약관·종료 확인)용 제품명 — 커스텀 appName과 무관 */
export function getNrmProductDisplayName(): string {
  return NRM_VERSION_INFO_PRODUCT_NAME;
}

/** @deprecated getNrmProductDisplayName() 사용 */
export function getNrmBrandDisplayNameForUi(): string {
  return getNrmProductDisplayName();
}

export function getNrmBrandStorageFolderForPaths(): string {
  return getResolvedNrmBrandStorageFolderName();
}
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
  const normalized = displayName.trim() || getNrmProductDisplayName();
  const parts = normalized.split(/\s+/).filter(Boolean);
  if (parts.length <= 1) {
    return { primary: normalized, accent: '' };
  }
  const accent = parts.pop()!;
  return { primary: `${parts.join(' ')} `, accent };
}

export function getNrmLogoWordmark(): { primary: string; accent: string } {
  return splitNrmLogoWordmark(getNrmProductDisplayName());
}

export function getNrmFileLogFolderDisplayPath(): string {
  return `Download/${getNrmBrandStorageFolderForPaths()}/logs/`;
}

export function getNrmDownloadsFolderDisplayPath(): string {
  return `Download/${getNrmBrandStorageFolderForPaths()}/downloads/`;
}

export function getNrmAppExitConfirmMessage(): string {
  return `${getNrmProductDisplayName()}을 종료할까요?`;
}

export function getNrmUserAgent(appVersion: string): string {
  return `${getNrmBrandStorageFolderForPaths()}/${appVersion}`;
}

/** 다운로드·문서 저장 폴더명 (공백 없음) — 웹·레거시 import 호환 */
export const NRM_DOWNLOAD_DIR_NAME = NRM_BRAND_STORAGE_FOLDER_NAME;

export function getNrmDownloadDirName(): string {
  return getNrmBrandStorageFolderForPaths();
}
