/**
 * APK 파일 로깅 빌드 허용 여부.
 * on/off는 AsyncStorage(`nrm_file_logging_enabled`) 단일 저장 — 기본 off.
 */
export const NRM_FILE_LOGGING_BUILD_ALLOWED = true as const;

/** @deprecated isNrmFileLoggingActive() 사용 */
export const NRM_FILE_LOGGING_ENABLED = NRM_FILE_LOGGING_BUILD_ALLOWED;
