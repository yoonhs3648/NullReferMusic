/** 웹: 네이티브 권한 없음 */
export async function ensureAppRequiredPermissions(): Promise<boolean> {
  return true;
}

export function getAndroidMediaGranularPermissions(): undefined {
  return undefined;
}
