import Ionicons from '@expo/vector-icons/Ionicons';
import { LinearGradient } from 'expo-linear-gradient';
import { Platform, StyleSheet, View } from 'react-native';

type MedalTier = 1 | 2 | 3;

const MEDAL_STYLES: Record<
  MedalTier,
  { gradient: [string, string, string]; rim: string; icon: string; glow: string }
> = {
  1: {
    gradient: ['#FFF4B8', '#E8B923', '#C9920A'],
    rim: '#B8860B',
    icon: '#5C4200',
    glow: 'rgba(232, 185, 35, 0.45)',
  },
  2: {
    gradient: ['#F5F7FA', '#C5CED8', '#9AA8B8'],
    rim: '#8B9AAB',
    icon: '#3D4A57',
    glow: 'rgba(154, 168, 184, 0.4)',
  },
  3: {
    gradient: ['#FFDCC0', '#E09555', '#B86A2E'],
    rim: '#9E5520',
    icon: '#4A2B12',
    glow: 'rgba(224, 149, 85, 0.42)',
  },
};

type Props = {
  rank: number;
  /** 앨범 커버 한 변 길이 */
  coverSize: number;
};

export function NrmHomeChartRankMedal({ rank, coverSize }: Props) {
  if (rank < 1 || rank > 3) return null;
  const tier = rank as MedalTier;
  const palette = MEDAL_STYLES[tier];
  const badge = Math.max(44, Math.round(coverSize * 0.22));
  const iconSize = Math.round(badge * 0.52);

  return (
    <View
      style={[
        styles.wrap,
        {
          width: badge + 8,
          height: badge + 8,
          top: -6,
          left: -6,
          shadowColor: palette.glow,
        },
      ]}
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants">
      <LinearGradient
        colors={palette.gradient}
        start={{ x: 0.15, y: 0 }}
        end={{ x: 0.85, y: 1 }}
        style={[
          styles.badge,
          {
            width: badge,
            height: badge,
            borderRadius: badge / 2,
            borderColor: palette.rim,
          },
        ]}>
        <View style={[styles.innerRing, { borderColor: 'rgba(255,255,255,0.55)' }]}>
          <Ionicons name="medal" size={iconSize} color={palette.icon} />
        </View>
      </LinearGradient>
      <View style={[styles.ribbon, { backgroundColor: palette.rim }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    zIndex: 2,
    alignItems: 'center',
    justifyContent: 'center',
    ...Platform.select({
      ios: {
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.35,
        shadowRadius: 8,
      },
      android: {
        elevation: 6,
      },
      default: {},
    }),
  },
  badge: {
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    overflow: 'hidden',
  },
  innerRing: {
    width: '78%',
    height: '78%',
    borderRadius: 999,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ribbon: {
    position: 'absolute',
    bottom: 2,
    width: 14,
    height: 5,
    borderRadius: 2,
    opacity: 0.9,
  },
});
