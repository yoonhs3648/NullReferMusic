/**
 * AI Lab 음악 검색 플랫폼 — ID(enum) 기준.
 * 목록은 향후 확장용으로 전체 표시. 이번 버전은 Melon만 선택·검색 가능.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

/** Platform ID — 문자열 라벨로 비교하지 말 것 */
export const MusicPlatformId = {
  MELON: 'melon',
  SPOTIFY: 'spotify',
  SPOTIFY_PREMIUM: 'spotify_premium',
  APPLE_MUSIC: 'apple_music',
  LAST_FM: 'last_fm',
  YOUTUBE_MUSIC: 'youtube_music',
  GENIE: 'genie',
  BILLBOARD: 'billboard',
  SOUNDCLOUD: 'soundcloud',
} as const;

export type MusicPlatformId = (typeof MusicPlatformId)[keyof typeof MusicPlatformId];

/** Provider Capability — Planner/FC가 불가능한 작업을 막음 */
export type MusicProviderCapabilities = {
  supportsSearch: boolean;
  supportsChart: boolean;
  supportsAlbum: boolean;
  supportsArtist: boolean;
  supportsLyrics: boolean;
};

export const MUSIC_PLATFORM_CAPABILITIES: Record<MusicPlatformId, MusicProviderCapabilities> = {
  [MusicPlatformId.MELON]: {
    supportsSearch: true,
    supportsChart: true,
    supportsAlbum: true,
    supportsArtist: true,
    supportsLyrics: true,
  },
  [MusicPlatformId.SPOTIFY]: {
    supportsSearch: false,
    supportsChart: true,
    supportsAlbum: false,
    supportsArtist: false,
    supportsLyrics: false,
  },
  [MusicPlatformId.SPOTIFY_PREMIUM]: {
    supportsSearch: true,
    supportsChart: true,
    supportsAlbum: true,
    supportsArtist: true,
    supportsLyrics: false,
  },
  [MusicPlatformId.APPLE_MUSIC]: {
    supportsSearch: true,
    supportsChart: true,
    supportsAlbum: true,
    supportsArtist: true,
    supportsLyrics: false,
  },
  [MusicPlatformId.LAST_FM]: {
    supportsSearch: true,
    supportsChart: true,
    supportsAlbum: true,
    supportsArtist: true,
    supportsLyrics: false,
  },
  [MusicPlatformId.YOUTUBE_MUSIC]: {
    supportsSearch: false,
    supportsChart: true,
    supportsAlbum: false,
    supportsArtist: false,
    supportsLyrics: false,
  },
  [MusicPlatformId.GENIE]: {
    supportsSearch: false,
    supportsChart: true,
    supportsAlbum: false,
    supportsArtist: false,
    supportsLyrics: false,
  },
  [MusicPlatformId.BILLBOARD]: {
    supportsSearch: false,
    supportsChart: true,
    supportsAlbum: false,
    supportsArtist: false,
    supportsLyrics: false,
  },
  [MusicPlatformId.SOUNDCLOUD]: {
    supportsSearch: false,
    supportsChart: false,
    supportsAlbum: false,
    supportsArtist: false,
    supportsLyrics: false,
  },
};

export function getMusicPlatformCapabilities(id: MusicPlatformId): MusicProviderCapabilities {
  return MUSIC_PLATFORM_CAPABILITIES[id];
}

export type AiLabMusicPlatformRow = {
  id: MusicPlatformId;
  label: string;
  /** @deprecated capabilities.supportsSearch 사용 */
  searchSupported: boolean;
  sortOrder: number;
};

/** 모달 표시 목록 (전체 연동 플랫폼) */
export const AI_LAB_MUSIC_PLATFORM_ROWS: AiLabMusicPlatformRow[] = [
  { id: MusicPlatformId.MELON, label: 'Melon', searchSupported: true, sortOrder: 10 },
  { id: MusicPlatformId.SPOTIFY, label: 'Spotify', searchSupported: false, sortOrder: 20 },
  {
    id: MusicPlatformId.SPOTIFY_PREMIUM,
    label: 'Spotify Premium',
    searchSupported: true,
    sortOrder: 30,
  },
  { id: MusicPlatformId.APPLE_MUSIC, label: 'Apple Music', searchSupported: true, sortOrder: 40 },
  { id: MusicPlatformId.LAST_FM, label: 'Last.fm', searchSupported: true, sortOrder: 50 },
  {
    id: MusicPlatformId.YOUTUBE_MUSIC,
    label: 'YouTube Music',
    searchSupported: false,
    sortOrder: 60,
  },
  { id: MusicPlatformId.GENIE, label: 'Genie', searchSupported: false, sortOrder: 70 },
  { id: MusicPlatformId.BILLBOARD, label: 'Billboard', searchSupported: false, sortOrder: 80 },
  { id: MusicPlatformId.SOUNDCLOUD, label: 'SoundCloud', searchSupported: false, sortOrder: 90 },
];

