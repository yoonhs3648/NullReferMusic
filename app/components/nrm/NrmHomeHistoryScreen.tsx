import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  RefreshControl,
  SectionList,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { nrmTokens } from '@/constants/nrmTokens';
import {
  formatActivityHistoryLabel,
  formatActivityHistoryTime,
  groupActivityHistoryByDate,
  invalidateActivityHistoryCache,
  peekActivityHistoryForDisplay,
  type NrmActivityHistoryEntry,
  type NrmActivityHistorySection,
} from '@/lib/nrmActivityHistory';
import {
  registerActivityHistoryDisplayListener,
  DEFAULT_ACTIVITY_HISTORY_DISPLAY_DAYS,
  type NrmActivityHistoryDisplayDays,
} from '@/lib/nrmActivityHistorySettings';

type Props = {
  isDark: boolean;
};

/** 설정된 기간의 다운로드·가사 생성 기록 (읽기 전용) */
export function NrmHomeHistoryScreen({ isDark }: Props) {
  const [items, setItems] = useState<NrmActivityHistoryEntry[]>([]);
  const [displayDays, setDisplayDays] = useState<NrmActivityHistoryDisplayDays>(
    DEFAULT_ACTIVITY_HISTORY_DISPLAY_DAYS,
  );
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const titleColor = isDark ? nrmTokens.color.bodyOnDark : nrmTokens.color.ink;
  const bodyColor = isDark ? nrmTokens.color.textMuted : nrmTokens.color.inkMuted48;
  const hairline = isDark ? nrmTokens.color.borderOnDark : nrmTokens.color.hairline;
  const sectionHeaderBg = isDark ? nrmTokens.color.surfaceTile1 : nrmTokens.color.canvas;

  const sections = useMemo(() => groupActivityHistoryByDate(items), [items]);

  const applySnapshot = useCallback(
    (days: NrmActivityHistoryDisplayDays, rows: NrmActivityHistoryEntry[]) => {
      setDisplayDays(days);
      setItems(rows);
    },
    [],
  );

  useEffect(() => {
    void (async () => {
      setLoading(true);
      const peek = await peekActivityHistoryForDisplay();
      applySnapshot(peek.displayDays, peek.items);
      setLoading(false);
    })();
  }, [applySnapshot]);

  useEffect(() => {
    registerActivityHistoryDisplayListener((days) => {
      void peekActivityHistoryForDisplay().then((peek) => {
        if (peek.displayDays === days) {
          applySnapshot(days, peek.items);
        }
      });
    });
    return () => registerActivityHistoryDisplayListener(null);
  }, [applySnapshot]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    invalidateActivityHistoryCache();
    const peek = await peekActivityHistoryForDisplay();
    applySnapshot(peek.displayDays, peek.items);
    setRefreshing(false);
  }, [applySnapshot]);

  const emptyMessage =
    displayDays === '0' ? 'History 표시가 꺼져 있습니다.' : '최근 기록이 없습니다.';

  const renderSectionHeader = useCallback(
    ({ section }: { section: NrmActivityHistorySection }) => (
      <View style={[styles.sectionHeader, { backgroundColor: sectionHeaderBg }]}>
        <Text style={[styles.sectionHeaderLabel, { color: bodyColor }]}>{section.title}</Text>
      </View>
    ),
    [bodyColor, sectionHeaderBg],
  );

  const renderItem = useCallback(
    ({ item }: { item: NrmActivityHistoryEntry }) => (
      <View style={[styles.row, { borderBottomColor: hairline }]}>
        <Text style={[styles.rowLabel, { color: titleColor }]} numberOfLines={2}>
          {formatActivityHistoryLabel(item)}
        </Text>
        <Text style={[styles.rowWhen, { color: bodyColor }]}>
          {formatActivityHistoryTime(item.createdAt)}
        </Text>
      </View>
    ),
    [bodyColor, hairline, titleColor],
  );

  return (
    <View style={styles.wrap}>
      {loading ? (
        <ActivityIndicator style={styles.loader} color={nrmTokens.color.primary} />
      ) : (
        <SectionList
          sections={sections}
          keyExtractor={(item) => item.id}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={() => void onRefresh()} />
          }
          contentContainerStyle={sections.length === 0 ? styles.emptyContent : styles.listContent}
          ListEmptyComponent={
            <Text style={[styles.empty, { color: bodyColor }]}>{emptyMessage}</Text>
          }
          renderSectionHeader={renderSectionHeader}
          renderItem={renderItem}
          stickySectionHeadersEnabled
          showsVerticalScrollIndicator={false}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
    minHeight: 0,
    width: '100%',
    paddingHorizontal: nrmTokens.space.md,
    paddingTop: nrmTokens.space.sm,
  },
  loader: {
    marginTop: nrmTokens.space.xl,
  },
  listContent: {
    paddingBottom: nrmTokens.space.xxl,
  },
  emptyContent: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingBottom: nrmTokens.space.xxl,
  },
  empty: {
    textAlign: 'center',
    fontSize: nrmTokens.font.body,
  },
  sectionHeader: {
    paddingHorizontal: nrmTokens.space.xs,
    paddingVertical: nrmTokens.space.xxs,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(128,128,128,0.25)',
  },
  sectionHeaderLabel: {
    fontSize: nrmTokens.font.finePrint,
    fontWeight: '600',
    letterSpacing: 0.3,
  },
  row: {
    paddingVertical: nrmTokens.space.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 4,
  },
  rowLabel: {
    fontSize: nrmTokens.font.body,
    fontWeight: '500',
    lineHeight: 22,
  },
  rowWhen: {
    fontSize: nrmTokens.font.caption,
  },
});
