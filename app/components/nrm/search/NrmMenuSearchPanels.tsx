import Ionicons from '@expo/vector-icons/Ionicons';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { NrmChartPlatformIcon } from '@/components/nrm/charts/NrmChartPlatformIcon';
import { nrmTokens } from '@/constants/nrmTokens';
import {
  getSearchPlatformLabel,
  NRM_SEARCH_KIND_ROWS,
  NRM_SEARCH_PLATFORM_ROWS,
  type SearchKind,
  type SearchMenuPanel,
  type SearchPlatformId,
} from '@/lib/nrmSearchMenu';

type Props = {
  panel: SearchMenuPanel;
  titleColor: string;
  bodyColor: string;
  rowHover: string;
  onBackToRoot: () => void;
  onBackToSearch: () => void;
  onOpenPlatform: (platform: SearchPlatformId) => void;
  onOpenSpotifySearch: (kind: SearchKind) => void;
  onOpenLastfmSearch: (kind: SearchKind) => void;
  onOpenMelonSearch: (kind: SearchKind) => void;
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

function KindRows({
  titleColor,
  bodyColor,
  rowHover,
  onPress,
}: {
  titleColor: string;
  bodyColor: string;
  rowHover: string;
  onPress: (kind: SearchKind) => void;
}) {
  return (
    <>
      {NRM_SEARCH_KIND_ROWS.map((row) => (
        <Pressable
          key={row.kind}
          onPress={() => onPress(row.kind)}
          style={({ pressed }) => [
            styles.row,
            pressed && { backgroundColor: rowHover },
          ]}>
          <Text style={[styles.rowLabel, { color: titleColor }]}>{row.label}</Text>
          <Ionicons name="chevron-forward" size={20} color={bodyColor} />
        </Pressable>
      ))}
    </>
  );
}

export function NrmMenuSearchPanels({
  panel,
  titleColor,
  bodyColor,
  rowHover,
  onBackToRoot,
  onBackToSearch,
  onOpenPlatform,
  onOpenSpotifySearch,
  onOpenLastfmSearch,
  onOpenMelonSearch,
}: Props) {
  if (panel === 'search') {
    return (
      <>
        <MenuBackRow onPress={onBackToRoot} />
        <Text style={[styles.panelTitle, { color: titleColor }]}>음악 검색</Text>
        {NRM_SEARCH_PLATFORM_ROWS.map((row) => (
          <Pressable
            key={row.id}
            onPress={() => onOpenPlatform(row.id)}
            style={({ pressed }) => [
              styles.row,
              pressed && { backgroundColor: rowHover },
            ]}
            accessibilityRole="button">
            <NrmChartPlatformIcon iconKey={row.iconKey} size={28} />
            <View style={styles.rowTextBlock}>
              <Text style={[styles.rowLabel, { color: titleColor }]}>
                {row.label}
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={bodyColor} />
          </Pressable>
        ))}
        <Pressable
          disabled
          style={[styles.row, styles.rowDisabled]}
          accessibilityRole="button"
          accessibilityState={{ disabled: true }}>
          <Ionicons
            name="logo-soundcloud"
            size={28}
            color="#FF5500"
            style={styles.monoIcon}
          />
          <View style={styles.rowTextBlock}>
            <Text style={[styles.rowLabel, { color: bodyColor }, styles.rowLabelDisabled]}>
              SoundCloud
            </Text>
          </View>
        </Pressable>
      </>
    );
  }

  if (panel === 'searchSpotify') {
    return (
      <>
        <MenuBackRow onPress={onBackToSearch} />
        <Text style={[styles.panelTitle, { color: titleColor }]}>
          {getSearchPlatformLabel('spotify')}
        </Text>
        <KindRows
          titleColor={titleColor}
          bodyColor={bodyColor}
          rowHover={rowHover}
          onPress={onOpenSpotifySearch}
        />
      </>
    );
  }

  if (panel === 'searchLastfm') {
    return (
      <>
        <MenuBackRow onPress={onBackToSearch} />
        <Text style={[styles.panelTitle, { color: titleColor }]}>
          {getSearchPlatformLabel('lastfm')}
        </Text>
        <KindRows
          titleColor={titleColor}
          bodyColor={bodyColor}
          rowHover={rowHover}
          onPress={onOpenLastfmSearch}
        />
      </>
    );
  }

  if (panel === 'searchMelon') {
    return (
      <>
        <MenuBackRow onPress={onBackToSearch} />
        <Text style={[styles.panelTitle, { color: titleColor }]}>
          {getSearchPlatformLabel('melon')}
        </Text>
        <KindRows
          titleColor={titleColor}
          bodyColor={bodyColor}
          rowHover={rowHover}
          onPress={onOpenMelonSearch}
        />
      </>
    );
  }

  return null;
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
    justifyContent: 'space-between',
    gap: nrmTokens.space.sm,
    paddingVertical: nrmTokens.space.md,
    paddingHorizontal: nrmTokens.space.xs,
    borderRadius: nrmTokens.radius.sm,
    marginBottom: nrmTokens.space.xs,
  },
  rowDisabled: {
    opacity: 0.5,
  },
  monoIcon: {
    width: 28,
    textAlign: 'center',
  },
  rowTextBlock: {
    flex: 1,
    minWidth: 0,
    paddingRight: nrmTokens.space.sm,
  },
  rowLabel: {
    fontSize: nrmTokens.font.body,
    fontWeight: '500',
  },
  rowLabelDisabled: {
    color: nrmTokens.color.textMuted,
  },
});