export const DEFAULT_AI_LAB_MUSIC_PLATFORM_ID: MusicPlatformId = MusicPlatformId.MELON;

const STORAGE_KEY = 'nrm_ai_lab_selected_music_platform_id_v1';

const ID_SET = new Set<string>(Object.values(MusicPlatformId));

export function isMusicPlatformId(v: string): v is MusicPlatformId {
  return ID_SET.has(v);
}

/**
 * LLM FC / 사용자 문구의 platform 문자열 → MusicPlatformId.
 * 예: spotify, Spotify Premium, appleMusic, billboard
 */
export function normalizeMusicPlatformArg(raw: string | null | undefined): MusicPlatformId | null {
  const s = String(raw ?? '').trim().toLowerCase().replace(/[\s_-]+/g, '');
  if (!s) return null;
  if (s === 'melon' || s === '멜론') return MusicPlatformId.MELON;
  if (
    s === 'spotifypremium' ||
    s === 'spotifyprem' ||
    s.includes('spotifypremium') ||
    s.includes('스포티파이프리미엄')
  ) {
    return MusicPlatformId.SPOTIFY_PREMIUM;
  }
  if (s === 'spotify' || s.includes('spotify') || s.includes('스포티파이')) {
    return MusicPlatformId.SPOTIFY;
  }
  if (
    s === 'applemusic' ||
    s === 'apple' ||
    s.includes('applemusic') ||
    s.includes('애플뮤직')
  ) {
    return MusicPlatformId.APPLE_MUSIC;
  }
  if (s === 'lastfm' || s === 'last.fm' || s.includes('lastfm') || s.includes('라스트')) {
    return MusicPlatformId.LAST_FM;
  }
  if (s === 'youtubemusic' || s.includes('youtubemusic') || s.includes('유튜브뮤직')) {
    return MusicPlatformId.YOUTUBE_MUSIC;
  }
  if (s === 'genie' || s.includes('genie') || s.includes('지니')) return MusicPlatformId.GENIE;
  if (s === 'billboard' || s.includes('billboard') || s.includes('빌보드')) {
    return MusicPlatformId.BILLBOARD;
  }
  if (s === 'soundcloud' || s.includes('soundcloud') || s.includes('사운드클라우드')) {
    return MusicPlatformId.SOUNDCLOUD;
  }
  // 이미 enum id 형태
  if (isMusicPlatformId(String(raw ?? '').trim().toLowerCase())) {
    return String(raw).trim().toLowerCase() as MusicPlatformId;
  }
  return null;
}

/** FC platform 있으면 그것, 없으면 Preference */
export function resolveMusicPlatformIdForSearch(
  fcPlatform: string | null | undefined,
  preferenceId: MusicPlatformId,
): MusicPlatformId {
  return normalizeMusicPlatformArg(fcPlatform) ?? preferenceId;
}

export function getAiLabMusicPlatformLabel(id: MusicPlatformId): string {
  return AI_LAB_MUSIC_PLATFORM_ROWS.find((r) => r.id === id)?.label ?? id;
}

export function listAiLabMusicPlatformRows(): AiLabMusicPlatformRow[] {
  return [...AI_LAB_MUSIC_PLATFORM_ROWS].sort((a, b) => a.sortOrder - b.sortOrder);
}

/**
 * 이번 버전 강제 게이트: Melon만 Enabled, 그 외 Disabled.
 * (토큰·차트 연동 게이트는 사용하지 않음)
 */
export async function isAiLabMusicPlatformAvailable(id: MusicPlatformId): Promise<boolean> {
  return id === MusicPlatformId.MELON;
}

export async function loadAiLabMusicPlatformAvailabilityMap(): Promise<
  Record<MusicPlatformId, boolean>
