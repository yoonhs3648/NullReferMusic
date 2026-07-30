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
      'Melon 곡 검색. platform은 생략/melon만. 다른 플랫폼 요청 시 호출하지 말고 미지원 안내.',
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
    name: 'get_lyrics_download_options',
    description:
      '가사 옵션(한국어 팩/영어 팩/번역지원). 가사만 요청되고 옵션이 없을 때 질문용.',
    parameters: { type: 'object', properties: {} },
  },
  {
    name: 'start_music_download',
    description:
      'Melon hit로 다운로드. YouTube는 Melon 메타로만 검색. lyricsOption 기본 none.',
    parameters: {
      type: 'object',
      properties: {
        hit: { type: 'object', description: 'search_music hits 항목' },
        lyricsOption: {
          type: 'string',
          description: 'none|ko|en|auto|ko_translate|en_translate|auto_translate',
        },
        lyricsMode: {
          type: 'string',
          description: 'legacy; prefer lyricsOption',
        },
        alignLang: { type: 'string', description: 'ko|en optional' },
      },
      required: ['hit'],
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
