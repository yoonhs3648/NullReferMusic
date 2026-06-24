import Ionicons from '@expo/vector-icons/Ionicons';
import { memo, useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  FlatList,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { nrmTokens } from '@/constants/nrmTokens';
import type { NrmAlarmFeed } from '@/lib/nrmAlarmFeed';
import type { NrmAlarmItem } from '@/lib/nrmAlarmClient';
import { peekReadAlarmIds } from '@/lib/nrmAlarmReadState';
import { getNrmModalScrimColor } from '@/lib/nrmUiAppearanceColors';

const keyExtractorAlarm = (row: NrmAlarmItem) => String(row.id);

type Props = {
  isDark: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  feed: NrmAlarmFeed;
};

function AlarmListRowInner({
  item,
  isDark,
  expanded,
  isRead,
  onToggle,
}: {
  item: NrmAlarmItem;
  isDark: boolean;
  expanded: boolean;
  isRead: boolean;
  onToggle: (id: number) => void;
}) {
  const titleColor = isDark ? nrmTokens.color.bodyOnDark : nrmTokens.color.ink;
  const bodyColor = isDark ? nrmTokens.color.textMuted : nrmTokens.color.inkMuted48;
  const readTitleColor = isDark ? 'rgba(255,255,255,0.58)' : nrmTokens.color.inkMuted80;
  const hairline = isDark ? nrmTokens.color.borderOnDark : nrmTokens.color.hairline;
  const cardBg = isDark ? 'rgba(255,255,255,0.05)' : '#fff';
  const expandedBg = isDark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)';
  const contentLines = item.content.split('\n');

  return (
    <View style={[styles.row, { borderColor: hairline, backgroundColor: cardBg }]}>
      <Pressable
        onPress={() => onToggle(item.id)}
        style={({ pressed }) => [styles.rowHead, pressed && styles.rowPressed]}
        accessibilityRole="button"
        accessibilityState={{ expanded }}>
        <View style={styles.rowTitleLine}>
          {item.isNoti ? (
            <View style={styles.noticeBadge}>
              <Text style={styles.noticeBadgeText}>공지</Text>
            </View>
          ) : null}
          <View style={styles.titleWithBadge}>
            <Text
              style={[
                styles.rowTitle,
                { color: isRead ? readTitleColor : titleColor },
                !isRead && styles.rowTitleUnread,
              ]}
              numberOfLines={expanded ? undefined : 2}>
              {item.title}
            </Text>
            {!isRead ? (
              <View style={styles.newBadge}>
                <Text style={styles.newBadgeText}>N</Text>
              </View>
            ) : null}
          </View>
          <Ionicons
            name={expanded ? 'chevron-up' : 'chevron-down'}
            size={16}
            color={bodyColor}
            style={styles.rowChevron}
          />
        </View>
        <Text style={[styles.rowDate, { color: bodyColor }]}>{item.date}</Text>
      </Pressable>
      {expanded ? (
        <View style={[styles.rowBody, { borderTopColor: hairline, backgroundColor: expandedBg }]}>
          {contentLines.map((line, i) => (
            <Text
              key={`${item.id}-line-${i}`}
              style={[styles.rowContent, { color: bodyColor }]}>
              {line}
            </Text>
          ))}
        </View>
      ) : null}
    </View>
  );
}

const AlarmListRow = memo(AlarmListRowInner);

