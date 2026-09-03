import { getNrmAuthSessionSerialNo, getNrmAuthSessionUserName } from '@/lib/nrmAuthSession';

export function clearNrmAppSerialCache(): void {}

export async function getNrmAppSerialNo(): Promise<string> {
  return getNrmAuthSessionSerialNo();
}

export async function getNrmAppUserName(): Promise<string> {
  return getNrmAuthSessionUserName();
}

export async function getNrmAndroidIdSha256(): Promise<string> {
  return '';
}
