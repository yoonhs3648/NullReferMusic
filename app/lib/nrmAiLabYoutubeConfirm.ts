/**
 * AI Lab — YouTube 후보 확인(미리듣기) 세션.
 * Melon artist+title 검색·rerank 결과는 유지하고, Top1을 바로 받지 않고
 * 사용자가 맞다/아니다로 확정할 때까지 다운로드를 보류한다.
 */
import { Platform } from 'react-native';

import type { NrmAudioFileMetadata } from '@/lib/nrmDownloadAudioMetadata';
import type { NrmLyricsUiMode } from '@/lib/nrmMelonLyrics';
import { logNrmDev, logNrmRunError } from '@/lib/nrmDevLog';
import { getAudioStreamUrlWithInnertube } from '@/lib/nrmInnertubeYoutube';
import { getAudioStreamUrlOnDevice } from '@/lib/onDeviceDownload';
import type { YoutubeSearchItem } from '@/lib/youtubeSearchTypes';

/** Melon hit — download tools와 동일 shape (순환 import 방지용 로컬 타입) */
export type AiLabYoutubeConfirmHit = {
  ref: string;
  platform: string;
  title: string;
  artist: string;
  album: string;
  imageUrl: string;
  externalUrl: string;
  releaseDate: string;
  genre: string;
  rank?: number;
};

const LOG = 'ailab.youtubeConfirm';
export const AI_LAB_YOUTUBE_CONFIRM_MAX = 10;

export type AiLabYoutubeConfirmUiStatus =
  | 'PREPARING'
  | 'READY'
  | 'PLAYING'
  | 'PAUSED'
  | 'FAILED';

export type AiLabYoutubeConfirmSession = {
  sessionId: string;
  /** Melon 기준 표시: "가수 - 곡명" (YouTube title 미사용) */
  displayLabel: string;
  hit: AiLabYoutubeConfirmHit;
  meta: NrmAudioFileMetadata;
  fileName: string;
  lyricsMode: NrmLyricsUiMode;
  lyricsQueued: boolean;
  lyricsAskEligible: boolean;
  lyricsSkippedReason?: string;
  explicitLyricsRequest: boolean;
  ytQuery: string;
  candidates: YoutubeSearchItem[];
  index: number;
  uiStatus: AiLabYoutubeConfirmUiStatus;
  streamUrl: string | null;
  durationMs: number | null;
  prepareError: string | null;
  prepareGeneration: number;
  exhausted: boolean;
  confirmed: boolean;
};

type SessionListener = (session: AiLabYoutubeConfirmSession) => void;

const sessions = new Map<string, AiLabYoutubeConfirmSession>();
const listeners = new Map<string, Set<SessionListener>>();
/**
 * DB UiMeta용 스냅샷 캐시. 세션 Map과 별도로 두어 persist 시점에
 * getSession 레이스/모듈 이슈가 있어도 후보·hit를 잃지 않게 한다.
 */
const persistSnapshotById = new Map<
  string,
  {
    sessionId: string;
    displayLabel: string;
    hit: AiLabYoutubeConfirmHit;
    meta: NrmAudioFileMetadata;
    fileName: string;
    lyricsMode: NrmLyricsUiMode;
    lyricsQueued: boolean;
    lyricsAskEligible: boolean;
    lyricsSkippedReason?: string;
    explicitLyricsRequest: boolean;
    ytQuery: string;
    candidates: YoutubeSearchItem[];
    index: number;
    exhausted: boolean;
    confirmed: boolean;
  }
>();

