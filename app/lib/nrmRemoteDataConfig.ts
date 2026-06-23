export const NRM_GITHUB_REPO = 'yoonhs3648/NullReferMusic';
export const NRM_GITHUB_BRANCH = 'main';

export const NRM_ALARM_JSON_RAW_URL = `https://raw.githubusercontent.com/${NRM_GITHUB_REPO}/${NRM_GITHUB_BRANCH}/data/alarm.json`;
export const NRM_USER_LIST_JSON_RAW_URL = `https://raw.githubusercontent.com/${NRM_GITHUB_REPO}/${NRM_GITHUB_BRANCH}/data/custom-apk/userList.json`;
export const NRM_USER_LIST_JSON_API_PATH = `https://api.github.com/repos/${NRM_GITHUB_REPO}/contents/data/custom-apk/userList.json`;

export const NRM_ALARM_JSON_API_PATH = `https://api.github.com/repos/${NRM_GITHUB_REPO}/contents/data/alarm.json`;

export const NRM_INQUIRY_JSON_RAW_URL = `https://raw.githubusercontent.com/${NRM_GITHUB_REPO}/${NRM_GITHUB_BRANCH}/data/inquiry.json`;
export const NRM_INQUIRY_JSON_API_PATH = `https://api.github.com/repos/${NRM_GITHUB_REPO}/contents/data/inquiry.json`;
export const NRM_INQUIRY_ATTACH_DIR_API = `https://api.github.com/repos/${NRM_GITHUB_REPO}/contents/data/inquiryAttachFile`;

export const NRM_USER_BAN_LIST_JSON_RAW_URL = `https://raw.githubusercontent.com/${NRM_GITHUB_REPO}/${NRM_GITHUB_BRANCH}/data/userBanList.json`;
export const NRM_USER_BAN_LIST_JSON_API_PATH = `https://api.github.com/repos/${NRM_GITHUB_REPO}/contents/data/userBanList.json`;

/** 원격 차단 목록 주기적 갱신 간격 (캐시 없음) */
export const NRM_USER_BAN_POLL_INTERVAL_MS = 30 * 60 * 1000;

/** 알림 리스트에 표시할 최대 일수 */
export const NRM_ALARM_DISPLAY_DAYS = 30;

export const NRM_INQUIRY_MAX_CONTENT_CHARS = 500;
export const NRM_INQUIRY_MAX_ATTACHMENT_BYTES = 20 * 1024 * 1024;