> {
  const rows = listAiLabMusicPlatformRows();
  const entries = await Promise.all(
    rows.map(async (r) => [r.id, await isAiLabMusicPlatformAvailable(r.id)] as const),
  );
  const map = {} as Record<MusicPlatformId, boolean>;
  for (const [id, ok] of entries) map[id] = ok;
  return map;
}

export async function loadAiLabSelectedMusicPlatformId(): Promise<MusicPlatformId> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    // 이번 버전: 저장된 값이 Melon이 아니면 Melon으로 강제
    if (raw === MusicPlatformId.MELON) return MusicPlatformId.MELON;
  } catch {
    // ignore
  }
  return DEFAULT_AI_LAB_MUSIC_PLATFORM_ID;
}

export async function saveAiLabSelectedMusicPlatformId(id: MusicPlatformId): Promise<void> {
  if (id !== MusicPlatformId.MELON) return;
  try {
    await AsyncStorage.setItem(STORAGE_KEY, MusicPlatformId.MELON);
  } catch {
    // ignore
  }
}

/** 사용자 문구에서 명시 플랫폼 추출 (명시 > Preference) */
const EXPLICIT_PATTERNS: Array<{ id: MusicPlatformId; patterns: RegExp[] }> = [
  {
    id: MusicPlatformId.SPOTIFY_PREMIUM,
    patterns: [/spotify\s*premium/i, /스포티파이\s*프리미엄/i],
  },
  {
    id: MusicPlatformId.SPOTIFY,
    patterns: [/spotify/i, /스포티파이/i],
  },
  {
    id: MusicPlatformId.APPLE_MUSIC,
    patterns: [/apple\s*music/i, /애플\s*뮤직/i, /애플뮤직/i],
  },
  {
    id: MusicPlatformId.LAST_FM,
    patterns: [/last\.?\s*fm/i, /라스트\s*fm/i, /라스트에프엠/i],
  },
  {
    id: MusicPlatformId.YOUTUBE_MUSIC,
    patterns: [/youtube\s*music/i, /유튜브\s*뮤직/i, /유튜브뮤직/i],
  },
  {
    id: MusicPlatformId.GENIE,
    patterns: [/genie/i, /지니/i],
  },
  {
    id: MusicPlatformId.BILLBOARD,
    patterns: [/billboard/i, /빌보드/i],
  },
  {
    id: MusicPlatformId.SOUNDCLOUD,
    patterns: [/sound\s*cloud/i, /사운드클라우드/i],
  },
  {
    id: MusicPlatformId.MELON,
    patterns: [/melon/i, /멜론/i],
  },
];

/** Melon 폴백 수락 문구 — 원요청에 빌보드 등이 남아도 Melon을 우선 */
const RE_MELON_FALLBACK_ACCEPT =
  /melon으로\s*검색해서\s*진행|멜론으로\s*검색해서\s*진행|\[AI_LAB_MELON_FALLBACK\]/i;

export function isAiLabMelonFallbackAcceptMessage(message: string): boolean {
  return RE_MELON_FALLBACK_ACCEPT.test(String(message ?? '').trim());
}

export function detectExplicitMusicPlatformId(message: string): MusicPlatformId | null {
  const t = message.trim();
  if (!t) return null;
  // 「Melon으로 검색해서 진행… 요청: …빌보드…」처럼 폴백 수락이면 Melon 고정.
  // 그렇지 않으면 원요청의 빌보드가 Melon보다 먼저 매칭되어 안내 루프가 난다.
  if (isAiLabMelonFallbackAcceptMessage(t)) return MusicPlatformId.MELON;
  for (const row of EXPLICIT_PATTERNS) {
    for (const re of row.patterns) {
      if (re.test(t)) return row.id;
    }
  }
  return null;
}

export type ResolvedAiLabMusicPlatform = {
  platformId: MusicPlatformId;
  label: string;
  explicit: boolean;
  available: boolean;
  searchSupported: boolean;
};

export async function resolveAiLabMusicPlatformForMessage(
  message: string,
  preferredId?: MusicPlatformId | null,
  opts?: { forcePlatformId?: MusicPlatformId | null },
): Promise<ResolvedAiLabMusicPlatform> {
  const forced =
    opts?.forcePlatformId && isMusicPlatformId(opts.forcePlatformId)
      ? opts.forcePlatformId
      : null;
  const preferred =
    preferredId && isMusicPlatformId(preferredId)
      ? preferredId
      : await loadAiLabSelectedMusicPlatformId();
  const explicit = forced ?? detectExplicitMusicPlatformId(message);
  const platformId = explicit ?? preferred;
  const row = AI_LAB_MUSIC_PLATFORM_ROWS.find((r) => r.id === platformId);
  const available = await isAiLabMusicPlatformAvailable(platformId);
  return {
    platformId,
    label: row?.label ?? platformId,
    explicit: explicit != null,
    available,
    searchSupported: getMusicPlatformCapabilities(platformId).supportsSearch,
  };
}

