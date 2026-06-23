import { NativeModules, Platform } from 'react-native';

type NrmGithubDataNative = {
  getGithubDataPat: () => Promise<string>;
};

export async function getNrmGithubDataPat(): Promise<string> {
  if (Platform.OS !== 'android') return '';
  const mod = NativeModules.NrmGithubData as NrmGithubDataNative | undefined;
  if (!mod?.getGithubDataPat) return '';
  try {
    return String(await mod.getGithubDataPat()).trim();
  } catch {
    return '';
  }
}
