/**
 * AI Lab 앱 다운로드 Function Calling 선언.
 * Gemini Interactions / Legacy generateContent / Groq OpenAI-compat 공통.
 *
 * Gemini JSON schema는 additionalProperties를 거부한다(400).
 */

export const DOWNLOAD_FUNCTION_DECLARATIONS = [
  {
    name: 'list_ready_download_platforms',
    description: '사용 가능 플랫폼 목록. 이번 버전은 Melon만.',
    parameters: { type: 'object', properties: {} },
  },
  {
    name: 'search_music',
    description:
      'Melon 트랙(곡) 검색. 「멜론에서」 없어도 호출. platform은 생략/melon만.',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: '예: 아이유 좋은날' },
        platform: {
          type: 'string',
          description: 'optional — melon only',
        },
      },
      required: ['query'],
    },
  },
  {
    name: 'search_music_artist',
    description: 'Melon 아티스트 검색. 가수 정보 요청 시.',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: '예: 아이유' },
      },
      required: ['query'],
    },
  },
  {
    name: 'search_music_album',
    description: 'Melon 앨범 검색. 앨범 정보 요청 시.',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: '예: Love poem' },
      },
      required: ['query'],
    },
  },
  {
    name: 'get_ai_lab_lyrics_capability',
    description:
      '가사 생성 가능 여부(wav2vec2-base + en-kotransliterator). 다운로드 후 가사 되묻기 전에 확인.',
    parameters: { type: 'object', properties: {} },
  },
  {
    name: 'get_lyrics_download_options',
    description: '레거시 — get_ai_lab_lyrics_capability와 동일.',
    parameters: { type: 'object', properties: {} },
  },
  {
    name: 'start_music_download',
    description:
      'Melon hit로 오디오 다운로드(요청당 1곡). 기본 가사 없음(lyricsOption=none). YouTube는 Melon 메타로만.',
    parameters: {
      type: 'object',
      properties: {
        hit: { type: 'object', description: 'search_music hits 항목' },
        lyricsOption: {
          type: 'string',
          description:
            'none(기본)|auto(명시적 가사 요청 시). 번역은 넣지 말 것.',
        },
        lyricsMode: {
          type: 'string',
          description: 'legacy; prefer lyricsOption',
        },
      },
      required: ['hit'],
    },
  },
  {
    name: 'start_ai_lab_lyrics',
    description:
      '최근 다운로드 곡에 Melon 가사 생성(wav2vec2-base+다국어 발음 전처리). 번역 없음.',
    parameters: {
      type: 'object',
      properties: {
        videoId: { type: 'string', description: 'start_music_download 반환 videoId' },
        hit: { type: 'object', description: 'optional track hit' },
      },
    },
  },
  {
    name: 'translate_ai_lab_lyrics',
    description:
      '생성된 영문 가사를 Google Translator로 한국어 번역(DeepL 설정 무시).',
    parameters: {
      type: 'object',
      properties: {
        videoId: { type: 'string', description: '대상 videoId' },
      },
    },
  },
] as const;

/** Interactions API tools: [{ type: "function", name, description, parameters }] */
export function toInteractionsFunctionTools(): Array<Record<string, unknown>> {
  return DOWNLOAD_FUNCTION_DECLARATIONS.map((d) => ({
    type: 'function',
    name: d.name,
    description: d.description,
    parameters: d.parameters,
  }));
}

/** Legacy generateContent: [{ functionDeclarations: [...] }] */
export function toLegacyGeminiFunctionDeclarations(): Array<Record<string, unknown>> {
  return DOWNLOAD_FUNCTION_DECLARATIONS.map((d) => ({
    name: d.name,
    description: d.description,
    parameters: d.parameters,
  }));
}

/** Groq/OpenAI-compat tools */
export function toOpenAiFunctionTools(): Array<Record<string, unknown>> {
  return DOWNLOAD_FUNCTION_DECLARATIONS.map((d) => ({
    type: 'function',
    function: {
      name: d.name,
      description: d.description,
      parameters: d.parameters,
    },
  }));
}
