import { NativeModules, Platform } from 'react-native';

type NrmDeepLNativeModule = {
  translateTexts: (
    apiKey: string,
    texts: string[],
  ) => Promise<{ texts: string[]; sourceLangs?: string[]; apiUsed: string }>;
};

export function isNativeDeepLTranslateAvailable(): boolean {
  return Platform.OS === 'android' && NativeModules.NrmDeepL?.translateTexts != null;
}

export async function translateTextsViaNative(
  apiKey: string,
  texts: string[],
): Promise<{ texts: string[]; sourceLangs: string[]; apiUsed: 'free' | 'pro' }> {
  const mod = NativeModules.NrmDeepL as NrmDeepLNativeModule | undefined;
  if (!mod?.translateTexts) {
    throw new Error('NrmDeepL.translateTexts unavailable');
  }
  const out = await mod.translateTexts(apiKey.trim(), texts);
  const apiUsed = out.apiUsed === 'pro' ? 'pro' : 'free';
  return {
    texts: Array.isArray(out.texts) ? out.texts.map((t) => String(t ?? '').trim()) : [],
    sourceLangs: Array.isArray(out.sourceLangs)
      ? out.sourceLangs.map((v) => String(v ?? '').trim().toUpperCase())
      : [],
    apiUsed,
  };
}
