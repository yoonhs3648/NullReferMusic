export const NRM_GITHUB_REPO = 'yoonhs3648/NullReferMusic';
export const NRM_GITHUB_BRANCH = 'main';

export const NRM_ALARM_JSON_RAW_URL = `https://raw.githubusercontent.com/${NRM_GITHUB_REPO}/${NRM_GITHUB_BRANCH}/data/alarm.json`;
export const NRM_USER_LIST_JSON_RAW_URL = `https://raw.githubusercontent.com/${NRM_GITHUB_REPO}/${NRM_GITHUB_BRANCH}/data/custom-apk/userList.json`;
export const NRM_USER_LIST_JSON_API_PATH = `https://api.github.com/repos/${NRM_GITHUB_REPO}/contents/data/custom-apk/userList.json`;

export const NRM_ALARM_JSON_API_PATH = `https://api.github.com/repos/${NRM_GITHUB_REPO}/contents/data/alarm.json`;

export const NRM_INQUIRY_JSON_RAW_URL = `https://raw.githubusercontent.com/${NRM_GITHUB_REPO}/${NRM_GITHUB_BRANCH}/data/inquiry.json`;
export const NRM_INQUIRY_JSON_API_PATH = `https://api.github.com/repos/${NRM_GITHUB_REPO}/contents/data/inquiry.json`;
export const NRM_INQUIRY_ATTACH_DIR_API = `https://api.github.com/repos/${NRM_GITHUB_REPO}/contents/data/inquiryAttachFile`;
export const NRM_INQUIRY_ATTACH_RAW_BASE = `https://raw.githubusercontent.com/${NRM_GITHUB_REPO}/${NRM_GITHUB_BRANCH}/data/inquiryAttachFile`;


export const NRM_USER_BAN_LIST_JSON_RAW_URL = `https://raw.githubusercontent.com/${NRM_GITHUB_REPO}/${NRM_GITHUB_BRANCH}/data/userBanList.json`;
export const NRM_USER_BAN_LIST_JSON_API_PATH = `https://api.github.com/repos/${NRM_GITHUB_REPO}/contents/data/userBanList.json`;

/** 공개 릴리스 APK 최신 버전 (PAT 불필요) */
export const NRM_APK_VERSION_JSON_RAW_URL = `https://raw.githubusercontent.com/${NRM_GITHUB_REPO}/${NRM_GITHUB_BRANCH}/data/apkVersion.json`;
export const NRM_APK_VERSION_JSON_API_PATH = `https://api.github.com/repos/${NRM_GITHUB_REPO}/contents/data/apkVersion.json`;

/** GitHub Releases APK 다운로드 URL (tag: v{version}, asset: NullReferenceMusic-v{version}.apk) */
export function getNrmApkReleaseDownloadUrl(version: string): string {
  const v = version.trim();
  return `https://github.com/${NRM_GITHUB_REPO}/releases/download/v${v}/NullReferenceMusic-v${v}.apk`;
}

/** 원격 차단 목록 주기적 갱신 간격 (캐시 없음) */
export const NRM_USER_BAN_POLL_INTERVAL_MS = 30 * 60 * 1000;

/** 알림 리스트에 표시할 최대 일수 */
export const NRM_ALARM_DISPLAY_DAYS = 30;

/** 문의내역 주기적 갱신 간격 */
export const NRM_INQUIRY_POLL_INTERVAL_MS = 60 * 1000;

export const NRM_INQUIRY_MAX_CONTENT_CHARS = 500;
export const NRM_INQUIRY_MAX_REPLY_CHARS = 2000;
export const NRM_INQUIRY_MAX_ATTACHMENT_BYTES = 20 * 1024 * 1024;

/** 문의내역 탭에 표시할 최대 일수 */
export const NRM_INQUIRY_HISTORY_DAYS = 90;

