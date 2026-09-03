import { NativeModules, Platform } from 'react-native';

import brandConfig from '../nrm-brand.config.json';
import { clearNrmAppSerialCache, getNrmAndroidIdSha256 } from '@/lib/nrmAppSerialNo.native';
import { fetchUserListEntryByDeviceId } from '@/lib/nrmUserListClient';
import { logNrmDev, logNrmRunError } from '@/lib/nrmDevLog';

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

/** 로그인 후 serial/userName을 네이티브 identity에 반영 (브랜딩 displayName은 제품명 유지) */
export async function applyNrmLoggedInIdentity(
  serialNo: string,
  userName: string,
): Promise<void> {
  const productDisplayName =
    String(brandConfig.versionInfoProductName ?? '').trim() ||
    bakedIdentity().displayName ||
    'NullReference Music';
  const storageFolder =
    (snapshot ?? bakedIdentity()).storageFolderName.trim() || bakedIdentity().storageFolderName;

  if (Platform.OS === 'android') {
    const mod = NativeModules.NrmAppBrand as NrmAppBrandNative | undefined;
    if (mod?.overwriteBrandIdentity) {
      try {
        const next = await mod.overwriteBrandIdentity(
          serialNo.trim(),
          userName.trim(),
          productDisplayName,
          storageFolder,
          false,
        );
        snapshot = {
          serialNo: String(next.serialNo ?? serialNo).trim(),
          userName: String(next.userName ?? userName).trim(),
          displayName: String(next.displayName ?? productDisplayName).trim(),
          storageFolderName: String(next.storageFolderName ?? storageFolder).trim(),
          versionInfoAdminBuild: false,
        };
        clearNrmAppSerialCache();
        return;
      } catch {
        // fall through to in-memory snapshot
      }
    }
  }

  snapshot = {
    serialNo: serialNo.trim(),
    userName: userName.trim(),
    displayName: productDisplayName,
    storageFolderName: storageFolder,
    versionInfoAdminBuild: false,
  };
  clearNrmAppSerialCache();
}

/** 로그아웃 시 로그인 사용자 identity를 APK 기본값으로 되돌린다. */
export async function resetNrmLoggedInIdentity(): Promise<void> {
  const target = bakedIdentity();
  if (Platform.OS === 'android') {
    const mod = NativeModules.NrmAppBrand as NrmAppBrandNative | undefined;
    if (mod?.overwriteBrandIdentity) {
      try {
        const restored = await mod.overwriteBrandIdentity(
          target.serialNo,
          target.userName,
          target.displayName,
          target.storageFolderName,
          target.versionInfoAdminBuild,
        );
        snapshot = {
          serialNo: String(restored.serialNo ?? target.serialNo).trim(),
          userName: String(restored.userName ?? target.userName).trim(),
          displayName: String(restored.displayName ?? target.displayName).trim(),
          storageFolderName: String(
            restored.storageFolderName ?? target.storageFolderName,
          ).trim(),
          versionInfoAdminBuild:
            restored.versionInfoAdminBuild === true,
        };
        clearNrmAppSerialCache();
        return;
      } catch (e) {
        logNrmRunError('brand-identity.logout-reset', e);
      }
    }
  }
  snapshot = target;
  clearNrmAppSerialCache();
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
    // displayName(앱 상호)은 항상 제품명. 사용자 식별은 OAuth 세션의 serial_no.
    const productDisplayName =
      String(brandConfig.versionInfoProductName ?? '').trim() ||
      bakedIdentity().displayName ||
      'NullReference Music';
    const recovered = await mod.overwriteBrandIdentity(
      entry.SerialNo.trim(),
      entry.userName.trim(),
      productDisplayName,
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
