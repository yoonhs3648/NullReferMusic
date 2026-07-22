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
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { NrmAiLabComposer } from '@/components/nrm/discover/NrmAiLabComposer';
import { NrmAiLabMessageEnter } from '@/components/nrm/discover/NrmAiLabMessageEnter';
import { NrmAiLabSidebar } from '@/components/nrm/discover/NrmAiLabSidebar';
import { NrmEdgeSwipeOpenLayer } from '@/components/nrm/NrmEdgeSwipeOpenLayer';
import { NrmHamburgerIcon } from '@/components/nrm/NrmHamburgerIcon';
import { NrmLogo } from '@/components/nrm/NrmLogo';
import { nrmTokens } from '@/constants/nrmTokens';
import { getNrmAppSerialNo } from '@/lib/nrmAppSerialNo';
import {
  nrmAiLabEmptyGreeting,
  nrmAiLabRelativeTimeLabel,
  nrmAiLabTitleFromPrompt,
  type NrmAiLabConversation,
  type NrmAiLabMessage,
} from '@/lib/nrmAiLabChatUi';
import { deleteChatSession, fetchChatMessages, fetchChatSessions } from '@/lib/nrmChatClient';
import { logNrmRunError } from '@/lib/nrmDevLog';
import { resolveLlmSerialNo } from '@/lib/nrmLlmSerialNo';
import { sendLlmChatMessage } from '@/lib/nrmLlmChatSend';
import { getNrmModalScrimColor, getNrmRootBackgroundColor } from '@/lib/nrmUiAppearanceColors';
import { useNrmMainLogoDisplayName } from '@/lib/nrmMainLogoDisplayNameSettings';

type Props = {
  isDark: boolean;
};

const ICON_HIT = 44;
const NETWORK_PROBLEM_TEXT = '네트워크 문제로 요청할 수 없어요. 나중에 다시 시도해 주세요.';

