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
  hitFromAiLabTrackChoice,
  isAiLabStartDownloadToolName,
  isAiLabTrackChoiceId,
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
  rejectAiLabYoutubeCandidate,
} from '@/lib/nrmAiLabYoutubeConfirm';
import {
  aiLabMelonChartCheckingMessage,
  aiLabMelonChartDownloadStartedMessage,
  aiLabMelonChartIdentifiedMessage,
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
  const [sending, setSending] = useState(false);
  /** 방금 로컬로만 만든 대화(서버 세션 확정 전) — 목록 refresh 시 병합용 */
  const pendingLocalConversationRef = useRef<NrmAiLabConversation | null>(null);
  /** isActive false→true 감지용 */
  const wasActiveRef = useRef(isActive);
  /** 앱 설정 > 사용자 이름 변경 값 우선, 없으면 bake userName */
  const greetingName = useNrmUserDisplayName();
  const [keyboardInset, setKeyboardInset] = useState(0);
  const listRef = useRef<FlatList<NrmAiLabMessage>>(null);
  /** 사용자가 위로 올려 두면 false — 스트리밍/완료 시 자동 스크롤 안 함 */
  const stickToBottomRef = useRef(true);
  const scrollPinTimersRef = useRef<ReturnType<typeof setTimeout>[]>([]);

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
                messages: msgs,
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
      },
    });
    return () => {
      setAiLabLyricsFollowupHooks({});
    };
  }, [pinListToBottom]);

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
        const prevById = new Map(prev.map((c) => [c.id, c]));
        const pendingLocal = pendingLocalConversationRef.current;
        const merged = rows.map((row) => {
          const existing = prevById.get(row.id);
          return existing?.messagesLoaded
            ? { ...row, messages: existing.messages, messagesLoaded: true }
            : row;
        });
        // 서버 목록에 아직 없는 로컬(임시 id) 대화 — 스트리밍 중 목록 새로고침에 메시지 유실 방지
        const locals = prev.filter(
          (c) =>
            c.messagesLoaded &&
            c.messages.length > 0 &&
            !merged.some((m) => m.id === c.id),
        );
        const withLocals = locals.length > 0 ? [...locals, ...merged] : merged;
        if (pendingLocal && !withLocals.some((c) => c.id === pendingLocal.id)) {
          return [pendingLocal, ...withLocals.filter((c) => c.id !== pendingLocal.id)];
        }
        return withLocals;
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
   * 전송 중(sending)에는 스트리밍 로컬 메시지를 덮어쓰지 않는다. */
  useEffect(() => {
    if (!activeId || sending) return;
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
                  messages: c.messagesLoaded && c.messages.length > 0 ? c.messages : msgs,
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
  }, [activeId, conversations, sending]);

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

    if (!becameActive || sending) return;
    const sid = activeIdRef.current;
    if (!sid || sid.startsWith('c-')) return;
    void reloadSessionMessages(sid);
  }, [clearPersistedActiveSessionId, isActive, reloadSessionMessages, sending]);

  // 예전 기기 저장값이 남아 있어도 자동 복원하지 않도록 기동 시 제거
  useEffect(() => {
    clearPersistedActiveSessionId();
  }, [clearPersistedActiveSessionId]);

  const active = useMemo(
    () => conversations.find((c) => c.id === activeId) ?? null,
    [activeId, conversations],
  );
  const messages = active?.messages ?? [];
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
        // 선택 시마다 DB에서 다시 읽어, 이탈 중 확정된 assistant 누락을 막는다.
        if (!target.messagesLoaded || !sending) {
          setMessagesLoading(true);
          void fetchChatMessages(id)
            .then((msgs) => {
              setConversations((prev) =>
                prev.map((c) =>
                  c.id === id
                    ? {
                        ...c,
                        messages: sending && c.messagesLoaded ? c.messages : msgs,
                        messagesLoaded: true,
                      }
                    : c,
                ),
              );
            })
            .catch((e) => logNrmRunError('ailab.messages', e, { sessionId: id }))
            .finally(() => setMessagesLoading(false));
        }
      }
    },
    [closeMenu, conversations, sending],
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
      if (!text || sending || !serialNo || llmModelId == null) return;

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
      const targetId = activeId;
      const sourceConvId = targetId ?? nextTempId('c');

      setSending(true);

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
          setSending(false);
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

          const presentMelonChartYoutubeUi = async (ytSessionId: string) => {
            if (!melonChartHit || melonChartPlayerShown) return;
            dropLeftoverStreamingAssistant();
            removeEmptyAssistant(activeAssistantId);
            await sleepMs(280);
            appendAssistant({
              content: aiLabMelonChartDownloadStartedMessage({
                hit: melonChartHit,
                period: melonChartPeriod,
              }),
              typing: false,
            });
            await sleepMs(380);
            appendAssistant({
              content: '',
              typing: false,
              youtubeConfirm: { sessionId: ytSessionId },
            });
            melonChartPlayerShown = true;
            suppressLlmAssistantUi = true;
            lastAssistantText = aiLabMelonChartDownloadStartedMessage({
              hit: melonChartHit,
              period: melonChartPeriod,
            });
            pinListToBottom({ animated: false });
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
              setSending(false);
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
                '이 음원이 맞는지 확인해 주세요. 미리듣기 후 「맞다」또는 「아니다」를 선택해 주세요.';
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
                            : m,
                        ),
                      }
                    : c,
                ),
              );
              setSending(false);
              pinListToBottom({ animated: false });
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
                  prev.map((c) =>
                    c.id === currentConvId
                      ? {
                          ...c,
                          messages: c.messages.map((m) =>
                            m.id === activeAssistantId
                              ? {
                                  ...m,
                                  content: '',
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
                      sessionIdForApi = meta.sessionId;
                      currentConvId = meta.sessionId;
                    }
                    return;
                  }
                  const newConvId = meta.sessionId;
                  sessionIdForApi = newConvId;
                  setConversations((prev) => {
                    const idx = prev.findIndex((c) => c.id === currentConvId);
                    if (idx === -1) return prev;
                    const conv = prev[idx];
                    const finalizedMessages = conv.messages.map((m) =>
                      m.id === tempUserId
                        ? { ...meta.userMessage, content: displayText, pending: false }
                        : m,
                    );
                    const updatedConv: NrmAiLabConversation = {
                      ...conv,
                      id: newConvId,
                      title: meta.title || conv.title,
                      modelId: llmModelId,
                      messages: finalizedMessages,
                      messagesLoaded: true,
                    };
                    if (pendingLocalConversationRef.current?.id === currentConvId) {
                      pendingLocalConversationRef.current = null;
                    }
                    const rest = prev.filter((_, i) => i !== idx).filter((c) => c.id !== newConvId);
                    return [updatedConv, ...rest];
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
                onFinal: (final) => {
                  const choices =
                    (final.choices && final.choices.length > 0
                      ? final.choices
                      : lastToolChoices) ?? undefined;
                  const filteredChoices =
                    selectedHit && choices?.length
                      ? choices.filter((ch) => !isAiLabTrackChoiceId(ch.id))
                      : choices;
                  const mergedChoices =
                    (filteredChoices && filteredChoices.length > 0
                      ? filteredChoices
                      : preforcedLyricsChoices) ?? undefined;
                  const agentUi = parseAgentUiFromDiag(final.diag);
                  const convId = currentConvId;
                  const finalSessionId = String(final.sessionId ?? '').trim();
                  let finalContent = String(final.message.content ?? '');
                  if (youtubeConfirmSessionIdFromTools && !finalContent.trim()) {
                    finalContent =
                      '이 음원이 맞는지 확인해 주세요. 미리듣기 후 「맞다」또는 「아니다」를 선택해 주세요.';
                  }
                  if (finalContent) lastAssistantText = finalContent;

                  if (suppressLlmAssistantUi || melonChartPlayerShown) {
                    removeEmptyAssistant(activeAssistantId);
                    setConversations((prev) =>
                      prev.map((c) => {
                        if (c.id !== convId && c.id !== finalSessionId) return c;
                        return {
                          ...c,
                          id: finalSessionId || c.id,
                          modelId: llmModelId,
                          updatedAtLabel: '지금',
                          updatedAtIso: new Date().toISOString(),
                          messagesLoaded: true,
                          messages: c.messages.map((m) =>
                            m.id === tempUserId
                              ? { ...m, content: displayText, pending: false }
                              : m,
                          ),
                        };
                      }),
                    );
                    pinListToBottom({ animated: false });
                    return;
                  }

                  const assistantId = activeAssistantId;
                  setConversations((prev) =>
                    prev.map((c) => {
                      if (c.id !== convId && c.id !== finalSessionId) return c;
                      const messages = c.messages.map((m) =>
                        m.id === assistantId
                          ? {
                              // FlatList key를 유지해 MessageEnter가 opacity 0으로 재마운트되지 않게 함
                              ...final.message,
                              id: assistantId,
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
                            ? { ...m, content: displayText, pending: false }
                            : m,
                      );
                      return {
                        ...c,
                        id: finalSessionId || c.id,
                        modelId: llmModelId,
                        updatedAtLabel: '지금',
                        updatedAtIso: new Date().toISOString(),
                        messagesLoaded: true,
                        messages,
                      };
                    }),
                  );
                  pinListToBottom({ animated: false });
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
                  pendingAutoDownloadHit = hits[0];
                } else if (count > 1) {
                  pendingAutoDownloadHit = null;
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
              if (out.choices && out.choices.length > 0) {
                if (selectedHit) {
                  const nonTrack = out.choices.filter((ch) => !isAiLabTrackChoiceId(ch.id));
                  if (nonTrack.length > 0) roundChoices = nonTrack;
                } else {
                  roundChoices = out.choices;
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
                  if (melonChartUiActive && melonChartHit) {
                    await presentMelonChartYoutubeUi(ytSid);
                  }
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
              if (melonChartUiActive && melonChartHit) {
                await presentMelonChartYoutubeUi(ytSid);
              } else {
                const confirmText =
                  '이 음원이 맞는지 확인해 주세요. 미리듣기 후 「맞다」또는 「아니다」를 선택해 주세요.';
                const assistantId = activeAssistantId;
                setConversations((prev) =>
                  prev.map((c) => {
                    if (c.id !== currentConvId) return c;
                    return {
                      ...c,
                      messages: c.messages.map((m) => {
                        if (m.id !== assistantId) return m;
                        return {
                          ...m,
                          content: confirmText,
                          typing: false,
                          choices: undefined,
                          youtubeConfirm: { sessionId: ytSid },
                        };
                      }),
                    };
                  }),
                );
                pinListToBottom({ animated: false });
              }
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
          setSending(false);
          pinListToBottom({ animated: false });
        }
      })();
    },
    [activeId, llmModelId, musicPlatformId, pinListToBottom, pinListToBottomWhileStreaming, sending, serialNo],
  );

  const handleSend = useCallback(() => {
    const text = draft.trim();
    if (!text || sending || !serialNo || llmModelId == null) return;
    setDraft('');
    sendUserText(text);
  }, [draft, llmModelId, sendUserText, sending, serialNo]);

  const handleChoicePress = useCallback(
    (choice: NrmAiLabChoice, messageId?: string) => {
      if (sending || !serialNo || llmModelId == null) return;
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
          setConversations((prev) =>
            prev.map((c) =>
              c.id === convId
                ? {
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
                  }
                : c,
            ),
          );
          stickToBottomRef.current = true;
          requestAnimationFrame(() => {
            listRef.current?.scrollToEnd({ animated: true });
          });
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
          setConversations((prev) =>
            prev.map((c) =>
              c.id === convId
                ? {
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
                  }
                : c,
            ),
          );
          stickToBottomRef.current = true;
          requestAnimationFrame(() => {
            listRef.current?.scrollToEnd({ animated: true });
          });
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
          setConversations((prev) =>
            prev.map((c) =>
              c.id === convId
                ? {
                    ...c,
                    messages: [
                      ...stripMelonChoicesOn(c.messages, messageId),
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
    [llmModelId, sendUserText, sending, serialNo],
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
      })();
    },
    [],
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
    },
    [],
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
            {!isUser && item.youtubeConfirm?.sessionId && !item.typing ? (
              <NrmAiLabYoutubeConfirmCard
                sessionId={item.youtubeConfirm.sessionId}
                isDark={isDark}
                onConfirm={handleYoutubeConfirmAccept}
                onReject={handleYoutubeConfirmReject}
              />
            ) : null}
            {!isUser && item.choices && item.choices.length > 0 && !item.typing ? (
              <View style={styles.choiceRow}>
                {item.choices.map((ch) => (
                  <Pressable
                    key={ch.id}
                    disabled={sending}
                    onPress={() => handleChoicePress(ch, item.id)}
                    style={({ pressed }) => [
                      styles.choiceChip,
                      {
                        borderColor: hairline,
                        backgroundColor: userBubbleBg,
                        opacity: sending ? 0.5 : pressed ? 0.72 : 1,
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
      hairline,
      handleChoicePress,
      handleYoutubeConfirmAccept,
      handleYoutubeConfirmReject,
      isDark,
      sending,
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
              disabled={sending || !serialNo || llmModelId == null}
              onPress={() => {
                if (sending || !serialNo || llmModelId == null) return;
                void sendUserText(chip.promptText);
              }}
              style={({ pressed }) => [
                styles.suggestionChip,
                {
                  backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)',
                  borderColor: hairline,
                  opacity: pressed ? 0.72 : sending ? 0.55 : 1,
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
          disabled={sending || !serialNo}
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
