/**
 * APK 파일 로깅 빌드 허용 여부.
 * 실제 on/off는 사용자 설정(AsyncStorage + NrmFileLogger SharedPreferences)으로 제어.
 */
export const NRM_FILE_LOGGING_BUILD_ALLOWED = true as const;

/** @deprecated isNrmFileLoggingActive() 사용 */
export const NRM_FILE_LOGGING_ENABLED = NRM_FILE_LOGGING_BUILD_ALLOWED;
