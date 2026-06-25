/** Forced Alignment 엔진 (aeneas / wav2vec2-base 번들) */

export const NRM_ALIGN_AENEAS_ID = 'aeneas:sync' as const;
/** UI·설정용 — 한국어·영어 팩을 함께 설치 */
export const NRM_ALIGN_WAV2VEC2_BASE_ID = 'align:wav2vec2-base' as const;
/** 내부 팩 ID (다운로드·추론) */
export const NRM_ALIGN_WAV2VEC2_KO_ID = 'align:wav2vec2-ko' as const;
export const NRM_ALIGN_WAV2VEC2_EN_ID = 'align:wav2vec2-en' as const;

export const WAV2VEC2_PACK_IDS = [
  NRM_ALIGN_WAV2VEC2_KO_ID,
  NRM_ALIGN_WAV2VEC2_EN_ID,
] as const;

export type NrmAlignModelPackId = (typeof WAV2VEC2_PACK_IDS)[number];

export type NrmAlignModelId =
  | typeof NRM_ALIGN_AENEAS_ID
  | typeof NRM_ALIGN_WAV2VEC2_BASE_ID;

export type NrmAlignModelAssetSpec = {
  fileName: string;
  url: string;
  minBytes: number;
};

export type NrmAlignModelCatalogEntry = {
  id: NrmAlignModelId;
  label: string;
  speedLabel: string;
  qualityLabel: string;
  sizeLabel: string;
  assets: readonly NrmAlignModelAssetSpec[];
};

export type NrmAlignModelPackEntry = {
  id: NrmAlignModelPackId;
  label: string;
  assets: readonly NrmAlignModelAssetSpec[];
};

const BASE_KOREAN =
  'https://huggingface.co/Kkonjeong/wav2vec2-base-korean/resolve/main/';
/** HF FinDIT-Studio 미업로드 시 앱 다운로드 실패 — GitHub Release(공개·토큰 불필요) */
const BASE_KO_ONNX =
  'https://github.com/yoonhs3648/NullReferMusic/releases/download/align-wav2vec2-base-v1/';

const BASE_ENGLISH =
  'https://huggingface.co/facebook/wav2vec2-base-960h/resolve/main/';
const BASE_EN_ONNX =
  'https://github.com/yoonhs3648/NullReferMusic/releases/download/align-wav2vec2-en-v1/';

const WAV2VEC2_KO_PACK: NrmAlignModelPackEntry = {
  id: NRM_ALIGN_WAV2VEC2_KO_ID,
  label: 'wav2vec2-base (Korean)',
  assets: [
    { fileName: 'vocab.json', url: `${BASE_KOREAN}vocab.json`, minBytes: 600 },
    { fileName: 'config.json', url: `${BASE_KOREAN}config.json`, minBytes: 2_000 },
    {
      fileName: 'preprocessor_config.json',
      url: `${BASE_KOREAN}preprocessor_config.json`,
      minBytes: 100,
    },
    { fileName: 'model.onnx', url: `${BASE_KO_ONNX}model.onnx`, minBytes: 360_000_000 },
  ],
};

const WAV2VEC2_EN_PACK: NrmAlignModelPackEntry = {
  id: NRM_ALIGN_WAV2VEC2_EN_ID,
  label: 'wav2vec2-base (English)',
  assets: [
    { fileName: 'vocab.json', url: `${BASE_ENGLISH}vocab.json`, minBytes: 250 },
    { fileName: 'config.json', url: `${BASE_ENGLISH}config.json`, minBytes: 1_000 },
    {
      fileName: 'preprocessor_config.json',
      url: `${BASE_ENGLISH}preprocessor_config.json`,
      minBytes: 100,
    },
    { fileName: 'model.onnx', url: `${BASE_EN_ONNX}model.onnx`, minBytes: 360_000_000 },
  ],
};

export const WAV2VEC2_PACK_ENTRIES: readonly NrmAlignModelPackEntry[] = [
  WAV2VEC2_KO_PACK,
  WAV2VEC2_EN_PACK,
] as const;

/** 설정 UI에 표시되는 FA 엔진 목록 */
export const NRM_ALIGN_MODEL_OPTIONS: readonly NrmAlignModelCatalogEntry[] = [
  {
    id: NRM_ALIGN_WAV2VEC2_BASE_ID,
    label: 'wav2vec2-base',
    speedLabel: '보통',
    qualityLabel: '높음',
    sizeLabel: '~760 MB',
    assets: [],
  },
  {
    id: NRM_ALIGN_AENEAS_ID,
    label: 'aeneas',
    speedLabel: '매우 빠름',
    qualityLabel: '낮음',
    sizeLabel: '~1 MB',
    assets: [],
  },
] as const;

export const DEFAULT_ALIGN_MODEL_PREFERENCE: NrmAlignModelId = NRM_ALIGN_WAV2VEC2_BASE_ID;

const ALIGN_MODEL_IDS = new Set<string>([
  NRM_ALIGN_AENEAS_ID,
  NRM_ALIGN_WAV2VEC2_BASE_ID,
]);

const ALIGN_PACK_IDS = new Set<string>([...WAV2VEC2_PACK_IDS]);

export function isNrmAlignModelId(v: string): v is NrmAlignModelId {
  return ALIGN_MODEL_IDS.has(v);
}

export function isNrmAlignModelPackId(v: string): v is NrmAlignModelPackId {
  return ALIGN_PACK_IDS.has(v);
}

export function isNrmWav2Vec2BundleId(v: string): boolean {
  const pref = migrateAlignModelPreference(v);
  return pref === NRM_ALIGN_WAV2VEC2_BASE_ID;
}

export function migrateAlignModelPreference(raw: string): NrmAlignModelId {
  const v = raw.trim();
  if (v === 'whisperx:forced-align') return NRM_ALIGN_WAV2VEC2_BASE_ID;
  if (
    v === NRM_ALIGN_WAV2VEC2_KO_ID ||
    v === NRM_ALIGN_WAV2VEC2_EN_ID ||
    v === 'align:wav2vec2-base-int8'
  ) {
    return NRM_ALIGN_WAV2VEC2_BASE_ID;
  }
  if (isNrmAlignModelId(v)) return v;
  return DEFAULT_ALIGN_MODEL_PREFERENCE;
}

export function wav2Vec2PackIdForLanguage(lang: 'ko' | 'en'): NrmAlignModelPackId {
  return lang === 'en' ? NRM_ALIGN_WAV2VEC2_EN_ID : NRM_ALIGN_WAV2VEC2_KO_ID;
}

export function alignModelLabel(id: NrmAlignModelId): string {
  return NRM_ALIGN_MODEL_OPTIONS.find((o) => o.id === id)?.label ?? id;
}

export function alignPackLabel(id: NrmAlignModelPackId): string {
  return WAV2VEC2_PACK_ENTRIES.find((o) => o.id === id)?.label ?? id;
}

