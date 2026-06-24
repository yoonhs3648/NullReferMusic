import brandConfig from '../nrm-brand.config.json';

/**
 * 앱 브랜드 문자열 단일 출처.
 * 친구용 커스텀 빌드: `app/nrm-brand.config.json` 만 수정 후 `npm run sync:brand` (APK 빌드 시 자동).
 */
export const NRM_BRAND_DISPLAY_NAME = brandConfig.displayName.trim();
export const NRM_BRAND_STORAGE_FOLDER_NAME = brandConfig.storageFolderName.trim();

/** 버전 정보 오버레이 상단 제품명 — 커스텀 displayName과 무관 */
export const NRM_VERSION_INFO_PRODUCT_NAME = (
  brandConfig.versionInfoProductName ?? 'NullReference Music'
).trim() || 'NullReference Music';

/** 친구용 APK 빌드 시에만 설정 (build-release-apk-custom.bat -Customize) */
export function getNrmVersionInfoCustomizingLine(): string | null {
  const label = (brandConfig.versionInfoCustomizing ?? '').trim();
  return label ? `customizing : ${label}` : null;
}

/** 기본 admin APK 빌드 시에만 설정 (build-release-apk-custom.bat, -Customize 없음) */
export function getNrmVersionInfoAdminLine(): string | null {
  return brandConfig.versionInfoAdminBuild === true ? 'admin version' : null;
}

/** 로고 워드마크 — 마지막 단어를 accent 색으로 분리 */
export function getNrmLogoWordmark(): { primary: string; accent: string } {
  const parts = NRM_BRAND_DISPLAY_NAME.split(/\s+/).filter(Boolean);
  if (parts.length <= 1) {
    return { primary: NRM_BRAND_DISPLAY_NAME, accent: '' };
  }
  const accent = parts.pop()!;
  return { primary: `${parts.join(' ')} `, accent };
}

export function getNrmFileLogFolderDisplayPath(): string {
  return `Download/${NRM_BRAND_STORAGE_FOLDER_NAME}/logs/`;
}

export function getNrmDownloadsFolderDisplayPath(): string {
  return `Download/${NRM_BRAND_STORAGE_FOLDER_NAME}/downloads/`;
}

export function getNrmAppExitConfirmMessage(): string {
  return `${NRM_BRAND_DISPLAY_NAME}을 종료할까요?`;
}

export function getNrmUserAgent(appVersion: string): string {
  return `${NRM_BRAND_STORAGE_FOLDER_NAME}/${appVersion}`;
}

/** 다운로드·문서 저장 폴더명 (공백 없음) */
export const NRM_DOWNLOAD_DIR_NAME = NRM_BRAND_STORAGE_FOLDER_NAME;
