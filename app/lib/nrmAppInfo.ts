import packageJson from '../package.json';

import { NRM_VERSION_INFO_PRODUCT_NAME, getNrmVersionInfoAdminLine, getNrmVersionInfoCustomizingLine, shouldShowVersionInfoSerialNumber } from '@/lib/nrmAppBrand';

export { getNrmVersionInfoAdminLine, getNrmVersionInfoCustomizingLine, shouldShowVersionInfoSerialNumber };

/**
 * `package.json`의 `version` — Expo Go는 `expo-constants`의 `version`을 1.0.0 등으로 둘 수 있어
 * 릴리즈·앱 구성과 동일한 값을 쓰려면 npm 버전을 직접 씁니다.
 */
export function getNrmAppVersion(): string {
  return packageJson.version;
}

/** 설정·메뉴에 표시하는 전체 라벨 */
export function getNrmAppVersionLabel(): string {
  return `${NRM_VERSION_INFO_PRODUCT_NAME} v${getNrmAppVersion()}`;
}

/** 앱 정보 화면용 저작권 한 줄(연도 자동) — 커스텀 displayName과 무관 */
export function getNrmAppCopyrightNotice(): string {
  const year = new Date().getFullYear();
  return `© ${year} ${NRM_VERSION_INFO_PRODUCT_NAME}. All rights reserved.`;
}

/** 제작자 표기 */
export const NRM_APP_AUTHOR_DISPLAY = 'hsyoon';
