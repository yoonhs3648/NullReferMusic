/** Web — CookieManager 없음. 수동 입력·백엔드 프록시만 사용 */
export function hasNrmMelonCookieNativeModule(): boolean {
  return false;
}

export async function readMelonLoginCookieHeader(): Promise<string | null> {
  return null;
}

export async function clearMelonWebLoginCookies(): Promise<void> {
  /* no-op */
}
