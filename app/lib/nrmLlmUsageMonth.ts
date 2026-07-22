/** AI Lab 사용량 조회 — `LLMUserQuota.TargetMonth`(YYYYMM) 관련 월 계산 유틸. */

/** 현재(기기 로컬 시각 기준) YYYYMM. */
export function nrmCurrentTargetMonth(): string {
  return targetMonthFromDate(new Date());
}

export function targetMonthFromDate(d: Date): string {
  const y = d.getFullYear();
  const m = d.getMonth() + 1;
  return `${y}${String(m).padStart(2, '0')}`;
}

/** targetMonth(YYYYMM)에 delta개월을 더한 새 YYYYMM. */
export function nrmShiftTargetMonth(targetMonth: string, delta: number): string {
  const y = Number(targetMonth.slice(0, 4));
  const m = Number(targetMonth.slice(4, 6));
  const d = new Date(y, m - 1 + delta, 1);
  return targetMonthFromDate(d);
}

/** targetMonth가 현재(로컬) 월 이후(미래)인지 — "다음 달" 버튼 비활성 조건. */
export function nrmIsFutureTargetMonth(targetMonth: string): boolean {
  return targetMonth > nrmCurrentTargetMonth();
}

/** YYYYMM → "2026년 7월" 표시용 라벨. */
export function nrmFormatTargetMonthLabel(targetMonth: string): string {
  const y = targetMonth.slice(0, 4);
  const m = Number(targetMonth.slice(4, 6));
  return `${y}년 ${m}월`;
}
