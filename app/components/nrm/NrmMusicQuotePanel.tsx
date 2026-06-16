import { useMemo } from 'react';
import { Platform, StyleSheet, Text, View } from 'react-native';

import { nrmTokens } from '@/constants/nrmTokens';
import {
  formatMusicQuoteArtistLine,
  pickRandomMusicQuote,
  type NrmMusicQuoteEntry,
} from '@/lib/nrmMusicQuote';

type Props = {
  isDark: boolean;
  /** 바뀔 때마다 새 명언을 고릅니다. */
  refreshKey: number;
};

export function NrmMusicQuotePanel({ isDark, refreshKey }: Props) {
  const quote: NrmMusicQuoteEntry = useMemo(
    () => pickRandomMusicQuote(),
    [refreshKey],
  );

  const artistLine = formatMusicQuoteArtistLine(quote);
  if (!artistLine && !quote.quoteEn) return null;

  const ink = isDark ? nrmTokens.color.bodyOnDark : nrmTokens.color.ink;
  const muted = isDark ? nrmTokens.color.bodyMuted : nrmTokens.color.inkMuted48;
  const accent = isDark ? nrmTokens.color.primaryOnDark : nrmTokens.color.primary;

  return (
    <View style={styles.root} accessibilityRole="text">
      <View style={[styles.inner, isDark ? styles.innerDark : styles.innerLight]}>
        <Text style={[styles.artist, { color: ink }]}>{artistLine}</Text>
        <View style={[styles.rule, { backgroundColor: accent }]} />
        <Text style={[styles.quoteEn, { color: ink }]}>"{quote.quoteEn}"</Text>
        <Text style={[styles.quoteKo, { color: muted }]}>{quote.quoteKo}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    minHeight: 0,
    width: '100%',
    maxWidth: nrmTokens.layout.homeSearchClusterMaxWidth,
    alignSelf: 'center',
    paddingTop: nrmTokens.space.lg,
    paddingBottom: nrmTokens.space.xl,
    justifyContent: 'center',
  },
  inner: {
    paddingHorizontal: nrmTokens.space.lg,
    paddingVertical: nrmTokens.space.xl,
    borderRadius: nrmTokens.radius.lg,
    gap: nrmTokens.space.md,
    ...Platform.select({
      web: { boxSizing: 'border-box' as const },
    }),
  },
  innerLight: {
    backgroundColor: 'rgba(0,0,0,0.02)',
  },
  innerDark: {
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
  artist: {
    fontSize: nrmTokens.font.caption,
    fontWeight: '600',
    letterSpacing: 0.35,
    textTransform: 'none',
    lineHeight: 20,
    opacity: 0.92,
  },
  rule: {
    width: 28,
    height: 2,
    borderRadius: 1,
    opacity: 0.55,
  },
  quoteEn: {
    fontSize: nrmTokens.font.lead,
    fontWeight: '500',
    fontStyle: 'italic',
    lineHeight: 28,
    letterSpacing: -0.2,
  },
  quoteKo: {
    fontSize: nrmTokens.font.body,
    fontWeight: '400',
    lineHeight: 26,
    letterSpacing: -0.15,
  },
});
