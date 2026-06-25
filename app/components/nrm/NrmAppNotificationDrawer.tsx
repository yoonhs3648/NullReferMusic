import Ionicons from '@expo/vector-icons/Ionicons';
import {
  forwardRef,
  memo,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from 'react';
import {
  ActivityIndicator,
  Animated,
  InteractionManager,
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

import { NrmAppDrawerShell } from '@/components/nrm/NrmAppDrawerShell';
import { nrmTokens } from '@/constants/nrmTokens';
import type { NrmAlarmFeed } from '@/lib/nrmAlarmFeed';
import type { NrmAlarmItem } from '@/lib/nrmAlarmClient';
import { peekReadAlarmIds } from '@/lib/nrmAlarmReadState';
import {
  getNrmModalScrimColor,
  getNrmRootBackgroundColor,
} from '@/lib/nrmUiAppearanceColors';

type Props = {
  isDark: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  feed: NrmAlarmFeed;
};

export type NrmAppNotificationDrawerHandle = {
  open: () => void;
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
            <Text key={`${item.id}-line-${i}`} style={[styles.rowContent, { color: bodyColor }]}>
              {line}
            </Text>
          ))}
        </View>
      ) : null}
    </View>
  );
}

const AlarmListRow = memo(
  AlarmListRowInner,
  (prev, next) =>
    prev.item.id === next.item.id &&
    prev.isDark === next.isDark &&
    prev.expanded === next.expanded &&
    prev.isRead === next.isRead &&
    prev.onToggle === next.onToggle,
);

/** 우측 알림 레이어 — GitHub alarm.json 기반 인앱 알림 (메뉴 드로어와 동일 레이아웃) */
export const NrmAppNotificationDrawer = forwardRef<NrmAppNotificationDrawerHandle, Props>(
  function NrmAppNotificationDrawer({ isDark, open, onOpenChange, feed }, ref) {
    const { width: windowWidth } = useWindowDimensions();
    const insets = useSafeAreaInsets();
    const drawerW = Math.max(280, Math.min(380, Math.round(windowWidth * 0.88) || 320));
    const drawerWRef = useRef(drawerW);
    drawerWRef.current = drawerW;
    const translateX = useRef(new Animated.Value(320)).current;
    const openRef = useRef(open);
    openRef.current = open;

    const feedRef = useRef(feed);
    feedRef.current = feed;

    const [readIds, setReadIds] = useState<Set<number>>(() => new Set());
    const readIdsRef = useRef(readIds);
    readIdsRef.current = readIds;

    const rootBg = getNrmRootBackgroundColor(isDark);
    const modalScrim = getNrmModalScrimColor(isDark);
    const cardBg = isDark ? nrmTokens.color.surfaceTile1 : nrmTokens.color.canvas;
    const cardBorder = isDark ? nrmTokens.color.borderOnDark : nrmTokens.color.hairline;
    const titleColor = isDark ? nrmTokens.color.bodyOnDark : nrmTokens.color.ink;
    const bodyColor = isDark ? nrmTokens.color.textMuted : nrmTokens.color.inkMuted48;

    const dismissDrawer = useCallback(() => {
      Animated.timing(translateX, {
        toValue: drawerW,
        duration: 220,
        useNativeDriver: true,
      }).start(({ finished }) => {
        if (finished) onOpenChange(false);
      });
    }, [drawerW, onOpenChange, translateX]);

    const openDrawer = useCallback(() => {
      translateX.setValue(drawerWRef.current);
      feedRef.current.collapseAllExpanded();
      onOpenChange(true);
    }, [onOpenChange, translateX]);

    useImperativeHandle(ref, () => ({ open: openDrawer }), [openDrawer]);

    useEffect(() => {
      if (!open) return;
      Animated.timing(translateX, {
        toValue: 0,
        duration: 240,
        useNativeDriver: true,
      }).start();
      const task = InteractionManager.runAfterInteractions(() => {
        void feedRef.current.reload(false);
        void peekReadAlarmIds().then(setReadIds);
      });
      return () => task.cancel();
    }, [open, translateX]);

    useEffect(() => {
      if (!openRef.current) return;
      translateX.setValue(0);
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [drawerW]);

    const onToggle = useCallback((id: number) => {
      feedRef.current.toggleExpanded(id);
      if (!readIdsRef.current.has(id)) {
        setReadIds((prev) => new Set(prev).add(id));
      }
    }, []);

    const onRefreshPull = useCallback(() => {
      void feedRef.current.pullToRefresh();
    }, []);

    return (
      <Modal
        visible={open}
        transparent
        animationType="none"
        onRequestClose={dismissDrawer}
        statusBarTranslucent
        hardwareAccelerated>
        <View style={[styles.modalWrap, { backgroundColor: rootBg }]}>
          <Pressable
            style={[StyleSheet.absoluteFill, { backgroundColor: modalScrim }]}
            onPress={dismissDrawer}
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
            <NrmAppDrawerShell
              titleColor={titleColor}
              onDismiss={dismissDrawer}
              compactFooter={Platform.OS !== 'web'}
              refreshControl={
                feed.items.length > 0 ? (
                  <RefreshControl
                    refreshing={feed.refreshing}
                    onRefresh={onRefreshPull}
                    tintColor={nrmTokens.color.primary}
                  />
                ) : undefined
              }>
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
                feed.items.map((item) => (
                  <AlarmListRow
                    key={item.id}
                    item={item}
                    isDark={isDark}
                    expanded={feed.expandedIds.has(item.id)}
                    isRead={readIds.has(item.id)}
                    onToggle={onToggle}
                  />
                ))
              )}
            </NrmAppDrawerShell>
          </Animated.View>
        </View>
      </Modal>
    );
  },
);

const styles = StyleSheet.create({
  modalWrap: {
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
    borderWidth: StyleSheet.hairlineWidth,
    borderRightWidth: 0,
    paddingHorizontal: nrmTokens.space.lg,
    zIndex: 1,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: -4, height: 0 },
        shadowOpacity: 0.18,
        shadowRadius: 12,
      },
      android: {
        elevation: 16,
      },
      web: {
        boxShadow: '-4px 0 24px rgba(0,0,0,0.18)',
      },
    }),
  },
  title: {
    fontSize: nrmTokens.font.lead,
    fontWeight: '600',
    marginBottom: nrmTokens.space.md,
    letterSpacing: -0.4,
  },
  hint: {
    fontSize: nrmTokens.font.body,
    lineHeight: 22,
  },
  centered: {
    paddingVertical: nrmTokens.space.xl,
    alignItems: 'center',
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
    paddingTop: nrmTokens.space.sm + nrmTokens.space.xs,
    paddingBottom: nrmTokens.space.md,
    gap: 4,
  },
  rowContent: {
    fontSize: nrmTokens.font.body,
    lineHeight: 22,
  },
});
