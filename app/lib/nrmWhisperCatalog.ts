/** Whisper 가사 모델 카탈로그 (UI·백엔드·Android 공통 ID) */

export const NRM_WHISPER_MODEL_IDS = [
  'whisper:large-v3-turbo',
  'whisper:large-v3',
  'whisper:medium',
  'whisper:small',
  'whisper:base',
] as const;

export type NrmWhisperModelId = (typeof NRM_WHISPER_MODEL_IDS)[number];

export type NrmWhisperModelCatalogEntry = {
  id: NrmWhisperModelId;
  /** UI 표시명 */
  label: string;
  speedLabel: string;
  qualityLabel: string;
  /** 다운로드 전 표시용 대략 용량 (저사양 기기 q5 우선) */
  sizeLabel: string;
  /** whisper.cpp ggml 파일 (품질: 비양자화 .bin 우선, 없으면 q5 폴백) */
  ggmlFiles: readonly string[];
  /** Hugging Face `ggerganov/whisper.cpp` 파일명 */
  minBytes: number;
};

export const NRM_WHISPER_MODEL_CATALOG: readonly NrmWhisperModelCatalogEntry[] = [
  {
    id: 'whisper:large-v3-turbo',
    label: 'large-v3-turbo',
    speedLabel: '빠름',
    qualityLabel: '높음',
    sizeLabel: '~550 MB',
    ggmlFiles: ['ggml-large-v3-turbo.bin', 'ggml-large-v3-turbo-q5_0.bin'],
    minBytes: 300_000_000,
  },
  {
    id: 'whisper:large-v3',
    label: 'large-v3',
    speedLabel: '매우 느림',
    qualityLabel: '다국어처리 우수',
    sizeLabel: '~1 GB',
    ggmlFiles: ['ggml-large-v3.bin', 'ggml-large-v3-q5_0.bin'],
    minBytes: 700_000_000,
  },
  {
    id: 'whisper:medium',
    label: 'medium',
    speedLabel: '보통',
    qualityLabel: '높음',
    sizeLabel: '~500 MB',
    ggmlFiles: ['ggml-medium.bin', 'ggml-medium-q5_0.bin'],
    minBytes: 300_000_000,
  },
  {
    id: 'whisper:small',
    label: 'small',
    speedLabel: '빠름',
    qualityLabel: '중간',
    sizeLabel: '~180 MB',
    ggmlFiles: ['ggml-small.bin', 'ggml-small-q5_1.bin'],
    minBytes: 100_000_000,
  },
  {
    id: 'whisper:base',
    label: 'base',
    speedLabel: '매우 빠름',
    qualityLabel: '낮음',
    sizeLabel: '~60 MB',
    ggmlFiles: ['ggml-base.bin', 'ggml-base-q5_1.bin'],
    minBytes: 50_000_000,
  },
];

const CATALOG_BY_ID = new Map(
  NRM_WHISPER_MODEL_CATALOG.map((e) => [e.id, e] as const),
);

export function isNrmWhisperModelId(v: string): v is NrmWhisperModelId {
  return (NRM_WHISPER_MODEL_IDS as readonly string[]).includes(v);
}

export function getWhisperCatalogEntry(id: NrmWhisperModelId): NrmWhisperModelCatalogEntry {
  return CATALOG_BY_ID.get(id)!;
}

export function ggmlFilesForWhisperModelId(id: NrmWhisperModelId): string[] {
  return [...getWhisperCatalogEntry(id).ggmlFiles];
}

/** 이전 설정값 → 신규 5종 ID */
export function migrateWhisperModelPreference(raw: string): NrmWhisperModelId {
  if (isNrmWhisperModelId(raw)) return raw;
  const legacy: Record<string, NrmWhisperModelId> = {
    'profile:fast': 'whisper:base',
    'profile:balanced': 'whisper:medium',
    'profile:quality': 'whisper:large-v3',
    'model:ggml-large-v3-turbo-q5_0.bin': 'whisper:large-v3-turbo',
    'model:ggml-large-v3-turbo.bin': 'whisper:large-v3-turbo',
    'model:ggml-large-v3-q5_0.bin': 'whisper:large-v3',
    'model:ggml-large-v3.bin': 'whisper:large-v3',
    'model:ggml-medium-q5_0.bin': 'whisper:medium',
    'model:ggml-medium.bin': 'whisper:medium',
    'model:ggml-small-q5_1.bin': 'whisper:small',
    'model:ggml-small.bin': 'whisper:small',
    'model:ggml-base-q5_1.bin': 'whisper:base',
    'model:ggml-base.bin': 'whisper:base',
    'model:ggml-base.en-q5_1.bin': 'whisper:base',
    'model:ggml-base.en.bin': 'whisper:base',
    'model:ggml-tiny-q5_1.bin': 'whisper:base',
    'model:ggml-tiny.bin': 'whisper:base',
  };
  return legacy[raw] ?? 'whisper:large-v3';
}

export const NRM_WHISPER_HF_BASE =
  'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/';

export function huggingFaceModelUrl(fileName: string): string {
  return `${NRM_WHISPER_HF_BASE}${encodeURIComponent(fileName)}?download=true`;
}
