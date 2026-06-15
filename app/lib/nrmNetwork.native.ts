import { NativeModules, Platform } from 'react-native';

type NrmNetworkNative = {
  isConnectedViaWifi?: () => Promise<boolean>;
};

const mod = NativeModules.NrmNetwork as NrmNetworkNative | undefined;

/** Wi‑Fi(또는 이더넷) 연결 여부. Android 전용 — 그 외는 true(확인 생략). */
export async function isConnectedViaWifiNative(): Promise<boolean> {
  if (Platform.OS !== 'android' || !mod?.isConnectedViaWifi) {
    return true;
  }
  try {
    return await mod.isConnectedViaWifi();
  } catch {
    return false;
  }
}
