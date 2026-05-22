import Ionicons from '@expo/vector-icons/Ionicons';

import { Pressable, StyleSheet, Text, View } from 'react-native';



import { nrmTokens } from '@/constants/nrmTokens';

import { NrmChartPlatformIcon } from '@/components/nrm/charts/NrmChartPlatformIcon';

import {
  getNrmChartPlatformRows,
  type ChartMenuPanel,
} from '@/lib/nrmChartsPlatforms';



type Props = {

  panel: ChartMenuPanel;

  titleColor: string;

  bodyColor: string;

  rowHover: string;

  onBackToRoot: () => void;

  onBackToCharts: () => void;

  onOpenAppleMusicCharts: () => void;

  onOpenSpotifyChartsOfficial: () => void;

  onOpenSpotifyChartsCharts: () => void;

  onOpenLastfmCharts: () => void;

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



export function NrmMenuChartPanels({

  panel,

  titleColor,

  bodyColor,

  rowHover,

  onBackToRoot,

  onBackToCharts,

  onOpenAppleMusicCharts,

  onOpenSpotifyChartsOfficial,

  onOpenSpotifyChartsCharts,

  onOpenLastfmCharts,

}: Props) {

  if (panel !== 'charts') {

    return null;

  }



  return (

    <>

      <MenuBackRow onPress={onBackToRoot} />

      <Text style={[styles.panelTitle, { color: titleColor }]}>

        실시간 차트

      </Text>

      {getNrmChartPlatformRows().map((row) => {

        const disabled = !row.enabled;

        return (

          <Pressable

            key={row.panel}

            disabled={disabled}

            onPress={() => {

              if (row.panel === 'chartAppleMusic') {

                onOpenAppleMusicCharts();

              } else if (row.panel === 'chartSpotifyCharts') {

                onOpenSpotifyChartsCharts();

              } else if (row.panel === 'chartSpotifyOfficial') {

                onOpenSpotifyChartsOfficial();

              } else if (row.panel === 'chartLastfm') {

                onOpenLastfmCharts();

              }

            }}

            style={({ pressed }) => [

              styles.row,

              disabled && styles.rowDisabled,

              !disabled && pressed && { backgroundColor: rowHover },

            ]}

            accessibilityRole="button"

            accessibilityState={{ disabled }}>

            <NrmChartPlatformIcon iconKey={row.iconKey} size={28} />

            <View style={styles.rowTextBlock}>

              <Text

                style={[

                  styles.rowLabel,

                  { color: disabled ? bodyColor : titleColor },

                  disabled && styles.rowLabelDisabled,

                ]}>

                {row.label}

              </Text>

              <Text

                style={[

                  styles.rowSubtitle,

                  { color: bodyColor },

                  disabled && styles.rowSubtitleDisabled,

                ]}

                numberOfLines={2}>

                {row.subtitle}

              </Text>

            </View>

            {!disabled ? (

              <Ionicons name="chevron-forward" size={20} color={bodyColor} />

            ) : null}

          </Pressable>

        );

      })}

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

    justifyContent: 'space-between',

    gap: nrmTokens.space.sm,

    paddingVertical: nrmTokens.space.md,

    paddingHorizontal: nrmTokens.space.xs,

    borderRadius: nrmTokens.radius.sm,

    marginBottom: nrmTokens.space.xs,

  },

  rowDisabled: {

    opacity: 0.42,

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

    fontWeight: '400',

  },

  rowSubtitle: {

    marginTop: 2,

    fontSize: nrmTokens.font.caption,

    fontWeight: '400',

  },

  rowSubtitleDisabled: {

    opacity: 0.85,

  },

});

