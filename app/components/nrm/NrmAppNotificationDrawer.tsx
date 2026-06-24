import Ionicons from '@expo/vector-icons/Ionicons';
import { useCallback, useEffect, useRef, useState } from 'react';
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

function AlarmListRow({
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
  onToggle: () => void;
}) {
  const titleColor = isDark ? nrmTokens.color.bodyOnDark : nrmTokens.color.ink;
  const bodyColor = isDark ? nrmTokens.color.textMuted : nrmTokens.color.inkMuted48;
  const hairline = isDark ? nrmTokens.color.borderOnDark : nrmTokens.color.hairline;
  const contentLines = item.content.split('\n');

  return (
    <View style={[styles.row, { borderBottomColor: hairline }]}>
      <Pressable
        onPress={onToggle}
        style={({ pressed }) => [styles.rowHead, pressed && styles.rowPressed]}
        accessibilityRole="button"
        accessibilityState={{ expanded }}>
        <View style={styles.rowTitleLine}>
          {item.isNoti ? (
            <View style={styles.noticeBadge}>
              <Text style={styles.noticeBadgeText}>공지</Text>
            </View>
          ) : null}
          <Text
            style={[
              styles.rowTitle,
              { color: titleColor },
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
        <View style={styles.rowBody}>
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

/** 우측 알림 레이어 — GitHub alarm.json 기반 인앱 알림 */
export function NrmAppNotificationDrawer({ isDark, open, onOpenChange, feed }: Props) {
  const { width: windowWidth } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const drawerW = Math.min(380, Math.round(windowWidth * 0.88));
  const translateX = useRef(new Animated.Value(drawerW)).current;
  const [visible, setVisible] = useState(open);
  const [readIds, setReadIds] = useState<Set<number>>(() => new Set());

  const titleColor = isDark ? nrmTokens.color.bodyOnDark : nrmTokens.color.ink;
  const bodyColor = isDark ? nrmTokens.color.textMuted : nrmTokens.color.inkMuted48;
  const modalScrim = getNrmModalScrimColor(isDark);

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
    if (open) {
      feed.collapseAllExpanded();
      setVisible(true);
      translateX.setValue(drawerW);
      Animated.timing(translateX, {
        toValue: 0,
        duration: 260,
        useNativeDriver: true,
      }).start();
      void feed.reload(true);
      void peekReadAlarmIds().then(setReadIds);
      return;
    }
    if (visible) dismiss();
  }, [dismiss, drawerW, feed.collapseAllExpanded, feed.reload, open, translateX, visible]);

  const onToggle = useCallback(
    (id: number) => {
      feed.toggleExpanded(id);
      if (!readIds.has(id)) {
        setReadIds((prev) => new Set(prev).add(id));
      }
    },
    [feed, readIds],
  );

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
        onToggle={() => onToggle(item.id)}
      />
    ),
    [feed.expandedIds, isDark, onToggle, readIds],
  );

  if (!visible) return null;

  return (
    <Modal visible transparent animationType="none" onRequestClose={dismiss}>
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
          ]}>
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
    flexDirection: 'row',
    justifyContent: 'flex-end',
  },
  drawer: {
    height: '100%',
    borderTopLeftRadius: nrmTokens.radius.lg,
    borderBottomLeftRadius: nrmTokens.radius.lg,
    overflow: 'hidden',
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
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingVertical: nrmTokens.space.sm,
  },
  rowHead: {
    gap: nrmTokens.space.xs,
  },
  rowPressed: {
    opacity: 0.88,
  },
  rowTitleLine: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: nrmTokens.space.xs,
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
    flex: 1,
    fontSize: nrmTokens.font.body,
    lineHeight: 22,
    fontWeight: '400',
  },
  rowTitleUnread: {
    fontWeight: '700',
  },
  rowChevron: {
    marginTop: 3,
  },
  rowDate: {
    fontSize: nrmTokens.font.caption,
    marginTop: 2,
  },
  rowBody: {
    marginTop: nrmTokens.space.sm,
    paddingLeft: nrmTokens.space.xs,
    gap: 2,
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