function nextTempId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/** AI Lab — 앱 상단바·메뉴 패턴에 맞춘 대화 UI. ChatSession/ChatMessage 기반 실 LLM 연동. */
export function NrmDiscoverAiLabScreen({ isDark }: Props) {
  const insets = useSafeAreaInsets();
  const { width: windowWidth } = useWindowDimensions();
  const drawerW = Math.max(280, Math.min(380, Math.round(windowWidth * 0.88) || 320));
  const drawerWRef = useRef(drawerW);
  drawerWRef.current = drawerW;
  const translateX = useRef(new Animated.Value(-drawerW)).current;
  /** 메인 NrmAppTopBar 와 동일 — 기종별 반응형 가로 여백 */
  const padH = Math.max(nrmTokens.space.md, Math.round(windowWidth * 0.04));

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
  const [llmProviderId, setLlmProviderId] = useState<number | null>(null);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [sending, setSending] = useState(false);
  /** 방금 로컬로만 만든 대화(서버 세션 확정 전) — 목록 refresh 시 병합용 */
  const pendingLocalConversationRef = useRef<NrmAiLabConversation | null>(null);
  /** 앱 설정 > 앱 이름 변경 값 우선, 없으면 APK 내장 AppName */
  const greetingName = useNrmMainLogoDisplayName();
  const [keyboardInset, setKeyboardInset] = useState(0);
  const listRef = useRef<FlatList<NrmAiLabMessage>>(null);

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

  const refreshSessions = useCallback(async () => {
    if (!serialNo) return;
    try {
      const rows = await fetchChatSessions(serialNo);
      setConversations((prev) => {
        const prevById = new Map(prev.map((c) => [c.id, c]));
        const pendingLocal = pendingLocalConversationRef.current;
        const merged = rows.map((row) => {
          const existing = prevById.get(row.id);
          return existing?.messagesLoaded ? { ...row, messages: existing.messages, messagesLoaded: true } : row;
        });
        // 서버에 아직 반영 안 된(방금 만든) 로컬 대화는 목록 맨 위에 유지
        if (pendingLocal && !merged.some((c) => c.id === pendingLocal.id)) {
          return [pendingLocal, ...merged];
        }
        return merged;
      });
    } catch (e) {
      logNrmRunError('ailab.sessions', e, { serialNo });
    }
  }, [serialNo]);

  useEffect(() => {
    if (serialNo) void refreshSessions();
  }, [serialNo, refreshSessions]);

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
    const t = setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 50);
    return () => clearTimeout(t);
  }, [messages.length, activeId]);

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
    closeMenu();
  }, [closeMenu]);

  const handleSelect = useCallback(
    (id: string) => {
      setActiveId(id);
      setDraft('');
      closeMenu();
      const target = conversations.find((c) => c.id === id);
      if (target) {
        // 세션은 생성 시점 모델에 고정 — 이어서 보내는 요청도 동일 모델을 쓰도록 동기화.
        setLlmProviderId(target.providerId);
        if (!target.messagesLoaded) {
          setMessagesLoading(true);
          void fetchChatMessages(id)
            .then((msgs) => {
              setConversations((prev) =>
                prev.map((c) => (c.id === id ? { ...c, messages: msgs, messagesLoaded: true } : c)),
              );
            })
            .catch((e) => logNrmRunError('ailab.messages', e, { sessionId: id }))
            .finally(() => setMessagesLoading(false));
        }
      }
    },
    [closeMenu, conversations],
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

  const handleSend = useCallback(() => {
    const text = draft.trim();
    if (!text || sending || !serialNo || llmProviderId == null) return;

    const tempUserId = nextTempId('u');
    const userMsg: NrmAiLabMessage = { id: tempUserId, role: 'user', content: text, pending: true };
    const targetId = activeId;
    const sourceConvId = targetId ?? nextTempId('c');

    setDraft('');
    setSending(true);

    if (!targetId) {
      const created: NrmAiLabConversation = {
        id: sourceConvId,
        title: nrmAiLabTitleFromPrompt(text),
        updatedAtLabel: '지금',
        updatedAtIso: new Date().toISOString(),
        providerId: llmProviderId,
        messages: [userMsg],
        messagesLoaded: true,
      };
      pendingLocalConversationRef.current = created;
      setConversations((prev) => [created, ...prev]);
      setActiveId(sourceConvId);
    } else {
      setConversations((prev) =>
        prev.map((c) => (c.id === sourceConvId ? { ...c, messages: [...c.messages, userMsg] } : c)),
      );
    }

    void sendLlmChatMessage({
      serialNo,
      providerId: llmProviderId,
      sessionId: targetId,
      message: text,
    })
      .then((result) => {
        pendingLocalConversationRef.current = null;
        setConversations((prev) => {
          const sourceConv = prev.find((c) => c.id === sourceConvId);
          const finalizedMessages = (sourceConv?.messages ?? [])
            .filter((m) => m.id !== tempUserId)
            .concat([result.userMessage, result.replyMessage]);
          const finalizedConv: NrmAiLabConversation = {
            id: result.sessionId,
            title: result.title || sourceConv?.title || nrmAiLabTitleFromPrompt(text),
            updatedAtLabel: '지금',
            updatedAtIso: new Date().toISOString(),
            providerId: llmProviderId,
            messages: finalizedMessages,
            messagesLoaded: true,
          };
          const rest = prev.filter((c) => c.id !== sourceConvId && c.id !== result.sessionId);
          return [finalizedConv, ...rest];
        });
        setActiveId(result.sessionId);
      })
      .catch((e) => {
        logNrmRunError('ailab.send', e, {
          sourceConvId,
          isNewConversation: !targetId,
          providerId: llmProviderId,
          messageLength: text.length,
        });
        const sysMsg: NrmAiLabMessage = {
          id: nextTempId('s'),
          role: 'system',
          content: NETWORK_PROBLEM_TEXT,
        };
        setConversations((prev) =>
          prev.map((c) =>
            c.id === sourceConvId
              ? {
                  ...c,
                  messages: c.messages
                    .map((m) => (m.id === tempUserId ? { ...m, pending: false } : m))
                    .concat(sysMsg),
                }
              : c,
          ),
        );
      })
      .finally(() => setSending(false));
  }, [activeId, draft, llmProviderId, sending, serialNo]);

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
            <Text style={[styles.msgText, { color: titleColor }]}>{item.content}</Text>
          </View>
        </NrmAiLabMessageEnter>
      );
    },
    [hairline, systemBubbleBg, systemTextColor, titleColor, userBubbleBg],
  );

  const emptyChat = (
    <View style={styles.empty}>
      <NrmLogo markOnly markSize={72} />
      <Text style={[styles.emptyLine1, { color: titleColor }]}>{greeting.line1}</Text>
      <Text style={[styles.emptyLine2, { color: titleColor }]}>{greeting.line2}</Text>
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
        onContentSizeChange={() => {
          if (messages.length > 0) listRef.current?.scrollToEnd({ animated: false });
        }}
      />
      {messagesLoading && messages.length === 0 ? (
        <View style={styles.loadingOverlay} pointerEvents="none">
          <ActivityIndicator color={nrmTokens.color.primary} />
        </View>
      ) : null}

      <View style={{ paddingHorizontal: padH }}>
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
        onRequestClose={closeMenu}
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
              llmProviderId={llmProviderId}
              onLlmProviderChange={setLlmProviderId}
              onSelect={handleSelect}
              onNewChat={handleNewChat}
              onDelete={handleDelete}
              onDismiss={closeMenu}
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
    paddingBottom: nrmTokens.space.md,
  },
  msgListContentEmpty: {
    flexGrow: 1,
    justifyContent: 'center',
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
    justifyContent: 'center',
    gap: nrmTokens.space.sm,
    paddingVertical: nrmTokens.space.xxl,
    paddingHorizontal: nrmTokens.space.lg,
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
