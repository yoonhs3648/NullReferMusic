/** 웹: 네이티브 권한 없음 */
export type NrmRequiredPermissionState = {
  notifications: boolean;
  media: boolean;
  saf: boolean;
};

export async function ensureAppRequiredPermissions(): Promise<boolean> {
  return true;
}

export async function checkRequiredPermissions(): Promise<NrmRequiredPermissionState> {
  return { notifications: true, media: true, saf: true };
}

export async function requestAllRequiredPermissions(): Promise<NrmRequiredPermissionState> {
  return { notifications: true, media: true, saf: true };
}

export function getAndroidMediaGranularPermissions(): undefined {
  return undefined;
}
