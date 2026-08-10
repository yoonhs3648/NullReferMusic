import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Dimensions,
  FlatList,
  Keyboard,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
  type ListRenderItemInfo,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { NrmAiLabComposer } from '@/components/nrm/discover/NrmAiLabComposer';
import { NrmAiLabMarkdown } from '@/components/nrm/discover/NrmAiLabMarkdown';
import { NrmAiLabMessageEnter } from '@/components/nrm/discover/NrmAiLabMessageEnter';
import { NrmAiLabSidebar } from '@/components/nrm/discover/NrmAiLabSidebar';
import { NrmAiLabTypingDots } from '@/components/nrm/discover/NrmAiLabTypingDots';
import { NrmEdgeSwipeOpenLayer } from '@/components/nrm/NrmEdgeSwipeOpenLayer';
import { NrmHamburgerIcon } from '@/components/nrm/NrmHamburgerIcon';
import { NrmLogo } from '@/components/nrm/NrmLogo';
import { nrmTokens } from '@/constants/nrmTokens';
import { getNrmAppSerialNo } from '@/lib/nrmAppSerialNo';
import {
  nrmAiLabEmptyGreeting,
  nrmAiLabRelativeTimeLabel,
  nrmAiLabTitleFromPrompt,
  parseAgentUiFromDiag,
  agentUiBadgeIconName,
  type NrmAiLabConversation,
  type NrmAiLabMessage,
} from '@/lib/nrmAiLabChatUi';
import Ionicons from '@expo/vector-icons/Ionicons';
import {
  loadAiLabSelectedModelId,
  saveAiLabSelectedModelId,
} from '@/lib/nrmAiLabModelPreference';
import {
  aiLabMusicPlatformUnavailableMessage,
  DEFAULT_AI_LAB_MUSIC_PLATFORM_ID,
  isAiLabMelonSearchChoiceId,
  isAiLabMelonSearchChoiceUserText,
  loadAiLabSelectedMusicPlatformId,
  MELON_SEARCH_YES_NO_CHOICES,
  MusicPlatformId,
  resolveAiLabMusicPlatformForMessage,
  rewriteAiLabQueryForMelonFallback,
  saveAiLabSelectedMusicPlatformId,
  type MusicPlatformId as MusicPlatformIdT,
} from '@/lib/nrmAiLabMusicPlatform';
import {
  fetchAiLabSuggestionCatalog,
  pickAiLabSuggestionChips,
} from '@/lib/nrmAiLabSuggestionPrompts';
import type { NrmAiLabSuggestionChip } from '@/lib/nrmSupabaseDatabase.types';
import { deleteChatSession, fetchChatMessages, fetchChatSessions } from '@/lib/nrmChatClient';
import {
  persistAiLabAssistantUiMeta,
  persistAiLabLocalMessages,
  persistAiLabYoutubeConfirmHost,
} from '@/lib/nrmAiLabChatPersist';
import { logNrmRunError } from '@/lib/nrmDevLog';
import { resolveLlmSerialNo } from '@/lib/nrmLlmSerialNo';
import {
  NrmLlmChatSendError,
  sendLlmChatMessageStream,
  type NrmLlmToolRequestEvent,
  type NrmLlmToolResultPayload,
} from '@/lib/nrmLlmChatSend';
import {
  aiLabOneDownloadPerRequestResult,
  confirmAiLabYoutubeCandidateAndDownload,
  executeAiLabDownloadTool,
  getCachedAiLabTrackHit,
  hitFromAiLabTrackChoice,
  hitRefFromDownloadYesChoiceId,
  isAiLabDownloadChoiceId,
  isAiLabDownloadYesChoiceId,
  isAiLabStartDownloadToolName,
  isAiLabTrackChoiceId,
  resolveMelonChartInfoChoices,
  type NrmAiLabChoice,
  type NrmAiLabTrackHit,
} from '@/lib/nrmAiLabDownloadTools';
import {
  advanceAiLabMusicListPage,
  isAiLabMoreMusicListChoiceId,
} from '@/lib/nrmAiLabMusicChoicePager';
import {
  acceptAiLabTranslation,
  declineAiLabTranslation,
  isAiLabLyricsChoiceId,
  isAiLabTranslateChoiceId,
  LYRICS_YES_NO_CHOICES,
  setAiLabLyricsFollowupHooks,
  startAiLabLyrics,
  TRANSLATE_YES_NO_CHOICES,
} from '@/lib/nrmAiLabLyricsFollowup';
import {
  AI_LAB_YOUTUBE_EXHAUSTED_MESSAGE,
  getAiLabYoutubeConfirmPersistSnapshot,
  getAiLabYoutubeConfirmSession,
  hydrateAiLabYoutubeConfirmFromSnapshot,
  rejectAiLabYoutubeCandidate,
} from '@/lib/nrmAiLabYoutubeConfirm';
import {
  aiLabMelonChartCheckingMessage,
  aiLabMelonChartDownloadStartedMessage,
  aiLabMelonChartIdentifiedMessage,
  AI_LAB_YOUTUBE_CONFIRM_USER_PROMPT,
  appendDownloadAskPrompt,
} from '@/lib/nrmAiLabMelonChartAnnounce';
import { NrmAiLabYoutubeConfirmCard } from '@/components/nrm/discover/NrmAiLabYoutubeConfirmCard';
import { getNrmModalScrimColor, getNrmRootBackgroundColor } from '@/lib/nrmUiAppearanceColors';
import { useNrmUserDisplayName } from '@/lib/nrmUserDisplayNameSettings';

type Props = {
  isDark: boolean;
  /** 탭/레이어가 보일 때 true. false→true 전환 시 활성 세션 메시지를 DB와 재동기화 */
  isActive?: boolean;
};

const ICON_HIT = 44;
const NETWORK_PROBLEM_TEXT = '네트워크가 불안정해요 📡 나중에 다시 시도해 주세요.';
const MAX_AI_LAB_TOOL_ROUNDS = 6;
const ACTIVE_SESSION_STORAGE_KEY = 'nrm_ai_lab_active_session_id_v1';

/**
 * 예전엔 전송 실패 원인과 무관하게 항상 NETWORK_PROBLEM_TEXT 하나로 뭉뚱그려
 * 보여줬다 — 진짜 네트워크 단절/서버 오류/스트리밍 중 연결 끊김이 다 같은
 * 문구로 나와서 사용자도 원인을 알 수 없고 로그를 뒤져야만 구분됐다.
 * sendLlmChatMessageStream이 던지는 에러 code로 상황에 맞는 문구를 보여준다.
 */
function aiLabSendErrorText(e: unknown): string {
  if (e instanceof NrmLlmChatSendError) {
    switch (e.code) {
      case 'fetch_error':
        return '네트워크가 안 좋아요 📡 연결 확인하고 다시 시도해 주세요.';
      case 'http_error':
        return '서버가 잠깐 삐끗했어요 🛠️ 잠시 후 다시 시도해 주세요.';
      case 'no_final':
        return '응답 받다 끊겼어요 🔌 다시 시도해 주세요.';
      case 'stream_error':
        return '응답 처리 중 문제가 생겼어요 😵 다시 시도해 주세요.';
    }
  }
  return NETWORK_PROBLEM_TEXT;
}

function nextTempId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/** 새 대화 전송 직후 로컬 전용 세션 id (`c-…`). 서버 SessionID와 구분. */
function isAiLabTempConversationId(id: string): boolean {
  return id.startsWith('c-');
}

function firstUserContentOf(messages: NrmAiLabMessage[]): string {
  for (const m of messages) {
    if (m.role === 'user') return (m.content || '').trim();
  }
  return '';
}

/** 휴리스틱 제목(원문 앞부분)과 첫 사용자 메시지 매칭 — temp↔서버 중복 판별용. */
function aiLabPromptMatchesSessionTitle(prompt: string, title: string): boolean {
  const p = prompt.replace(/\s+/g, ' ').trim();
  const t = title.replace(/\s+/g, ' ').trim();
  if (!p || !t) return false;
  if (p === t) return true;
  const heuristic = p.length > 28 ? `${p.slice(0, 28)}…` : p;
  if (heuristic === t) return true;
  if (p.startsWith(t.replace(/…$/u, '')) || t.replace(/…$/u, '').startsWith(p.slice(0, Math.min(28, p.length)))) {
    return true;
  }
  return false;
}

/** 동일 id가 두 줄로 남는 경우(temp→서버 이관 레이스) 하나로 합친다. */
function dedupeConversationsById(list: NrmAiLabConversation[]): NrmAiLabConversation[] {
  const best = new Map<string, NrmAiLabConversation>();
  for (const c of list) {
    const prev = best.get(c.id);
    if (!prev) {
      best.set(c.id, c);
      continue;
    }
    const prevScore = prev.messagesLoaded ? prev.messages.length : -1;
    const nextScore = c.messagesLoaded ? c.messages.length : -1;
    const pick = nextScore >= prevScore ? c : prev;
    const other = pick === c ? prev : c;
    best.set(c.id, {
      ...pick,
      title: (pick.title || '').trim() || other.title,
      messages: pick.messagesLoaded
        ? pick.messages
        : other.messagesLoaded
          ? other.messages
          : pick.messages,
      messagesLoaded: pick.messagesLoaded || other.messagesLoaded,
      updatedAtIso: pick.updatedAtIso || other.updatedAtIso,
      updatedAtLabel: pick.updatedAtLabel || other.updatedAtLabel,
    });
  }
  const out: NrmAiLabConversation[] = [];
  const seen = new Set<string>();
  for (const c of list) {
    if (seen.has(c.id)) continue;
    seen.add(c.id);
    out.push(best.get(c.id)!);
  }
  return out;
}

function dbMessageIdOf(m: NrmAiLabMessage): string | null {
  const cand = (m.persistId ?? m.id).trim();
  return /^\d+$/.test(cand) ? cand : null;
}

/** DB 스냅샷에 youtubeConfirm가 빠져도 같은 세션 로컬 플레이어를 유지한다. */
function mergeMessagesPreferLocalYoutube(
  local: NrmAiLabMessage[],
  remote: NrmAiLabMessage[],
): NrmAiLabMessage[] {
  if (local.length === 0) return remote;
  const ytByKey = new Map<string, string>();
  for (const m of local) {
    const sid = m.youtubeConfirm?.sessionId?.trim();
    if (!sid) continue;
    ytByKey.set(m.id, sid);
    const dbId = dbMessageIdOf(m);
    if (dbId) ytByKey.set(dbId, sid);
    const contentKey = `c:${m.role}:${(m.content || '').trim()}`;
    if ((m.content || '').trim()) ytByKey.set(contentKey, sid);
  }
  const remoteHasYt = new Set(
    remote
      .map((m) => m.youtubeConfirm?.sessionId?.trim())
      .filter((s): s is string => Boolean(s)),
  );
  const merged = remote.map((m) => {
    if (m.youtubeConfirm?.sessionId) return m;
    const dbId = dbMessageIdOf(m);
    const sid =
      ytByKey.get(m.id) ||
      (dbId ? ytByKey.get(dbId) : undefined) ||
      ytByKey.get(`c:${m.role}:${(m.content || '').trim()}`);
    if (!sid) return m;
    return { ...m, youtubeConfirm: { sessionId: sid }, typing: false };
  });
  for (const m of local) {
    const sid = m.youtubeConfirm?.sessionId?.trim();
    if (!sid || remoteHasYt.has(sid)) continue;
    if (merged.some((x) => x.youtubeConfirm?.sessionId === sid)) continue;
    if (merged.some((x) => x.id === m.id || (m.persistId != null && x.id === m.persistId))) {
      continue;
    }
    merged.push({ ...m, typing: false });
  }
  return merged;
}

/** 미확정 미리듣기 카드가 다음 턴 setState에서 빠지거나 typing으로 숨겨지지 않게 복원. */
function withPreservedYoutubePlayers(
  before: NrmAiLabMessage[],
  after: NrmAiLabMessage[],
): NrmAiLabMessage[] {
  const activeYt = new Map<string, string>();
  for (const m of before) {
    const sid = m.youtubeConfirm?.sessionId?.trim();
    if (!sid) continue;
    const live = getAiLabYoutubeConfirmSession(sid);
    const snap = getAiLabYoutubeConfirmPersistSnapshot(sid);
    if (live?.confirmed || live?.exhausted || snap?.confirmed || snap?.exhausted) continue;
    activeYt.set(m.id, sid);
    const dbId = dbMessageIdOf(m);
    if (dbId) activeYt.set(dbId, sid);
  }
  if (activeYt.size === 0) {
    // after 쪽에만 남아 있어도 typing 때문에 카드가 숨겨지지 않게
    return after.map((m) =>
      m.youtubeConfirm?.sessionId && m.typing ? { ...m, typing: false } : m,
    );
  }

  const seen = new Set<string>();
  const out = after.map((m) => {
    const dbId = dbMessageIdOf(m);
    const sid =
      m.youtubeConfirm?.sessionId?.trim() ||
      activeYt.get(m.id) ||
      (dbId ? activeYt.get(dbId) : undefined);
    if (!sid) return m;
    seen.add(sid);
    if (m.youtubeConfirm?.sessionId === sid && !m.typing) return m;
    return { ...m, youtubeConfirm: { sessionId: sid }, typing: false };
  });

  for (const m of before) {
    const sid = m.youtubeConfirm?.sessionId?.trim();
    if (!sid || seen.has(sid)) continue;
    const live = getAiLabYoutubeConfirmSession(sid);
    const snap = getAiLabYoutubeConfirmPersistSnapshot(sid);
    if (live?.confirmed || live?.exhausted || snap?.confirmed || snap?.exhausted) continue;
    const idx = before.findIndex((x) => x.id === m.id);
    let insertAt = out.length;
    for (let i = idx - 1; i >= 0; i -= 1) {
      const prevId = before[i]!.id;
      const j = out.findIndex((x) => x.id === prevId);
      if (j >= 0) {
        insertAt = j + 1;
        break;
      }
    }
    out.splice(insertAt, 0, { ...m, typing: false });
    seen.add(sid);
  }
  return out;
}

