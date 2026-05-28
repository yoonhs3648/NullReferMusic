import AsyncStorage from '@react-native-async-storage/async-storage';

/** 다운로드 파일 확장자 (선택 UI 순서) */
export const NRM_AUDIO_EXTENSIONS = [
  '.mp3',
  '.m4a',
  '.wav',
  '.opus',
  '.flac',
  '.ogg',
  '.aac',
] as const;

export type NrmAudioExtension = (typeof NRM_AUDIO_EXTENSIONS)[number];
export const NRM_ENABLED_AUDIO_EXTENSIONS = ['.mp3', '.wav', '.m4a'] as const;

const STORAGE_EXT = 'nrm_download_audio_ext_v1';
const STORAGE_QUALITY = 'nrm_download_audio_quality_v1';
const STORAGE_FILENAME_FORMAT = 'nrm_download_filename_format_v1';
const STORAGE_METADATA_MODE = 'nrm_download_metadata_mode_v1';
const STORAGE_WHISPER_MODEL_PREFERENCE = 'nrm_download_whisper_model_preference_v1';

const DEFAULT_EXT: NrmAudioExtension = '.mp3';
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
const DEFAULT_WHISPER_MODEL_PREFERENCE = 'profile:fast';

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

export const NRM_WHISPER_MODEL_PREFERENCES = [
  'profile:fast',
  'profile:balanced',
  'profile:quality',
  'model:ggml-tiny-q5_1.bin',
  'model:ggml-tiny.bin',
  'model:ggml-base.en-q5_1.bin',
  'model:ggml-base.en.bin',
  'model:ggml-small-q5_1.bin',
  'model:ggml-medium-q5_0.bin',
  'model:ggml-large-v3-turbo-q5_0.bin',
  'model:ggml-large-v3-turbo.bin',
  'model:ggml-large-v3-q5_0.bin',
  'model:ggml-large-v3.bin',
] as const;

export type NrmWhisperModelPreference = (typeof NRM_WHISPER_MODEL_PREFERENCES)[number];

export function isNrmWhisperModelPreference(v: string): v is NrmWhisperModelPreference {
  return (NRM_WHISPER_MODEL_PREFERENCES as readonly string[]).includes(v);
}

/** yt-dlp --audio-format 값 (.ogg → vorbis) */
export function extensionToYtDlpFormat(ext: NrmAudioExtension): string {
  if (ext === '.ogg') return 'vorbis';
  return ext.slice(1);
}

export function clampAudioQuality(n: number): number {
  if (!Number.isFinite(n)) return DEFAULT_QUALITY;
  return Math.min(9, Math.max(0, Math.round(n)));
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
    if (raw && isNrmWhisperModelPreference(raw)) return raw;
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
    isNrmWhisperModelPreference(preference) ? preference : DEFAULT_WHISPER_MODEL_PREFERENCE,
  );
}

export type NrmDownloadEncodeSettings = {
  extension: NrmAudioExtension;
  audioQuality: number;
};

export async function loadDownloadEncodeSettings(): Promise<NrmDownloadEncodeSettings> {
  const [extension, audioQuality] = await Promise.all([
    loadDownloadAudioExtension(),
    loadDownloadAudioQuality(),
  ]);
  return { extension, audioQuality };
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
