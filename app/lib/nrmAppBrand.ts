import brandConfig from '../nrm-brand.config.json';
import {
  getResolvedNrmBrandStorageFolderName,
  getResolvedNrmBrandUserName,
} from '@/lib/nrmBrandIdentity';
import { peekAdminSessionActive } from '@/lib/nrmAdminSession';

/**
 * 앱 브랜드 문자열 단일 출처.
 * 앱 내 상호(로고·약관·종료·런처)는 항상 NullReference Music.
 * 사용자 serial/userName은 OAuth 로그인 세션에서 온다.
 */
/** 버전 정보 오버레이·앱 상호 공통 제품명 */
export const NRM_VERSION_INFO_PRODUCT_NAME = (
  brandConfig.versionInfoProductName ?? 'NullReference Music'
).trim() || 'NullReference Music';

export const NRM_BRAND_DISPLAY_NAME = NRM_VERSION_INFO_PRODUCT_NAME;
export const NRM_BRAND_STORAGE_FOLDER_NAME = brandConfig.storageFolderName.trim();

/** 앱 내 상호(로고·약관·종료 확인)용 제품명 */
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
/** 로그인한 사용자 이름이 있을 때 버전 정보 Custom 줄 */
export function getNrmVersionInfoCustomizingLine(): string | null {
  const userName = getResolvedNrmBrandUserName() || String(brandConfig.userName ?? '').trim();
  return userName ? `Custom : ${userName}` : null;
}

/** 로그인한 사용자의 is_admin=y 일 때 */
export function getNrmVersionInfoAdminLine(): string | null {
  return peekAdminSessionActive() ? 'Admin Version' : null;
}

export function shouldShowVersionInfoSerialNumber(): boolean {
  return true;
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
