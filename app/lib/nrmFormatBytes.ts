/** 바이트 수를 UI용 대략 용량 문자열로 변환 */
export function formatApproxBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'] as const;
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  const rounded =
    value >= 100 ? Math.round(value) : value >= 10 ? Math.round(value * 10) / 10 : Math.round(value * 100) / 100;
  return `~${rounded} ${units[unit]}`;
}