/** 로컬 temp 말풍선을 DB MessageID로 치환하고, 필요 시 세션 id도 확정한다. */
function applyPersistedLocalTurns(
  prev: NrmAiLabConversation[],
  opts: {
    convId: string;
    tempIds: string[];
    clearInteractiveIds?: string[];
    /** `choices`(기본에 가깝게 칩만) | `all`(youtubeConfirm도 제거) */
    clearInteractiveMode?: 'all' | 'choices';
    persisted: { sessionId: string; messages: NrmAiLabMessage[] } | null;
  },
): NrmAiLabConversation[] {
  const { convId, tempIds, clearInteractiveIds, persisted } = opts;
  const tempSet = new Set(tempIds);
  const clearSet = new Set(clearInteractiveIds ?? []);
  const clearMode = opts.clearInteractiveMode ?? 'all';
  const targetSessionId = persisted?.sessionId || convId;
  const mapped = prev.map((c) => {
    if (c.id !== convId && !(persisted && c.id === persisted.sessionId)) return c;
    const stripped = c.messages.map((m) => {
      const dbId = dbMessageIdOf(m);
      const shouldClear =
        clearSet.has(m.id) || (dbId != null && clearSet.has(dbId));
      if (!shouldClear) return m;
      if (clearMode === 'choices') {
        return { ...m, choices: undefined };
      }
      return { ...m, choices: undefined, youtubeConfirm: undefined };
    });
    if (!persisted || persisted.messages.length === 0) {
      return {
        ...c,
        id: targetSessionId,
        messages: stripped,
        messagesLoaded: true,
        updatedAtLabel: '지금',
        updatedAtIso: new Date().toISOString(),
      };
    }
    const kept = stripped.filter((m) => !tempSet.has(m.id));
    // DB 응답에 youtubeConfirm가 빠지면( UiMeta null / parse 실패 ) 로컬 플레이어를 지우지 않는다.
    const mergedPersisted = persisted.messages.map((pm, i) => {
      const tempId = tempIds[i];
      if (!tempId) return pm;
      const local = stripped.find((m) => m.id === tempId);
      if (!local?.youtubeConfirm?.sessionId) return pm;
      if (pm.youtubeConfirm?.sessionId) {
        return {
          ...pm,
          content: (pm.content || '').trim() ? pm.content : local.content,
        };
      }
      return {
        ...pm,
        content: (pm.content || '').trim() ? pm.content : local.content,
        youtubeConfirm: local.youtubeConfirm,
      };
    });
    return {
      ...c,
      id: persisted.sessionId,
      messages: [...kept, ...mergedPersisted],
      messagesLoaded: true,
      updatedAtLabel: '지금',
      updatedAtIso: new Date().toISOString(),
    };
  });

  // temp id와 서버 SessionID가 목록에 같이 있으면(목록 refresh 레이스) 고스트 temp를 제거한다.
  const seedUser =
    firstUserContentOf(
      mapped.find((c) => c.id === targetSessionId)?.messages ?? [],
    ) ||
    firstUserContentOf(persisted?.messages ?? []) ||
    firstUserContentOf(prev.find((c) => c.id === convId)?.messages ?? []);
  const withoutGhostTemps = mapped.filter((c) => {
    if (!isAiLabTempConversationId(c.id)) return true;
    if (c.id === convId && convId !== targetSessionId) return false;
    if (seedUser && firstUserContentOf(c.messages) === seedUser) return false;
    return true;
  });
  return dedupeConversationsById(withoutGhostTemps);
}

