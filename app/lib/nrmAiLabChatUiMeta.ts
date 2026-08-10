/**
 * AI Lab ChatMessage.UiMeta — 칩·agentUi·YouTube 미리듣기 스냅샷.
 */
import type {
  NrmAiLabAgentUiHints,
  NrmAiLabMessage,
} from '@/lib/nrmAiLabChatUi';
import type { NrmAiLabChoice } from '@/lib/nrmAiLabDownloadTools';
import type {
  AiLabYoutubeConfirmHit,
  AiLabYoutubeConfirmSession,
} from '@/lib/nrmAiLabYoutubeConfirm';
import type { NrmAudioFileMetadata } from '@/lib/nrmDownloadAudioMetadata';
import type { NrmLyricsUiMode } from '@/lib/nrmMelonLyrics';
import type { YoutubeSearchItem } from '@/lib/youtubeSearchTypes';

export type AiLabYoutubeConfirmPersistSnapshot = {
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
};

export type NrmAiLabChatUiMeta = {
  choices?: NrmAiLabChoice[];
  agentUi?: NrmAiLabAgentUiHints;
  youtubeConfirm?: AiLabYoutubeConfirmPersistSnapshot;
};

function asChoiceList(raw: unknown): NrmAiLabChoice[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const out: NrmAiLabChoice[] = [];
  for (const row of raw) {
    if (!row || typeof row !== 'object') continue;
    const id = String((row as { id?: unknown }).id ?? '').trim();
    const label = String((row as { label?: unknown }).label ?? '').trim();
    if (!id || !label) continue;
    out.push({ id, label });
  }
  return out.length > 0 ? out : undefined;
}

function asYoutubeItem(raw: unknown): YoutubeSearchItem | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const videoId = String(r.videoId ?? '').trim();
  const title = String(r.title ?? '').trim();
  if (!videoId || !title) return null;
  return {
    videoId,
    title,
    channelTitle: String(r.channelTitle ?? ''),
    thumbnailUrl: String(r.thumbnailUrl ?? ''),
  };
}

function asHit(raw: unknown): AiLabYoutubeConfirmHit | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const ref = String(r.ref ?? '').trim();
  const title = String(r.title ?? '').trim();
  const artist = String(r.artist ?? '').trim();
  if (!ref || !title) return null;
  return {
    ref,
    platform: String(r.platform ?? 'melon'),
    title,
    artist,
    album: String(r.album ?? ''),
    imageUrl: String(r.imageUrl ?? ''),
    externalUrl: String(r.externalUrl ?? ''),
    releaseDate: String(r.releaseDate ?? ''),
    genre: String(r.genre ?? ''),
    rank: typeof r.rank === 'number' ? r.rank : undefined,
  };
}

export function parseAiLabChatUiMeta(raw: unknown): NrmAiLabChatUiMeta | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const r = raw as Record<string, unknown>;
  const choices = asChoiceList(r.choices);
  const agentUi =
    r.agentUi && typeof r.agentUi === 'object'
      ? (r.agentUi as NrmAiLabAgentUiHints)
      : undefined;

  let youtubeConfirm: AiLabYoutubeConfirmPersistSnapshot | undefined;
  const yc = r.youtubeConfirm;
  if (yc && typeof yc === 'object') {
    const y = yc as Record<string, unknown>;
    const sessionId = String(y.sessionId ?? '').trim();
    const hit = asHit(y.hit);
    const candidatesRaw = Array.isArray(y.candidates) ? y.candidates : [];
    const candidates = candidatesRaw
      .map(asYoutubeItem)
      .filter((x): x is YoutubeSearchItem => x != null);
    if (sessionId && hit && candidates.length > 0) {
      youtubeConfirm = {
        sessionId,
        displayLabel: String(y.displayLabel ?? '').trim() || `${hit.artist} - ${hit.title}`,
        hit,
        meta: (y.meta && typeof y.meta === 'object'
          ? y.meta
          : { artist: hit.artist, title: hit.title }) as NrmAudioFileMetadata,
        fileName: String(y.fileName ?? 'track.m4a'),
        lyricsMode: (String(y.lyricsMode ?? 'unset') as NrmLyricsUiMode) || 'unset',
        lyricsQueued: y.lyricsQueued === true,
        lyricsAskEligible: y.lyricsAskEligible === true,
        lyricsSkippedReason:
          typeof y.lyricsSkippedReason === 'string' ? y.lyricsSkippedReason : undefined,
        explicitLyricsRequest: y.explicitLyricsRequest === true,
        ytQuery: String(y.ytQuery ?? ''),
        candidates,
        index: Math.max(0, Number(y.index) || 0),
        exhausted: y.exhausted === true,
        confirmed: y.confirmed === true,
      };
    }
  }

  if (!choices && !agentUi && !youtubeConfirm) return undefined;
  return { choices, agentUi, youtubeConfirm };
}

export function buildAiLabChatUiMetaFromMessage(
  msg: Pick<NrmAiLabMessage, 'choices' | 'agentUi' | 'youtubeConfirm'>,
  youtubeSnapshot?: AiLabYoutubeConfirmPersistSnapshot | null,
): NrmAiLabChatUiMeta | null {
  const choices =
    msg.choices && msg.choices.length > 0
      ? msg.choices.map((c) => ({ id: c.id, label: c.label }))
      : undefined;
  const agentUi = msg.agentUi;
  const youtubeConfirm =
    youtubeSnapshot ??
    (msg.youtubeConfirm?.sessionId
      ? undefined
      : undefined);
  const snap = youtubeSnapshot ?? null;
  if (!choices && !agentUi && !snap) return null;
  return {
    choices,
    agentUi,
    youtubeConfirm: snap ?? undefined,
  };
}

export function youtubeConfirmSnapshotFromSession(
  session: AiLabYoutubeConfirmSession,
): AiLabYoutubeConfirmPersistSnapshot {
  // 가사 전문은 jsonb를 키우고 미리듣기에 불필요 — 메타에서 제외
  const {
    lyrics: _lyrics,
    melonLyricsPlain: _plain,
    ...metaRest
  } = session.meta;
  const snap: AiLabYoutubeConfirmPersistSnapshot = {
    sessionId: session.sessionId,
    displayLabel: session.displayLabel,
    hit: session.hit,
    meta: metaRest as NrmAudioFileMetadata,
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
  };
  return snap;
}
