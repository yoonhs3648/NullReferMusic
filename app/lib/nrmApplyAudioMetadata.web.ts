import type { NrmAudioFileMetadata } from '@/lib/nrmDownloadAudioMetadata';
import { getResolvedApiBaseUrl } from '@/lib/apiBaseUrl';
import { nrmBackendFetch } from '@/lib/nrmBackendFetch';
import { splitMetadataForDownloadStages } from '@/lib/nrmWhisperLyrics';

/** 웹: 서버가 job 파일에 메타를 쓴 뒤 받는 흐름이 아니면 스킵 */
export async function applyAudioFileMetadata(
  fileUri: string,
  _metadata: NrmAudioFileMetadata,
): Promise<string> {
  void fileUri;
  return fileUri;
}

async function postJson<T>(url: string, body: unknown, timeoutMs: number): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  const res = await nrmBackendFetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    signal: controller.signal,
    body: JSON.stringify(body),
  }).finally(() => {
    clearTimeout(timeout);
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(text || `HTTP ${res.status}`);
  }
  return (await res.json().catch(() => ({}))) as T;
}

/** 2단계: ffmpeg 메타·커버만 (Whisper sentinel 제외) */
export async function applyServerJobFfmpegMetadata(
  jobId: string,
  metadata: NrmAudioFileMetadata,
): Promise<{ ok: boolean }> {
  const base = await getResolvedApiBaseUrl();
  if (!base) return { ok: false };
  const { ffmpegMetadata } = splitMetadataForDownloadStages(metadata);
  await postJson(`${base}/api/download/metadata`, { jobId, ...ffmpegMetadata }, 120000);
  return { ok: true };
}

export type ServerWhisperLyricsResult = {
  lyricsRequested: boolean;
  lyricsEmbedded: boolean;
  lyricsTranslationFailed?: boolean;
  lrcText?: string;
};

/** 3단계: Whisper LRC (ffmpeg 메타와 독립) */
export async function applyServerJobWhisperLyrics(
  jobId: string,
  metadata: NrmAudioFileMetadata,
  options?: { deeplApiKey?: string; whisperModelPreference?: string },
): Promise<ServerWhisperLyricsResult> {
  const base = await getResolvedApiBaseUrl();
  if (!base) {
    return { lyricsRequested: false, lyricsEmbedded: false };
  }
  const body = await postJson<ServerWhisperLyricsResult & { ok?: boolean }>(
    `${base}/api/download/whisper-lyrics`,
    {
      jobId,
      lyrics: metadata.lyrics,
      deeplApiKey: options?.deeplApiKey?.trim() || undefined,
      whisperModelPreference: options?.whisperModelPreference?.trim() || undefined,
    },
    1_800_000,
  );
  return {
    lyricsRequested: !!body.lyricsRequested,
    lyricsEmbedded: !!body.lyricsEmbedded,
    lyricsTranslationFailed: !!body.lyricsTranslationFailed,
    lrcText: typeof body.lrcText === 'string' ? body.lrcText : undefined,
  };
}

/** ffmpeg 메타·커버 + Whisper LRC — 서버에서 병렬 실행 */
export async function applyServerJobPostProcess(
  jobId: string,
  metadata: NrmAudioFileMetadata,
  options?: { deeplApiKey?: string; whisperModelPreference?: string },
): Promise<ServerWhisperLyricsResult> {
  const base = await getResolvedApiBaseUrl();
  if (!base) {
    return { lyricsRequested: false, lyricsEmbedded: false };
  }
  const body = await postJson<ServerWhisperLyricsResult & { ok?: boolean }>(
    `${base}/api/download/post-process`,
    {
      jobId,
      ...metadata,
      deeplApiKey: options?.deeplApiKey?.trim() || undefined,
      whisperModelPreference: options?.whisperModelPreference?.trim() || undefined,
    },
    1_800_000,
  );
  return {
    lyricsRequested: !!body.lyricsRequested,
    lyricsEmbedded: !!body.lyricsEmbedded,
    lyricsTranslationFailed: !!body.lyricsTranslationFailed,
    lrcText: typeof body.lrcText === 'string' ? body.lrcText : undefined,
  };
}

/** PC 백엔드: 2단계 → 3단계 (Whisper 실패해도 2단계는 유지) */
export async function applyServerJobMetadata(
  jobId: string,
  metadata: NrmAudioFileMetadata,
  options?: { deeplApiKey?: string; whisperModelPreference?: string },
): Promise<ServerWhisperLyricsResult> {
  const { ffmpegMetadata, whisperMode } = splitMetadataForDownloadStages(metadata);

  if (whisperMode) {
    try {
      return await applyServerJobPostProcess(jobId, metadata, options);
    } catch {
      return {
        lyricsRequested: true,
        lyricsEmbedded: false,
        lyricsTranslationFailed: false,
      };
    }
  }

  await applyServerJobFfmpegMetadata(jobId, ffmpegMetadata);
  return { lyricsRequested: false, lyricsEmbedded: false };
}
