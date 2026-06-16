import { useMemo } from 'react';
import { Platform, StyleSheet, Text, View } from 'react-native';

import { nrmTokens } from '@/constants/nrmTokens';
import {
  parseMusicQuoteYears,
  pickRandomMusicQuote,
  presentMusicQuoteEn,
  presentMusicQuoteKo,
  type NrmMusicQuoteEntry,
} from '@/lib/nrmMusicQuote';

type Props = {
  isDark: boolean;
  /** 바뀔 때마다 새 명언을 고릅니다. */
  refreshKey: number;
};

const quoteSerif = Platform.select({
  web: 'Georgia, "Iowan Old Style", "Palatino Linotype", "Book Antiqua", serif',
  ios: 'Georgia',
  default: undefined,
});

export function NrmMusicQuotePanel({ isDark, refreshKey }: Props) {
  const quote: NrmMusicQuoteEntry = useMemo(
    () => pickRandomMusicQuote(),
    [refreshKey],
  );

  const years = useMemo(() => parseMusicQuoteYears(quote.years), [quote.years]);
  const quoteEn = presentMusicQuoteEn(quote.quoteEn);
  const quoteKo = presentMusicQuoteKo(quote.quoteKo);

  if (!quote.nameKo && !quote.nameEn && !quoteEn) return null;

  const ink = isDark ? nrmTokens.color.bodyOnDark : nrmTokens.color.ink;
  const muted = isDark ? 'rgba(255,255,255,0.52)' : nrmTokens.color.inkMuted48;
  const faint = isDark ? 'rgba(255,255,255,0.38)' : 'rgba(29,29,31,0.42)';
  const accent = isDark ? nrmTokens.color.primaryOnDark : nrmTokens.color.primary;

  const yearsLine =
    years && years.birth && years.death
      ? `${years.birth} — ${years.death}`
      : years?.raw ?? '';

  return (
    <View style={styles.root} accessibilityRole="text">
      <View style={styles.content}>
        <View style={styles.artistBlock}>
          {quote.nameKo ? (
            <Text style={[styles.nameKo, { color: ink }]} numberOfLines={2}>
              {quote.nameKo}
            </Text>
          ) : null}
          {quote.nameEn ? (
            <Text style={[styles.nameEn, { color: muted }]} numberOfLines={2}>
              {quote.nameEn}
            </Text>
          ) : null}
          {yearsLine ? (
            <Text style={[styles.years, { color: faint }]} numberOfLines={1}>
              {yearsLine}
            </Text>
          ) : null}
        </View>

        {quoteEn ? (
          <View style={styles.quoteBlock}>
            <Text style={[styles.openQuote, { color: accent }]} accessibilityElementsHidden>
              {'\u201C'}
            </Text>
            <Text
              style={[
                styles.quoteEn,
                { color: ink },
                quoteSerif ? { fontFamily: quoteSerif } : null,
              ]}>
              {quoteEn}
            </Text>
          </View>
        ) : null}

        {quoteKo ? (
          <Text style={[styles.quoteKo, { color: muted }]}>{quoteKo}</Text>
        ) : null}
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
    paddingHorizontal: nrmTokens.space.md,
    paddingTop: nrmTokens.space.md,
    paddingBottom: nrmTokens.space.xl,
    justifyContent: 'center',
  },
  content: {
    width: '100%',
    gap: nrmTokens.space.lg,
    ...Platform.select({
      web: { boxSizing: 'border-box' as const },
    }),
  },
  artistBlock: {
    width: '100%',
    alignItems: 'center',
    gap: 4,
  },
  nameKo: {
    fontSize: 30,
    fontWeight: '700',
    letterSpacing: -0.6,
    lineHeight: 38,
    textAlign: 'center',
  },
  nameEn: {
    fontSize: 17,
    fontWeight: '500',
    letterSpacing: 0.15,
    lineHeight: 24,
    textAlign: 'center',
    marginTop: 2,
  },
  years: {
    fontSize: 13,
    fontWeight: '500',
    letterSpacing: 1.2,
    lineHeight: 18,
    textAlign: 'center',
    marginTop: 6,
    textTransform: 'none',
  },
  quoteBlock: {
    width: '100%',
    paddingTop: nrmTokens.space.sm,
    gap: nrmTokens.space.xs,
  },
  openQuote: {
    fontSize: 44,
    lineHeight: 44,
    fontWeight: '400',
    opacity: 0.42,
    alignSelf: 'flex-start',
    marginBottom: -8,
    ...Platform.select({
      web: { fontFamily: 'Georgia, serif' },
      default: {},
    }),
  },
  quoteEn: {
    fontSize: 22,
    fontWeight: '400',
    fontStyle: 'italic',
    lineHeight: 34,
    letterSpacing: -0.15,
    width: '100%',
  },
  quoteKo: {
    fontSize: 18,
    fontWeight: '400',
    lineHeight: 30,
    letterSpacing: -0.2,
    width: '100%',
    paddingTop: nrmTokens.space.xs,
  },
});