function sleepMs(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** AI Lab — 앱 상단바·메뉴 패턴에 맞춘 대화 UI. ChatSession/ChatMessage 기반 실 LLM 연동. */
export function NrmDiscoverAiLabScreen({ isDark, isActive = true }: Props) {
  const insets = useSafeAreaInsets();
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const drawerW = Math.max(280, Math.min(380, Math.round(windowWidth * 0.88) || 320));
  const emptyPadTop = Math.max(28, Math.round(windowHeight * 0.1));
  const drawerWRef = useRef(drawerW);
  drawerWRef.current = drawerW;
  const sidebarBackHandlerRef = useRef<(() => boolean) | null>(null);
  const translateX = useRef(new Animated.Value(-drawerW)).current;
  /** 메인 NrmAppTopBar 와 동일 — 기종별 반응형 가로 여백 */
  const padH = Math.max(nrmTokens.space.md, Math.round(windowWidth * 0.04));
  /** 하단 입력란만 조금 더 넓게(좌우 여백 축소) */
  const composerPadH = Math.max(nrmTokens.space.xs, Math.round(windowWidth * 0.02));

  const titleColor = isDark ? nrmTokens.color.bodyOnDark : nrmTokens.color.ink;
  const hairline = isDark ? nrmTokens.color.borderOnDark : nrmTokens.color.hairline;
  const chatBg = getNrmRootBackgroundColor(isDark);
  const userBubbleBg = isDark ? 'rgba(0, 102, 204, 0.28)' : 'rgba(0, 102, 204, 0.12)';
  const cardBg = isDark ? nrmTokens.color.surfaceTile1 : nrmTokens.color.canvas;
  const cardBorder = isDark ? nrmTokens.color.borderOnDark : nrmTokens.color.hairline;
  const modalScrim = getNrmModalScrimColor(isDark);
  const rootBg = getNrmRootBackgroundColor(isDark);
  const systemBubbleBg = isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.045)';
  const systemTextColor = isDark ? nrmTokens.color.textMuted : nrmTokens.color.inkMuted80;

  const [serialNo, setSerialNo] = useState<string | null>(null);
  const [conversations, setConversations] = useState<NrmAiLabConversation[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [menuOpen, setMenuOpen] = useState(false);
  const [llmModelId, setLlmModelId] = useState<number | null>(null);
  const [suggestionChips, setSuggestionChips] = useState<NrmAiLabSuggestionChip[]>([]);
  const suggestionCatalogRef = useRef<Awaited<ReturnType<typeof fetchAiLabSuggestionCatalog>>>([]);
  /** AsyncStorage 선호 모델 로드 완료 전엔 기본값으로 저장을 덮어쓰지 않음 */
  const [llmModelPrefReady, setLlmModelPrefReady] = useState(false);
  const [musicPlatformId, setMusicPlatformId] = useState<MusicPlatformIdT>(
    DEFAULT_AI_LAB_MUSIC_PLATFORM_ID,
  );
  const [messagesLoading, setMessagesLoading] = useState(false);
  /** 세션별 in-flight — 해당 세션만 추가 전송 차단, 다른 세션·앱 이동은 허용 */
  const [sendingSessionIds, setSendingSessionIds] = useState<ReadonlySet<string>>(
    () => new Set(),
  );
  const sendingSessionIdsRef = useRef<ReadonlySet<string>>(new Set());
  /** 방금 로컬로만 만든 대화(서버 세션 확정 전) — 목록 refresh 시 병합용 */
  const pendingLocalConversationRef = useRef<NrmAiLabConversation | null>(null);
  /** temp `c-…` → 서버 SessionID. 목록 refresh 시 고스트 중복 제거용 */
  const localTempToServerIdRef = useRef<Map<string, string>>(new Map());
  /** isActive false→true 감지용 */
  const wasActiveRef = useRef(isActive);
  /** 앱 설정 > 사용자 이름 변경 값 우선, 없으면 bake userName */
  const greetingName = useNrmUserDisplayName();
  const [keyboardInset, setKeyboardInset] = useState(0);
  const listRef = useRef<FlatList<NrmAiLabMessage>>(null);
  /** 사용자가 위로 올려 두면 false — 스트리밍/완료 시 자동 스크롤 안 함 */
  const stickToBottomRef = useRef(true);
  const scrollPinTimersRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  const isSessionSending = useCallback((sessionId: string | null | undefined) => {
    if (!sessionId) return false;
    return sendingSessionIdsRef.current.has(sessionId);
  }, []);

  const markSessionSending = useCallback((sessionId: string) => {
    if (!sessionId) return;
    setSendingSessionIds((prev) => {
      if (prev.has(sessionId)) return prev;
      const next = new Set(prev);
      next.add(sessionId);
      sendingSessionIdsRef.current = next;
      return next;
    });
  }, []);

  const clearSessionSending = useCallback((sessionId: string) => {
    if (!sessionId) return;
    setSendingSessionIds((prev) => {
      if (!prev.has(sessionId)) return prev;
      const next = new Set(prev);
      next.delete(sessionId);
      sendingSessionIdsRef.current = next;
      return next;
    });
  }, []);

  const transferSessionSending = useCallback((fromId: string, toId: string) => {
    if (!fromId || !toId || fromId === toId) return;
    setSendingSessionIds((prev) => {
      if (!prev.has(fromId) && prev.has(toId)) return prev;
      const next = new Set(prev);
      next.delete(fromId);
      next.add(toId);
      sendingSessionIdsRef.current = next;
      return next;
    });
  }, []);

  const clearScrollPinTimers = useCallback(() => {
    for (const t of scrollPinTimersRef.current) clearTimeout(t);
    scrollPinTimersRef.current = [];
  }, []);

  const pinListToBottom = useCallback(
    (opts?: { force?: boolean; animated?: boolean; settle?: boolean }) => {
      if (!opts?.force && !stickToBottomRef.current) return;
      const animated = opts?.animated === true;
      const run = () => {
        if (!opts?.force && !stickToBottomRef.current) return;
        listRef.current?.scrollToEnd({ animated });
      };
      run();
      requestAnimationFrame(run);
      if (opts?.settle === false) return;
      // 칩·마크다운·말풍선 레이아웃이 늦게 늘어나도 최하단에 붙도록 재핀
      clearScrollPinTimers();
      for (const ms of [32, 100, 220, 400]) {
        scrollPinTimersRef.current.push(setTimeout(run, ms));
      }
    },
    [clearScrollPinTimers],
  );

  /** 스트리밍 중 매 프레임 — sticky일 때만 즉시 하단 (settle 타이머 없음) */
  const pinListToBottomWhileStreaming = useCallback(() => {
    if (!stickToBottomRef.current) return;
    requestAnimationFrame(() => {
      if (!stickToBottomRef.current) return;
      listRef.current?.scrollToEnd({ animated: false });
    });
  }, []);

  const onChatListScroll = useCallback(
    (e: {
      nativeEvent: {
        contentOffset: { y: number };
        contentSize: { height: number };
        layoutMeasurement: { height: number };
      };
    }) => {
      const { contentOffset, contentSize, layoutMeasurement } = e.nativeEvent;
      const viewport = layoutMeasurement.height;
      const contentH = contentSize.height;
      if (viewport <= 0 || contentH <= 0) return;
      const distanceFromBottom = contentH - viewport - contentOffset.y;
      // 하단 근처면 sticky, 위로 올리면 해제
      stickToBottomRef.current = distanceFromBottom <= 72;
    },
    [],
  );

  const clearPersistedActiveSessionId = useCallback(() => {
    void AsyncStorage.removeItem(ACTIVE_SESSION_STORAGE_KEY).catch(() => {});
  }, []);

  const reloadSessionMessages = useCallback(async (sessionId: string) => {
    if (!sessionId || sessionId.startsWith('c-')) return;
    try {
      const msgs = await fetchChatMessages(sessionId);
      setConversations((prev) =>
        prev.map((c) =>
          c.id === sessionId
            ? {
                ...c,
                messages: mergeMessagesPreferLocalYoutube(c.messages, msgs),
                messagesLoaded: true,
                // 전송 중 로컬 typing 말풍선이 있으면 DB 스냅샷으로 덮지 않음 — 호출측에서 sending 가드
              }
            : c,
        ),
      );
    } catch (e) {
      logNrmRunError('ailab.messages', e, { sessionId });
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    void getNrmAppSerialNo().then((raw) => {
      if (cancelled) return;
      setSerialNo(resolveLlmSerialNo(raw));
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const activeIdRef = useRef(activeId);
  activeIdRef.current = activeId;

  useEffect(() => {
    setAiLabLyricsFollowupHooks({
      onAskTranslation: (payload) => {
        const convId = activeIdRef.current;
        if (!convId) return;
        const msg: NrmAiLabMessage = {
          id: nextTempId('a'),
          role: 'assistant',
          content: payload.message,
          choices: payload.choices,
        };
        setConversations((prev) =>
          prev.map((c) =>
            c.id === convId ? { ...c, messages: [...c.messages, msg] } : c,
          ),
        );
        pinListToBottom({ animated: false });
        const sn = serialNo;
        const mid = llmModelId;
        if (sn && mid != null && /^\d+$/.test(convId)) {
          void persistAiLabLocalMessages({
            serialNo: sn,
            sessionId: convId,
            modelId: mid,
            messages: [msg],
          }).then((persisted) => {
            if (!persisted) return;
            setConversations((prev) =>
              applyPersistedLocalTurns(prev, {
                convId,
                tempIds: [msg.id],
                persisted,
              }),
            );
          });
        }
      },
    });
    return () => {
      setAiLabLyricsFollowupHooks({});
    };
  }, [llmModelId, pinListToBottom, serialNo]);

  // 사용자가 마지막으로 직접 고른 모델을 기기에서 복원 — 로드 전에는 피커가
  // pickDefault로 AsyncStorage를 덮어쓰지 않도록 prefReady를 기다린다.
  useEffect(() => {
    let cancelled = false;
    void loadAiLabSelectedModelId()
      .then((id) => {
        if (cancelled) return;
        if (id != null) setLlmModelId(id);
      })
      .finally(() => {
        if (!cancelled) setLlmModelPrefReady(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    void loadAiLabSelectedMusicPlatformId().then((id) => {
      if (!cancelled) setMusicPlatformId(id);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    void fetchAiLabSuggestionCatalog().then((catalog) => {
      if (cancelled) return;
      suggestionCatalogRef.current = catalog;
      setSuggestionChips(pickAiLabSuggestionChips(catalog));
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const handleLlmModelChange = useCallback((modelId: number) => {
    setLlmModelId(modelId);
    void saveAiLabSelectedModelId(modelId);
  }, []);

  /** 기본 모델 자동 선택 — UI만 채우고 저장하지 않음(사용자 선호 덮어쓰기 방지) */
  const handleLlmModelDefault = useCallback((modelId: number) => {
    setLlmModelId((prev) => (prev == null ? modelId : prev));
  }, []);

  const handleMusicPlatformChange = useCallback((id: MusicPlatformIdT) => {
    setMusicPlatformId(id);
    void saveAiLabSelectedMusicPlatformId(id);
  }, []);

  const refreshSessions = useCallback(async () => {
    if (!serialNo) return;
    try {
      const rows = await fetchChatSessions(serialNo);
      setConversations((prev) => {
        const pendingLocal = pendingLocalConversationRef.current;
        const tempToServer = localTempToServerIdRef.current;
        const prevById = new Map(prev.map((c) => [c.id, c]));

        const takeLocalMessagesForServer = (
          row: NrmAiLabConversation,
        ): NrmAiLabConversation => {
          const existing = prevById.get(row.id);
          if (existing?.messagesLoaded && existing.messages.length > 0) {
            return {
              ...row,
              messages: existing.messages,
              messagesLoaded: true,
              // 서버 제목(요약) 우선 — 로컬 휴리스틱/원문이 목록에 남지 않게
              title: row.title || existing.title,
            };
          }

          const tryAbsorb = (local: NrmAiLabConversation | null | undefined) => {
            if (!local?.messagesLoaded || local.messages.length === 0) return null;
            if (isAiLabTempConversationId(local.id)) {
              tempToServer.set(local.id, row.id);
            }
            return {
              ...row,
              messages: local.messages,
              messagesLoaded: true,
              title: row.title || local.title,
            };
          };

          for (const [tempId, serverId] of tempToServer) {
            if (serverId !== row.id) continue;
            const absorbed = tryAbsorb(prevById.get(tempId));
            if (absorbed) return absorbed;
          }

          if (pendingLocal && tempToServer.get(pendingLocal.id) === row.id) {
            const absorbed = tryAbsorb(pendingLocal);
            if (absorbed) {
              pendingLocalConversationRef.current = null;
              return absorbed;
            }
          }

          const rowTitle = (row.title || '').trim();
          if (rowTitle) {
            for (const c of prev) {
              if (!isAiLabTempConversationId(c.id) || !c.messagesLoaded) continue;
              const fu = firstUserContentOf(c.messages);
              if (fu && aiLabPromptMatchesSessionTitle(fu, rowTitle)) {
                const absorbed = tryAbsorb(c);
                if (absorbed) return absorbed;
              }
            }
            if (pendingLocal && isAiLabTempConversationId(pendingLocal.id)) {
              const fu = firstUserContentOf(pendingLocal.messages);
              if (fu && aiLabPromptMatchesSessionTitle(fu, rowTitle)) {
                const absorbed = tryAbsorb(pendingLocal);
                if (absorbed) {
                  pendingLocalConversationRef.current = null;
                  return absorbed;
                }
              }
            }
          }

          return row;
        };

        const merged = rows.map(takeLocalMessagesForServer);
        const absorbedTempIds = new Set<string>();
        for (const [tempId, serverId] of tempToServer) {
          if (merged.some((m) => m.id === serverId)) absorbedTempIds.add(tempId);
        }
        for (const row of merged) {
          if (!row.messagesLoaded) continue;
          const fu = firstUserContentOf(row.messages);
          if (!fu) continue;
          for (const c of prev) {
            if (!isAiLabTempConversationId(c.id)) continue;
            if (firstUserContentOf(c.messages) === fu) absorbedTempIds.add(c.id);
          }
        }

        const locals = prev.filter((c) => {
          if (!c.messagesLoaded || c.messages.length === 0) return false;
          if (merged.some((m) => m.id === c.id)) return false;
          if (absorbedTempIds.has(c.id)) return false;
          if (tempToServer.has(c.id) && merged.some((m) => m.id === tempToServer.get(c.id))) {
            return false;
          }
          if (isAiLabTempConversationId(c.id)) {
            const fu = firstUserContentOf(c.messages);
            if (
              fu &&
              merged.some((m) => aiLabPromptMatchesSessionTitle(fu, m.title || ''))
            ) {
              return false;
            }
            // 서버에 아직 없는 로컬(스트리밍·전송 실패 초안)은 유지
            return true;
          }
          return true;
        });

        let withLocals = locals.length > 0 ? [...locals, ...merged] : merged;

        if (pendingLocal && !withLocals.some((c) => c.id === pendingLocal.id)) {
          const mappedServerId = tempToServer.get(pendingLocal.id);
          const pendingFu = firstUserContentOf(pendingLocal.messages);
          const alreadyOnServer =
            (mappedServerId != null &&
              withLocals.some((c) => c.id === mappedServerId)) ||
            (pendingFu != null &&
              pendingFu.length > 0 &&
              withLocals.some((c) =>
                aiLabPromptMatchesSessionTitle(pendingFu, c.title || ''),
              ));
          if (alreadyOnServer) {
            pendingLocalConversationRef.current = null;
          } else {
            withLocals = [
              pendingLocal,
              ...withLocals.filter((c) => c.id !== pendingLocal.id),
            ];
          }
        }

        return dedupeConversationsById(withLocals);
      });
      // 재진입/앱 재실행 시에는 항상 AI Lab 메인(새 대화). 사이드바에서만 세션을 연다.
    } catch (e) {
      logNrmRunError('ailab.sessions', e, { serialNo });
    }
  }, [serialNo]);

  useEffect(() => {
    if (serialNo) void refreshSessions();
  }, [serialNo, refreshSessions]);

  /** 활성 세션이 목록 새로고침으로 messagesLoaded=false가 되면 DB에서 메시지를 다시 채운다.
   * 해당 세션이 in-flight면 스트리밍 로컬 메시지를 덮어쓰지 않는다. */
  useEffect(() => {
    if (!activeId || isSessionSending(activeId)) return;
    const target = conversations.find((c) => c.id === activeId);
    if (!target || target.messagesLoaded) return;
    let cancelled = false;
    setMessagesLoading(true);
    void fetchChatMessages(activeId)
      .then((msgs) => {
        if (cancelled) return;
        setConversations((prev) =>
          prev.map((c) =>
            c.id === activeId
              ? {
                  ...c,
                  messages:
                    c.messagesLoaded && c.messages.length > 0
                      ? c.messages
                      : mergeMessagesPreferLocalYoutube(c.messages, msgs),
                  messagesLoaded: true,
                }
              : c,
          ),
        );
      })
      .catch((e) => logNrmRunError('ailab.messages', e, { sessionId: activeId }))
      .finally(() => {
        if (!cancelled) setMessagesLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [activeId, conversations, isSessionSending]);

  /** AI Lab을 벗어나면 메인으로 리셋. 복귀·앱 재실행 시에도 이전 세션을 자동으로 열지 않는다. */
  useEffect(() => {
    const wasActive = wasActiveRef.current;
    const becameActive = isActive && !wasActive;
    const becameInactive = !isActive && wasActive;
    wasActiveRef.current = isActive;

    if (becameInactive) {
      setActiveId(null);
      clearPersistedActiveSessionId();
      return;
    }

    if (!becameActive) return;
    const sid = activeIdRef.current;
    if (!sid || sid.startsWith('c-')) return;
    // in-flight 세션은 로컬 스트리밍 유지
    if (isSessionSending(sid)) return;
    void reloadSessionMessages(sid);
  }, [clearPersistedActiveSessionId, isActive, isSessionSending, reloadSessionMessages]);

  // 예전 기기 저장값이 남아 있어도 자동 복원하지 않도록 기동 시 제거
  useEffect(() => {
    clearPersistedActiveSessionId();
  }, [clearPersistedActiveSessionId]);

  const active = useMemo(
    () => conversations.find((c) => c.id === activeId) ?? null,
    [activeId, conversations],
  );
  const messages = active?.messages ?? [];
  /** 현재 보고 있는 세션만 전송 중 — composer/칩 잠금용 */
  const activeSessionSending = Boolean(activeId && sendingSessionIds.has(activeId));
  const greeting = useMemo(() => nrmAiLabEmptyGreeting(greetingName), [greetingName]);

  useEffect(() => {
    const showEvt = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvt = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const onShow = (e: { endCoordinates: { height: number; screenY: number } }) => {
      const winH = Dimensions.get('window').height;
      const overlap = Math.max(0, winH - e.endCoordinates.screenY);
      const fallback = e.endCoordinates.height;
      setKeyboardInset(overlap > 0 ? overlap : Platform.OS === 'ios' ? fallback : 0);
    };
    const onHide = () => setKeyboardInset(0);
    const subShow = Keyboard.addListener(showEvt, onShow);
    const subHide = Keyboard.addListener(hideEvt, onHide);
    return () => {
      subShow.remove();
      subHide.remove();
    };
  }, []);

  useEffect(() => {
    if (messages.length === 0) return;
    // 세션 전환·메시지 개수 변화: sticky일 때만 하단 고정
    pinListToBottom({ animated: false });
  }, [messages.length, activeId, pinListToBottom]);

  useEffect(() => {
    return () => clearScrollPinTimers();
  }, [clearScrollPinTimers]);

  // 키보드가 올라오면 sticky일 때 다시 하단으로
  useEffect(() => {
    if (keyboardInset <= 0) return;
    pinListToBottom({ animated: false });
  }, [keyboardInset, pinListToBottom]);

  const openMenu = useCallback(() => {
    // setMenuOpen 전에 화면 밖 위치 고정 → 첫 프레임 깜빡임 방지
    translateX.setValue(-drawerWRef.current);
    setMenuOpen(true);
    void refreshSessions();
  }, [refreshSessions, translateX]);

  const closeMenu = useCallback(() => {
    Animated.timing(translateX, {
      toValue: -drawerWRef.current,
      duration: 220,
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (finished) setMenuOpen(false);
    });
  }, [translateX]);

  const registerSidebarBackHandler = useCallback((handler: (() => boolean) | null) => {
    sidebarBackHandlerRef.current = handler;
  }, []);

  /** Android 하드웨어 뒤로: 사이드바 서브패널이 먼저 처리하면 드로어는 안 닫는다. */
  const onDrawerRequestClose = useCallback(() => {
    if (sidebarBackHandlerRef.current?.()) return;
    closeMenu();
  }, [closeMenu]);

  // false→true 전환 시 슬라이드 인 (햄버거·좌측 스와이프 공통)
  useEffect(() => {
    if (!menuOpen) return;
    Animated.timing(translateX, {
      toValue: 0,
      duration: 240,
      useNativeDriver: true,
    }).start();
  }, [menuOpen, translateX]);

  // 열린 상태에서 화면 폭만 바뀔 때 위치 보정 (열림 전환과 분리)
  useEffect(() => {
    if (!menuOpen) return;
    translateX.setValue(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drawerW]);

  const handleNewChat = useCallback(() => {
    setActiveId(null);
    setDraft('');
    stickToBottomRef.current = true;
    clearPersistedActiveSessionId();
    closeMenu();
  }, [clearPersistedActiveSessionId, closeMenu]);

  const handleSelect = useCallback(
    (id: string) => {
      setActiveId(id);
      setDraft('');
      stickToBottomRef.current = true;
      closeMenu();
      const target = conversations.find((c) => c.id === id);
      if (target) {
        // 모델은 좌측 피커/저장 선호값을 유지 — 과거 세션 ModelID로 UI를 덮어쓰지 않음.
        // 실제 호출은 클라이언트가 보내는 modelId를 서버가 우선 사용한다.
        // in-flight면 로컬 스트리밍을 유지하고, 아니면 DB에서 다시 읽어 이탈 중 확정분 반영.
        if (isSessionSending(id)) return;
        setMessagesLoading(true);
        void fetchChatMessages(id)
          .then((msgs) => {
            setConversations((prev) =>
              prev.map((c) =>
                c.id === id
                  ? {
                      ...c,
                      messages: isSessionSending(id)
                        ? c.messages
                        : mergeMessagesPreferLocalYoutube(c.messages, msgs),
                      messagesLoaded: true,
                    }
                  : c,
              ),
            );
          })
          .catch((e) => logNrmRunError('ailab.messages', e, { sessionId: id }))
          .finally(() => setMessagesLoading(false));
      }
    },
    [closeMenu, conversations, isSessionSending],
  );

  const handleDelete = useCallback(
    (id: string) => {
      setConversations((prev) => prev.filter((c) => c.id !== id));
      setActiveId((cur) => (cur === id ? null : cur));
      if (pendingLocalConversationRef.current?.id === id) pendingLocalConversationRef.current = null;
      if (!serialNo) return;
      void deleteChatSession(serialNo, id).catch((e) => {
        logNrmRunError('ailab.delete', e, { sessionId: id });
        void refreshSessions();
      });
    },
    [refreshSessions, serialNo],
  );

  const sendUserText = useCallback(
    (text: string, opts?: {
      displayText?: string;
      apiMessage?: string;
      trackSelectHit?: NrmAiLabTrackHit;
      /** Melon 폴백 수락 등 — 플랫폼 탐지 결과를 Melon으로 강제 */
      forceMusicPlatformId?: MusicPlatformIdT;
    }) => {
      if (!text || !serialNo || llmModelId == null) return;
      const targetId = activeId;
      // 같은 세션만 추가 전송 차단 — 다른 세션·새 대화는 허용
      if (targetId && isSessionSending(targetId)) return;

      const displayText = (opts?.displayText ?? text).trim() || text;
      const apiText = (opts?.apiMessage ?? displayText).trim() || displayText;
      const selectedHit = opts?.trackSelectHit ?? null;
      const forceMusicPlatformId = opts?.forceMusicPlatformId ?? null;

      stickToBottomRef.current = true;
      pinListToBottom({ force: true, animated: false });

      const tempUserId = nextTempId('u');
      const tempAssistantId = nextTempId('a');
      const userMsg: NrmAiLabMessage = {
        id: tempUserId,
        role: 'user',
        content: displayText,
        pending: true,
      };
      const sourceConvId = targetId ?? nextTempId('c');
      /** 이 요청의 in-flight 키 — onMeta/persist로 세션 id가 바뀌면 이관 */
      let flightSessionId = sourceConvId;
      const adoptFlightSessionId = (nextId: string) => {
        const id = String(nextId ?? '').trim();
        if (!id || id === flightSessionId) return;
        if (isAiLabTempConversationId(flightSessionId)) {
          localTempToServerIdRef.current.set(flightSessionId, id);
        }
        if (pendingLocalConversationRef.current?.id === flightSessionId) {
          pendingLocalConversationRef.current = null;
        }
        transferSessionSending(flightSessionId, id);
        flightSessionId = id;
      };

      markSessionSending(flightSessionId);

      if (!targetId) {
        const created: NrmAiLabConversation = {
          id: sourceConvId,
          title: nrmAiLabTitleFromPrompt(displayText),
          updatedAtLabel: '지금',
          updatedAtIso: new Date().toISOString(),
          modelId: llmModelId,
          messages: [userMsg],
          messagesLoaded: true,
        };
        pendingLocalConversationRef.current = created;
        setConversations((prev) => [created, ...prev]);
        setActiveId(sourceConvId);
      } else {
        setConversations((prev) =>
          prev.map((c) =>
            c.id === sourceConvId ? { ...c, messages: [...c.messages, userMsg] } : c,
          ),
        );
      }

      let currentConvId = sourceConvId;
      let gotFirstDelta = false;

      const typingPlaceholder: NrmAiLabMessage = {
        id: tempAssistantId,
        role: 'assistant',
        content: '',
        typing: true,
      };
      setConversations((prev) =>
        prev.map((c) =>
          c.id === currentConvId ? { ...c, messages: [...c.messages, typingPlaceholder] } : c,
        ),
      );

      void (async () => {
        let toolContinue = false;
        let toolResults: NrmLlmToolResultPayload[] | undefined;
        let previousInteractionId: string | null = null;
        let lastToolChoices: NrmAiLabChoice[] | undefined;
        let sessionIdForApi: string | null = targetId;

        const resolvedPlatform = await resolveAiLabMusicPlatformForMessage(
          apiText,
          musicPlatformId,
          forceMusicPlatformId ? { forcePlatformId: forceMusicPlatformId } : undefined,
        );
        const musicPlatformBlocked =
          !resolvedPlatform.available || !resolvedPlatform.searchSupported;

        if (resolvedPlatform.explicit && !resolvedPlatform.available) {
          const assistantMsg: NrmAiLabMessage = {
            id: nextTempId('a'),
            role: 'assistant',
            content: aiLabMusicPlatformUnavailableMessage(resolvedPlatform.label),
            choices: MELON_SEARCH_YES_NO_CHOICES,
          };
          setConversations((prev) =>
            prev.map((c) =>
              c.id === currentConvId
                ? {
                    ...c,
                    messages: c.messages
                      .filter((m) => m.id !== tempAssistantId)
                      .map((m) => (m.id === tempUserId ? { ...m, pending: false } : m))
                      .concat(assistantMsg),
                  }
                : c,
            ),
          );
          clearSessionSending(flightSessionId);
          if (serialNo && llmModelId != null) {
            const userPersist: NrmAiLabMessage = {
              id: tempUserId,
              role: 'user',
              content: displayText,
            };
            void persistAiLabLocalMessages({
              serialNo,
              sessionId: sessionIdForApi && /^\d+$/.test(sessionIdForApi) ? sessionIdForApi : null,
              modelId: llmModelId,
              messages: [userPersist, assistantMsg],
            }).then((persisted) => {
              if (!persisted) return;
              setConversations((prev) =>
                applyPersistedLocalTurns(prev, {
                  convId: currentConvId,
                  tempIds: [tempUserId, assistantMsg.id],
                  persisted,
                }),
              );
              if (persisted.sessionId !== currentConvId) {
                setActiveId(persisted.sessionId);
              }
            });
          }
          return;
        }

        try {
          /** 사용자 메시지 1회당 오디오 다운로드 시작은 최대 1회 */
          let downloadsStartedThisSend = 0;
          /** 검색 1건 / 칩 선택 hit — 모델이 텍스트만 하고 FC를 안 할 때 강제 다운로드 */
          let pendingAutoDownloadHit: NrmAiLabTrackHit | null = selectedHit;
          let lastAssistantText = '';
          const userLikelyWantsDownload =
            selectedHit != null ||
            /다운로드|받아\s*줘|넣어\s*줘|저장해|download/i.test(displayText) ||
            /다운로드|받아\s*줘|넣어\s*줘|저장해|download/i.test(apiText);

          // 칩으로 곡이 확정되면 YouTube 후보 확인(미리듣기)부터 — 다운로드는 「맞다」후
          let preforcedLyricsChoices: NrmAiLabChoice[] | undefined;
          let youtubeConfirmSessionIdFromTools: string | undefined;
          /** onFinal에서 확정된 assistant MessageID — force-download UiMeta patch용 */
          let lastDbAssistantMessageId: string | undefined;

          /** 멜론 차트 순위만 조회(다운로드 X) 시 1건 hit — 예/아니요 칩용 */
          let lastChartInfoOnlyHit: NrmAiLabTrackHit | null = null;
          /** 멜론 차트 다운로드: LLM 호출 수 유지 + 단계별 로컬 말풍선 */
          let activeAssistantId = tempAssistantId;
          let melonChartCheckingShown = false;
          let melonChartUiActive = false;
          let melonChartHit: NrmAiLabTrackHit | null = null;
          let melonChartPeriod: string | null = null;
          let melonChartPlayerShown = false;
          /** 플레이어까지 로컬로 냈으면 LLM 최종 문구로 UI를 덮지 않음(호출은 그대로) */
          let suppressLlmAssistantUi = false;

          const patchAssistant = (id: string, patch: Partial<NrmAiLabMessage>) => {
            const convId = currentConvId;
            setConversations((prev) =>
              prev.map((c) =>
                c.id === convId
                  ? {
                      ...c,
                      messages: c.messages.map((m) => (m.id === id ? { ...m, ...patch } : m)),
                    }
                  : c,
              ),
            );
          };

          const removeEmptyAssistant = (id: string) => {
            const convId = currentConvId;
            setConversations((prev) =>
              prev.map((c) => {
                if (c.id !== convId) return c;
                const target = c.messages.find((m) => m.id === id);
                if (
                  !target ||
                  target.content.trim() ||
                  target.youtubeConfirm ||
                  (target.choices && target.choices.length > 0)
                ) {
                  return c;
                }
                return { ...c, messages: c.messages.filter((m) => m.id !== id) };
              }),
            );
          };

          const appendAssistant = (msg: {
            content: string;
            typing?: boolean;
            youtubeConfirm?: { sessionId: string };
            choices?: NrmAiLabChoice[];
          }): string => {
            const id = nextTempId('a');
            const full: NrmAiLabMessage = {
              id,
              role: 'assistant',
              content: msg.content,
              typing: msg.typing === true,
              youtubeConfirm: msg.youtubeConfirm,
              choices: msg.choices,
            };
            const convId = currentConvId;
            setConversations((prev) =>
              prev.map((c) =>
                c.id === convId ? { ...c, messages: [...c.messages, full] } : c,
              ),
            );
            activeAssistantId = id;
            pinListToBottom({ animated: false });
            return id;
          };

          const dropLeftoverStreamingAssistant = () => {
            const id = activeAssistantId;
            const convId = currentConvId;
            setConversations((prev) =>
              prev.map((c) => {
                if (c.id !== convId) return c;
                const target = c.messages.find((m) => m.id === id);
                if (!target || target.youtubeConfirm) return c;
                const content = target.content.trim();
                const keepProgress =
                  content === aiLabMelonChartCheckingMessage() ||
                  content.startsWith('해당 곡은') ||
                  content.startsWith('우선 ');
                if (keepProgress) return c;
                return { ...c, messages: c.messages.filter((m) => m.id !== id) };
              }),
            );
          };

          const YT_CONFIRM_FALLBACK = AI_LAB_YOUTUBE_CONFIRM_USER_PROMPT;

          const conversationHasYoutubeSession = (
            messages: NrmAiLabMessage[],
            ytSessionId: string,
          ): boolean =>
            messages.some((m) => m.youtubeConfirm?.sessionId === ytSessionId);

          /**
           * YouTube 미리듣기: 텍스트+플레이어를 반드시 같은 말풍선에 즉시 붙인다.
           * LLM onFinal에 맡기지 않는다 (텍스트만 나오고 카드 누락 방지).
           * @param preferDbMessageId Edge finalize로 이미 저장된 assistant MessageID — 있으면 UiMeta PATCH 우선
           */
          const presentYoutubeConfirmUi = async (
            ytSessionId: string,
            preferDbMessageId?: string,
          ) => {
            if (!ytSessionId) return;
            suppressLlmAssistantUi = true;
            melonChartPlayerShown = true;

            dropLeftoverStreamingAssistant();
            removeEmptyAssistant(activeAssistantId);

            const preferredContent =
              melonChartUiActive && melonChartHit
                ? aiLabMelonChartDownloadStartedMessage({
                    hit: melonChartHit,
                    period: melonChartPeriod,
                  })
                : null;

            let hostMsgId = '';
            let hostPersistId: string | undefined;
            let hostContent = preferredContent || YT_CONFIRM_FALLBACK;
            let skippedAttach = false;

            setConversations((prev) =>
              prev.map((c) => {
                if (c.id !== currentConvId) return c;
                if (conversationHasYoutubeSession(c.messages, ytSessionId)) {
                  skippedAttach = true;
                  const existing = c.messages.find(
                    (m) => m.youtubeConfirm?.sessionId === ytSessionId,
                  );
                  if (existing) {
                    hostMsgId = existing.id;
                    hostPersistId = dbMessageIdOf(existing) ?? undefined;
                  }
                  return c;
                }
                const messages = [...c.messages];
                while (messages.length > 0) {
                  const last = messages[messages.length - 1]!;
                  if (
                    last.role === 'assistant' &&
                    last.typing &&
                    !last.content.trim() &&
                    !last.youtubeConfirm
                  ) {
                    messages.pop();
                    continue;
                  }
                  break;
                }
                const last = messages[messages.length - 1];
                if (
                  last &&
                  last.role === 'assistant' &&
                  !last.youtubeConfirm?.sessionId
                ) {
                  hostMsgId = last.id;
                  hostPersistId = dbMessageIdOf(last) ?? undefined;
                  hostContent =
                    preferredContent ||
                    last.content.trim() ||
                    YT_CONFIRM_FALLBACK;
                  messages[messages.length - 1] = {
                    ...last,
                    content: hostContent,
                    typing: false,
                    choices: undefined,
                    youtubeConfirm: { sessionId: ytSessionId },
                  };
                  return { ...c, messages };
                }
                hostMsgId = nextTempId('a');
                hostPersistId = undefined;
                messages.push({
                  id: hostMsgId,
                  role: 'assistant',
                  content: hostContent,
                  youtubeConfirm: { sessionId: ytSessionId },
                });
                return { ...c, messages };
              }),
            );

            if (hostMsgId) activeAssistantId = hostMsgId;
            lastAssistantText = hostContent;
            pinListToBottom({ animated: false });

            if (!getAiLabYoutubeConfirmSession(ytSessionId)) {
              logNrmRunError(
                'ailab.ytConfirmUi',
                new Error('youtube_session_missing_at_ui'),
                { ytSessionId },
              );
            }

            const sid =
              (sessionIdForApi && /^\d+$/.test(sessionIdForApi) && sessionIdForApi) ||
              (currentConvId && /^\d+$/.test(currentConvId) ? currentConvId : null);
            const patchTargetId =
              (preferDbMessageId && /^\d+$/.test(preferDbMessageId)
                ? preferDbMessageId
                : null) ||
              hostPersistId ||
              (hostMsgId && /^\d+$/.test(hostMsgId) ? hostMsgId : null);

            if (serialNo && llmModelId != null && sid && patchTargetId) {
              // Edge finalize 행(또는 이미 DB id인 호스트)에 UiMeta PATCH — append 누락 방지
              await persistAiLabAssistantUiMeta({
                serialNo,
                sessionId: sid,
                messageId: patchTargetId,
                message: {
                  id: patchTargetId,
                  persistId: patchTargetId,
                  role: 'assistant',
                  content: hostContent,
                  youtubeConfirm: { sessionId: ytSessionId },
                },
              });
              setConversations((prev) =>
                prev.map((c) =>
                  c.id === currentConvId || c.id === sid
                    ? {
                        ...c,
                        messages: c.messages.map((m) =>
                          m.id === hostMsgId ||
                          m.persistId === patchTargetId ||
                          m.id === patchTargetId
                            ? {
                                ...m,
                                persistId: patchTargetId,
                                content: hostContent,
                                typing: false,
                                youtubeConfirm: { sessionId: ytSessionId },
                              }
                            : m,
                        ),
                      }
                    : c,
                ),
              );
              return;
            }

            if (!skippedAttach && serialNo && llmModelId != null && hostMsgId) {
              const hostMsg: NrmAiLabMessage = {
                id: hostMsgId,
                persistId: hostPersistId,
                role: 'assistant',
                content: hostContent,
                youtubeConfirm: { sessionId: ytSessionId },
              };
              const persisted = await persistAiLabYoutubeConfirmHost({
                serialNo,
                sessionId: sid,
                modelId: llmModelId,
                hostMsg,
              });
              if (!persisted || persisted.messages.length === 0) {
                logNrmRunError(
                  'ailab.ytConfirmUi',
                  new Error('persist_failed'),
                  { sessionId: sid, ytSessionId },
                );
                return;
              }
              setConversations((prev) =>
                applyPersistedLocalTurns(prev, {
                  convId: currentConvId,
                  tempIds: [hostMsgId],
                  persisted,
                }),
              );
              if (persisted.sessionId !== currentConvId) {
                adoptFlightSessionId(persisted.sessionId);
                setActiveId(persisted.sessionId);
                currentConvId = persisted.sessionId;
                sessionIdForApi = persisted.sessionId;
              }
            } else if (
              skippedAttach &&
              serialNo &&
              llmModelId != null &&
              (hostPersistId || (/^\d+$/.test(hostMsgId) ? hostMsgId : null))
            ) {
              const mid = hostPersistId || hostMsgId;
              if (sid) {
                await persistAiLabAssistantUiMeta({
                  serialNo,
                  sessionId: sid,
                  messageId: mid,
                  message: {
                    id: mid,
                    role: 'assistant',
                    content: hostContent,
                    youtubeConfirm: { sessionId: ytSessionId },
                  },
                });
              }
            }
          };
          if (selectedHit) {
            setConversations((prev) =>
              prev.map((c) =>
                c.id === currentConvId
                  ? {
                      ...c,
                      messages: c.messages.map((m) =>
                        m.id === tempAssistantId
                          ? {
                              ...m,
                              content: '음원을 확인하고 있습니다…',
                              typing: true,
                              choices: undefined,
                              youtubeConfirm: undefined,
                            }
                          : m,
                      ),
                    }
                  : c,
              ),
            );
            lastAssistantText = '음원을 확인하고 있습니다…';
            const pre = await executeAiLabDownloadTool(
              'start_music_download',
              { hit: selectedHit, lyricsOption: 'none' },
              { musicPlatformId: resolvedPlatform.platformId },
            );
            pendingAutoDownloadHit = null;
            const preOk = (pre.result as { ok?: boolean }).ok === true;
            if (!preOk) {
              const err = String((pre.result as { error?: unknown }).error ?? 'unknown');
              const errMsg = String((pre.result as { message?: unknown }).message ?? '');
              const failText =
                errMsg || `음원 후보를 찾지 못했습니다 (${err}).`;
              lastAssistantText = failText;
              logNrmRunError('ailab.preforce_download', new Error(err), {
                ref: selectedHit.ref,
                title: selectedHit.title,
              });
              setConversations((prev) =>
                prev.map((c) =>
                  c.id === currentConvId
                    ? {
                        ...c,
                        messages: c.messages.map((m) =>
                          m.id === tempAssistantId
                            ? { ...m, content: lastAssistantText, typing: false }
                            : m,
                        ),
                      }
                    : c,
                ),
              );
              clearSessionSending(flightSessionId);
              return;
            }
            const needsYt =
              (pre.result as { needsYoutubeConfirm?: boolean }).needsYoutubeConfirm === true;
            const ytSessionId = String(
              (pre.result as { youtubeConfirmSessionId?: unknown }).youtubeConfirmSessionId ??
                '',
            ).trim();
            if (needsYt && ytSessionId) {
              const label = String(
                (pre.result as { label?: unknown }).label ?? selectedHit.title,
              );
              lastAssistantText =
                AI_LAB_YOUTUBE_CONFIRM_USER_PROMPT;
              setConversations((prev) =>
                prev.map((c) =>
                  c.id === currentConvId
                    ? {
                        ...c,
                        messages: c.messages.map((m) =>
                          m.id === tempAssistantId
                            ? {
                                ...m,
                                content: lastAssistantText,
                                typing: false,
                                choices: undefined,
                                youtubeConfirm: { sessionId: ytSessionId },
                              }
                            : m.id === tempUserId
                              ? { ...m, pending: false }
                              : m,
                        ),
                      }
                    : c,
                ),
              );
              clearSessionSending(flightSessionId);
              pinListToBottom({ animated: false });
              if (serialNo && llmModelId != null) {
                const userPersist: NrmAiLabMessage = {
                  id: tempUserId,
                  role: 'user',
                  content: displayText,
                };
                const asstPersist: NrmAiLabMessage = {
                  id: tempAssistantId,
                  role: 'assistant',
                  content: lastAssistantText,
                  youtubeConfirm: { sessionId: ytSessionId },
                };
                void persistAiLabLocalMessages({
                  serialNo,
                  sessionId: sessionIdForApi && /^\d+$/.test(sessionIdForApi) ? sessionIdForApi : null,
                  modelId: llmModelId,
                  messages: [userPersist, asstPersist],
                }).then((persisted) => {
                  if (!persisted) return;
                  setConversations((prev) =>
                    applyPersistedLocalTurns(prev, {
                      convId: currentConvId,
                      tempIds: [tempUserId, tempAssistantId],
                      persisted,
                    }),
                  );
                  if (persisted.sessionId !== currentConvId) {
                    adoptFlightSessionId(persisted.sessionId);
                    setActiveId(persisted.sessionId);
                    currentConvId = persisted.sessionId;
                    sessionIdForApi = persisted.sessionId;
                  }
                });
              }
              void label;
              return;
            }
            // 하위 호환: 확인 없이 바로 다운로드된 경우
            downloadsStartedThisSend = 1;
            if (pre.choices && pre.choices.length > 0) {
              preforcedLyricsChoices = pre.choices;
            }
          }

          // DB/화면에는 사용자 라벨만. 선택 hit·다운로드 완료 여부는 body 필드로만 전달.
          for (let round = 0; round < MAX_AI_LAB_TOOL_ROUNDS; round += 1) {
            const pendingToolCalls: NrmLlmToolRequestEvent[] = [];
            let roundChoices: NrmAiLabChoice[] | undefined;

            if (toolContinue) {
              if (!suppressLlmAssistantUi) {
                setConversations((prev) =>
                  prev.map((c) => {
                    if (c.id !== currentConvId) return c;
                    const nextMessages = c.messages.map((m) => {
                      if (m.id !== activeAssistantId) return m;
                      // 미리듣기 호스트는 typing으로 바꾸지 않음 (카드가 !typing 조건에 가려짐)
                      if (m.youtubeConfirm?.sessionId) {
                        return { ...m, typing: false, choices: undefined };
                      }
                      return {
                        ...m,
                        content: '',
                        typing: true,
                        choices: undefined,
                      };
                    });
                    return {
                      ...c,
                      messages: withPreservedYoutubePlayers(c.messages, nextMessages),
                    };
                  }),
                );
              }
              gotFirstDelta = false;
            }

            const outcome = await sendLlmChatMessageStream(
              {
                serialNo,
                modelId: llmModelId,
                sessionId: sessionIdForApi,
                message: toolContinue ? '' : apiText,
                toolContinue,
                toolResults: toolContinue ? toolResults : undefined,
                previousInteractionId: toolContinue ? previousInteractionId : undefined,
                musicPlatformId: resolvedPlatform.platformId,
                musicPlatformLabel: resolvedPlatform.label,
                musicPlatformBlocked,
                musicPlatformExplicit: resolvedPlatform.explicit,
                trackSelectHit: !toolContinue ? selectedHit : undefined,
                downloadAlreadyStarted:
                  !toolContinue && selectedHit != null && downloadsStartedThisSend >= 1,
              },
              {
                onMeta: (meta) => {
                  if (toolContinue) {
                    if (meta.sessionId) {
                      adoptFlightSessionId(meta.sessionId);
                      sessionIdForApi = meta.sessionId;
                      currentConvId = meta.sessionId;
                    }
                    return;
                  }
                  const newConvId = meta.sessionId;
                  const prevTempId = currentConvId;
                  sessionIdForApi = newConvId;
                  adoptFlightSessionId(newConvId);
                  if (
                    isAiLabTempConversationId(prevTempId) &&
                    prevTempId !== newConvId
                  ) {
                    localTempToServerIdRef.current.set(prevTempId, newConvId);
                  }
                  // 서버 세션이 확정되면 pending 스냅샷을 비워 목록 refresh 고스트를 막는다.
                  pendingLocalConversationRef.current = null;
                  setConversations((prev) => {
                    const source =
                      prev.find((c) => c.id === prevTempId) ??
                      prev.find((c) => c.id === newConvId);
                    if (!source) {
                      return dedupeConversationsById(
                        prev.filter(
                          (c) =>
                            c.id !== prevTempId &&
                            localTempToServerIdRef.current.get(c.id) !== newConvId,
                        ),
                      );
                    }
                    const finalizedMessages = withPreservedYoutubePlayers(
                      source.messages,
                      source.messages.map((m) =>
                        m.id === tempUserId
                          ? { ...meta.userMessage, content: displayText, pending: false }
                          : m,
                      ),
                    );
                    const updatedConv: NrmAiLabConversation = {
                      ...source,
                      id: newConvId,
                      title: meta.title || source.title,
                      modelId: llmModelId,
                      messages: finalizedMessages,
                      messagesLoaded: true,
                    };
                    const rest = prev.filter(
                      (c) =>
                        c.id !== prevTempId &&
                        c.id !== newConvId &&
                        localTempToServerIdRef.current.get(c.id) !== newConvId,
                    );
                    return dedupeConversationsById([updatedConv, ...rest]);
                  });
                  if (currentConvId !== newConvId) {
                    currentConvId = newConvId;
                    setActiveId(newConvId);
                  }
                },
                onDelta: (chunk) => {
                  gotFirstDelta = true;
                  if (suppressLlmAssistantUi) return;
                  const convId = currentConvId;
                  const assistantId = activeAssistantId;
                  setConversations((prev) =>
                    prev.map((c) =>
                      c.id === convId
                        ? {
                            ...c,
                            messages: c.messages.map((m) => {
                              if (m.id !== assistantId) return m;
                              const next = m.content + chunk;
                              lastAssistantText = next;
                              return { ...m, content: next, typing: false };
                            }),
                          }
                        : c,
                    ),
                  );
                  pinListToBottomWhileStreaming();
                },
                onToolRequest: (ev) => {
                  pendingToolCalls.push(ev);
                },
                onFinal: async (final) => {
                  const choices =
                    (final.choices && final.choices.length > 0
                      ? final.choices
                      : lastToolChoices) ?? undefined;
                  const filteredChoices =
                    selectedHit && choices?.length
                      ? choices.filter((ch) => !isAiLabTrackChoiceId(ch.id))
                      : choices;
                  let mergedChoices =
                    (filteredChoices && filteredChoices.length > 0
                      ? filteredChoices
                      : preforcedLyricsChoices) ?? undefined;
                  if (
                    !userLikelyWantsDownload &&
                    lastChartInfoOnlyHit?.ref &&
                    !selectedHit
                  ) {
                    mergedChoices = resolveMelonChartInfoChoices({
                      userLikelyWantsDownload: false,
                      hits: [lastChartInfoOnlyHit],
                      toolChoices: mergedChoices,
                    });
                  } else if (
                    !userLikelyWantsDownload &&
                    mergedChoices?.some((ch) => isAiLabTrackChoiceId(ch.id))
                  ) {
                    mergedChoices = mergedChoices.filter((ch) => !isAiLabTrackChoiceId(ch.id));
                    if (mergedChoices.length === 0) mergedChoices = undefined;
                  }
                  const agentUi = parseAgentUiFromDiag(final.diag);
                  const convId = currentConvId;
                  const finalSessionId = String(final.sessionId ?? '').trim();
                  if (finalSessionId) {
                    adoptFlightSessionId(finalSessionId);
                    currentConvId = finalSessionId;
                  }
                  let finalContent = String(final.message.content ?? '');
                  if (mergedChoices?.some((ch) => isAiLabDownloadChoiceId(ch.id))) {
                    finalContent = appendDownloadAskPrompt(finalContent);
                  }
                  if (youtubeConfirmSessionIdFromTools && !finalContent.trim()) {
                    finalContent = AI_LAB_YOUTUBE_CONFIRM_USER_PROMPT;
                  }
                  if (finalContent) lastAssistantText = finalContent;

                  if (suppressLlmAssistantUi || melonChartPlayerShown) {
                    removeEmptyAssistant(activeAssistantId);
                    setConversations((prev) =>
                      prev.map((c) => {
                        if (c.id !== convId && c.id !== finalSessionId) return c;
                        const nextMessages = c.messages.map((m) => {
                          if (m.id === tempUserId) {
                            return { ...m, content: displayText, pending: false };
                          }
                          if (
                            youtubeConfirmSessionIdFromTools &&
                            (m.youtubeConfirm?.sessionId === youtubeConfirmSessionIdFromTools ||
                              m.id === activeAssistantId)
                          ) {
                            return {
                              ...m,
                              content:
                                (m.content || '').trim() ||
                                finalContent ||
                                AI_LAB_YOUTUBE_CONFIRM_USER_PROMPT,
                              typing: false,
                              choices: undefined,
                              youtubeConfirm: {
                                sessionId: youtubeConfirmSessionIdFromTools,
                              },
                            };
                          }
                          return m;
                        });
                        return {
                          ...c,
                          id: finalSessionId || c.id,
                          modelId: llmModelId,
                          updatedAtLabel: '지금',
                          updatedAtIso: new Date().toISOString(),
                          messagesLoaded: true,
                          messages: withPreservedYoutubePlayers(c.messages, nextMessages),
                        };
                      }),
                    );
                    pinListToBottom({ animated: false });
                    // Edge finalize 행(안내 문구)에도 youtubeConfirm UiMeta를 붙인다.
                    // suppress 시 여기까지 안 오면 DB에는 텍스트만 남고 재진입 시 플레이어가 사라짐.
                    const dbAssistantId = String(final.message.id ?? '').trim();
                    if (
                      serialNo &&
                      finalSessionId &&
                      /^\d+$/.test(dbAssistantId) &&
                      youtubeConfirmSessionIdFromTools
                    ) {
                      lastDbAssistantMessageId = dbAssistantId;
                      await persistAiLabAssistantUiMeta({
                        serialNo,
                        sessionId: finalSessionId,
                        messageId: dbAssistantId,
                        message: {
                          id: dbAssistantId,
                          role: 'assistant',
                          content:
                            finalContent.trim() ||
                            AI_LAB_YOUTUBE_CONFIRM_USER_PROMPT,
                          youtubeConfirm: {
                            sessionId: youtubeConfirmSessionIdFromTools,
                          },
                        },
                      });
                    }
                    return;
                  }

                  const assistantId = activeAssistantId;
                  const dbAssistantId = String(final.message.id ?? '').trim();
                  if (/^\d+$/.test(dbAssistantId)) {
                    lastDbAssistantMessageId = dbAssistantId;
                  }
                  setConversations((prev) =>
                    prev.map((c) => {
                      if (c.id !== convId && c.id !== finalSessionId) return c;
                      const nextMessages = c.messages.map((m) =>
                        m.id === assistantId
                          ? {
                              // FlatList key를 유지해 MessageEnter가 opacity 0으로 재마운트되지 않게 함
                              ...final.message,
                              id: assistantId,
                              persistId: /^\d+$/.test(dbAssistantId) ? dbAssistantId : undefined,
                              content: finalContent || m.content || '',
                              choices:
                                mergedChoices && mergedChoices.length > 0
                                  ? mergedChoices
                                  : undefined,
                              youtubeConfirm: youtubeConfirmSessionIdFromTools
                                ? { sessionId: youtubeConfirmSessionIdFromTools }
                                : m.youtubeConfirm,
                              agentUi,
                              typing: false,
                              pending: false,
                            }
                          : m.id === tempUserId
                            ? {
                                ...m,
                                content: displayText,
                                pending: false,
                                persistId: undefined,
                              }
                            : m,
                      );
                      return {
                        ...c,
                        id: finalSessionId || c.id,
                        modelId: llmModelId,
                        updatedAtLabel: '지금',
                        updatedAtIso: new Date().toISOString(),
                        messagesLoaded: true,
                        messages: withPreservedYoutubePlayers(c.messages, nextMessages),
                      };
                    }),
                  );
                  pinListToBottom({ animated: false });
                  if (
                    serialNo &&
                    finalSessionId &&
                    /^\d+$/.test(dbAssistantId) &&
                    ((mergedChoices && mergedChoices.length > 0) ||
                      agentUi ||
                      youtubeConfirmSessionIdFromTools)
                  ) {
                    await persistAiLabAssistantUiMeta({
                      serialNo,
                      sessionId: finalSessionId,
                      messageId: dbAssistantId,
                      message: {
                        id: dbAssistantId,
                        role: 'assistant',
                        content: finalContent,
                        choices:
                          mergedChoices && mergedChoices.length > 0
                            ? mergedChoices
                            : undefined,
                        youtubeConfirm: youtubeConfirmSessionIdFromTools
                          ? { sessionId: youtubeConfirmSessionIdFromTools }
                          : undefined,
                        agentUi,
                      },
                    });
                  }
                },
                onTitleUpdated: ({ sessionId, title: newTitle }) => {
                  setConversations((prev) =>
                    prev.map((c) =>
                      c.id === sessionId || c.id === currentConvId
                        ? { ...c, title: newTitle }
                        : c,
                    ),
                  );
                },
              },
            );

            if (outcome.kind !== 'tool_turn') {
              break;
            }

            previousInteractionId = outcome.previousInteractionId ?? null;

            const nextResults: NrmLlmToolResultPayload[] = [];
            for (const call of pendingToolCalls) {
              if (
                isAiLabStartDownloadToolName(call.name) &&
                (downloadsStartedThisSend >= 1 ||
                  melonChartPlayerShown ||
                  Boolean(youtubeConfirmSessionIdFromTools))
              ) {
                const blocked = aiLabOneDownloadPerRequestResult();
                nextResults.push({
                  callId: call.callId,
                  name: call.name,
                  args: call.args,
                  response: blocked.result,
                });
                continue;
              }

              // 트랙 칩 선택 후 모델이 재검색하면 → 선택 hit 1건으로 바꿔 루프 차단
              if (
                selectedHit &&
                (call.name === 'search_music' ||
                  call.name === 'search_track_on_platform' ||
                  call.name === 'search_music_artist' ||
                  call.name === 'search_music_album')
              ) {
                nextResults.push({
                  callId: call.callId,
                  name: call.name,
                  args: call.args,
                  response: {
                    ok: true,
                    hits: [selectedHit],
                    count: 1,
                    kind: 'track',
                    redirectedFromSearch: true,
                    nextHint:
                      '이미 사용자가 곡을 선택함. start_music_download(이 hit, lyricsOption=none) 필수. 재검색·choices 금지.',
                  },
                });
                continue;
              }

              let callArgs = call.args;
              if (selectedHit && isAiLabStartDownloadToolName(call.name)) {
                callArgs = {
                  ...call.args,
                  hit: selectedHit,
                  lyricsOption:
                    call.args.lyricsOption != null ? call.args.lyricsOption : 'none',
                };
              }

              if (call.name === 'search_melon_chart' && userLikelyWantsDownload) {
                patchAssistant(activeAssistantId, {
                  content: aiLabMelonChartCheckingMessage(),
                  typing: false,
                  choices: undefined,
                  youtubeConfirm: undefined,
                });
                lastAssistantText = aiLabMelonChartCheckingMessage();
                melonChartCheckingShown = true;
                await sleepMs(280);
                activeAssistantId = appendAssistant({ content: '', typing: true });
              }

              const out = await executeAiLabDownloadTool(call.name, callArgs, {
                musicPlatformId: resolvedPlatform.platformId,
              });
              if (
                (call.name === 'search_music' ||
                  call.name === 'search_track_on_platform' ||
                  call.name === 'search_melon_chart') &&
                !selectedHit
              ) {
                const hits = (out.result as { hits?: NrmAiLabTrackHit[]; count?: number }).hits;
                const count = Number(
                  (out.result as { count?: number }).count ?? hits?.length ?? 0,
                );
                if (count === 1 && hits?.[0]?.title && hits[0]?.artist) {
                  pendingAutoDownloadHit =
                    call.name === 'search_melon_chart' && !userLikelyWantsDownload
                      ? null
                      : hits[0];
                } else if (count > 1) {
                  pendingAutoDownloadHit = null;
                }
              }
              if (call.name === 'search_melon_chart' && !userLikelyWantsDownload) {
                const hits = (out.result as { hits?: NrmAiLabTrackHit[] }).hits ?? [];
                const resolved = resolveMelonChartInfoChoices({
                  userLikelyWantsDownload: false,
                  hits,
                  toolChoices: out.choices,
                });
                lastChartInfoOnlyHit =
                  hits.length === 1 && hits[0]?.title && hits[0]?.artist ? hits[0] : null;
                if (resolved && resolved.length > 0) {
                  roundChoices = resolved;
                } else if (out.choices && out.choices.length > 0) {
                  roundChoices = out.choices;
                }
              } else if (out.choices && out.choices.length > 0) {
                if (selectedHit) {
                  const nonTrack = out.choices.filter((ch) => !isAiLabTrackChoiceId(ch.id));
                  if (nonTrack.length > 0) roundChoices = nonTrack;
                } else {
                  roundChoices = out.choices;
                }
              }
              if (call.name === 'search_melon_chart' && melonChartCheckingShown) {
                const hits = (out.result as { hits?: NrmAiLabTrackHit[] }).hits;
                const count = Number(
                  (out.result as { count?: number }).count ?? hits?.length ?? 0,
                );
                const period = String(
                  (out.result as { period?: unknown }).period ??
                    (out.result as { resolvedPeriod?: unknown }).resolvedPeriod ??
                    callArgs.period ??
                    '',
                ).trim();
                if (count === 1 && hits?.[0]?.title && hits[0]?.artist) {
                  melonChartUiActive = true;
                  melonChartHit = hits[0];
                  melonChartPeriod = period || 'realtime';
                  removeEmptyAssistant(activeAssistantId);
                  await sleepMs(320);
                  appendAssistant({
                    content: aiLabMelonChartIdentifiedMessage(hits[0]),
                    typing: false,
                  });
                  lastAssistantText = aiLabMelonChartIdentifiedMessage(hits[0]);
                  activeAssistantId = appendAssistant({ content: '', typing: true });
                } else {
                  melonChartUiActive = false;
                  melonChartHit = null;
                }
              }
              if (isAiLabStartDownloadToolName(call.name)) {
                const needsYt =
                  (out.result as { needsYoutubeConfirm?: boolean }).needsYoutubeConfirm ===
                  true;
                const ytSid = String(
                  (out.result as { youtubeConfirmSessionId?: unknown })
                    .youtubeConfirmSessionId ?? '',
                ).trim();
                if (needsYt && ytSid) {
                  youtubeConfirmSessionIdFromTools = ytSid;
                  await presentYoutubeConfirmUi(ytSid, lastDbAssistantMessageId);
                } else {
                  const err = String(
                    (out.result as { error?: unknown } | undefined)?.error ?? '',
                  );
                  // 가사 미선택·hit 누락은 아직 다운로드 시도가 아님
                  if (err !== 'lyrics_option_required' && err !== 'missing_hit') {
                    downloadsStartedThisSend += 1;
                  }
                }
              }
              nextResults.push({
                callId: call.callId,
                name: call.name,
                args: callArgs,
                response: out.result,
              });
            }
            if (roundChoices) lastToolChoices = roundChoices;
            toolResults = nextResults;
            toolContinue = true;
            if (nextResults.length === 0) {
              throw new NrmLlmChatSendError('stream_error', 'llm-chat-send: empty_tool_requests');
            }
            if (round === MAX_AI_LAB_TOOL_ROUNDS - 1) {
              throw new NrmLlmChatSendError('stream_error', 'llm-chat-send: tool_rounds_exceeded');
            }
          }

          // 모델이 「다운로드를 진행합니다」만 말하고 start_music_download를 안 부른 경우
          // → YouTube 확인 단계부터 강제 시작
          const shouldForceDownload =
            downloadsStartedThisSend === 0 &&
            !youtubeConfirmSessionIdFromTools &&
            pendingAutoDownloadHit != null &&
            (selectedHit != null ||
              userLikelyWantsDownload ||
              /다운로드를 진행/.test(lastAssistantText));
          if (shouldForceDownload && pendingAutoDownloadHit) {
            const forcedHit = pendingAutoDownloadHit;
            const out = await executeAiLabDownloadTool(
              'start_music_download',
              { hit: forcedHit, lyricsOption: 'none' },
              { musicPlatformId: resolvedPlatform.platformId },
            );
            const ok = (out.result as { ok?: boolean }).ok === true;
            const err = String((out.result as { error?: unknown }).error ?? '');
            const errMsg = String((out.result as { message?: unknown }).message ?? '');
            const needsYt =
              (out.result as { needsYoutubeConfirm?: boolean }).needsYoutubeConfirm === true;
            const ytSid = String(
              (out.result as { youtubeConfirmSessionId?: unknown }).youtubeConfirmSessionId ??
                '',
            ).trim();
            if (ok && needsYt && ytSid) {
              youtubeConfirmSessionIdFromTools = ytSid;
              // onFinal이 이미 Edge 행을 만든 뒤 force 미리듣기가 붙는 경우가 많음 → 그 MessageID에 PATCH
              await presentYoutubeConfirmUi(ytSid, lastDbAssistantMessageId);
            } else {
              downloadsStartedThisSend = 1;
              let extra = '';
              let forceChoices: NrmAiLabChoice[] | undefined;
              if (!ok) {
                extra =
                  errMsg || `다운로드를 시작하지 못했습니다 (${err || 'unknown'}).`;
                logNrmRunError('ailab.force_download', new Error(err || 'force_download_failed'), {
                  ref: forcedHit.ref,
                  title: forcedHit.title,
                });
              } else if (out.choices && out.choices.length > 0) {
                extra = '가사도 생성을 할까요?';
                forceChoices = out.choices;
              }
              const assistantId = activeAssistantId;
              setConversations((prev) =>
                prev.map((c) => {
                  if (c.id !== currentConvId) return c;
                  return {
                    ...c,
                    messages: c.messages.map((m) => {
                      if (m.id !== assistantId) return m;
                      const base = (m.content || '').trim() || '다운로드를 진행합니다.';
                      const withAnnounce = /다운로드를 진행/.test(base)
                        ? base
                        : `다운로드를 진행합니다.\n\n${base}`;
                      return {
                        ...m,
                        content: extra ? `${withAnnounce}\n\n${extra}` : withAnnounce,
                        typing: false,
                        choices: forceChoices ?? m.choices,
                      };
                    }),
                  };
                }),
              );
              pinListToBottom({ animated: false });
            }
          }
        } catch (e) {
          logNrmRunError('ailab.send', e, {
            sourceConvId,
            isNewConversation: !targetId,
            modelId: llmModelId,
            messageLength: apiText.length,
            gotFirstDelta,
          });
          const sysMsg: NrmAiLabMessage = {
            id: nextTempId('s'),
            role: 'system',
            content: aiLabSendErrorText(e),
          };
          setConversations((prev) =>
            prev.map((c) =>
              c.id === currentConvId
                ? {
                    ...c,
                    messages: c.messages
                      .filter((m) => m.id !== tempAssistantId)
                      .map((m) => (m.id === tempUserId ? { ...m, pending: false } : m))
                      .concat(sysMsg),
                  }
                : c,
            ),
          );
        } finally {
          clearSessionSending(flightSessionId);
          pinListToBottom({ animated: false });
        }
      })();
    },
    [activeId, clearSessionSending, isSessionSending, llmModelId, markSessionSending, musicPlatformId, pinListToBottom, pinListToBottomWhileStreaming, serialNo, transferSessionSending],
  );

  const handleSend = useCallback(() => {
    const text = draft.trim();
    if (!text || activeSessionSending || !serialNo || llmModelId == null) return;
    setDraft('');
    sendUserText(text);
  }, [activeSessionSending, draft, llmModelId, sendUserText, serialNo]);

  const handleChoicePress = useCallback(
    (choice: NrmAiLabChoice, messageId?: string) => {
      if (activeSessionSending || !serialNo || llmModelId == null) return;
      if (isAiLabMoreMusicListChoiceId(choice.id)) {
        const convId = activeIdRef.current;
        if (!convId) return;
        const userMsg: NrmAiLabMessage = {
          id: nextTempId('u'),
          role: 'user',
          content: choice.label,
        };
        void (async () => {
          const next = await advanceAiLabMusicListPage();
          const assistantMsg: NrmAiLabMessage = next.ok
            ? {
                id: nextTempId('a'),
                role: 'assistant',
                content: next.prompt,
                choices: next.choices,
              }
            : {
                id: nextTempId('a'),
                role: 'assistant',
                content: next.message,
              };
          const hostMessages =
            conversations.find((c) => c.id === convId)?.messages ?? [];
          const clearIds = hostMessages
            .filter((m) => m.choices?.some((ch) => isAiLabMoreMusicListChoiceId(ch.id)))
            .map((m) => dbMessageIdOf(m))
            .filter((id): id is string => id != null);
          setConversations((prev) =>
            prev.map((c) =>
              c.id === convId
                ? {
                    ...c,
                    messages: [
                      ...c.messages.map((m) =>
                        m.choices?.some((ch) => isAiLabMoreMusicListChoiceId(ch.id))
                          ? { ...m, choices: undefined }
                          : m,
                      ),
                      userMsg,
                      assistantMsg,
                    ],
                    updatedAtLabel: '지금',
                    updatedAtIso: new Date().toISOString(),
                  }
                : c,
            ),
          );
          stickToBottomRef.current = true;
          requestAnimationFrame(() => {
            listRef.current?.scrollToEnd({ animated: true });
          });
          if (serialNo && llmModelId != null) {
            const persisted = await persistAiLabLocalMessages({
              serialNo,
              sessionId: /^\d+$/.test(convId) ? convId : null,
              modelId: llmModelId,
              messages: [userMsg, assistantMsg],
              clearInteractiveMessageIds: clearIds,
              clearInteractiveMode: 'choices',
              clearInteractiveSourceMessages: hostMessages,
            });
            if (persisted) {
              setConversations((prev) =>
                applyPersistedLocalTurns(prev, {
                  convId,
                  tempIds: [userMsg.id, assistantMsg.id],
                  clearInteractiveIds: clearIds,
                  clearInteractiveMode: 'choices',
                  persisted,
                }),
              );
              if (persisted.sessionId !== convId) setActiveId(persisted.sessionId);
            }
          }
        })();
        return;
      }
      if (isAiLabLyricsChoiceId(choice.id)) {
        const convId = activeIdRef.current;
        if (!convId) return;
        const userMsg: NrmAiLabMessage = {
          id: nextTempId('u'),
          role: 'user',
          content: choice.label,
        };
        void (async () => {
          let assistantContent: string;
          let assistantChoices: NrmAiLabChoice[] | undefined;
          if (choice.id === 'lyrics_yes') {
            const out = await startAiLabLyrics({});
            if (out.ok !== true) {
              assistantContent = String(
                out.message ?? '가사 생성을 시작하지 못했습니다. 잠시 후 다시 시도해 주세요.',
              );
            } else if (out.askTranslation === true) {
              assistantContent =
                '가사 생성을 시작했습니다. 영문 가사로 보여 번역도 할까요? 완료되면 알림으로 알려 드릴게요.';
              assistantChoices = TRANSLATE_YES_NO_CHOICES;
            } else {
              assistantContent =
                '가사 생성을 시작했습니다. 완료되면 알림으로 알려 드릴게요.';
            }
          } else {
            assistantContent = '알겠습니다. 가사 생성은 진행하지 않습니다.';
          }
          const assistantMsg: NrmAiLabMessage = {
            id: nextTempId('a'),
            role: 'assistant',
            content: assistantContent,
            choices: assistantChoices,
          };
          const hostMessages =
            conversations.find((c) => c.id === convId)?.messages ?? [];
          const clearIds = hostMessages
            .filter((m) => m.choices?.some((ch) => isAiLabLyricsChoiceId(ch.id)))
            .map((m) => dbMessageIdOf(m))
            .filter((id): id is string => id != null);
          setConversations((prev) =>
            prev.map((c) => {
              if (c.id !== convId) return c;
              return {
                ...c,
                messages: [
                  ...c.messages.map((m) =>
                    m.choices?.some((ch) => isAiLabLyricsChoiceId(ch.id))
                      ? { ...m, choices: undefined }
                      : m,
                  ),
                  userMsg,
                  assistantMsg,
                ],
                updatedAtLabel: '지금',
                updatedAtIso: new Date().toISOString(),
              };
            }),
          );
          stickToBottomRef.current = true;
          requestAnimationFrame(() => {
            listRef.current?.scrollToEnd({ animated: true });
          });
          if (serialNo && llmModelId != null) {
            const persisted = await persistAiLabLocalMessages({
              serialNo,
              sessionId: /^\d+$/.test(convId) ? convId : null,
              modelId: llmModelId,
              messages: [userMsg, assistantMsg],
              clearInteractiveMessageIds: clearIds,
              clearInteractiveMode: 'choices',
              clearInteractiveSourceMessages: hostMessages,
            });
            if (persisted) {
              setConversations((prev) =>
                applyPersistedLocalTurns(prev, {
                  convId,
                  tempIds: [userMsg.id, assistantMsg.id],
                  clearInteractiveIds: clearIds,
                  clearInteractiveMode: 'choices',
                  persisted,
                }),
              );
              if (persisted.sessionId !== convId) setActiveId(persisted.sessionId);
            }
          }
        })();
        return;
      }
      if (isAiLabTranslateChoiceId(choice.id)) {
        const convId = activeIdRef.current;
        if (!convId) return;
        const userMsg: NrmAiLabMessage = {
          id: nextTempId('u'),
          role: 'user',
          content: choice.label,
        };
        void (async () => {
          let assistantContent: string;
          if (choice.id === 'translate_yes') {
            const out = await acceptAiLabTranslation();
            if (out.ok !== true) {
              assistantContent = String(
                out.message ?? '번역을 시작하지 못했습니다. 잠시 후 다시 시도해 주세요.',
              );
            } else if (out.waitingForLyrics === true) {
              assistantContent =
                '알겠습니다. 가사 생성이 끝나는 대로 Google Translator로 한국어 번역을 진행합니다.';
            } else {
              assistantContent =
                '한국어 번역을 시작했습니다. 완료되면 알림으로 알려 드릴게요.';
            }
          } else {
            declineAiLabTranslation();
            assistantContent = '알겠습니다. 번역 없이 영문 가사만 유지합니다.';
          }
          const assistantMsg: NrmAiLabMessage = {
            id: nextTempId('a'),
            role: 'assistant',
            content: assistantContent,
          };
          const hostMessages =
            conversations.find((c) => c.id === convId)?.messages ?? [];
          const clearIds = hostMessages
            .filter((m) => m.choices?.some((ch) => isAiLabTranslateChoiceId(ch.id)))
            .map((m) => dbMessageIdOf(m))
            .filter((id): id is string => id != null);
          setConversations((prev) =>
            prev.map((c) => {
              if (c.id !== convId) return c;
              return {
                ...c,
                messages: [
                  ...c.messages.map((m) =>
                    m.choices?.some((ch) => isAiLabTranslateChoiceId(ch.id))
                      ? { ...m, choices: undefined }
                      : m,
                  ),
                  userMsg,
                  assistantMsg,
                ],
                updatedAtLabel: '지금',
                updatedAtIso: new Date().toISOString(),
              };
            }),
          );
          stickToBottomRef.current = true;
          requestAnimationFrame(() => {
            listRef.current?.scrollToEnd({ animated: true });
          });
          if (serialNo && llmModelId != null) {
            const persisted = await persistAiLabLocalMessages({
              serialNo,
              sessionId: /^\d+$/.test(convId) ? convId : null,
              modelId: llmModelId,
              messages: [userMsg, assistantMsg],
              clearInteractiveMessageIds: clearIds,
              clearInteractiveMode: 'choices',
              clearInteractiveSourceMessages: hostMessages,
            });
            if (persisted) {
              setConversations((prev) =>
                applyPersistedLocalTurns(prev, {
                  convId,
                  tempIds: [userMsg.id, assistantMsg.id],
                  clearInteractiveIds: clearIds,
                  clearInteractiveMode: 'choices',
                  persisted,
                }),
              );
              if (persisted.sessionId !== convId) setActiveId(persisted.sessionId);
            }
          }
        })();
        return;
      }
      if (isAiLabMelonSearchChoiceId(choice.id)) {
        const convId = activeIdRef.current;
        if (!convId) return;
        const stripMelonChoicesOn = (messages: NrmAiLabMessage[], hostId?: string) =>
          messages.map((m) => {
            if (hostId && m.id !== hostId) return m;
            if (!m.choices?.some((ch) => isAiLabMelonSearchChoiceId(ch.id))) return m;
            return { ...m, choices: undefined };
          });
        if (choice.id === 'melon_search_no') {
          const userMsg: NrmAiLabMessage = {
            id: nextTempId('u'),
            role: 'user',
            content: choice.label,
          };
          const assistantMsg: NrmAiLabMessage = {
            id: nextTempId('a'),
            role: 'assistant',
            content: '알겠습니다. Melon 검색은 진행하지 않습니다.',
          };
          let clearIds: string[] = [];
          let hostMessages: NrmAiLabMessage[] = [];
          setConversations((prev) =>
            prev.map((c) => {
              if (c.id !== convId) return c;
              hostMessages = c.messages;
              clearIds = c.messages
                .filter((m) => {
                  if (messageId && m.id !== messageId) return false;
                  return m.choices?.some((ch) => isAiLabMelonSearchChoiceId(ch.id)) === true;
                })
                .map((m) => dbMessageIdOf(m))
                .filter((id): id is string => id != null);
              return {
                ...c,
                messages: [
                  ...stripMelonChoicesOn(c.messages, messageId),
                  userMsg,
                  assistantMsg,
                ],
                updatedAtLabel: '지금',
                updatedAtIso: new Date().toISOString(),
              };
            }),
          );
          stickToBottomRef.current = true;
          requestAnimationFrame(() => {
            listRef.current?.scrollToEnd({ animated: true });
          });
          if (serialNo && llmModelId != null) {
            void persistAiLabLocalMessages({
              serialNo,
              sessionId: /^\d+$/.test(convId) ? convId : null,
              modelId: llmModelId,
              messages: [userMsg, assistantMsg],
              clearInteractiveMessageIds: clearIds,
              clearInteractiveMode: 'choices',
              clearInteractiveSourceMessages: hostMessages,
            }).then((persisted) => {
              if (!persisted) return;
              setConversations((prev) =>
                applyPersistedLocalTurns(prev, {
                  convId,
                  tempIds: [userMsg.id, assistantMsg.id],
                  clearInteractiveIds: clearIds,
                  clearInteractiveMode: 'choices',
                  persisted,
                }),
              );
              if (persisted.sessionId !== convId) setActiveId(persisted.sessionId);
            });
          }
          return;
        }
        let original = '';
        setConversations((prev) =>
          prev.map((c) => {
            if (c.id !== convId) return c;
            const idx = messageId
              ? c.messages.findIndex((m) => m.id === messageId)
              : c.messages.findIndex((m) =>
                  m.choices?.some((ch) => isAiLabMelonSearchChoiceId(ch.id)),
                );
            if (idx > 0) {
              for (let i = idx - 1; i >= 0; i -= 1) {
                const prevMsg = c.messages[i];
                if (prevMsg?.role !== 'user') continue;
                const content = prevMsg.content.trim();
                // 이전 「예, Melon으로 검색」 칩 클릭·폴백 재전송은 건너뛰고 진짜 원요청을 찾는다
                if (isAiLabMelonSearchChoiceUserText(content)) continue;
                original = content;
                break;
              }
            }
            return {
              ...c,
              messages: stripMelonChoicesOn(c.messages, messageId ?? c.messages[idx]?.id),
            };
          }),
        );
        sendUserText(choice.label, {
          displayText: choice.label,
          apiMessage: rewriteAiLabQueryForMelonFallback(original || choice.label),
          forceMusicPlatformId: MusicPlatformId.MELON,
        });
        return;
      }
      if (isAiLabDownloadChoiceId(choice.id)) {
        const convId = activeIdRef.current;
        if (!convId) return;
        setConversations((prev) =>
          prev.map((c) => {
            if (c.id !== convId) return c;
            return {
              ...c,
              messages: c.messages.map((m) =>
                m.id === messageId ||
                m.choices?.some((ch) => isAiLabDownloadChoiceId(ch.id))
                  ? { ...m, choices: undefined }
                  : m,
              ),
            };
          }),
        );
        if (isAiLabDownloadYesChoiceId(choice.id)) {
          const ref = hitRefFromDownloadYesChoiceId(choice.id);
          const hit = ref ? getCachedAiLabTrackHit(ref) : undefined;
          if (!hit) {
            const userMsg: NrmAiLabMessage = {
              id: nextTempId('u'),
              role: 'user',
              content: '예',
            };
            const assistantMsg: NrmAiLabMessage = {
              id: nextTempId('a'),
              role: 'assistant',
              content:
                '곡 정보를 찾지 못했습니다. 차트 질문을 다시 보낸 뒤 「예」를 선택해 주세요.',
            };
            setConversations((prev) =>
              prev.map((c) =>
                c.id === convId
                  ? {
                      ...c,
                      messages: [
                        ...c.messages.map((m) =>
                          m.id === messageId ||
                          m.choices?.some((ch) => isAiLabDownloadChoiceId(ch.id))
                            ? { ...m, choices: undefined }
                            : m,
                        ),
                        userMsg,
                        assistantMsg,
                      ],
                      updatedAtLabel: '지금',
                      updatedAtIso: new Date().toISOString(),
                    }
                  : c,
              ),
            );
            return;
          }
          const userMsg: NrmAiLabMessage = {
            id: nextTempId('u'),
            role: 'user',
            content: '예',
          };
          const asstId = nextTempId('a');
          const hostMessages = conversations.find((c) => c.id === convId)?.messages ?? [];
          const clearIds = hostMessages
            .filter((m) => m.choices?.some((ch) => isAiLabDownloadChoiceId(ch.id)))
            .map((m) => dbMessageIdOf(m))
            .filter((id): id is string => id != null);
          setConversations((prev) =>
            prev.map((c) =>
              c.id === convId
                ? {
                    ...c,
                    messages: [
                      ...c.messages.map((m) =>
                        m.id === messageId ||
                        m.choices?.some((ch) => isAiLabDownloadChoiceId(ch.id))
                          ? { ...m, choices: undefined }
                          : m,
                      ),
                      userMsg,
                      {
                        id: asstId,
                        role: 'assistant',
                        content: '음원을 확인하고 있습니다…',
                        typing: true,
                      },
                    ],
                    updatedAtLabel: '지금',
                    updatedAtIso: new Date().toISOString(),
                  }
                : c,
            ),
          );
          stickToBottomRef.current = true;
          requestAnimationFrame(() => {
            listRef.current?.scrollToEnd({ animated: true });
          });
          void (async () => {
            const platform = await resolveAiLabMusicPlatformForMessage('', musicPlatformId);
            const pre = await executeAiLabDownloadTool(
              'start_music_download',
              { hit, lyricsOption: 'none' },
              { musicPlatformId: platform.platformId },
            );
            const preOk = (pre.result as { ok?: boolean }).ok === true;
            if (!preOk) {
              const errMsg = String((pre.result as { message?: unknown }).message ?? '');
              const err = String((pre.result as { error?: unknown }).error ?? 'unknown');
              const failText = errMsg || `음원 후보를 찾지 못했습니다 (${err}).`;
              setConversations((prev) =>
                prev.map((c) =>
                  c.id === convId
                    ? {
                        ...c,
                        messages: c.messages.map((m) =>
                          m.id === asstId
                            ? { ...m, content: failText, typing: false }
                            : m,
                        ),
                      }
                    : c,
                ),
              );
              return;
            }
            const needsYt =
              (pre.result as { needsYoutubeConfirm?: boolean }).needsYoutubeConfirm === true;
            const ytSessionId = String(
              (pre.result as { youtubeConfirmSessionId?: unknown }).youtubeConfirmSessionId ??
                '',
            ).trim();
            if (!needsYt || !ytSessionId) {
              setConversations((prev) =>
                prev.map((c) =>
                  c.id === convId
                    ? {
                        ...c,
                        messages: c.messages.map((m) =>
                          m.id === asstId
                            ? {
                                ...m,
                                content: '다운로드 확인 UI를 표시하지 못했습니다. 다시 시도해 주세요.',
                                typing: false,
                              }
                            : m,
                        ),
                      }
                    : c,
                ),
              );
              return;
            }
            const confirmText = AI_LAB_YOUTUBE_CONFIRM_USER_PROMPT;
            const assistantMsg: NrmAiLabMessage = {
              id: asstId,
              role: 'assistant',
              content: confirmText,
              youtubeConfirm: { sessionId: ytSessionId },
            };
            setConversations((prev) =>
              prev.map((c) =>
                c.id === convId
                  ? {
                      ...c,
                      messages: c.messages.map((m) => (m.id === asstId ? assistantMsg : m)),
                    }
                  : c,
              ),
            );
            if (serialNo && llmModelId != null) {
              const persisted = await persistAiLabLocalMessages({
                serialNo,
                sessionId: /^\d+$/.test(convId) ? convId : null,
                modelId: llmModelId,
                messages: [userMsg, assistantMsg],
                clearInteractiveMessageIds: clearIds,
                clearInteractiveMode: 'choices',
                clearInteractiveSourceMessages: hostMessages,
              });
              if (persisted) {
                setConversations((prev) =>
                  applyPersistedLocalTurns(prev, {
                    convId,
                    tempIds: [userMsg.id, asstId],
                    clearInteractiveIds: clearIds,
                    clearInteractiveMode: 'choices',
                    persisted,
                  }),
                );
                if (persisted.sessionId !== convId) setActiveId(persisted.sessionId);
              }
            }
          })();
          return;
        }
        const userMsg: NrmAiLabMessage = {
          id: nextTempId('u'),
          role: 'user',
          content: choice.label,
        };
        const assistantMsg: NrmAiLabMessage = {
          id: nextTempId('a'),
          role: 'assistant',
          content: '알겠습니다. 다운로드는 진행하지 않습니다.',
        };
        const hostMessages = conversations.find((c) => c.id === convId)?.messages ?? [];
        const clearIds = hostMessages
          .filter((m) => m.choices?.some((ch) => isAiLabDownloadChoiceId(ch.id)))
          .map((m) => dbMessageIdOf(m))
          .filter((id): id is string => id != null);
        setConversations((prev) =>
          prev.map((c) =>
            c.id === convId
              ? {
                  ...c,
                  messages: [...c.messages, userMsg, assistantMsg],
                  updatedAtLabel: '지금',
                  updatedAtIso: new Date().toISOString(),
                }
              : c,
          ),
        );
        stickToBottomRef.current = true;
        requestAnimationFrame(() => {
          listRef.current?.scrollToEnd({ animated: true });
        });
        if (serialNo && llmModelId != null) {
          void persistAiLabLocalMessages({
            serialNo,
            sessionId: /^\d+$/.test(convId) ? convId : null,
            modelId: llmModelId,
            messages: [userMsg, assistantMsg],
            clearInteractiveMessageIds: clearIds,
            clearInteractiveMode: 'choices',
            clearInteractiveSourceMessages: hostMessages,
          }).then((persisted) => {
            if (!persisted) return;
            setConversations((prev) =>
              applyPersistedLocalTurns(prev, {
                convId,
                tempIds: [userMsg.id, assistantMsg.id],
                clearInteractiveIds: clearIds,
                clearInteractiveMode: 'choices',
                persisted,
              }),
            );
            if (persisted.sessionId !== convId) setActiveId(persisted.sessionId);
          });
        }
        return;
      }
      const hit: NrmAiLabTrackHit | undefined = isAiLabTrackChoiceId(choice.id)
        ? hitFromAiLabTrackChoice(choice)
        : undefined;
      if (hit) {
        sendUserText(choice.label, {
          displayText: choice.label,
          trackSelectHit: hit,
        });
        return;
      }
      sendUserText(choice.label);
    },
    [activeSessionSending, conversations, llmModelId, musicPlatformId, sendUserText, serialNo],
  );

  const handleYoutubeConfirmAccept = useCallback(
    (sessionId: string) => {
      const convId = activeIdRef.current;
      // LLM toolContinue가 아직 끝나지 않아도 미리듣기 확인은 진행 가능
      if (!convId) return;
      void (async () => {
        const out = await confirmAiLabYoutubeCandidateAndDownload(sessionId);
        const userMsg: NrmAiLabMessage = {
          id: nextTempId('u'),
          role: 'user',
          content: '맞다',
        };
        let assistantMsg: NrmAiLabMessage;
        if (!out.ok) {
          assistantMsg = {
            id: nextTempId('a'),
            role: 'assistant',
            content:
              out.message ||
              `다운로드를 시작하지 못했습니다 (${out.error}).`,
          };
        } else {
          const lines = [
            `선택하신 **${out.label}** 곡의 다운로드를 시작했습니다.`,
          ];
          if (out.lyricsAskEligible) {
            lines.push('', '가사도 함께 생성할까요?');
          }
          assistantMsg = {
            id: nextTempId('a'),
            role: 'assistant',
            content: lines.join('\n'),
            choices: out.lyricsAskEligible ? LYRICS_YES_NO_CHOICES : undefined,
          };
        }
        const clearFromPrev =
          conversations
            .find((c) => c.id === convId)
            ?.messages.filter((m) => m.youtubeConfirm?.sessionId === sessionId)
            .map((m) => dbMessageIdOf(m))
            .filter((id): id is string => id != null) ?? [];
        setConversations((prev) =>
          prev.map((c) =>
            c.id === convId
              ? {
                  ...c,
                  messages: [
                    ...c.messages.map((m) =>
                      m.youtubeConfirm?.sessionId === sessionId
                        ? { ...m, youtubeConfirm: undefined }
                        : m,
                    ),
                    userMsg,
                    assistantMsg,
                  ],
                  updatedAtLabel: '지금',
                  updatedAtIso: new Date().toISOString(),
                }
              : c,
          ),
        );
        stickToBottomRef.current = true;
        requestAnimationFrame(() => {
          listRef.current?.scrollToEnd({ animated: true });
        });
        if (serialNo && llmModelId != null) {
          void persistAiLabLocalMessages({
            serialNo,
            sessionId: /^\d+$/.test(convId) ? convId : null,
            modelId: llmModelId,
            messages: [userMsg, assistantMsg],
            clearInteractiveMessageIds: clearFromPrev,
          }).then((persisted) => {
            if (!persisted) return;
            setConversations((prev) =>
              applyPersistedLocalTurns(prev, {
                convId,
                tempIds: [userMsg.id, assistantMsg.id],
                clearInteractiveIds: clearFromPrev,
                persisted,
              }),
            );
            if (persisted.sessionId !== convId) setActiveId(persisted.sessionId);
          });
        }
      })();
    },
    [conversations, llmModelId, serialNo],
  );

  const handleYoutubeConfirmReject = useCallback(
    (sessionId: string) => {
      const convId = activeIdRef.current;
      if (!convId) return;
      const result = rejectAiLabYoutubeCandidate(sessionId);
      const userMsg: NrmAiLabMessage = {
        id: nextTempId('u'),
        role: 'user',
        content: '아니다',
      };
      const stripConfirm = (messages: NrmAiLabMessage[]) =>
        messages.map((m) =>
          m.youtubeConfirm?.sessionId === sessionId
            ? { ...m, youtubeConfirm: undefined }
            : m,
        );
      let assistantMsg: NrmAiLabMessage;
      if (!result.ok) {
        assistantMsg = {
          id: nextTempId('a'),
          role: 'assistant',
          content:
            '음원 후보 확인 세션이 만료되었습니다. 같은 곡으로 다시 다운로드를 요청해 주세요.',
        };
      } else if (result.exhausted) {
        assistantMsg = {
          id: nextTempId('a'),
          role: 'assistant',
          content: result.message || AI_LAB_YOUTUBE_EXHAUSTED_MESSAGE,
        };
      } else {
        // 다음 후보는 새 말풍선+카드로 붙여, 「아니다」아래에 반응이 보이게 한다
        assistantMsg = {
          id: nextTempId('a'),
          role: 'assistant',
          content:
            '다른 후보로 다시 확인해 주세요. 미리듣기 후 「맞다」또는 「아니다」를 선택해 주세요.',
          youtubeConfirm: { sessionId },
        };
      }
      const clearFromPrev =
        conversations
          .find((c) => c.id === convId)
          ?.messages.filter((m) => m.youtubeConfirm?.sessionId === sessionId)
          .map((m) => dbMessageIdOf(m))
          .filter((id): id is string => id != null) ?? [];
      setConversations((prev) =>
        prev.map((c) =>
          c.id === convId
            ? {
                ...c,
                messages: [...stripConfirm(c.messages), userMsg, assistantMsg],
                updatedAtLabel: '지금',
                updatedAtIso: new Date().toISOString(),
              }
            : c,
        ),
      );
      stickToBottomRef.current = true;
      requestAnimationFrame(() => {
        listRef.current?.scrollToEnd({ animated: true });
      });
      if (serialNo && llmModelId != null) {
        void persistAiLabLocalMessages({
          serialNo,
          sessionId: /^\d+$/.test(convId) ? convId : null,
          modelId: llmModelId,
          messages: [userMsg, assistantMsg],
          clearInteractiveMessageIds: clearFromPrev,
        }).then((persisted) => {
          if (!persisted) return;
          setConversations((prev) =>
            applyPersistedLocalTurns(prev, {
              convId,
              tempIds: [userMsg.id, assistantMsg.id],
              clearInteractiveIds: clearFromPrev,
              persisted,
            }),
          );
          if (persisted.sessionId !== convId) setActiveId(persisted.sessionId);
        });
      }
    },
    [conversations, llmModelId, serialNo],
  );

  const renderMessage = useCallback(
    ({ item }: ListRenderItemInfo<NrmAiLabMessage>) => {
      if (item.role === 'system') {
        return (
          <NrmAiLabMessageEnter style={styles.msgRowSystem} delayMs={0}>
            <View style={[styles.bubbleSystem, { backgroundColor: systemBubbleBg }]}>
              <Text style={[styles.msgTextSystem, { color: systemTextColor }]}>{item.content}</Text>
            </View>
          </NrmAiLabMessageEnter>
        );
      }
      const isUser = item.role === 'user';
      return (
        <NrmAiLabMessageEnter
          style={[styles.msgRow, isUser ? styles.msgRowUser : styles.msgRowAssistant]}
          delayMs={isUser ? 0 : 40}>
          {!isUser ? (
            <View style={styles.avatar}>
              <NrmLogo markOnly markSize={28} />
            </View>
          ) : null}
          <View
            style={[
              styles.bubble,
              isUser
                ? [styles.bubbleUser, { backgroundColor: userBubbleBg, borderColor: hairline }]
                : styles.bubbleAssistant,
              item.pending && styles.bubblePending,
            ]}>
            {item.typing && !item.content ? (
              <NrmAiLabTypingDots color={systemTextColor} />
            ) : isUser ? (
              <Text style={[styles.msgText, { color: titleColor }]}>{item.content}</Text>
            ) : item.content.trim() ? (
              <NrmAiLabMarkdown content={item.content} color={titleColor} isDark={isDark} />
            ) : null}
            {!isUser && item.agentUi && !item.typing ? (
              <View style={styles.agentMetaBlock}>
                {item.agentUi.warnings.length > 0 ? (
                  <View style={styles.agentWarnRow}>
                    {item.agentUi.warnings.map((w) => (
                      <View
                        key={w.id}
                        style={[styles.agentWarnChip, { borderColor: hairline }]}>
                        <Ionicons name="warning-outline" size={12} color={systemTextColor} />
                        <Text style={[styles.agentMetaText, { color: systemTextColor }]}>
                          {w.message}
                        </Text>
                      </View>
                    ))}
                  </View>
                ) : null}
                {item.agentUi.badges.length > 0 ? (
                  <View style={styles.agentMetaRow}>
                    {item.agentUi.badges.map((b) => (
                      <View
                        key={b.id}
                        style={[styles.agentMetaChip, { borderColor: hairline }]}>
                        <Ionicons
                          name={agentUiBadgeIconName(b.icon) as keyof typeof Ionicons.glyphMap}
                          size={12}
                          color={systemTextColor}
                        />
                        <Text
                          style={[styles.agentMetaText, { color: systemTextColor }]}
                          numberOfLines={1}>
                          {b.label}
                        </Text>
                      </View>
                    ))}
                  </View>
                ) : null}
                {item.agentUi.actions.length > 0 ? (
                  <View style={styles.agentMetaRow}>
                    {item.agentUi.actions.map((a) => (
                      <View
                        key={a.id}
                        style={[styles.agentActionChip, { borderColor: hairline }]}>
                        <Ionicons name="download-outline" size={12} color={systemTextColor} />
                        <Text style={[styles.agentMetaText, { color: systemTextColor }]}>
                          {a.label}
                        </Text>
                      </View>
                    ))}
                  </View>
                ) : null}
              </View>
            ) : null}
            {!isUser && item.youtubeConfirm?.sessionId ? (
              <NrmAiLabYoutubeConfirmCard
                sessionId={item.youtubeConfirm.sessionId}
                isDark={isDark}
                disabled={activeSessionSending}
                onConfirm={handleYoutubeConfirmAccept}
                onReject={handleYoutubeConfirmReject}
              />
            ) : null}
            {!isUser && item.choices && item.choices.length > 0 && !item.typing ? (
              <View style={styles.choiceRow}>
                {item.choices.map((ch) => (
                  <Pressable
                    key={ch.id}
                    disabled={activeSessionSending}
                    onPress={() => handleChoicePress(ch, item.id)}
                    style={({ pressed }) => [
                      styles.choiceChip,
                      {
                        borderColor: hairline,
                        backgroundColor: userBubbleBg,
                        opacity: activeSessionSending ? 0.5 : pressed ? 0.72 : 1,
                      },
                    ]}>
                    <Text style={[styles.choiceChipText, { color: titleColor }]} numberOfLines={2}>
                      {ch.label}
                    </Text>
                  </Pressable>
                ))}
              </View>
            ) : null}
          </View>
        </NrmAiLabMessageEnter>
      );
    },
    [
      activeSessionSending,
      hairline,
      handleChoicePress,
      handleYoutubeConfirmAccept,
      handleYoutubeConfirmReject,
      isDark,
      systemBubbleBg,
      systemTextColor,
      titleColor,
      userBubbleBg,
    ],
  );

  const emptyChat = (
    <View style={[styles.empty, { paddingTop: emptyPadTop }]}>
      <NrmLogo markOnly markSize={72} />
      <Text style={[styles.emptyLine1, { color: titleColor }]}>{greeting.line1}</Text>
      <Text style={[styles.emptyLine2, { color: titleColor }]}>{greeting.line2}</Text>
      {suggestionChips.length > 0 ? (
        <View style={styles.suggestionList}>
          {suggestionChips.map((chip) => (
            <Pressable
              key={`${chip.categoryId}-${chip.promptId}`}
              disabled={activeSessionSending || !serialNo || llmModelId == null}
              onPress={() => {
                if (activeSessionSending || !serialNo || llmModelId == null) return;
                void sendUserText(chip.promptText);
              }}
              style={({ pressed }) => [
                styles.suggestionChip,
                {
                  backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)',
                  borderColor: hairline,
                  opacity: pressed ? 0.72 : activeSessionSending ? 0.55 : 1,
                },
              ]}
              accessibilityRole="button"
              accessibilityLabel={chip.promptText}>
              <Text style={[styles.suggestionChipText, { color: titleColor }]} numberOfLines={2}>
                {chip.promptText}
              </Text>
            </Pressable>
          ))}
        </View>
      ) : null}
    </View>
  );

  return (
    <View style={[styles.root, { backgroundColor: chatBg }]}>
      {/* NrmAppTopBar 와 동일한 패딩(insets.top + xs, padH) — 햄버거만 */}
      <View
        style={[
          styles.topBar,
          {
            paddingTop: insets.top + nrmTokens.space.xs,
            paddingHorizontal: padH,
          },
        ]}>
        <Pressable
          onPress={openMenu}
          hitSlop={8}
          style={({ pressed }) => [styles.sideSlot, pressed && styles.pressed]}
          accessibilityRole="button"
          accessibilityLabel="메뉴">
          <NrmHamburgerIcon color={titleColor} size={22} />
        </Pressable>
        <View style={styles.topBarSpacer} />
      </View>

      <FlatList
        ref={listRef}
        data={messages}
        keyExtractor={(m) => m.id}
        renderItem={renderMessage}
        style={styles.msgList}
        contentContainerStyle={[
          styles.msgListContent,
          { paddingHorizontal: padH },
          messages.length === 0 && styles.msgListContentEmpty,
        ]}
        ListEmptyComponent={messagesLoading ? null : emptyChat}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
        showsVerticalScrollIndicator={Platform.OS === 'web'}
        onScroll={onChatListScroll}
        scrollEventThrottle={16}
        onContentSizeChange={() => {
          if (messages.length === 0) return;
          pinListToBottomWhileStreaming();
        }}
        onLayout={() => {
          if (messages.length === 0) return;
          pinListToBottom({ animated: false, settle: false });
        }}
      />
      {messagesLoading && messages.length === 0 ? (
        <View style={styles.loadingOverlay} pointerEvents="none">
          <ActivityIndicator color={nrmTokens.color.primary} />
        </View>
      ) : null}

      <View style={{ paddingHorizontal: composerPadH }}>
        <NrmAiLabComposer
          isDark={isDark}
          value={draft}
          onChangeText={setDraft}
          onSend={handleSend}
          disabled={activeSessionSending || !serialNo}
        />
      </View>
      {keyboardInset > 0 ? <View style={{ height: keyboardInset }} /> : null}

      <NrmEdgeSwipeOpenLayer enabled={!menuOpen} onOpen={openMenu} />

      <Modal
        visible={menuOpen}
        transparent
        animationType="none"
        onRequestClose={onDrawerRequestClose}
        statusBarTranslucent
        hardwareAccelerated>
        <View style={[styles.modalWrap, { backgroundColor: rootBg }]}>
          <Pressable
            style={[StyleSheet.absoluteFill, { backgroundColor: modalScrim }]}
            onPress={closeMenu}
            accessibilityRole="button"
            accessibilityLabel="닫기"
          />
          <Animated.View
            style={[
              styles.drawer,
              {
                width: drawerW,
                backgroundColor: cardBg,
                borderColor: cardBorder,
                paddingTop: insets.top + nrmTokens.space.lg,
                paddingBottom: insets.bottom,
                transform: [{ translateX }],
              },
            ]}
            accessibilityViewIsModal>
            <NrmAiLabSidebar
              isDark={isDark}
              conversations={conversations.map((c) => ({
                id: c.id,
                title: c.title,
                updatedAtLabel: nrmAiLabRelativeTimeLabel(c.updatedAtIso) || c.updatedAtLabel,
              }))}
              activeId={activeId}
              serialNo={serialNo}
              llmModelId={llmModelId}
              onLlmModelChange={handleLlmModelChange}
              onLlmModelDefault={handleLlmModelDefault}
              llmModelPrefReady={llmModelPrefReady}
              musicPlatformId={musicPlatformId}
              onMusicPlatformChange={handleMusicPlatformChange}
              onSelect={handleSelect}
              onNewChat={handleNewChat}
              onDelete={handleDelete}
              onDismiss={closeMenu}
              registerBackHandler={registerSidebarBackHandler}
            />
          </Animated.View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    zIndex: 60,
  },
  sideSlot: {
    width: ICON_HIT,
    height: ICON_HIT,
    alignItems: 'center',
    justifyContent: 'center',
  },
  topBarSpacer: {
    flex: 1,
  },
  pressed: { opacity: 0.72 },
  msgList: { flex: 1 },
  msgListContent: {
    paddingTop: nrmTokens.space.lg,
    paddingBottom: nrmTokens.space.lg,
  },
  msgListContentEmpty: {
    flexGrow: 1,
    justifyContent: 'flex-start',
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  msgRow: {
    marginBottom: nrmTokens.space.md,
    maxWidth: '100%',
  },
  msgRowUser: { alignItems: 'flex-end' },
  msgRowAssistant: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: nrmTokens.space.sm,
    alignSelf: 'stretch',
  },
  msgRowSystem: {
    marginBottom: nrmTokens.space.md,
    alignItems: 'center',
  },
  avatar: {
    width: 28,
    height: 28,
    marginTop: 2,
  },
  bubble: { maxWidth: '88%' },
  bubbleUser: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: nrmTokens.radius.lg,
    paddingHorizontal: nrmTokens.space.md,
    paddingVertical: nrmTokens.space.sm,
  },
  bubbleAssistant: {
    flex: 1,
    paddingTop: 4,
    paddingRight: nrmTokens.space.sm,
  },
  bubblePending: {
    opacity: 0.6,
  },
  bubbleSystem: {
    maxWidth: '90%',
    borderRadius: nrmTokens.radius.md,
    paddingHorizontal: nrmTokens.space.md,
    paddingVertical: nrmTokens.space.sm,
  },
  msgText: {
    fontSize: nrmTokens.font.body,
    lineHeight: 24,
    fontWeight: '400',
  },
  msgTextSystem: {
    fontSize: nrmTokens.font.caption,
    lineHeight: 18,
    fontWeight: '500',
    textAlign: 'center',
  },
  empty: {
    alignItems: 'center',
    justifyContent: 'flex-start',
    gap: nrmTokens.space.sm,
    paddingBottom: nrmTokens.space.xxl,
    paddingHorizontal: nrmTokens.space.sm,
    width: '100%',
  },
  emptyLine1: {
    marginTop: nrmTokens.space.sm,
    fontSize: nrmTokens.font.leadAiry,
    fontWeight: '600',
    textAlign: 'center',
  },
  emptyLine2: {
    fontSize: nrmTokens.font.body,
    fontWeight: '400',
    textAlign: 'center',
  },
  suggestionList: {
    marginTop: nrmTokens.space.lg,
    width: '100%',
    maxWidth: 420,
    gap: nrmTokens.space.sm,
  },
  suggestionChip: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: nrmTokens.radius.md,
    paddingHorizontal: nrmTokens.space.md,
    paddingVertical: 12,
    alignSelf: 'stretch',
  },
  suggestionChipText: {
    fontSize: nrmTokens.font.body,
    lineHeight: 22,
    fontWeight: '500',
    textAlign: 'left',
  },
  choiceRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: nrmTokens.space.sm,
    marginTop: nrmTokens.space.sm,
  },
  agentMetaBlock: {
    marginTop: nrmTokens.space.sm,
    gap: 6,
  },
  agentMetaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  agentWarnRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  agentMetaChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: nrmTokens.radius.sm,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  agentWarnChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: nrmTokens.radius.sm,
    paddingHorizontal: 8,
    paddingVertical: 3,
    opacity: 0.9,
  },
  agentActionChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: nrmTokens.radius.sm,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  agentMetaText: {
    fontSize: 11,
    lineHeight: 14,
    fontWeight: '500',
    maxWidth: 140,
  },
  choiceChip: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: nrmTokens.radius.md,
    paddingHorizontal: nrmTokens.space.sm,
    paddingVertical: 8,
    maxWidth: '100%',
  },
  choiceChipText: {
    fontSize: nrmTokens.font.caption,
    lineHeight: 18,
    fontWeight: '500',
  },
  modalWrap: {
    flex: 1,
  },
  drawer: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    height: '100%',
    maxHeight: '100%',
    flexDirection: 'column',
    borderTopRightRadius: nrmTokens.radius.lg,
    borderBottomRightRadius: nrmTokens.radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderLeftWidth: 0,
    paddingHorizontal: nrmTokens.space.lg,
    zIndex: 1,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 4, height: 0 },
        shadowOpacity: 0.18,
        shadowRadius: 12,
      },
      android: {
        elevation: 16,
      },
      default: {},
    }),
  },
});
