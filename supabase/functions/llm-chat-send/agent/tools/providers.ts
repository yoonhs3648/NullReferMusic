/**
 * 기본 Tool 등록 (schema/examples 포함).
 * 이번 버전: Melon 전용 검색·다운로드.
 */

import { createTool, registerTool } from './registry.ts';

const emptyObjectParams = { type: 'object', properties: {} };

registerTool(
  createTool({
    definition: {
      id: 'list_ready_download_platforms',
      name: 'list_ready_download_platforms',
      description:
        '사용 가능한 음악 메타데이터 플랫폼 목록. 이번 버전은 Melon만 반환한다.',
      kind: 'download_fc',
      priority: 10,
      parameters: emptyObjectParams,
      examples: [{ user: '음악 다운로드하고 싶어', args: {} }],
    },
    supports: (ctx) =>
      ctx.isToolContinue ||
      ctx.intent.needsDownloadTool ||
      ctx.intent.needsMusicSearch ||
      ctx.intent.intent === 'download',
  }),
);

registerTool(
  createTool({
    definition: {
      id: 'search_music',
      name: 'search_music',
      description:
        'Melon 곡 검색. platform은 생략하거나 melon만. Spotify/Apple Music 등 다른 플랫폼이면 호출하지 말고 미지원 안내 후 Melon 제안을 한다.',
      kind: 'download_fc',
      priority: 15,
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: '예: 아이유 좋은날' },
          platform: {
            type: 'string',
            description: 'optional. 이번 버전은 melon만 유효',
          },
        },
        required: ['query'],
      },
      examples: [
        { user: '좋은날 찾아줘', args: { query: '좋은날' } },
        { user: 'Melon에서 좋은날', args: { query: '좋은날', platform: 'melon' } },
      ],
    },
    supports: (ctx) =>
      ctx.isToolContinue ||
      ctx.intent.needsMusicSearch ||
      ctx.intent.needsDownloadTool ||
      ctx.intent.intent === 'download',
  }),
);

registerTool(
  createTool({
    definition: {
      id: 'get_lyrics_download_options',
      name: 'get_lyrics_download_options',
      description:
        '가사 옵션 선택지(한국어 팩/영어 팩/번역지원). 가사 요청만 있고 옵션이 없을 때 질문 문구용. 보통은 텍스트로 먼저 질문하고, 필요 시 이 도구로 선택지를 가져온다.',
      kind: 'download_fc',
      priority: 30,
      parameters: emptyObjectParams,
      examples: [{ user: '가사 넣어서 받아줘', args: {} }],
    },
    supports: (ctx) =>
      ctx.isToolContinue || ctx.intent.needsDownloadTool || ctx.intent.intent === 'download',
  }),
);

registerTool(
  createTool({
    definition: {
      id: 'start_music_download',
      name: 'start_music_download',
      description:
        'Melon 검색 hit로 다운로드. YouTube는 Melon 메타(아티스트+제목)로만 검색. lyricsOption 기본 none. hit는 search_music 결과 그대로.',
      kind: 'download_fc',
      priority: 40,
      parameters: {
        type: 'object',
        properties: {
          hit: { type: 'object', description: 'search_music hits[] 항목' },
          lyricsOption: {
            type: 'string',
            description:
              'none|ko|en|auto|ko_translate|en_translate|auto_translate (기본 none)',
          },
          lyricsMode: {
            type: 'string',
            description: '레거시. lyricsOption 없을 때만',
          },
          alignLang: { type: 'string', description: 'ko|en — 선택' },
        },
        required: ['hit'],
      },
      examples: [
        {
          user: '좋은날 다운로드해줘',
          args: { hit: { ref: 'melon:123', platform: 'melon', title: '좋은 날', artist: '아이유' }, lyricsOption: 'none' },
        },
        {
          user: '좋은날 다운로드하고 한국어팩으로 가사도',
          args: {
            hit: { ref: 'melon:123', platform: 'melon', title: '좋은 날', artist: '아이유' },
            lyricsOption: 'ko',
          },
        },
      ],
    },
    supports: (ctx) =>
      ctx.isToolContinue || ctx.intent.needsDownloadTool || ctx.intent.intent === 'download',
  }),
);

registerTool(
  createTool({
    definition: {
      id: 'native_web_grounding',
      name: 'native_web_grounding',
      description: 'Provider 네이티브 웹 검색(google_search / browser_search).',
      kind: 'native_grounding',
      priority: 5,
      parameters: emptyObjectParams,
      examples: [{ user: '이번주 빌보드 차트', args: {} }],
    },
    supports: (ctx) =>
      !ctx.isToolContinue &&
      ctx.supportsGrounding &&
      (ctx.intent.needsWebSearch || ctx.intent.intent === 'latest') &&
      !ctx.intent.needsDownloadTool,
  }),
);
