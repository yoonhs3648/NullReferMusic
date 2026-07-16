import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
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
import {
  nrmAiLabEmptyGreeting,
  nrmAiLabTitleFromPrompt,
  NRM_AI_LAB_DEFAULT_LLM_MODEL,
  NRM_AI_LAB_DEMO_ASSISTANT_REPLY,
  type NrmAiLabConversation,
  type NrmAiLabLlmModelId,
  type NrmAiLabMessage,
} from '@/lib/nrmAiLabChatUi';
import { getNrmAppUserName } from '@/lib/nrmAppSerialNo';
import { getResolvedNrmBrandUserName } from '@/lib/nrmBrandIdentity';
import { getNrmModalScrimColor, getNrmRootBackgroundColor } from '@/lib/nrmUiAppearanceColors';

type Props = {
  isDark: boolean;
};

const ICON_HIT = 44;

function nextId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/** AI Lab — 앱 상단바·메뉴 패턴에 맞춘 대화 UI (실 LLM 연동 전 목업). */
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

  const [conversations, setConversations] = useState<NrmAiLabConversation[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [menuOpen, setMenuOpen] = useState(false);
  const [llmModel, setLlmModel] = useState<NrmAiLabLlmModelId>(NRM_AI_LAB_DEFAULT_LLM_MODEL);
  const [userName, setUserName] = useState(() => getResolvedNrmBrandUserName());
  const [keyboardInset, setKeyboardInset] = useState(0);
  const listRef = useRef<FlatList<NrmAiLabMessage>>(null);

  const active = useMemo(
    () => conversations.find((c) => c.id === activeId) ?? null,
    [activeId, conversations],
  );
  const messages = active?.messages ?? [];
  const greeting = useMemo(() => nrmAiLabEmptyGreeting(userName), [userName]);

  useEffect(() => {
    let cancelled = false;
    void getNrmAppUserName().then((name) => {
      if (!cancelled && name.trim()) setUserName(name.trim());
    });
    return () => {
      cancelled = true;
    };
  }, []);

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
  }, [translateX]);

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
    },
    [closeMenu],
  );

  const handleDelete = useCallback((id: string) => {
    setConversations((prev) => prev.filter((c) => c.id !== id));
    setActiveId((cur) => (cur === id ? null : cur));
  }, []);

  const handleSend = useCallback(() => {
    const text = draft.trim();
    if (!text) return;

    const userMsg: NrmAiLabMessage = { id: nextId('u'), role: 'user', content: text };
    const assistantMsg: NrmAiLabMessage = {
      id: nextId('a'),
      role: 'assistant',
      content: NRM_AI_LAB_DEMO_ASSISTANT_REPLY,
    };

    setDraft('');

    if (!activeId) {
      const id = nextId('c');
      const created: NrmAiLabConversation = {
        id,
        title: nrmAiLabTitleFromPrompt(text),
        updatedAtLabel: '지금',
        messages: [userMsg],
      };
      setConversations((prev) => [created, ...prev]);
      setActiveId(id);
      setTimeout(() => {
        setConversations((prev) =>
          prev.map((c) =>
            c.id === id
              ? { ...c, updatedAtLabel: '지금', messages: [...c.messages, assistantMsg] }
              : c,
          ),
        );
      }, 320);
      return;
    }

    const sessionId = activeId;
    setConversations((prev) =>
      prev.map((c) =>
        c.id === sessionId
          ? {
              ...c,
              title: c.messages.length === 0 ? nrmAiLabTitleFromPrompt(text) : c.title,
              updatedAtLabel: '지금',
              messages: [...c.messages, userMsg],
            }
          : c,
      ),
    );
    setTimeout(() => {
      setConversations((prev) =>
        prev.map((c) =>
          c.id === sessionId
            ? { ...c, updatedAtLabel: '지금', messages: [...c.messages, assistantMsg] }
            : c,
        ),
      );
    }, 320);
  }, [activeId, draft]);

  const renderMessage = useCallback(
    ({ item }: ListRenderItemInfo<NrmAiLabMessage>) => {
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
            ]}>
            <Text style={[styles.msgText, { color: titleColor }]}>{item.content}</Text>
          </View>
        </NrmAiLabMessageEnter>
      );
    },
    [hairline, titleColor, userBubbleBg],
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
        ListEmptyComponent={emptyChat}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
        showsVerticalScrollIndicator={Platform.OS === 'web'}
        onContentSizeChange={() => {
          if (messages.length > 0) listRef.current?.scrollToEnd({ animated: false });
        }}
      />

      <View style={{ paddingHorizontal: padH }}>
        <NrmAiLabComposer
          isDark={isDark}
          value={draft}
          onChangeText={setDraft}
          onSend={handleSend}
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
              conversations={conversations}
              activeId={activeId}
              llmModel={llmModel}
              onLlmModelChange={setLlmModel}
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
  msgText: {
    fontSize: nrmTokens.font.body,
    lineHeight: 24,
    fontWeight: '400',
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
