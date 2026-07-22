import Ionicons from '@expo/vector-icons/Ionicons';
import { useMemo, useState } from 'react';
import {
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { NrmAiLabModelPicker } from '@/components/nrm/discover/NrmAiLabModelPicker';
import { NrmMenuDrawerScroll } from '@/components/nrm/NrmMenuDrawerScroll';
import { nrmTokens } from '@/constants/nrmTokens';
import { getNrmModalScrimColor } from '@/lib/nrmUiAppearanceColors';

type DrawerPanel = 'root' | 'usage';

export type NrmAiLabSidebarConversation = {
  id: string;
  title: string;
  updatedAtLabel: string;
};

type Props = {
  isDark: boolean;
  conversations: NrmAiLabSidebarConversation[];
  activeId: string | null;
  llmProviderId: number | null;
  onLlmProviderChange: (providerId: number) => void;
  onSelect: (id: string) => void;
  onNewChat: () => void;
  onDelete: (id: string) => void;
  onDismiss: () => void;
};

/** AI Lab 좌측 메뉴 — 앱 메뉴와 동일한 행·폰트·하단 닫기 패턴. */
export function NrmAiLabSidebar({
  isDark,
  conversations,
  activeId,
  llmProviderId,
  onLlmProviderChange,
  onSelect,
  onNewChat,
  onDelete,
  onDismiss,
}: Props) {
  const [panel, setPanel] = useState<DrawerPanel>('root');
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [menuForId, setMenuForId] = useState<string | null>(null);

  const titleColor = isDark ? nrmTokens.color.bodyOnDark : nrmTokens.color.ink;
  const bodyColor = isDark ? nrmTokens.color.textMuted : nrmTokens.color.inkMuted80;
  const hairline = isDark ? nrmTokens.color.borderOnDark : nrmTokens.color.hairline;
  const rowHover = isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)';
  const activeBg = isDark ? 'rgba(0, 102, 204, 0.22)' : 'rgba(0, 102, 204, 0.10)';
  const inputBg = isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.03)';
  const sheetBg = isDark ? nrmTokens.color.surfaceTile2 : nrmTokens.color.canvas;

  const filtered = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return conversations;
    return conversations.filter((c) => c.title.toLowerCase().includes(q));
  }, [conversations, searchQuery]);

  const footerClose = (
    <Pressable
      onPress={onDismiss}
      style={({ pressed }) => [
        styles.footerClose,
        Platform.OS !== 'web' && styles.footerCloseCompact,
        pressed && styles.footerClosePressed,
      ]}
      accessibilityRole="button"
      accessibilityLabel="닫기">
      <Text style={[styles.footerCloseLabel, { color: titleColor }]}>닫기</Text>
    </Pressable>
  );

  if (panel === 'usage') {
    return (
      <View style={styles.root}>
        <NrmMenuDrawerScroll contentContainerStyle={styles.scrollContent}>
          <Pressable
            onPress={() => setPanel('root')}
            style={({ pressed }) => [styles.backRow, pressed && { backgroundColor: rowHover }]}
            accessibilityRole="button"
            accessibilityLabel="뒤로">
            <Ionicons name="chevron-back" size={20} color={nrmTokens.color.primary} />
            <Text style={[styles.backLabel, { color: nrmTokens.color.primary }]}>뒤로</Text>
          </Pressable>
          <Text style={[styles.panelTitle, { color: titleColor }]}>사용량 조회</Text>
        </NrmMenuDrawerScroll>
        {footerClose}
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <NrmMenuDrawerScroll contentContainerStyle={styles.scrollContent}>
        <View style={styles.modelRow}>
          <NrmAiLabModelPicker
            isDark={isDark}
            value={llmProviderId}
            onChange={onLlmProviderChange}
            presentation="menuRow"
          />
        </View>

        <Pressable
          onPress={() => setPanel('usage')}
          style={({ pressed }) => [styles.row, pressed && { backgroundColor: rowHover }]}
          accessibilityRole="button"
          accessibilityLabel="사용량 조회">
          <View style={styles.rowLeft}>
            <View style={styles.iconSlot}>
              <Ionicons name="stats-chart-outline" size={22} color={titleColor} />
            </View>
            <Text style={[styles.rowLabel, { color: titleColor }]}>사용량 조회</Text>
          </View>
        </Pressable>

        <Pressable
          onPress={() => {
            setSearchOpen((v) => !v);
            if (searchOpen) setSearchQuery('');
          }}
          style={({ pressed }) => [styles.row, pressed && { backgroundColor: rowHover }]}
          accessibilityRole="button"
          accessibilityLabel="검색">
          <View style={styles.rowLeft}>
            <View style={styles.iconSlot}>
              <Ionicons name="search-outline" size={22} color={titleColor} />
            </View>
            <Text style={[styles.rowLabel, { color: titleColor }]}>검색</Text>
          </View>
        </Pressable>

        {searchOpen ? (
          <View style={[styles.searchBox, { borderColor: hairline, backgroundColor: inputBg }]}>
            <Ionicons name="search-outline" size={18} color={bodyColor} />
            <TextInput
              value={searchQuery}
              onChangeText={setSearchQuery}
              placeholder="대화 검색"
              placeholderTextColor={isDark ? '#6b7288' : '#9ca3af'}
              style={[styles.searchInput, { color: titleColor }]}
              autoFocus
            />
          </View>
        ) : null}

        <Text style={[styles.sectionLabel, { color: bodyColor }]}>최근</Text>

        {filtered.length === 0 ? (
          <Text style={[styles.emptyListText, { color: bodyColor }]}>
            {searchQuery.trim() ? '검색 결과가 없습니다.' : '대화 내역이 없습니다.'}
          </Text>
        ) : null}

        {filtered.map((c) => {
          const active = c.id === activeId;
          return (
            <View
              key={c.id}
              style={[styles.chatRowWrap, active && { backgroundColor: activeBg }]}>
              <Pressable
                onPress={() => onSelect(c.id)}
                style={({ pressed }) => [
                  styles.chatRowMain,
                  pressed && !active && { backgroundColor: rowHover },
                ]}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                accessibilityLabel={c.title}>
                <Text style={[styles.chatTitle, { color: titleColor }]} numberOfLines={1}>
                  {c.title}
                </Text>
                {c.updatedAtLabel ? (
                  <Text style={[styles.chatSubtitle, { color: bodyColor }]} numberOfLines={1}>
                    {c.updatedAtLabel}
                  </Text>
                ) : null}
              </Pressable>
              <Pressable
                onPress={() => setMenuForId(c.id)}
                hitSlop={12}
                style={({ pressed }) => [styles.moreBtn, pressed && { opacity: 0.72 }]}
                accessibilityRole="button"
                accessibilityLabel="더보기">
                <Ionicons name="ellipsis-horizontal" size={18} color={bodyColor} />
              </Pressable>
            </View>
          );
        })}
      </NrmMenuDrawerScroll>

      <Pressable
        onPress={onNewChat}
        style={({ pressed }) => [styles.newChatBtn, pressed && styles.newChatBtnPressed]}
        accessibilityRole="button"
        accessibilityLabel="새 대화">
        <Ionicons name="create-outline" size={18} color={nrmTokens.color.onPrimary} />
        <Text style={styles.newChatLabel}>새 대화</Text>
      </Pressable>

      {footerClose}

      <Modal
        visible={menuForId != null}
        transparent
        animationType="fade"
        onRequestClose={() => setMenuForId(null)}
        statusBarTranslucent>
        <Pressable
          style={[styles.menuBackdrop, { backgroundColor: getNrmModalScrimColor(isDark) }]}
          onPress={() => setMenuForId(null)}>
          <Pressable
            style={[styles.actionSheet, { backgroundColor: sheetBg, borderColor: hairline }]}
            onPress={(e) => e.stopPropagation()}>
            <Pressable
              onPress={() => {
                const id = menuForId;
                setMenuForId(null);
                if (id) onDelete(id);
              }}
              style={({ pressed }) => [
                styles.actionRow,
                pressed && { backgroundColor: rowHover },
              ]}
              accessibilityRole="button"
              accessibilityLabel="삭제">
              <Ionicons name="trash-outline" size={20} color={nrmTokens.color.danger} />
              <Text style={[styles.actionLabel, { color: nrmTokens.color.danger }]}>삭제</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    minHeight: 0,
    width: '100%',
    flexDirection: 'column',
  },
  scrollContent: {
    flexGrow: 1,
    paddingBottom: nrmTokens.space.sm,
    ...Platform.select({
      web: {},
      default: { paddingRight: nrmTokens.space.xxs },
    }),
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: nrmTokens.space.md,
    paddingHorizontal: nrmTokens.space.xs,
    borderRadius: nrmTokens.radius.sm,
    marginBottom: nrmTokens.space.xs,
  },
  modelRow: {
    marginBottom: nrmTokens.space.xs,
  },
  rowLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: nrmTokens.space.sm,
    flex: 1,
    minWidth: 0,
  },
  iconSlot: {
    width: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowLabel: {
    fontSize: nrmTokens.font.body,
    fontWeight: '500',
  },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: nrmTokens.space.xs,
    marginBottom: nrmTokens.space.sm,
    marginHorizontal: nrmTokens.space.xs,
    paddingHorizontal: nrmTokens.space.sm,
    borderRadius: nrmTokens.radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    minHeight: 40,
  },
  searchInput: {
    flex: 1,
    fontSize: nrmTokens.font.body,
    paddingVertical: Platform.OS === 'ios' ? 8 : 6,
  },
  sectionLabel: {
    fontSize: nrmTokens.font.caption,
    fontWeight: '600',
    paddingHorizontal: nrmTokens.space.xs,
    paddingTop: nrmTokens.space.xs,
    paddingBottom: nrmTokens.space.xs,
  },
  chatRowWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: nrmTokens.radius.sm,
    marginBottom: 2,
    paddingRight: nrmTokens.space.xxs,
    zIndex: 1,
  },
  chatRowMain: {
    flex: 1,
    minWidth: 0,
    paddingVertical: 10,
    paddingHorizontal: nrmTokens.space.xs,
    borderRadius: nrmTokens.radius.sm,
  },
  chatTitle: {
    fontSize: nrmTokens.font.body,
    fontWeight: '400',
  },
  chatSubtitle: {
    fontSize: nrmTokens.font.caption,
    fontWeight: '400',
    marginTop: 1,
  },
  emptyListText: {
    fontSize: nrmTokens.font.body,
    paddingHorizontal: nrmTokens.space.xs,
    paddingVertical: nrmTokens.space.sm,
  },
  moreBtn: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 2,
  },
  backRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: nrmTokens.space.sm,
    paddingHorizontal: nrmTokens.space.xs,
    borderRadius: nrmTokens.radius.sm,
    marginBottom: nrmTokens.space.sm,
    alignSelf: 'flex-start',
  },
  backLabel: {
    fontSize: nrmTokens.font.body,
    fontWeight: '500',
  },
  panelTitle: {
    fontSize: nrmTokens.font.lead,
    fontWeight: '600',
    paddingHorizontal: nrmTokens.space.xs,
    marginBottom: nrmTokens.space.md,
  },
  newChatBtn: {
    alignSelf: 'stretch',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: nrmTokens.space.xs,
    minHeight: nrmTokens.layout.touchMin,
    marginTop: nrmTokens.space.sm,
    borderRadius: nrmTokens.radius.pill,
    backgroundColor: nrmTokens.color.primary,
    paddingHorizontal: nrmTokens.space.md,
    ...Platform.select({
      web: {},
      default: { marginRight: nrmTokens.space.xxs },
    }),
  },
  newChatBtnPressed: { opacity: 0.88, transform: [{ scale: 0.98 }] },
  newChatLabel: {
    color: nrmTokens.color.onPrimary,
    fontSize: nrmTokens.font.body,
    fontWeight: '600',
  },
  footerClose: {
    alignSelf: 'stretch',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 11,
    marginTop: nrmTokens.space.sm,
    marginBottom: nrmTokens.layout.menuDrawerCloseBottomGap,
    borderRadius: nrmTokens.radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(128,128,128,0.35)',
    ...Platform.select({
      web: {},
      default: { marginRight: nrmTokens.space.xxs },
    }),
  },
  footerCloseCompact: {
    marginTop: nrmTokens.space.xs,
  },
  footerClosePressed: { opacity: 0.92 },
  footerCloseLabel: {
    fontSize: nrmTokens.font.body,
    fontWeight: '500',
  },
  menuBackdrop: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: nrmTokens.space.lg,
  },
  actionSheet: {
    borderRadius: nrmTokens.radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: nrmTokens.space.sm,
    paddingVertical: nrmTokens.space.md,
    paddingHorizontal: nrmTokens.space.md,
  },
  actionLabel: {
    fontSize: nrmTokens.font.body,
    fontWeight: '600',
  },
});
