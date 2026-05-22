import { Platform, StyleSheet, Text, View } from 'react-native';

import { NrmChartPlatformIcon } from '@/components/nrm/charts/NrmChartPlatformIcon';
import { nrmTokens } from '@/constants/nrmTokens';
import type { ChartPlatformIconKey } from '@/lib/nrmChartsPlatforms';

const HEADING_ICON_SIZE = 26;
const HEADING_LINE_HEIGHT = 32;

type Props = {
  iconKey: ChartPlatformIconKey;
  title: string;
  titleColor: string;
};

export function NrmChartPageHeading({ iconKey, title, titleColor }: Props) {
  return (
    <View style={styles.row}>
      <View
        style={[
          styles.iconSlot,
          iconKey === 'appleMusic' && styles.iconSlotApple,
        ]}>
        <NrmChartPlatformIcon iconKey={iconKey} size={HEADING_ICON_SIZE} />
      </View>
      <Text
        style={[styles.title, { color: titleColor }]}
        numberOfLines={1}>
        {title}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: nrmTokens.space.xs,
    marginBottom: nrmTokens.space.md,
  },
  iconSlot: {
    width: HEADING_ICON_SIZE,
    height: HEADING_LINE_HEIGHT,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconSlotApple: {
    paddingTop: 1,
  },
  title: {
    flex: 1,
    minWidth: 0,
    fontSize: nrmTokens.font.lead,
    lineHeight: HEADING_LINE_HEIGHT,
    fontWeight: '600',
    letterSpacing: -0.4,
    ...Platform.select({
      android: { includeFontPadding: false, textAlignVertical: 'center' as const },
      default: {},
    }),
  },
});
