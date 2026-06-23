import { NativeModules, Platform } from 'react-native';

type NrmAppBrandNative = {
  getSerialNo: () => Promise<string>;
  getUserName: () => Promise<string>;
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
  if (Platform.OS !== 'android') {
    cachedUserName = '';
    return cachedUserName;
  }
  const mod = NativeModules.NrmAppBrand as NrmAppBrandNative | undefined;
  if (!mod?.getUserName) {
    cachedUserName = '';
    return cachedUserName;
  }
  try {
    cachedUserName = String(await mod.getUserName()).trim();
  } catch {
    cachedUserName = '';
  }
  return cachedUserName;
}
