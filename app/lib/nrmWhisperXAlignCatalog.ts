/** WhisperX wav2vec2 CTC forced alignment (멜론 가사 싱크용) */

export const NRM_WHISPERX_ALIGN_MODEL_ID = 'whisperx:forced-align' as const;

export type NrmWhisperXAlignModelId = typeof NRM_WHISPERX_ALIGN_MODEL_ID;

export type NrmWhisperXAlignAssetSpec = {
  fileName: string;
  url: string;
  minBytes: number;
};

export type NrmWhisperXAlignCatalogEntry = {
  id: NrmWhisperXAlignModelId;
  label: string;
  speedLabel: string;
  qualityLabel: string;
  sizeLabel: string;
  assets: readonly NrmWhisperXAlignAssetSpec[];
};

const KOREAN_HF_BASE =
  'https://huggingface.co/kresnik/wav2vec2-large-xlsr-korean/resolve/main/';
const ONNX_HF_BASE =
  'https://huggingface.co/FinDIT-Studio/wav2vec2-large-xlsr-53-korean-onnx/resolve/main/';

/**
 * wav2vec2 CTC forced alignment — 알고 있는 멜론 가사를 오디오 프레임에 맞춘다.
 * whisper.cpp 전사가 아니라 ONNX Runtime + wav2vec2(korean XLSR) 추론.
 */
export const NRM_WHISPERX_ALIGN_CATALOG: NrmWhisperXAlignCatalogEntry = {
  id: NRM_WHISPERX_ALIGN_MODEL_ID,
  label: 'wav2vec2',
  speedLabel: '느림',
  qualityLabel: '멜론 가사 CTC 정렬',
  sizeLabel: '~1.2 GB',
  assets: [
    { fileName: 'vocab.json', url: `${KOREAN_HF_BASE}vocab.json`, minBytes: 1_000 },
    { fileName: 'config.json', url: `${KOREAN_HF_BASE}config.json`, minBytes: 500 },
    {
      fileName: 'preprocessor_config.json',
      url: `${KOREAN_HF_BASE}preprocessor_config.json`,
      minBytes: 100,
    },
    { fileName: 'model.onnx', url: `${ONNX_HF_BASE}model.onnx`, minBytes: 50_000_000 },
  ],
};

export function isNrmWhisperXAlignModelId(v: string): v is NrmWhisperXAlignModelId {
  return v === NRM_WHISPERX_ALIGN_MODEL_ID;
}
