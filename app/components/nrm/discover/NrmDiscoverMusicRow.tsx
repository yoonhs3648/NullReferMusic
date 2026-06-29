import { memo } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { nrmTokens } from '@/constants/nrmTokens';
import type { NrmMusicListItem } from '@/lib/nrmMusicListTypes';

type Props = {
  item: NrmMusicListItem;
  titleColor: string;
  bodyColor: string;
};

export const NrmDiscoverMusicRow = memo(function NrmDiscoverMusicRow({
  item,
  titleColor,
  bodyColor,
}: Props) {
  return (
    <View style={styles.row} accessibilityRole="text">
      <Text style={[styles.rank, { color: bodyColor }]}>{item.rank}</Text>
      <View style={styles.meta}>
        <Text style={[styles.title, { color: titleColor }]} numberOfLines={1}>
          {item.title}
        </Text>
        <Text style={[styles.sub, { color: bodyColor }]} numberOfLines={1}>
          {item.artist}
          {item.album ? ` · ${item.album}` : ''}
        </Text>
        <Text style={[styles.hint, { color: bodyColor }]} numberOfLines={1}>
          {item.year} · {item.genre}
        </Text>
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: nrmTokens.space.sm,
    paddingVertical: nrmTokens.space.sm,
  },
  rank: {
    width: 32,
    textAlign: 'center',
    fontWeight: '700',
    fontSize: nrmTokens.font.body,
    paddingTop: 2,
  },
  meta: { flex: 1, minWidth: 0 },
  title: { fontSize: nrmTokens.font.body, fontWeight: '600' },
  sub: { marginTop: 2, fontSize: nrmTokens.font.caption },
  hint: { marginTop: 2, fontSize: 11, opacity: 0.85 },
});
