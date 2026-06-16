import AsyncStorage from '@react-native-async-storage/async-storage';

import {
  isNrmWhisperModelId,
  migrateWhisperModelPreference,
  type NrmWhisperModelId,
} from '@/lib/nrmWhisperCatalog';
import {
  DEFAULT_ALIGN_MODEL_PREFERENCE,
  isNrmAlignModelId,
  migrateAlignModelPreference,
  type NrmAlignModelId,
} from '@/lib/nrmAlignModelCatalog';

/** 다운로드 파일 확장자 (선택 UI 순서) */
export const NRM_AUDIO_EXTENSIONS = [
  '.m4a',
  '.mp3',
  '.wav',
  '.opus',
  '.flac',
  '.ogg',
  '.aac',
] as const;

export type NrmAudioExtension = (typeof NRM_AUDIO_EXTENSIONS)[number];
export const NRM_ENABLED_AUDIO_EXTENSIONS = ['.m4a', '.mp3', '.wav'] as const;

const STORAGE_EXT = 'nrm_download_audio_ext_v1';
const STORAGE_QUALITY = 'nrm_download_audio_quality_v1';
const STORAGE_VBR_MODE = 'nrm_download_vbr_mode_v1';
const STORAGE_LOSSLESS_MODE = 'nrm_download_lossless_mode_v1';
const STORAGE_FILENAME_FORMAT = 'nrm_download_filename_format_v1';
const STORAGE_METADATA_MODE = 'nrm_download_metadata_mode_v1';
const STORAGE_WHISPER_MODEL_PREFERENCE = 'nrm_download_whisper_model_preference_v1';
const STORAGE_ALIGN_MODEL_PREFERENCE = 'nrm_download_align_model_preference_v1';

const DEFAULT_EXT: NrmAudioExtension = '.m4a';
const DEFAULT_QUALITY = 0;

/** 다운로드 파일명 조합 (가수·트랙 필드 순서) */
export const NRM_DOWNLOAD_FILENAME_FORMATS = [
  { id: 'artist-title', label: '가수 - 트랙' },
  { id: 'title-artist', label: '트랙 - 가수' },
  { id: 'title', label: '트랙' },
] as const;

export type NrmDownloadFileNameFormat =
  (typeof NRM_DOWNLOAD_FILENAME_FORMATS)[number]['id'];

const DEFAULT_FILENAME_FORMAT: NrmDownloadFileNameFormat = 'artist-title';

/** 다운로드 시 메타데이터(ffmpeg) 처리 방식 */
export const NRM_DOWNLOAD_METADATA_MODES = [
  { id: 'manual', label: '설정' },
  { id: 'auto', label: '자동 설정' },
  { id: 'none', label: '미설정' },
] as const;

export type NrmDownloadMetadataMode =
  (typeof NRM_DOWNLOAD_METADATA_MODES)[number]['id'];

const DEFAULT_METADATA_MODE: NrmDownloadMetadataMode = 'manual';
const DEFAULT_WHISPER_MODEL_PREFERENCE = 'whisper:large-v3';

/** 가사 저장 방식: 외부 LRC 사이드카 파일 | 오디오 파일 내 메타데이터로 임베드 */
export const NRM_LYRICS_OUTPUT_MODES = [
  { id: 'sidecar', label: '외부 LRC 사용' },
  { id: 'embed', label: '임베드 사용' },
] as const;

export type NrmLyricsOutputMode = (typeof NRM_LYRICS_OUTPUT_MODES)[number]['id'];

const STORAGE_LYRICS_OUTPUT_MODE = 'nrm_download_lyrics_output_mode_v1';
const DEFAULT_LYRICS_OUTPUT_MODE: NrmLyricsOutputMode = 'sidecar';

export function isNrmLyricsOutputMode(v: string): v is NrmLyricsOutputMode {
  return (NRM_LYRICS_OUTPUT_MODES as readonly { id: string }[]).some((m) => m.id === v);
}

