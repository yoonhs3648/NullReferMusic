import Ionicons from '@expo/vector-icons/Ionicons';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { NrmChartPlatformIcon } from '@/components/nrm/charts/NrmChartPlatformIcon';
import { nrmTokens } from '@/constants/nrmTokens';
import type { PeriodChartMenuPanel } from '@/lib/nrmChartsMenu';

type Props = {
  panel: PeriodChartMenuPanel;
  titleColor: string;
  bodyColor: string;
  rowHover: string;
  onBackToRoot: () => void;
  onOpenLastfm: () => void;
  onOpenSpotify: () => void;
};

function MenuBackRow({ onPress }: { onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      style={styles.backRow}
      accessibilityRole="button"
      accessibilityLabel="뒤로">
      <Ionicons name="chevron-back" size={22} color={nrmTokens.color.primary} />
      <Text style={styles.backText}>뒤로</Text>
    </Pressable>
  );
}

export function NrmMenuPeriodChartPanels({
  panel,
  titleColor,
  bodyColor,
  rowHover,
  onBackToRoot,
  onOpenLastfm,
  onOpenSpotify,
}: Props) {
  if (panel !== 'periodCharts') return null;

  return (
    <>
      <MenuBackRow onPress={onBackToRoot} />
      <Text style={[styles.panelTitle, { color: titleColor }]}>기간별 차트</Text>
      <Pressable
        onPress={onOpenLastfm}
        style={({ pressed }) => [styles.row, pressed && { backgroundColor: rowHover }]}>
        <NrmChartPlatformIcon iconKey="lastfm" size={28} />
        <Text style={[styles.rowLabel, { color: titleColor }]}>Last.fm</Text>
        <Ionicons name="chevron-forward" size={20} color={bodyColor} />
      </Pressable>
      <Pressable
        onPress={onOpenSpotify}
        style={({ pressed }) => [styles.row, pressed && { backgroundColor: rowHover }]}>
        <NrmChartPlatformIcon iconKey="spotify" size={28} />
        <View style={styles.rowTextBlock}>
          <Text style={[styles.rowLabel, { color: titleColor }]}>Spotify</Text>
        </View>
        <Ionicons name="chevron-forward" size={20} color={bodyColor} />
      </Pressable>
    </>
  );
}

const styles = StyleSheet.create({
  backRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: nrmTokens.space.xxs,
    marginTop: nrmTokens.space.md,
    marginBottom: nrmTokens.space.md,
    alignSelf: 'flex-start',
  },
  backText: {
    fontSize: nrmTokens.font.body,
    color: nrmTokens.color.primary,
    fontWeight: '500',
  },
  panelTitle: {
    fontSize: nrmTokens.font.lead,
    fontWeight: '600',
    marginBottom: nrmTokens.space.md,
    letterSpacing: -0.4,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: nrmTokens.space.sm,
    paddingVertical: nrmTokens.space.md,
    paddingHorizontal: nrmTokens.space.xs,
    borderRadius: nrmTokens.radius.sm,
    marginBottom: nrmTokens.space.xs,
  },
  rowTextBlock: { flex: 1, minWidth: 0 },
  rowLabel: { flex: 1, fontSize: nrmTokens.font.body, fontWeight: '500' },
});