/** 우측 알림 레이어 — GitHub alarm.json 기반 인앱 알림 */
export function NrmAppNotificationDrawer({ isDark, open, onOpenChange, feed }: Props) {
  const { width: windowWidth } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const drawerW = Math.max(280, Math.min(380, Math.round(windowWidth * 0.88) || 320));
  const drawerWRef = useRef(drawerW);
  drawerWRef.current = drawerW;
  const translateX = useRef(new Animated.Value(drawerW)).current;
  const [visible, setVisible] = useState(open);
  const [readIds, setReadIds] = useState<Set<number>>(() => new Set());
  const feedRef = useRef(feed);
  feedRef.current = feed;

  const titleColor = isDark ? nrmTokens.color.bodyOnDark : nrmTokens.color.ink;
  const bodyColor = isDark ? nrmTokens.color.textMuted : nrmTokens.color.inkMuted48;
  const modalScrim = getNrmModalScrimColor(isDark);

  /** feed/readIds의 최신 값을 ref로 유지 — onToggle 참조 안정화용 */
  const readIdsRef = useRef(readIds);
  readIdsRef.current = readIds;

  const dismiss = useCallback(() => {
    Animated.timing(translateX, {
      toValue: drawerW,
      duration: 220,
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (finished) {
        setVisible(false);
        onOpenChange(false);
      }
    });
  }, [drawerW, onOpenChange, translateX]);

  useEffect(() => {
    if (!open) return;
    feedRef.current.collapseAllExpanded();
    setVisible(true);
    const w = drawerWRef.current;
    translateX.setValue(w);
    Animated.timing(translateX, {
      toValue: 0,
      duration: 260,
      useNativeDriver: true,
    }).start();
    void feedRef.current.reload(true);
    void peekReadAlarmIds().then(setReadIds);
  }, [open, translateX]);

  useEffect(() => {
    if (!open) return;
    translateX.setValue(0);
  }, [drawerW, open, translateX]);

  useEffect(() => {
    if (open || !visible) return;
    dismiss();
  }, [dismiss, open, visible]);

  /** 참조가 안정적 — feed/readIds를 ref로 읽으므로 deps 불필요 */
  const onToggle = useCallback((id: number) => {
    feedRef.current.toggleExpanded(id);
    if (!readIdsRef.current.has(id)) {
      setReadIds((prev) => new Set(prev).add(id));
    }
  }, []);

  const onRefreshPull = useCallback(() => {
    void feed.pullToRefresh();
  }, [feed]);

  const renderItem = useCallback(
    ({ item }: { item: NrmAlarmItem }) => (
      <AlarmListRow
        item={item}
        isDark={isDark}
        expanded={feed.expandedIds.has(item.id)}
        isRead={readIds.has(item.id)}
        onToggle={onToggle}
      />
    ),
    [feed.expandedIds, isDark, onToggle, readIds],
  );

  if (!visible) return null;

  return (
    <Modal
      visible
      transparent
      animationType="none"
      onRequestClose={dismiss}
      statusBarTranslucent
      hardwareAccelerated>
      <View style={styles.modalRoot}>
        <Pressable
          style={[StyleSheet.absoluteFill, { backgroundColor: modalScrim }]}
          onPress={dismiss}
          accessibilityLabel="닫기"
        />
        <Animated.View
          style={[
            styles.drawer,
            {
              width: drawerW,
              paddingTop: insets.top,
              paddingBottom: insets.bottom + nrmTokens.layout.menuDrawerCloseBottomGap,
              backgroundColor: isDark ? nrmTokens.color.surfaceTile1 : nrmTokens.color.canvas,
              transform: [{ translateX }],
            },
          ]}
          accessibilityViewIsModal>
          <View style={styles.drawerColumn}>
            <View style={styles.body}>
              <Text style={[styles.title, { color: titleColor }]}>알림</Text>
              {feed.loading ? (
                <View style={styles.centered}>
                  <ActivityIndicator color={nrmTokens.color.primary} />
                </View>
              ) : feed.items.length === 0 ? (
                <Text style={[styles.hint, { color: bodyColor }]}>
                  최근 30일 이내 알림이 없습니다.
                </Text>
              ) : (
                <FlatList
                  data={feed.items}
                  keyExtractor={keyExtractorAlarm}
                  renderItem={renderItem}
                  refreshControl={
                    <RefreshControl
                      refreshing={feed.refreshing}
                      onRefresh={onRefreshPull}
                      tintColor={nrmTokens.color.primary}
                    />
                  }
                  contentContainerStyle={styles.listContent}
                  showsVerticalScrollIndicator={false}
                  keyboardShouldPersistTaps="always"
                  overScrollMode="never"
                  initialNumToRender={15}
                  maxToRenderPerBatch={10}
                  windowSize={8}
                />
              )}
            </View>
            <Pressable
              onPress={dismiss}
              style={({ pressed }) => [styles.footerClose, pressed && styles.footerClosePressed]}
              accessibilityRole="button"
              accessibilityLabel="닫기">
              <Text style={[styles.footerCloseLabel, { color: titleColor }]}>닫기</Text>
            </Pressable>
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalRoot: {
    flex: 1,
  },
  drawer: {
    position: 'absolute',
    right: 0,
    top: 0,
    bottom: 0,
    height: '100%',
    maxHeight: '100%',
    flexDirection: 'column',
    borderTopLeftRadius: nrmTokens.radius.lg,
    borderBottomLeftRadius: nrmTokens.radius.lg,
    zIndex: 1,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: -2, height: 0 },
        shadowOpacity: 0.18,
        shadowRadius: 12,
      },
      android: { elevation: 16 },
      default: {},
    }),
  },
  drawerColumn: {
    flex: 1,
  },
  body: {
    flex: 1,
    paddingHorizontal: nrmTokens.space.lg,
    paddingTop: nrmTokens.space.lg,
  },
  title: {
    fontSize: nrmTokens.font.leadAiry,
    fontWeight: '700',
    marginBottom: nrmTokens.space.md,
  },
  hint: {
    fontSize: nrmTokens.font.body,
    lineHeight: 22,
  },
  centered: {
    paddingVertical: nrmTokens.space.xl,
    alignItems: 'center',
  },
  listContent: {
    paddingBottom: nrmTokens.space.md,
  },
  row: {
    borderWidth: 1,
    borderRadius: nrmTokens.radius.md,
    marginBottom: nrmTokens.space.sm,
    overflow: 'hidden',
  },
  rowHead: {
    gap: nrmTokens.space.xs,
    paddingHorizontal: nrmTokens.space.md,
    paddingVertical: nrmTokens.space.sm + 2,
    minHeight: 44,
  },
  rowPressed: {
    opacity: 0.88,
  },
  rowTitleLine: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: nrmTokens.space.xs,
  },
  titleWithBadge: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 6,
    minWidth: 0,
  },
  noticeBadge: {
    backgroundColor: nrmTokens.color.primary,
    borderRadius: nrmTokens.radius.sm,
    paddingHorizontal: 6,
    paddingVertical: 2,
    marginTop: 2,
  },
  noticeBadgeText: {
    color: nrmTokens.color.onPrimary,
    fontSize: 11,
    fontWeight: '700',
  },
  newBadge: {
    backgroundColor: nrmTokens.color.primary,
    borderRadius: 999,
    minWidth: 18,
    height: 18,
    paddingHorizontal: 5,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  newBadgeText: {
    color: nrmTokens.color.onPrimary,
    fontSize: 10,
    fontWeight: '800',
    lineHeight: 12,
  },
  rowTitle: {
    flexShrink: 1,
    fontSize: nrmTokens.font.body,
    lineHeight: 22,
    fontWeight: '400',
  },
  rowTitleUnread: {
    fontWeight: '800',
  },
  rowChevron: {
    marginTop: 3,
  },
  rowDate: {
    fontSize: 11,
    marginTop: 2,
    opacity: 0.55,
  },
  rowBody: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: nrmTokens.space.md,
    paddingTop: nrmTokens.space.sm,
    paddingBottom: nrmTokens.space.md,
    gap: 4,
  },
  rowContent: {
    fontSize: nrmTokens.font.body,
    lineHeight: 22,
  },
  footerClose: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: nrmTokens.layout.touchMin,
    marginHorizontal: nrmTokens.space.lg,
    borderRadius: nrmTokens.radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(128,128,128,0.35)',
  },
  footerClosePressed: {
    opacity: 0.88,
  },
  footerCloseLabel: {
    fontSize: nrmTokens.font.bodyStrong,
    fontWeight: '600',
  },
});