export async function loadLyricsOutputMode(): Promise<NrmLyricsOutputMode> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_LYRICS_OUTPUT_MODE);
    if (raw && isNrmLyricsOutputMode(raw)) return raw;
  } catch {
    /* ignore */
  }
  return DEFAULT_LYRICS_OUTPUT_MODE;
}

export async function saveLyricsOutputMode(mode: NrmLyricsOutputMode): Promise<void> {
  await AsyncStorage.setItem(STORAGE_LYRICS_OUTPUT_MODE, mode);
}

export function isNrmDownloadMetadataMode(v: string): v is NrmDownloadMetadataMode {
  return (NRM_DOWNLOAD_METADATA_MODES as readonly { id: string }[]).some(
    (m) => m.id === v,
  );
}

export function isNrmDownloadFileNameFormat(v: string): v is NrmDownloadFileNameFormat {
  return (NRM_DOWNLOAD_FILENAME_FORMATS as readonly { id: string }[]).some(
    (f) => f.id === v,
  );
}

export function isNrmAudioExtension(v: string): v is NrmAudioExtension {
  return (NRM_AUDIO_EXTENSIONS as readonly string[]).includes(v);
}

export function isEnabledNrmAudioExtension(v: string): v is NrmAudioExtension {
  return (NRM_ENABLED_AUDIO_EXTENSIONS as readonly string[]).includes(v);
}

export type NrmWhisperModelPreference = NrmWhisperModelId;
export type NrmAlignModelPreference = NrmAlignModelId;
export { NRM_WHISPER_MODEL_IDS as NRM_WHISPER_MODEL_PREFERENCES } from '@/lib/nrmWhisperCatalog';
export { isNrmWhisperModelId as isNrmWhisperModelPreference } from '@/lib/nrmWhisperCatalog';
export { isNrmAlignModelId as isNrmAlignModelPreference } from '@/lib/nrmAlignModelCatalog';

/** yt-dlp --audio-format 값 (.ogg → vorbis) */
export function extensionToYtDlpFormat(ext: NrmAudioExtension): string {
  if (ext === '.ogg') return 'vorbis';
  return ext.slice(1);
}

