/**
 * 기본 Tool 등록 (schema/examples 포함).
 * 이번 버전: Melon 전용 검색·다운로드.
 *
 * download_fc는 Intent와 무관하게, Function Calling을 지원하는 모든 모델에 항상 노출한다.
 * (칩 클릭·후속 메시지에 「다운로드」 키워드가 없어도 도구를 쓸 수 있어야 함)
 */

import { createTool, registerTool } from './registry.ts';

const emptyObjectParams = { type: 'object', properties: {} };

/** Melon 검색·다운로드·가사 FC — FC 지원 모델이면 항상 사용 가능 */
const supportsDownloadFc = (ctx: { supportsFunctionCalling: boolean }) =>
  ctx.supportsFunctionCalling === true;

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
    supports: supportsDownloadFc,
  }),
);

registerTool(
  createTool({
    definition: {
      id: 'search_music',
      name: 'search_music',
      description:
        'Melon 트랙(곡) 검색. 「멜론에서」 없어도 호출. 「blooming 알려줘」도 이 도구. platform은 melon만.',
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
        { user: 'blooming 알려줘', args: { query: 'blooming' } },
      ],
    },
    supports: supportsDownloadFc,
  }),
);

registerTool(
  createTool({
    definition: {
      id: 'search_music_artist',
      name: 'search_music_artist',
      description: 'Melon 아티스트 검색. 가수 정보 요청 시.',
      kind: 'download_fc',
      priority: 16,
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: '예: 아이유' },
        },
        required: ['query'],
      },
      examples: [{ user: '아이유 가수 정보', args: { query: '아이유' } }],
    },
    supports: supportsDownloadFc,
  }),
);

registerTool(
  createTool({
    definition: {
      id: 'search_music_album',
      name: 'search_music_album',
      description: 'Melon 앨범 검색. 앨범 정보 요청 시.',
      kind: 'download_fc',
      priority: 17,
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: '예: Love poem' },
        },
        required: ['query'],
      },
      examples: [{ user: 'Love poem 앨범 알려줘', args: { query: 'Love poem' } }],
    },
    supports: supportsDownloadFc,
  }),
);

registerTool(
  createTool({
    definition: {
      id: 'search_melon_chart',
      name: 'search_melon_chart',
      description:
        'Melon 차트(일/주/월/년/실시간). 오늘 1위·특정일·주간/월간/연간 순위. 곡명 검색이 아니면 이 도구.',
      kind: 'download_fc',
      priority: 14,
      parameters: {
        type: 'object',
        properties: {
          period: {
            type: 'string',
            description: 'daily|weekly|monthly|yearly|realtime',
          },
          date: { type: 'string', description: 'YYYY-MM-DD KST' },
          rank: { type: 'number', description: '1~100 optional' },
          limit: { type: 'number', description: '상위 N, 기본 10' },
          genre: { type: 'string', description: 'classCd 또는 장르명' },
          chart: { type: 'string', description: 'realtime: top100|hot100' },
        },
        required: ['period'],
      },
      examples: [
        {
          user: '오늘 멜론 1위 다운로드해',
          args: { period: 'realtime', date: '2026-07-30', rank: 1, chart: 'top100' },
        },
        {
          user: '2026-05-23 멜론 차트 알려줘',
          args: { period: 'daily', date: '2026-05-23', limit: 10 },
        },
        {
          user: '이번 주 멜론 주간 차트',
          args: { period: 'weekly', date: '2026-07-30', limit: 10 },
        },
      ],
    },
    supports: supportsDownloadFc,
  }),
);

registerTool(
  createTool({
    definition: {
      id: 'get_ai_lab_lyrics_capability',
      name: 'get_ai_lab_lyrics_capability',
      description:
        '가사 생성 가능 여부(wav2vec2-base + en-kotransliterator). canAskLyrics면 다운로드 후 가사 되묻기 가능.',
      kind: 'download_fc',
      priority: 30,
      parameters: emptyObjectParams,
      examples: [{ user: '좋은날 다운로드해줘', args: {} }],
    },
    supports: supportsDownloadFc,
  }),
);

registerTool(
  createTool({
    definition: {
      id: 'get_lyrics_download_options',
      name: 'get_lyrics_download_options',
      description: '레거시 — get_ai_lab_lyrics_capability와 동일.',
      kind: 'download_fc',
      priority: 31,
      parameters: emptyObjectParams,
      examples: [{ user: '가사 생성할 수 있어?', args: {} }],
    },
    supports: supportsDownloadFc,
  }),
);

registerTool(
  createTool({
    definition: {
      id: 'start_music_download',
      name: 'start_music_download',
      description:
        'Melon hit로 오디오 다운로드(요청당 1곡). 기본 lyricsOption=none. 가사 명시면 auto. 번역은 넣지 말 것.',
      kind: 'download_fc',
      priority: 40,
      parameters: {
        type: 'object',
        properties: {
          hit: { type: 'object', description: 'search_music hits[] 항목' },
          lyricsOption: {
            type: 'string',
            description: 'none(기본)|auto(명시적 가사)',
          },
          lyricsMode: {
            type: 'string',
            description: '레거시. lyricsOption 없을 때만',
          },
        },
        required: ['hit'],
      },
      examples: [
        {
          user: '좋은날 다운로드해줘',
          args: {
            hit: { ref: 'melon:123', platform: 'melon', title: '좋은 날', artist: '아이유' },
            lyricsOption: 'none',
          },
        },
        {
          user: '좋은날 다운로드하고 가사도',
          args: {
            hit: { ref: 'melon:123', platform: 'melon', title: '좋은 날', artist: '아이유' },
            lyricsOption: 'auto',
          },
        },
      ],
    },
    supports: supportsDownloadFc,
  }),
);

registerTool(
  createTool({
    definition: {
      id: 'start_ai_lab_lyrics',
      name: 'start_ai_lab_lyrics',
      description:
        '최근 다운로드 곡 Melon 가사 생성(wav2vec2-base+다국어 발음 전처리). 번역 없음.',
      kind: 'download_fc',
      priority: 45,
      parameters: {
        type: 'object',
        properties: {
          videoId: { type: 'string', description: 'start_music_download videoId' },
          hit: { type: 'object', description: 'optional hit' },
        },
      },
      examples: [{ user: '예, 가사 생성', args: { videoId: 'abc' } }],
    },
    supports: supportsDownloadFc,
  }),
);

registerTool(
  createTool({
    definition: {
      id: 'translate_ai_lab_lyrics',
      name: 'translate_ai_lab_lyrics',
      description: '영문 가사를 Google Translator로 한국어 번역.',
      kind: 'download_fc',
      priority: 46,
      parameters: {
        type: 'object',
        properties: {
          videoId: { type: 'string', description: '대상 videoId' },
        },
      },
      examples: [{ user: '예, 번역해주세요', args: { videoId: 'abc' } }],
    },
    supports: supportsDownloadFc,
  }),
);

registerTool(
  createTool({
    definition: {
      id: 'native_web_grounding',
      name: 'native_web_grounding',
      description: 'Provider 네이티브 웹 검색(Interactions google_search / Groq browser_search).',
      kind: 'native_grounding',
      priority: 5,
      parameters: emptyObjectParams,
      examples: [{ user: '이번주 빌보드 차트', args: {} }],
    },
    /** 웹 검색 전면 비활성 — 도구 선택에서 제외 */
    supports: () => false,
  }),
);
