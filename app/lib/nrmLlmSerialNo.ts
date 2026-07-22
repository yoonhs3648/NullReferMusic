/**
 * APK SerialNo → LLM 관련 테이블(`ChatSession`/`LLMUserQuota`/`LLMTokenHistory`/`LLMUserPermission`)의
 * `SerialNo` 컬럼 값 변환.
 *
 * 위 테이블들의 `SerialNo`는 **varchar**다 (과거엔 `bigint`여서 admin("admin")을 `0`으로 매핑해야 했지만,
 * 지금은 앱 `getNrmAppSerialNo()` 원문을 형 변환 없이 그대로 저장한다).
 *
 * - admin APK: text `"admin"` 그대로 저장
 * - 커스텀 APK: 숫자 문자열도 원문 그대로 저장 (앞자리 `0` 보존, 예: `"01092452918"`)
 */
export const NRM_LLM_ADMIN_SERIAL_NO = 'admin';

export function resolveLlmSerialNo(appSerialNo: string): string | null {
  const trimmed = appSerialNo.trim();
  return trimmed || null;
}

/** LLMUserPermission AllocatedToken = 0 → 할당 한도 없음(무제한). LLMProvider DailyLimit/MonthlyLimit 과 동일 규칙. */
export const NRM_LLM_UNLIMITED_ALLOCATED_TOKEN = 0;
