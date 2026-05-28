import type { NrmWhisperModelPreference } from '@/lib/nrmDownloadSettings';

type NrmRate = '좋음' | '중간' | '나쁨';

export type NrmWhisperModelOption = {
  id: NrmWhisperModelPreference;
  title: string;
  subtitle: string;
  speed: NrmRate;
  quality: NrmRate;
};

export const NRM_WHISPER_MODEL_OPTIONS: readonly NrmWhisperModelOption[] = [
  {
    id: 'profile:fast',
    title: '빠른 처리 (기본 추천)',
    subtitle: 'tiny 계열을 우선 사용합니다. 속도 중심',
    speed: '좋음',
    quality: '나쁨',
  },
  {
    id: 'profile:balanced',
    title: '균형형 처리',
    subtitle: 'base/small/medium 계열을 우선 사용합니다.',
    speed: '중간',
    quality: '중간',
  },
  {
    id: 'profile:quality',
    title: '고품질 처리 (느림)',
    subtitle: 'large-v3 계열을 우선 사용합니다. 품질 중심',
    speed: '나쁨',
    quality: '좋음',
  },
  {
    id: 'model:ggml-tiny-q5_1.bin',
    title: 'tiny-q5_1',
    subtitle: '경량 양자화 모델',
    speed: '좋음',
    quality: '나쁨',
  },
  {
    id: 'model:ggml-tiny.bin',
    title: 'tiny',
    subtitle: '초고속 모델',
    speed: '좋음',
    quality: '나쁨',
  },
  {
    id: 'model:ggml-base.en-q5_1.bin',
    title: 'base.en-q5_1',
    subtitle: '영어 중심 경량 모델',
    speed: '중간',
    quality: '중간',
  },
  {
    id: 'model:ggml-base.en.bin',
    title: 'base.en',
    subtitle: '영어 중심 기본 모델',
    speed: '중간',
    quality: '중간',
  },
  {
    id: 'model:ggml-small-q5_1.bin',
    title: 'small-q5_1',
    subtitle: '품질 개선형 양자화 모델',
    speed: '중간',
    quality: '중간',
  },
  {
    id: 'model:ggml-medium-q5_0.bin',
    title: 'medium-q5_0',
    subtitle: '중간 이상 품질 모델',
    speed: '나쁨',
    quality: '좋음',
  },
  {
    id: 'model:ggml-large-v3-turbo-q5_0.bin',
    title: 'large-v3-turbo-q5_0',
    subtitle: '고품질 터보 양자화',
    speed: '중간',
    quality: '좋음',
  },
  {
    id: 'model:ggml-large-v3-turbo.bin',
    title: 'large-v3-turbo',
    subtitle: '고품질 터보',
    speed: '중간',
    quality: '좋음',
  },
  {
    id: 'model:ggml-large-v3-q5_0.bin',
    title: 'large-v3-q5_0',
    subtitle: '고품질 양자화',
    speed: '나쁨',
    quality: '좋음',
  },
  {
    id: 'model:ggml-large-v3.bin',
    title: 'large-v3',
    subtitle: '최고 품질 모델 (매우 느릴 수 있음)',
    speed: '나쁨',
    quality: '좋음',
  },
];

