import Ionicons from '@expo/vector-icons/Ionicons';
import { ActivityIndicator, Platform, Pressable, StyleSheet, Text, View } from 'react-native';

import { nrmTokens } from '@/constants/nrmTokens';
import { useBgPlayer } from '@/lib/nrmBgPlayerContext';

export function NrmBgPlayerBar() {
  const { currentItem, playbackState, isLoadingStream, pauseOrResume, stop } = useBgPlayer();

  // 백그라운드 재생이 활성화되어 있고 현재 항목이 있을 때만 표시
  if (!currentItem || playbackState === 'idle') return null;
  if (Platform.OS === 'web') return null;

  const isPlaying = playbackState === 'playing';
  const isLoading = isLoadingStream || playbackState === 'loading';

  return (
    <View style={styles.bar}>
      <View style={styles.info}>
        <Ionicons name="musical-notes" size={16} color={nrmTokens.color.primaryOnDark} style={styles.noteIcon} />
        <Text style={styles.title} numberOfLines={1}>
          {currentItem.title}
        </Text>
        {currentItem.channelTitle ? (
          <Text style={styles.channel} numberOfLines={1}>
            {currentItem.channelTitle}
          </Text>
        ) : null}
      </View>

      <View style={styles.controls}>
        {isLoading ? (
          <ActivityIndicator size="small" color={nrmTokens.color.bodyOnDark} style={styles.controlBtn} />
        ) : (
          <Pressable
            onPress={() => void pauseOrResume()}
            style={({ pressed }) => [styles.controlBtn, pressed && styles.pressed]}
            accessibilityRole="button"
            accessibilityLabel={isPlaying ? '일시정지' : '재생'}>
            <Ionicons
              name={isPlaying ? 'pause' : 'play'}
              size={22}
              color={nrmTokens.color.bodyOnDark}
            />
          </Pressable>
        )}
        <Pressable
          onPress={() => void stop()}
          style={({ pressed }) => [styles.controlBtn, pressed && styles.pressed]}
          accessibilityRole="button"
          accessibilityLabel="중지">
          <Ionicons name="stop" size={20} color={nrmTokens.color.bodyOnDark} />
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: nrmTokens.color.surfaceTile1,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: nrmTokens.color.borderOnDark,
    paddingHorizontal: nrmTokens.space.md,
    paddingVertical: nrmTokens.space.xs,
    gap: nrmTokens.space.sm,
  },
  info: {
    flex: 1,
    flexDirection: 'column',
    minWidth: 0,
    gap: 2,
  },
  noteIcon: {
    marginBottom: 1,
  },
  title: {
    color: nrmTokens.color.bodyOnDark,
    fontSize: nrmTokens.font.caption,
    fontWeight: '600',
    letterSpacing: -0.2,
  },
  channel: {
    color: nrmTokens.color.bodyMuted,
    fontSize: nrmTokens.font.finePrint,
  },
  controls: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: nrmTokens.space.xs,
  },
  controlBtn: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: nrmTokens.radius.md,
  },
  pressed: {
    opacity: 0.6,
  },
});
