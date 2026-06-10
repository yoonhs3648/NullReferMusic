import { Pressable, Text, View } from 'react-native';

import { NrmChartTrackArt } from '@/components/nrm/charts/NrmChartTrackArt';
import { nrmChartTrackListStyles } from '@/components/nrm/charts/nrmChartTrackListStyles';
import type { ChartTrackItem } from '@/lib/nrmChartsTypes';

function formatReleaseDate(raw: string): string {
  const t = raw.trim();
  if (!t) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(t)) {
    const [y, m, d] = t.split('-');
    return `${y}. ${m}. ${d}.`;
  }
  return t;
}

/** 차트 숫자 메타 (Apple Music 등) */
function formatCount(n: number): string {
  if (!n || n <= 0) return '';
  if (n >= 100_000_000) return `${(n / 1_000_000).toFixed(0)}M`;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`;
  return n.toLocaleString();
}

type Props = {
  item: ChartTrackItem;
  titleColor: string;
  bodyColor: string;
  onPress?: () => void;
  countLabel?: string;
  /** Last.fm 차트: 보강된 커버 URL (없으면 item.imageUrl) */
  coverUrl?: string;
};

export function NrmChartTrackRow({
  item,
  titleColor,
  bodyColor,
  onPress,
  countLabel = '',
  coverUrl,
}: Props) {
  const row = nrmChartTrackListStyles;
  const releaseSuffix = formatReleaseDate(item.releaseDate);
  const releaseLine = releaseSuffix ? `발매일 ${releaseSuffix}` : '';
  const countSuffix = formatCount(item.popularity);
  const countLine =
    countSuffix && countLabel ? `${countLabel} ${countSuffix}` : countSuffix ? String(countSuffix) : '';

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [row.trackRow, pressed && row.trackRowPressed]}
      accessibilityRole="button"
      accessibilityLabel={`${item.rank}위 ${item.title}`}>
      <Text style={[row.rank, { color: bodyColor }]}>{item.rank}</Text>
      <NrmChartTrackArt imageUrl={coverUrl ?? item.imageUrl} />
      <View style={row.trackMeta}>
        <Text style={[row.trackTitle, { color: titleColor }]} numberOfLines={1}>
          {item.title}
        </Text>
        <Text style={[row.trackSub, { color: bodyColor }]} numberOfLines={1}>
          {item.artists}
        </Text>
        {releaseLine || countLine ? (
          <View style={row.metaRow}>
            {releaseLine ? (
              <Text style={[row.metaChip, { color: bodyColor }]}>{releaseLine}</Text>
            ) : null}
            {countLine ? (
              <Text style={[row.metaChip, { color: bodyColor }]}>{countLine}</Text>
            ) : null}
          </View>
        ) : null}
      </View>
    </Pressable>
  );
}