/** 로컬 경로에서 확장자(점 제외, 소문자) */
export function extensionFromLocalPath(pathOrUri: string): string | null {
  const path = pathOrUri.replace(/^file:\/\//, '').split('?')[0] ?? '';
  return path.match(/\.([a-z0-9]+)$/i)?.[1]?.toLowerCase() ?? null;
}

/** 변환 결과가 사용자 설정 확장자와 일치하는지 검증 */
export function assertLocalPathMatchesExtension(
  pathOrUri: string,
  ext: NrmAudioExtension,
): void {
  const want = ext.slice(1).toLowerCase();
  const have = extensionFromLocalPath(pathOrUri);
  if (have !== want) {
    throw new Error(
      `설정한 확장자(${ext})로 변환되지 않았습니다 (결과: .${have ?? '없음'}).`,
    );
  }
}

export function clampAudioQuality(n: number): number {
  if (!Number.isFinite(n)) return DEFAULT_QUALITY;
  return Math.min(9, Math.max(0, Math.round(n)));
}

/** MP3·M4A(AAC) 공통 CBR kbps — AudioEncodeBitrate.kt 와 동기화 */
export const AUDIO_QUALITY_BITRATE_KBPS = [
  320, 256, 224, 192, 160, 128, 112, 96, 80, 64,
] as const;

export function audioQualityBitrateKbps(quality: number): number {
  return AUDIO_QUALITY_BITRATE_KBPS[clampAudioQuality(quality)];
}

/** VBR(가변 비트레이트) 모드 — 기본값 vbr_best(최고 품질) */
export const NRM_DOWNLOAD_VBR_MODES = [
  {
    id: 'vbr_best',
    label: '가변 · 최고',
    description: '구간별로 비트를 조절해 같은 용량에서 음질을 최대화합니다.',
    hint: '권장',
  },
  {
    id: 'vbr_balanced',
    label: '가변 · 균형',
    description: '음질과 파일 크기의 균형을 맞춥니다.',
  },
  {
    id: 'vbr_compact',
    label: '가변 · 용량',
    description: '용량을 줄이되 가청 범위 내 품질을 유지합니다.',
  },
  {
    id: 'cbr',
    label: '고정 (CBR)',
    description: '비트레이트 설정의 kbps를 고정으로 사용합니다.',
  },
] as const;

export type NrmDownloadVbrMode = (typeof NRM_DOWNLOAD_VBR_MODES)[number]['id'];
const DEFAULT_VBR_MODE: NrmDownloadVbrMode = 'vbr_best';

/** 무손실·재인코딩 정책 — 기본값 smart(원본 보존 우선) */
export const NRM_DOWNLOAD_LOSSLESS_MODES = [
  {
    id: 'smart',
    label: '스마트 보존',
    description:
      '확장자가 같으면 재인코딩하지 않고, 필요할 때만 변환해 품질 손실을 줄입니다.',
    hint: '권장',
  },
  {
    id: 'lossless_path',
    label: '무손실 경유',
    description:
      '가능하면 스트림 복사·무손실 코덱을 우선하고, 손실 변환 시에도 최고 품질을 사용합니다.',
  },
  {
    id: 'always_reencode',
    label: '항상 재인코딩',
    description: '설정한 확장자·비트레이트로 매번 새로 인코딩합니다.',
  },
] as const;

export type NrmDownloadLosslessMode =
  (typeof NRM_DOWNLOAD_LOSSLESS_MODES)[number]['id'];
const DEFAULT_LOSSLESS_MODE: NrmDownloadLosslessMode = 'smart';

export function isNrmDownloadVbrMode(v: string): v is NrmDownloadVbrMode {
  return (NRM_DOWNLOAD_VBR_MODES as readonly { id: string }[]).some((m) => m.id === v);
}

export function isNrmDownloadLosslessMode(v: string): v is NrmDownloadLosslessMode {
  return (NRM_DOWNLOAD_LOSSLESS_MODES as readonly { id: string }[]).some((m) => m.id === v);
}

export async function loadDownloadVbrMode(): Promise<NrmDownloadVbrMode> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_VBR_MODE);
    if (raw && isNrmDownloadVbrMode(raw)) return raw;
  } catch {
    /* ignore */
  }
  return DEFAULT_VBR_MODE;
}

export async function saveDownloadVbrMode(mode: NrmDownloadVbrMode): Promise<void> {
  await AsyncStorage.setItem(
    STORAGE_VBR_MODE,
    isNrmDownloadVbrMode(mode) ? mode : DEFAULT_VBR_MODE,
  );
}

export async function loadDownloadLosslessMode(): Promise<NrmDownloadLosslessMode> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_LOSSLESS_MODE);
    if (raw && isNrmDownloadLosslessMode(raw)) return raw;
  } catch {
    /* ignore */
  }
  return DEFAULT_LOSSLESS_MODE;
}

export async function saveDownloadLosslessMode(
  mode: NrmDownloadLosslessMode,
): Promise<void> {
  await AsyncStorage.setItem(
    STORAGE_LOSSLESS_MODE,
    isNrmDownloadLosslessMode(mode) ? mode : DEFAULT_LOSSLESS_MODE,
  );
}

export async function loadDownloadAudioExtension(): Promise<NrmAudioExtension> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_EXT);
    if (raw && isNrmAudioExtension(raw) && isEnabledNrmAudioExtension(raw)) return raw;
  } catch {
    /* ignore */
  }
  return DEFAULT_EXT;
}

export async function saveDownloadAudioExtension(ext: NrmAudioExtension): Promise<void> {
  await AsyncStorage.setItem(STORAGE_EXT, isEnabledNrmAudioExtension(ext) ? ext : DEFAULT_EXT);
}

export async function loadDownloadAudioQuality(): Promise<number> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_QUALITY);
    if (raw != null) return clampAudioQuality(parseInt(raw, 10));
  } catch {
    /* ignore */
  }
  return DEFAULT_QUALITY;
}