export function aiLabMusicPlatformUnavailableMessage(label: string): string {
  return (
    `${label} 검색은 현재 지원하지 않습니다.\n` +
    `이번 버전에서는 Melon만 곡 검색·다운로드를 지원합니다.\n` +
    `Melon으로 검색할까요?`
  );
}

/** Melon 외 플랫폼 요청 시 안내 (search_music 결과·프롬프트 공통) */
export function aiLabNonMelonSearchMessage(label: string): string {
  return aiLabMusicPlatformUnavailableMessage(label);
}

/** 미지원 플랫폼 → Melon 검색 여부 칩 */
export const MELON_SEARCH_YES_NO_CHOICES: Array<{ id: string; label: string }> = [
  { id: 'melon_search_yes', label: '예, Melon으로 검색' },
  { id: 'melon_search_no', label: '아니요' },
];

export function isAiLabMelonSearchChoiceId(id: string): boolean {
  return id === 'melon_search_yes' || id === 'melon_search_no';
}

/** Melon 예/아니요 칩 라벨(또는 폴백 재전송 문구) — 원요청 탐색 시 건너뜀 */
export function isAiLabMelonSearchChoiceUserText(content: string): boolean {
  const t = String(content ?? '').trim();
  if (!t) return false;
  if (MELON_SEARCH_YES_NO_CHOICES.some((c) => c.label === t)) return true;
  if (isAiLabMelonFallbackAcceptMessage(t)) return true;
  return false;
}

const RE_CHART_OR_RANK =
  /차트|순위|1위|일간|주간|월간|연간|핫\s*100|hot\s*100|top\s*100|톱\s*100|빌보드|billboard|spotify\s*chart|스포티파이\s*차트/i;

const RE_DOWNLOAD_HINT =
  /다운로드|다운\s*받|다운받|받아\s*줘|받아줘|넣어\s*줘|넣어줘|저장해|저장\s*해|\bdownload\b/i;

/**
 * Melon 폴백 수락 시 서버/LLM에 넘길 문구.
 * 원요청(빌보드 1위 등)을 유지하고, 곡명을 다시 묻지 말고 Melon 도구로 즉시 처리하도록 지시한다.
 */
export function rewriteAiLabQueryForMelonFallback(original: string): string {
  const t = original.trim();
  if (!t) {
    return (
      `[AI_LAB_MELON_FALLBACK]\n` +
      `Melon으로 검색해서 진행해 주세요. 원요청이 비어 있으면 짧게 확인만 한다.`
    );
  }
  // 이미 폴백 마커가 있으면 원문 유지(중첩 rewrite 방지)
  if (isAiLabMelonFallbackAcceptMessage(t)) return t;

  const chart = RE_CHART_OR_RANK.test(t);
  const download = RE_DOWNLOAD_HINT.test(t);
  const action = chart
    ? download
      ? '곡명·가수를 다시 묻지 말고 즉시 search_melon_chart(period=realtime 또는 문맥에 맞는 period, rank=1 등)로 Melon 차트에서 확인한 뒤 start_music_download를 진행한다.'
      : '곡명·가수를 다시 묻지 말고 즉시 search_melon_chart(period=realtime 또는 문맥에 맞는 period, rank=1 등)로 Melon 차트에서 찾아 알려준다. (빌보드 등 미지원 차트 대신 Melon 차트로 대체)'
    : download
      ? '곡명·가수를 다시 묻지 말고 원요청의로 즉시 search_music 후 start_music_download를 진행한다.'
      : '곡명·가수를 다시 묻지 말고 원요청으로 즉시 search_music(또는 해당 Melon 도구)을 호출해 답한다.';

  return (
    `[AI_LAB_MELON_FALLBACK]\n` +
    `Melon으로 검색해서 진행해 주세요.\n` +
    `사용자가 미지원 플랫폼 대신 Melon 폴백을 수락했다.\n` +
    `원요청: ${t}\n` +
    `지시: ${action}`
  );
}
