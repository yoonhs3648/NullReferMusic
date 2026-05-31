/**
 * APK 파일 로깅 전역 스위치.
 * false — Download/…/nrm-debug.log 등 물리 로그 파일을 절대 쓰지 않음.
 * (레거시 로거·설정 코드는 유지, 호출만 no-op)
 */
export const NRM_FILE_LOGGING_ENABLED = false as const;