function nextSessionId(): string {
  return `ytc-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function stripMetaForPersist(meta: NrmAudioFileMetadata): NrmAudioFileMetadata {
  const {
    lyrics: _lyrics,
    melonLyricsPlain: _plain,
    ...metaRest
  } = meta;
  return metaRest as NrmAudioFileMetadata;
}

function cachePersistSnapshot(session: AiLabYoutubeConfirmSession): void {
  persistSnapshotById.set(session.sessionId, {
    sessionId: session.sessionId,
    displayLabel: session.displayLabel,
    hit: session.hit,
    meta: stripMetaForPersist(session.meta),
    fileName: session.fileName,
    lyricsMode: session.lyricsMode,
    lyricsQueued: session.lyricsQueued,
    lyricsAskEligible: session.lyricsAskEligible,
    lyricsSkippedReason: session.lyricsSkippedReason,
    explicitLyricsRequest: session.explicitLyricsRequest,
    ytQuery: session.ytQuery,
    candidates: session.candidates.map((c) => ({ ...c })),
    index: session.index,
    exhausted: session.exhausted,
    confirmed: session.confirmed,
  });
}

/** ChatMessage.UiMeta.youtubeConfirm 저장용 — 세션 또는 캐시에서 스냅샷. */
export function getAiLabYoutubeConfirmPersistSnapshot(sessionId: string): {
  sessionId: string;
  displayLabel: string;
  hit: AiLabYoutubeConfirmHit;
  meta: NrmAudioFileMetadata;
  fileName: string;
  lyricsMode: NrmLyricsUiMode;
  lyricsQueued: boolean;
  lyricsAskEligible: boolean;
  lyricsSkippedReason?: string;
  explicitLyricsRequest: boolean;
  ytQuery: string;
  candidates: YoutubeSearchItem[];
  index: number;
  exhausted: boolean;
  confirmed: boolean;
} | null {
  const id = sessionId.trim();
  if (!id) return null;
  const live = sessions.get(id);
  if (live) {
    cachePersistSnapshot(live);
    return persistSnapshotById.get(id) ?? null;
  }
  const cached = persistSnapshotById.get(id);
  return cached ? { ...cached, candidates: cached.candidates.map((c) => ({ ...c })) } : null;
}

function notify(sessionId: string): void {
  const s = sessions.get(sessionId);
  if (!s) return;
  const set = listeners.get(sessionId);
  if (!set) return;
  for (const fn of set) {
    try {
      fn({ ...s, candidates: [...s.candidates] });
    } catch (e) {
      logNrmRunError(LOG, e, { event: 'listener_error', sessionId });
    }
  }
}

function patchSession(
  sessionId: string,
  patch: Partial<AiLabYoutubeConfirmSession>,
): AiLabYoutubeConfirmSession | null {
  const prev = sessions.get(sessionId);
  if (!prev) return null;
  const next = { ...prev, ...patch };
  sessions.set(sessionId, next);
  cachePersistSnapshot(next);
  notify(sessionId);
  return next;
}

export function getAiLabYoutubeConfirmSession(
  sessionId: string,
): AiLabYoutubeConfirmSession | null {
  const s = sessions.get(sessionId);
  return s ? { ...s, candidates: [...s.candidates] } : null;
}

export function subscribeAiLabYoutubeConfirm(
  sessionId: string,
  listener: SessionListener,
): () => void {
  let set = listeners.get(sessionId);
  if (!set) {
    set = new Set();
    listeners.set(sessionId, set);
  }
  set.add(listener);
  const current = sessions.get(sessionId);
  if (current) listener({ ...current, candidates: [...current.candidates] });
  return () => {
    set!.delete(listener);
    if (set!.size === 0) listeners.delete(sessionId);
  };
}

export function currentCandidateVideoId(sessionId: string): string | null {
  const s = sessions.get(sessionId);
  if (!s || s.exhausted) return null;
  return s.candidates[s.index]?.videoId ?? null;
}

/** Innertube(android→web) → yt-dlp 순으로 미리듣기 스트림 URL */
export async function resolveAiLabPreviewStreamUrl(videoId: string): Promise<string> {
  if (Platform.OS === 'web') {
    throw new Error('web_preview_unsupported');
  }
  try {
    const url = await getAudioStreamUrlWithInnertube(videoId);
    if (url?.trim()) {
      logNrmDev(LOG, { event: 'stream_innertube_ok', videoId });
      return url.trim();
    }
  } catch (e) {
    logNrmDev(LOG, {
      event: 'stream_innertube_fail',
      videoId,
      message: e instanceof Error ? e.message : String(e),
    });
  }
  if (Platform.OS === 'android') {
    const url = await getAudioStreamUrlOnDevice(videoId);
    if (url?.trim()) {
      logNrmDev(LOG, { event: 'stream_ytdlp_ok', videoId });
      return url.trim();
    }
  }
  throw new Error('preview_stream_unavailable');
}

export function createAiLabYoutubeConfirmSession(params: {
  displayLabel: string;
  hit: AiLabYoutubeConfirmHit;
  meta: NrmAudioFileMetadata;
  fileName: string;
  lyricsMode: NrmLyricsUiMode;
  lyricsQueued: boolean;
  lyricsAskEligible: boolean;
  lyricsSkippedReason?: string;
  explicitLyricsRequest: boolean;
  ytQuery: string;
  candidates: YoutubeSearchItem[];
}): AiLabYoutubeConfirmSession {
  const candidates = params.candidates.slice(0, AI_LAB_YOUTUBE_CONFIRM_MAX);
  const sessionId = nextSessionId();
  const session: AiLabYoutubeConfirmSession = {
    sessionId,
    displayLabel: params.displayLabel,
    hit: params.hit,
    meta: params.meta,
    fileName: params.fileName,
    lyricsMode: params.lyricsMode,
    lyricsQueued: params.lyricsQueued,
    lyricsAskEligible: params.lyricsAskEligible,
    lyricsSkippedReason: params.lyricsSkippedReason,
    explicitLyricsRequest: params.explicitLyricsRequest,
    ytQuery: params.ytQuery,
    candidates,
    index: 0,
    uiStatus: 'PREPARING',
    streamUrl: null,
    durationMs: null,
    prepareError: null,
    prepareGeneration: 0,
    exhausted: candidates.length === 0,
    confirmed: false,
  };
  sessions.set(sessionId, session);
  cachePersistSnapshot(session);
  logNrmDev(LOG, {
    event: 'session_created',
    sessionId,
    candidateCount: candidates.length,
    label: params.displayLabel.slice(0, 80),
  });
  return { ...session, candidates: [...candidates] };
}

export function setAiLabYoutubeConfirmUiStatus(
  sessionId: string,
  uiStatus: AiLabYoutubeConfirmUiStatus,
): void {
  patchSession(sessionId, { uiStatus });
}

export function setAiLabYoutubeConfirmDuration(
  sessionId: string,
  durationMs: number | null,
): void {
  patchSession(sessionId, { durationMs });
}

/** 현재 후보 스트림을 백그라운드 준비. generation으로 이전 요청 무시 */
export function prepareAiLabYoutubeConfirmStream(sessionId: string): void {
  const s = sessions.get(sessionId);
  if (!s || s.exhausted || s.confirmed) return;
  const videoId = s.candidates[s.index]?.videoId;
  if (!videoId) {
    patchSession(sessionId, {
      uiStatus: 'FAILED',
      prepareError: 'no_candidate',
      streamUrl: null,
    });
    return;
  }
  const generation = s.prepareGeneration + 1;
  patchSession(sessionId, {
    prepareGeneration: generation,
    uiStatus: 'PREPARING',
    streamUrl: null,
    durationMs: null,
    prepareError: null,
  });

  void (async () => {
    try {
      const url = await resolveAiLabPreviewStreamUrl(videoId);
      const cur = sessions.get(sessionId);
      if (!cur || cur.prepareGeneration !== generation) return;
      patchSession(sessionId, {
        streamUrl: url,
        uiStatus: 'READY',
        prepareError: null,
      });
    } catch (e) {
      const cur = sessions.get(sessionId);
      if (!cur || cur.prepareGeneration !== generation) return;
      const msg = e instanceof Error ? e.message : String(e);
      logNrmRunError(LOG, e, { event: 'prepare_failed', sessionId, videoId });
      patchSession(sessionId, {
        uiStatus: 'FAILED',
        streamUrl: null,
        prepareError: msg,
      });
    }
  })();
}

/** 재생 중 URL 만료 등 — 현재 후보만 재 resolve */
export async function refreshAiLabYoutubeConfirmStream(
  sessionId: string,
): Promise<string | null> {
  const s = sessions.get(sessionId);
  if (!s || s.exhausted) return null;
  const videoId = s.candidates[s.index]?.videoId;
  if (!videoId) return null;
  const generation = s.prepareGeneration + 1;
  patchSession(sessionId, {
    prepareGeneration: generation,
    uiStatus: 'PREPARING',
    prepareError: null,
  });
  try {
    const url = await resolveAiLabPreviewStreamUrl(videoId);
    const cur = sessions.get(sessionId);
    if (!cur || cur.prepareGeneration !== generation) return null;
    patchSession(sessionId, { streamUrl: url, uiStatus: 'READY', prepareError: null });
    return url;
  } catch (e) {
    const cur = sessions.get(sessionId);
    if (!cur || cur.prepareGeneration !== generation) return null;
    patchSession(sessionId, {
      uiStatus: 'FAILED',
      streamUrl: null,
      prepareError: e instanceof Error ? e.message : String(e),
    });
    return null;
  }
}

export type RejectYoutubeConfirmResult =
  | { ok: true; exhausted: false; session: AiLabYoutubeConfirmSession }
  | { ok: true; exhausted: true; message: string }
  | { ok: false; error: string };

export function rejectAiLabYoutubeCandidate(sessionId: string): RejectYoutubeConfirmResult {
  const s = sessions.get(sessionId);
  if (!s) return { ok: false, error: 'session_not_found' };
  if (s.confirmed) return { ok: false, error: 'already_confirmed' };
  const nextIndex = s.index + 1;
  if (nextIndex >= s.candidates.length || nextIndex >= AI_LAB_YOUTUBE_CONFIRM_MAX) {
    patchSession(sessionId, {
      exhausted: true,
      uiStatus: 'FAILED',
      streamUrl: null,
      prepareGeneration: s.prepareGeneration + 1,
    });
    return {
      ok: true,
      exhausted: true,
      message:
        '자동 YouTube 후보를 더 제공할 수 없습니다. YouTube 홈에서 직접 검색·다운로드하거나 다른 곡을 요청해 주세요.',
    };
  }
  const next = patchSession(sessionId, {
    index: nextIndex,
    uiStatus: 'PREPARING',
    streamUrl: null,
    durationMs: null,
    prepareError: null,
    prepareGeneration: s.prepareGeneration + 1,
  });
  if (!next) return { ok: false, error: 'session_not_found' };
  prepareAiLabYoutubeConfirmStream(sessionId);
  return { ok: true, exhausted: false, session: getAiLabYoutubeConfirmSession(sessionId)! };
}

export function markAiLabYoutubeConfirmConfirmed(sessionId: string): boolean {
  const s = sessions.get(sessionId);
  if (!s || s.exhausted) return false;
  patchSession(sessionId, {
    confirmed: true,
    prepareGeneration: s.prepareGeneration + 1,
    uiStatus: 'PAUSED',
  });
  return true;
}

export function disposeAiLabYoutubeConfirmSession(sessionId: string): void {
  const s = sessions.get(sessionId);
  if (s) {
    patchSession(sessionId, { prepareGeneration: s.prepareGeneration + 1 });
  }
  // persist 스냅샷은 유지 — 확정 후에도 DB에 이미 쓴 UiMeta 복원·디버그에 필요
  sessions.delete(sessionId);
  listeners.delete(sessionId);
}

/** DB UiMeta 스냅샷으로 미리듣기 세션을 복원한다. 이미 있으면 갱신만. */
export function hydrateAiLabYoutubeConfirmFromSnapshot(snap: {
  sessionId: string;
  displayLabel: string;
  hit: AiLabYoutubeConfirmHit;
  meta: NrmAudioFileMetadata;
  fileName: string;
  lyricsMode: NrmLyricsUiMode;
  lyricsQueued: boolean;
  lyricsAskEligible: boolean;
  lyricsSkippedReason?: string;
  explicitLyricsRequest: boolean;
  ytQuery: string;
  candidates: YoutubeSearchItem[];
  index: number;
  exhausted: boolean;
  confirmed: boolean;
}): AiLabYoutubeConfirmSession {
  const candidates = snap.candidates.slice(0, AI_LAB_YOUTUBE_CONFIRM_MAX);
  const index = Math.min(Math.max(0, snap.index), Math.max(0, candidates.length - 1));
  const exhausted = snap.exhausted || candidates.length === 0 || index >= candidates.length;
  const confirmed = snap.confirmed === true;
  const prev = sessions.get(snap.sessionId);
  const session: AiLabYoutubeConfirmSession = {
    sessionId: snap.sessionId,
    displayLabel: snap.displayLabel,
    hit: snap.hit,
    meta: snap.meta,
    fileName: snap.fileName,
    lyricsMode: snap.lyricsMode,
    lyricsQueued: snap.lyricsQueued,
    lyricsAskEligible: snap.lyricsAskEligible,
    lyricsSkippedReason: snap.lyricsSkippedReason,
    explicitLyricsRequest: snap.explicitLyricsRequest,
    ytQuery: snap.ytQuery,
    candidates,
    index,
    uiStatus: confirmed || exhausted ? 'PAUSED' : 'PREPARING',
    streamUrl: null,
    durationMs: null,
    prepareError: null,
    prepareGeneration: (prev?.prepareGeneration ?? 0) + 1,
    exhausted,
    confirmed,
  };
  sessions.set(snap.sessionId, session);
  cachePersistSnapshot(session);
  logNrmDev(LOG, {
    event: 'session_hydrated',
    sessionId: snap.sessionId,
    index,
    exhausted,
    confirmed,
    candidateCount: candidates.length,
  });
  if (!confirmed && !exhausted) {
    prepareAiLabYoutubeConfirmStream(snap.sessionId);
  }
  return { ...session, candidates: [...candidates] };
}

export const AI_LAB_YOUTUBE_EXHAUSTED_MESSAGE =
  '자동 YouTube 후보를 더 제공할 수 없습니다. YouTube 홈에서 직접 검색·다운로드하거나 다른 곡을 요청해 주세요.';
