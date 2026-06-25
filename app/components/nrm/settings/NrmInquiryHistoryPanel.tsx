import Ionicons from '@expo/vector-icons/Ionicons';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  AppState,
  type AppStateStatus,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { nrmTokens } from '@/constants/nrmTokens';
import {
  fetchInquiriesForApp,
  formatInquiryCreatedYmd,
  truncateInquiryPreview,
  type NrmInquiryItem,
} from '@/lib/nrmInquiryClient';
import { logNrmRunError } from '@/lib/nrmDevLog';
import { NRM_INQUIRY_POLL_INTERVAL_MS } from '@/lib/nrmRemoteDataConfig';

type Props = {
  titleColor: string;
  bodyColor: string;
  isDark: boolean;
};

type RowProps = {
  item: NrmInquiryItem;
  expanded: boolean;
  onToggle: (id: number) => void;
  titleColor: string;
  bodyColor: string;
  isDark: boolean;
};

function InquiryHistoryRow({
  item,
  expanded,
  onToggle,
  titleColor,
  bodyColor,
  isDark,
}: RowProps) {
  const hairline = isDark ? nrmTokens.color.borderOnDark : nrmTokens.color.hairline;
  const cardBg = isDark ? 'rgba(255,255,255,0.05)' : '#fff';
  const expandedBg = isDark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)';
  const preview = truncateInquiryPreview(item.content);
  const dateYmd = formatInquiryCreatedYmd(item.Createddate);
  const answered = item.isAnswered;

  const badgeBg = answered
    ? isDark
      ? 'rgba(110,207,138,0.22)'
      : 'rgba(46,160,87,0.12)'
    : isDark
      ? 'rgba(0,102,204,0.22)'
      : 'rgba(0,102,204,0.1)';
  const badgeColor = answered ? '#3d9a5c' : nrmTokens.color.primary;
  const badgeLabel = answered ? '답변완료' : '답변대기중';

  const onPress = useCallback(() => onToggle(item.id), [item.id, onToggle]);

  return (
    <View style={[styles.card, { borderColor: hairline, backgroundColor: cardBg }]}>
      <Pressable
        onPress={onPress}
        style={({ pressed }) => [styles.rowHead, pressed && styles.rowHeadPressed]}
        accessibilityRole="button"
        accessibilityState={{ expanded }}
        accessibilityLabel={`문의 ${dateYmd}, ${badgeLabel}`}>
        <Text style={[styles.preview, { color: titleColor }]} numberOfLines={1}>
          {preview}
        </Text>
        <View style={[styles.badge, { backgroundColor: badgeBg }]}>
          <Text style={[styles.badgeLabel, { color: badgeColor }]}>{badgeLabel}</Text>
        </View>
        <Text style={[styles.dateYmd, { color: bodyColor }]}>{dateYmd}</Text>
        <Ionicons
          name={expanded ? 'chevron-up' : 'chevron-down'}
          size={18}
          color={bodyColor}
          style={styles.chevron}
        />
      </Pressable>

      {expanded ? (
        <View style={[styles.detail, { borderTopColor: hairline, backgroundColor: expandedBg }]}>
          <Text style={[styles.detailLabel, { color: bodyColor }]}>문의내용 :</Text>
          <Text style={[styles.detailBody, { color: titleColor }]}>{item.content}</Text>

          {answered ? (
            <>
              <View style={[styles.divider, { backgroundColor: hairline }]} />
              <Text style={[styles.detailLabel, styles.replyLabel, { color: bodyColor }]}>
                답변 :
              </Text>
              <Text style={[styles.detailBody, { color: titleColor }]}>
                {item.replyContent || '—'}
              </Text>
            </>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

export function NrmInquiryHistoryPanel({ titleColor, bodyColor, isDark }: Props) {
  const [items, setItems] = useState<NrmInquiryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedIds, setExpandedIds] = useState<Set<number>>(() => new Set());

  const load = useCallback(async (opts?: { silent?: boolean }) => {
    const silent = opts?.silent === true;
    if (!silent) {
      setLoading(true);
      setError(null);
    }
    try {
      const rows = await fetchInquiriesForApp();
      setItems(rows);
      if (!silent) {
        setExpandedIds(new Set());
      }
    } catch (e) {
      if (!silent) {
        logNrmRunError('inquiry.historyLoad', e);
        setError(e instanceof Error ? e.message : '문의 내역을 불러오지 못했습니다.');
      }
    } finally {
      if (!silent) {
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const timer = setInterval(() => {
      void load({ silent: true });
    }, NRM_INQUIRY_POLL_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [load]);

  useEffect(() => {
    const onState = (state: AppStateStatus) => {
      if (state === 'active') void load({ silent: true });
    };
    const sub = AppState.addEventListener('change', onState);
    return () => sub.remove();
  }, [load]);

  const onToggle = useCallback((id: number) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  if (loading && items.length === 0) {
    return (
      <ActivityIndicator style={styles.loader} color={nrmTokens.color.primary} />
    );
  }

  if (error && items.length === 0) {
    return (
      <View style={styles.emptyWrap}>
        <Text style={[styles.emptyText, { color: bodyColor }]}>{error}</Text>
        <Pressable onPress={() => void load()} style={styles.retryBtn}>
          <Text style={styles.retryLabel}>다시 시도</Text>
        </Pressable>
      </View>
    );
  }

  if (items.length === 0) {
    return (
      <Text style={[styles.emptyText, { color: bodyColor, paddingVertical: nrmTokens.space.lg }]}>
        최근 90일 이내 등록한 문의가 없습니다.
      </Text>
    );
  }

  return (
    <View>
      {items.map((item) => (
        <InquiryHistoryRow
          key={item.id}
          item={item}
          expanded={expandedIds.has(item.id)}
          onToggle={onToggle}
          titleColor={titleColor}
          bodyColor={bodyColor}
          isDark={isDark}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  loader: {
    marginVertical: nrmTokens.space.xl,
  },
  emptyWrap: {
    gap: nrmTokens.space.md,
    paddingVertical: nrmTokens.space.lg,
  },
  emptyText: {
    fontSize: nrmTokens.font.body,
    lineHeight: 22,
  },
  retryBtn: {
    alignSelf: 'flex-start',
    paddingVertical: nrmTokens.space.xs,
  },
  retryLabel: {
    color: nrmTokens.color.primary,
    fontSize: nrmTokens.font.body,
    fontWeight: '600',
  },
  card: {
    borderWidth: 1,
    borderRadius: nrmTokens.radius.md,
    marginBottom: nrmTokens.space.sm,
    overflow: 'hidden',
  },
  rowHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: nrmTokens.space.xs,
    paddingHorizontal: nrmTokens.space.md,
    paddingVertical: nrmTokens.space.sm + 2,
    minHeight: 48,
  },
  rowHeadPressed: {
    opacity: 0.88,
  },
  preview: {
    flex: 1,
    flexShrink: 1,
    fontSize: nrmTokens.font.body,
    fontWeight: '500',
  },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: nrmTokens.radius.pill,
    flexShrink: 0,
  },
  badgeLabel: {
    fontSize: 11,
    fontWeight: '700',
  },
  dateYmd: {
    fontSize: nrmTokens.font.caption,
    flexShrink: 0,
    minWidth: 72,
    textAlign: 'right',
  },
  chevron: {
    flexShrink: 0,
    marginLeft: 2,
  },
  detail: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: nrmTokens.space.md,
    paddingTop: nrmTokens.space.sm,
    paddingBottom: nrmTokens.space.md,
  },
  detailLabel: {
    fontSize: nrmTokens.font.caption,
    fontWeight: '700',
    marginBottom: nrmTokens.space.xs,
  },
  replyLabel: {
    marginTop: nrmTokens.space.sm,
  },
  detailBody: {
    fontSize: nrmTokens.font.body,
    lineHeight: 22,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    marginTop: nrmTokens.space.md,
    marginBottom: nrmTokens.space.sm,
  },
});
