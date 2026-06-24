import brandConfig from '../nrm-brand.config.json';

import { NativeModules, Platform } from 'react-native';

type NrmAppBrandNative = {
  getSerialNo: () => Promise<string>;
  getUserName: () => Promise<string>;
  getAndroidIdSha256: () => Promise<string>;
};

let cachedSerialNo: string | null = null;
let cachedUserName: string | null = null;

export async function getNrmAppSerialNo(): Promise<string> {
  if (cachedSerialNo !== null) return cachedSerialNo;
  if (Platform.OS !== 'android') {
    cachedSerialNo = '';
    return cachedSerialNo;
  }
  const mod = NativeModules.NrmAppBrand as NrmAppBrandNative | undefined;
  if (!mod?.getSerialNo) {
    cachedSerialNo = '';
    return cachedSerialNo;
  }
  try {
    cachedSerialNo = String(await mod.getSerialNo()).trim();
  } catch {
    cachedSerialNo = '';
  }
  return cachedSerialNo;
}

export async function getNrmAppUserName(): Promise<string> {
  if (cachedUserName !== null) return cachedUserName;
  const fromConfig = String(brandConfig.userName ?? '').trim();
  if (Platform.OS !== 'android') {
    cachedUserName = fromConfig;
    return cachedUserName;
  }
  const mod = NativeModules.NrmAppBrand as NrmAppBrandNative | undefined;
  if (!mod?.getUserName) {
    cachedUserName = fromConfig;
    return cachedUserName;
  }
  try {
    const fromNative = String(await mod.getUserName()).trim();
    cachedUserName = fromNative || fromConfig;
  } catch {
    cachedUserName = fromConfig;
  }
  return cachedUserName;
}

/** 기기의 ANDROID_ID를 SHA-256 해싱한 hex 문자열 (비식별화) */
export async function getNrmAndroidIdSha256(): Promise<string> {
  if (Platform.OS !== 'android') return '';
  const mod = NativeModules.NrmAppBrand as NrmAppBrandNative | undefined;
  if (!mod?.getAndroidIdSha256) return '';
  try {
    return String(await mod.getAndroidIdSha256()).trim();
  } catch {
    return '';
  }
}
