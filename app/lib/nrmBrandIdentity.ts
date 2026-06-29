import { NativeModules, Platform } from 'react-native';

import brandConfig from '../nrm-brand.config.json';
import { clearNrmAppSerialCache, getNrmAndroidIdSha256 } from '@/lib/nrmAppSerialNo.native';
import { fetchUserListEntryByDeviceId } from '@/lib/nrmUserListClient';
import { logNrmDev } from '@/lib/nrmDevLog';

export type NrmBrandIdentity = {
  serialNo: string;
  userName: string;
  displayName: string;
  storageFolderName: string;
  versionInfoAdminBuild: boolean;
};

type NrmAppBrandNative = {
  initializeBrandIdentity?: () => Promise<NrmBrandIdentity>;
  overwriteBrandIdentity?: (
    serialNo: string,
    userName: string,
    displayName: string,
    storageFolderName: string,
    versionInfoAdminBuild: boolean,
  ) => Promise<NrmBrandIdentity>;
};

let snapshot: NrmBrandIdentity | null = null;
let initPromise: Promise<NrmBrandIdentity> | null = null;

function bakedIdentity(): NrmBrandIdentity {
  return {
    serialNo: String(brandConfig.serialNo ?? '').trim(),
    userName: String(brandConfig.userName ?? '').trim(),
    displayName: String(brandConfig.displayName ?? '').trim(),
    storageFolderName: String(brandConfig.storageFolderName ?? '').trim(),
    versionInfoAdminBuild: brandConfig.versionInfoAdminBuild === true,
  };
}

export function getNrmBrandIdentitySnapshot(): NrmBrandIdentity | null {
  return snapshot;
}

export function isNrmAdminBuild(): boolean {
  return (snapshot ?? bakedIdentity()).versionInfoAdminBuild;
}

export function getResolvedNrmBrandDisplayName(): string {
  const name = (snapshot ?? bakedIdentity()).displayName.trim();
  return name || bakedIdentity().displayName;
}

export function getResolvedNrmBrandStorageFolderName(): string {
  const folder = (snapshot ?? bakedIdentity()).storageFolderName.trim();
  return folder || bakedIdentity().storageFolderName;
}

export function getResolvedNrmBrandUserName(): string {
  return (snapshot ?? bakedIdentity()).userName.trim();
}

/** Android: SharedPreferences에 저장된 identity 복원(최초 1회는 APK 내장값 저장). */
export async function initNrmBrandIdentity(): Promise<NrmBrandIdentity> {
  if (snapshot) return snapshot;
  if (initPromise) return initPromise;

  initPromise = (async () => {
    if (Platform.OS === 'android') {
      const mod = NativeModules.NrmAppBrand as NrmAppBrandNative | undefined;
      if (mod?.initializeBrandIdentity) {
        try {
          const fromNative = await mod.initializeBrandIdentity();
          snapshot = {
            serialNo: String(fromNative.serialNo ?? '').trim(),
            userName: String(fromNative.userName ?? '').trim(),
            displayName: String(fromNative.displayName ?? '').trim(),
            storageFolderName: String(fromNative.storageFolderName ?? '').trim(),
            versionInfoAdminBuild: fromNative.versionInfoAdminBuild === true,
          };
          clearNrmAppSerialCache();
          await tryRecoverBrandIdentityFromDeviceBinding(mod);
          return snapshot!;
        } catch {
          // fall through to baked
        }
      }
    }
    snapshot = bakedIdentity();
    return snapshot;
  })();

  return initPromise;
}

async function tryRecoverBrandIdentityFromDeviceBinding(
  mod: NrmAppBrandNative,
): Promise<void> {
  if (!snapshot?.versionInfoAdminBuild || snapshot.serialNo !== 'admin') return;
  if (!mod.overwriteBrandIdentity) return;

  try {
    const deviceHash = await getNrmAndroidIdSha256();
    if (!deviceHash) return;
    const entry = await fetchUserListEntryByDeviceId(deviceHash);
    if (!entry || entry.SerialNo.trim() === 'admin') return;

    const storageFolder =
      snapshot.storageFolderName.trim() || bakedIdentity().storageFolderName;
    const recovered = await mod.overwriteBrandIdentity(
      entry.SerialNo.trim(),
      entry.userName.trim(),
      entry.appName.trim() || bakedIdentity().displayName,
      storageFolder,
      false,
    );
    snapshot = {
      serialNo: String(recovered.serialNo ?? '').trim(),
      userName: String(recovered.userName ?? '').trim(),
      displayName: String(recovered.displayName ?? '').trim(),
      storageFolderName: String(recovered.storageFolderName ?? '').trim(),
      versionInfoAdminBuild: recovered.versionInfoAdminBuild === true,
    };
    clearNrmAppSerialCache();
    logNrmDev('brand-identity', {
      event: 'recovered-from-device-binding',
      serialNo: snapshot.serialNo,
      entryId: entry.id,
    });
  } catch {
    // 복구 실패 시 admin identity 유지
  }
}