export async function saveDownloadAudioQuality(quality: number): Promise<void> {
  await AsyncStorage.setItem(STORAGE_QUALITY, String(clampAudioQuality(quality)));
}

export async function loadDownloadFileNameFormat(): Promise<NrmDownloadFileNameFormat> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_FILENAME_FORMAT);
    if (raw && isNrmDownloadFileNameFormat(raw)) return raw;
  } catch {
    /* ignore */
  }
  return DEFAULT_FILENAME_FORMAT;
}

export async function saveDownloadFileNameFormat(
  format: NrmDownloadFileNameFormat,
): Promise<void> {
  await AsyncStorage.setItem(STORAGE_FILENAME_FORMAT, format);
}

export async function loadDownloadMetadataMode(): Promise<NrmDownloadMetadataMode> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_METADATA_MODE);
    if (raw && isNrmDownloadMetadataMode(raw)) return raw;
  } catch {
    /* ignore */
  }
  return DEFAULT_METADATA_MODE;
}

export async function saveDownloadMetadataMode(
  mode: NrmDownloadMetadataMode,
): Promise<void> {
  await AsyncStorage.setItem(STORAGE_METADATA_MODE, mode);
}

export async function loadWhisperModelPreference(): Promise<NrmWhisperModelPreference> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_WHISPER_MODEL_PREFERENCE);
    if (raw) return migrateWhisperModelPreference(raw);
  } catch {
    /* ignore */
  }
  return DEFAULT_WHISPER_MODEL_PREFERENCE;
}

export async function saveWhisperModelPreference(
  preference: NrmWhisperModelPreference,
): Promise<void> {
  await AsyncStorage.setItem(
    STORAGE_WHISPER_MODEL_PREFERENCE,
    isNrmWhisperModelId(preference) ? preference : DEFAULT_WHISPER_MODEL_PREFERENCE,
  );
}

export async function loadAlignModelPreference(): Promise<NrmAlignModelPreference> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_ALIGN_MODEL_PREFERENCE);
    if (raw) return migrateAlignModelPreference(raw);
  } catch {
    /* ignore */
  }
  return DEFAULT_ALIGN_MODEL_PREFERENCE;
}

export async function saveAlignModelPreference(
  preference: NrmAlignModelPreference,
): Promise<void> {
  await AsyncStorage.setItem(
    STORAGE_ALIGN_MODEL_PREFERENCE,
    isNrmAlignModelId(preference) ? preference : DEFAULT_ALIGN_MODEL_PREFERENCE,
  );
}

export type NrmDownloadEncodeSettings = {
  extension: NrmAudioExtension;
  audioQuality: number;
  vbrMode: NrmDownloadVbrMode;
  losslessMode: NrmDownloadLosslessMode;
};

export async function loadDownloadEncodeSettings(): Promise<NrmDownloadEncodeSettings> {
  const [extension, audioQuality, vbrMode, losslessMode] = await Promise.all([
    loadDownloadAudioExtension(),
    loadDownloadAudioQuality(),
    loadDownloadVbrMode(),
    loadDownloadLosslessMode(),
  ]);
  return { extension, audioQuality, vbrMode, losslessMode };
}

/** 파일명에 선택 확장자가 붙도록 보정 */
export function applyDownloadExtension(fileName: string, ext: NrmAudioExtension): string {
  const stem = fileName.replace(/\.(mp3|m4a|opus|wav|flac|ogg|aac|webm|mp4)$/i, '').trim();
  return `${stem || 'track'}${ext}`;
}

export function mimeTypeForExtension(ext: NrmAudioExtension): string {
  const map: Record<NrmAudioExtension, string> = {
    '.mp3': 'audio/mpeg',
    '.m4a': 'audio/mp4',
    '.opus': 'audio/opus',
    '.wav': 'audio/wav',
    '.flac': 'audio/flac',
    '.ogg': 'audio/ogg',
    '.aac': 'audio/aac',
  };
  return map[ext];
}
