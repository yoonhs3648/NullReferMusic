import { NativeModules, Platform } from 'react-native';

type IosAudioNative = {
  transcribeToLrc?: (inputPath: string) => Promise<string>;
  alignPlainToLrc?: (inputPath: string, plain: string, lang: string) => Promise<string>;
  transcodeAudio?: (
    inputPath: string,
    format: string,
    bitrateKbps: number,
  ) => Promise<{ path?: string; format?: string; fallbackReason?: string }>;
  beginBackgroundTask?: (token: string) => Promise<null>;
  endBackgroundTask?: (token: string) => Promise<null>;
  pickDocument?: () => Promise<{ name?: string; uri?: string; sizeBytes?: number } | null>;
};

function mod(): IosAudioNative | undefined {
  if (Platform.OS !== 'ios') return undefined;
  return NativeModules.NrmAudioMetadata as IosAudioNative | undefined;
}

function fsPath(fileUri: string): string {
  return fileUri.startsWith('file://') ? fileUri.slice(7) : fileUri;
}

export async function transcribeAudioOnIos(fileUri: string): Promise<string> {
  const native = mod();
  if (!native?.transcribeToLrc) return '';
  const lrc = await native.transcribeToLrc(fsPath(fileUri));
  return String(lrc ?? '').trim();
}

export async function alignPlainLyricsOnIos(
  fileUri: string,
  plain: string,
  lang: string,
): Promise<string> {
  const native = mod();
  if (!native?.alignPlainToLrc) return '';
  const lrc = await native.alignPlainToLrc(fsPath(fileUri), plain, lang);
  return String(lrc ?? '').trim();
}

export async function transcodeAudioOnIos(
  fileUri: string,
  format: string,
  bitrateKbps: number,
): Promise<{ path: string; format?: string; fallbackReason?: string }> {
  const native = mod();
  if (!native?.transcodeAudio) {
    throw new Error('iOS 오디오 변환을 사용할 수 없습니다.');
  }
  const out = await native.transcodeAudio(fsPath(fileUri), format, bitrateKbps);
  const path = String(out?.path ?? '').trim();
  if (!path) throw new Error('iOS 오디오 변환 결과가 비어 있습니다.');
  return {
    path: path.startsWith('file://') ? path : `file://${path}`,
    format: out?.format,
    fallbackReason: out?.fallbackReason,
  };
}

export function beginIosBackgroundWork(token: string): void {
  const native = mod();
  if (!native?.beginBackgroundTask) return;
  void native.beginBackgroundTask(token).catch(() => undefined);
}

export function endIosBackgroundWork(token: string): void {
  const native = mod();
  if (!native?.endBackgroundTask) return;
  void native.endBackgroundTask(token).catch(() => undefined);
}

export async function pickIosDocument(): Promise<{
  name: string;
  uri: string;
  sizeBytes: number;
} | null> {
  const native = mod();
  if (!native?.pickDocument) return null;
  const row = await native.pickDocument();
  if (!row?.uri) return null;
  return {
    name: String(row.name ?? ''),
    uri: String(row.uri),
    sizeBytes: Number(row.sizeBytes ?? 0),
  };
}
