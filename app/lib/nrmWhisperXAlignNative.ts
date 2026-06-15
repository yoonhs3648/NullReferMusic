import { NativeEventEmitter, NativeModules, Platform } from 'react-native';

import {
  NRM_WHISPERX_ALIGN_MODEL_ID,
  type NrmWhisperXAlignModelId,
} from '@/lib/nrmWhisperXAlignCatalog';

export type WhisperXAlignModelStatusRow = {
  modelId: NrmWhisperXAlignModelId;
  installed: boolean;
  downloading: boolean;
  progress: number;
};

type NrmWhisperNative = {
  getAlignModelStatuses?: () => Promise<
    Array<{
      modelId: string;
      installed?: boolean;
      downloading?: boolean;
      progress?: number;
    }>
  >;
  isAlignModelInstalled?: () => Promise<boolean>;
  startAlignModelDownload?: (modelId: string) => Promise<{ started?: boolean }>;
  alignMelonLyricsToLrc?: (
    audioPath: string,
    lyricsPlain: string,
    mode: 'melon' | 'melon_translation',
  ) => Promise<{ lrc?: string; alignFailed?: boolean; alignMemoryInsufficient?: boolean }>;
};

const mod = NativeModules.NrmWhisper as NrmWhisperNative | undefined;

export function isWhisperXAlignNativeAvailable(): boolean {
  return Platform.OS === 'android' && !!mod?.getAlignModelStatuses;
}

export async function fetchWhisperXAlignModelStatuses(): Promise<WhisperXAlignModelStatusRow[]> {
  if (!isWhisperXAlignNativeAvailable() || !mod?.getAlignModelStatuses) {
    return [];
  }
  const rows = await mod.getAlignModelStatuses();
  const row = rows.find((r) => r.modelId === NRM_WHISPERX_ALIGN_MODEL_ID);
  const downloading = !!row?.downloading;
  const installed = !!row?.installed && !downloading;
  return [
    {
      modelId: NRM_WHISPERX_ALIGN_MODEL_ID,
      installed,
      downloading,
      progress: Math.min(100, Math.max(0, row?.progress ?? (installed ? 100 : 0))),
    },
  ];
}

export async function isWhisperXAlignModelInstalled(): Promise<boolean> {
  if (!isWhisperXAlignNativeAvailable()) return false;
  if (mod?.isAlignModelInstalled) {
    return mod.isAlignModelInstalled();
  }
  const rows = await fetchWhisperXAlignModelStatuses();
  return !!rows[0]?.installed && !rows[0].downloading;
}

export async function startWhisperXAlignModelDownload(): Promise<void> {
  if (!isWhisperXAlignNativeAvailable() || !mod?.startAlignModelDownload) return;
  await mod.startAlignModelDownload(NRM_WHISPERX_ALIGN_MODEL_ID);
}

export function subscribeWhisperXAlignDownloadEvents(
  onEvent: (payload: {
    modelId: NrmWhisperXAlignModelId;
    phase: 'progress' | 'complete' | 'failed';
    progress: number;
  }) => void,
): () => void {
  if (!isWhisperXAlignNativeAvailable() || !mod) {
    return () => {};
  }
  const emitter = new NativeEventEmitter(NativeModules.NrmWhisper);
  const sub = emitter.addListener(
    'WhisperXAlignModelDownload',
    (body: { modelId?: string; phase?: string; progress?: number }) => {
      const id = (body.modelId ?? '').trim();
      if (id !== NRM_WHISPERX_ALIGN_MODEL_ID) return;
      const phase =
        body.phase === 'complete'
          ? 'complete'
          : body.phase === 'failed'
            ? 'failed'
            : 'progress';
      onEvent({
        modelId: NRM_WHISPERX_ALIGN_MODEL_ID,
        phase,
        progress: Math.min(100, Math.max(0, body.progress ?? 0)),
      });
    },
  );
  return () => sub.remove();
}

export type MelonAlignNativeResult = {
  lrc: string;
  alignFailed: boolean;
  alignMemoryInsufficient: boolean;
};

export async function alignMelonLyricsToLrcNative(
  audioPath: string,
  lyricsPlain: string,
  mode: 'melon' | 'melon_translation',
): Promise<MelonAlignNativeResult> {
  if (!mod?.alignMelonLyricsToLrc) {
    return { lrc: '', alignFailed: true, alignMemoryInsufficient: false };
  }
  const fsPath = audioPath.startsWith('file://') ? audioPath.slice(7) : audioPath;
  try {
    const result = await mod.alignMelonLyricsToLrc(fsPath, lyricsPlain, mode);
    const lrc = (result.lrc ?? '').trim();
    const alignMemoryInsufficient = !!result.alignMemoryInsufficient;
    return {
      lrc,
      alignFailed: alignMemoryInsufficient || !!result.alignFailed || !lrc,
      alignMemoryInsufficient,
    };
  } catch (e) {
    const { logNrmRunError } = await import('@/lib/nrmDevLog');
    logNrmRunError('whisperx-align.native', e, { mode, audioPath: fsPath.slice(-120) });
    return { lrc: '', alignFailed: true, alignMemoryInsufficient: false };
  }
}

export function whisperXAlignDownloadCompleteMessage(): string {
  return 'WhisperX Forced Alignment(wav2vec2) 모델 다운로드가 완료되었습니다.';
}
