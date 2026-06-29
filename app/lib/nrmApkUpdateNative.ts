import { NativeEventEmitter, NativeModules, Platform } from 'react-native';

type NrmApkUpdateNative = {
  downloadApk(url: string, fileName: string): Promise<string>;
  installApk(apkPath: string): Promise<void>;
  canInstallPackages(): Promise<boolean>;
  openInstallUnknownAppsSettings(): Promise<void>;
};

const mod = NativeModules.NrmApkUpdate as NrmApkUpdateNative | undefined;

export function isNrmApkUpdateNativeAvailable(): boolean {
  return Platform.OS === 'android' && mod != null;
}

export type NrmApkDownloadProgress = {
  progress: number;
};

export function subscribeNrmApkDownloadProgress(
  listener: (event: NrmApkDownloadProgress) => void,
): () => void {
  if (!mod) return () => {};
  const emitter = new NativeEventEmitter(NativeModules.NrmApkUpdate);
  const sub = emitter.addListener('NrmApkDownloadProgress', listener);
  return () => sub.remove();
}

export async function downloadNrmApkUpdate(url: string, fileName: string): Promise<string> {
  if (!mod) {
    throw new Error('NrmApkUpdate native module unavailable');
  }
  return mod.downloadApk(url, fileName);
}

export async function installNrmApkUpdate(apkPath: string): Promise<void> {
  if (!mod) {
    throw new Error('NrmApkUpdate native module unavailable');
  }
  await mod.installApk(apkPath);
}

export async function canNrmInstallPackages(): Promise<boolean> {
  if (!mod) return false;
  return mod.canInstallPackages();
}

export async function openNrmInstallUnknownAppsSettings(): Promise<void> {
  if (!mod) return;
  await mod.openInstallUnknownAppsSettings();
}
