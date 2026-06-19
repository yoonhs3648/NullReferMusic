import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { nrmTokens } from '@/constants/nrmTokens';
import {
  formatActivityHistoryLabel,
  invalidateActivityHistoryCache,
  peekActivityHistoryForDisplay,
  type NrmActivityHistoryEntry,
} from '@/lib/nrmActivityHistory';
import {
  activityHistoryDisplaySubtitle,
  registerActivityHistoryDisplayListener,
  type NrmActivityHistoryDisplayDays,
} from '@/lib/nrmActivityHistorySettings';

type Props = {
  isDark: boolean;
};

function formatWhen(ts: number): string {
  const d = new Date(ts);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** 설정된 기간의 다운로드·가사생성 기록 (읽기 전용) */
export function NrmHomeHistoryScreen({ isDark }: Props) {
  const [items, setItems] = useState<NrmActivityHistoryEntry[]>([]);
  const [displayDays, setDisplayDays] = useState<NrmActivityHistoryDisplayDays>('90');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const titleColor = isDark ? nrmTokens.color.bodyOnDark : nrmTokens.color.ink;
  const bodyColor = isDark ? nrmTokens.color.textMuted : nrmTokens.color.inkMuted48;
  const hairline = isDark ? nrmTokens.color.borderOnDark : nrmTokens.color.hairline;
  const subtitle = activityHistoryDisplaySubtitle(displayDays);

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

  return (
    <View style={styles.wrap}>
      <Text style={[styles.title, { color: titleColor }]}>History</Text>
      <Text style={[styles.subtitle, { color: bodyColor }]}>{subtitle}</Text>
      {loading ? (
        <ActivityIndicator style={styles.loader} color={nrmTokens.color.primary} />
      ) : (
        <FlatList
          data={items}
          keyExtractor={(item) => item.id}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void onRefresh()} />}
          contentContainerStyle={items.length === 0 ? styles.emptyContent : styles.listContent}
          ListEmptyComponent={
            <Text style={[styles.empty, { color: bodyColor }]}>{emptyMessage}</Text>
          }
          renderItem={({ item }) => (
            <View style={[styles.row, { borderBottomColor: hairline }]}>
              <Text style={[styles.rowLabel, { color: titleColor }]} numberOfLines={2}>
                {formatActivityHistoryLabel(item)}
              </Text>
              <Text style={[styles.rowWhen, { color: bodyColor }]}>{formatWhen(item.createdAt)}</Text>
            </View>
          )}
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
  title: {
    fontSize: nrmTokens.font.leadAiry,
    fontWeight: '700',
    marginBottom: nrmTokens.space.xxs,
  },
  subtitle: {
    fontSize: nrmTokens.font.caption,
    marginBottom: nrmTokens.space.md,
  },
  loader: {
    marginTop: nrmTokens.space.xl,
  },
  listContent: {
    paddingBottom: nrmTokens.space.xl,
  },
  emptyContent: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingBottom: nrmTokens.space.xl,
  },
  empty: {
    textAlign: 'center',
    fontSize: nrmTokens.font.body,
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
