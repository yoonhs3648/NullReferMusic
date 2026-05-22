/**
 * 네이티브(Android/iOS) 전용 인앱 오디오 플레이어.
 * react-native-track-player의 usePlaybackState / useProgress 훅을 사용하여
 * 재생 상태를 반영하고, 시스템 미디어 알림과 자동으로 연동됩니다.
 */
import Ionicons from '@expo/vector-icons/Ionicons';
import {
  ActivityIndicator,
  Image,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { nrmTokens } from '@/constants/nrmTokens';
import {
  nrmTrackPlayer,
  usePlaybackState,
  useProgress,
} from '@/lib/nrmTrackPlayer';

type Props = {
  videoId: string;
  title: string;
  channelTitle: string;
  thumbnailUrl?: string | null;
  isDark: boolean;
  onStop: () => void;
};

function formatSeconds(sec: number): string {
  if (!isFinite(sec) || sec < 0) return '0:00';
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export function NrmNativeAudioPlayer({
  title,
  channelTitle,
  thumbnailUrl,
  isDark,
  onStop,
}: Props) {
  const { state } = usePlaybackState();
  const { position, duration } = useProgress();

  const isPlaying = state === 'playing';
  const isLoading = state === 'loading' || state === 'buffering';

  const tint = isDark ? nrmTokens.color.bodyOnDark : nrmTokens.color.ink;
  const sub = isDark ? nrmTokens.color.bodyMuted : nrmTokens.color.inkMuted48;
  const bg = isDark ? nrmTokens.color.surfaceTile1 : nrmTokens.color.canvas;
  const border = isDark ? nrmTokens.color.borderOnDark : nrmTokens.color.hairline;
  const progress = duration > 0 ? Math.min(position / duration, 1) : 0;

  return (
    <View style={[styles.card, { backgroundColor: bg, borderColor: border }]}>
      {/* 상단: 썸네일 + 정보 + 정지 버튼 */}
      <View style={styles.topRow}>
        {thumbnailUrl ? (
          <Image source={{ uri: thumbnailUrl }} style={styles.thumb} />
        ) : (
          <View style={[styles.thumb, styles.thumbPlaceholder]} />
        )}
        <View style={styles.meta}>
          <Text style={[styles.title, { color: tint }]} numberOfLines={2}>
            {title}
          </Text>
          <Text style={[styles.channel, { color: sub }]} numberOfLines={1}>
            {channelTitle}
          </Text>
        </View>
        <Pressable
          onPress={onStop}
          hitSlop={10}
          style={styles.stopBtn}
          accessibilityRole="button"
          accessibilityLabel="재생 중지">
          <Ionicons name="close-circle-outline" size={24} color={sub} />
        </Pressable>
      </View>

      {/* 진행 바 */}
      <View style={[styles.progressTrack, { backgroundColor: border }]}>
        <View
          style={[
            styles.progressFill,
            {
              backgroundColor: nrmTokens.color.primary,
              width: `${progress * 100}%`,
            },
          ]}
        />
      </View>
      <View style={styles.timeRow}>
        <Text style={[styles.time, { color: sub }]}>{formatSeconds(position)}</Text>
        <Text style={[styles.time, { color: sub }]}>
          {duration > 0 ? formatSeconds(duration) : ''}
        </Text>
      </View>

      {/* 하단: 재생 컨트롤 */}
      <View style={styles.controls}>
        <Pressable
          onPress={() => {
            if (isPlaying) void nrmTrackPlayer.pause();
            else void nrmTrackPlayer.resume();
          }}
          disabled={isLoading}
          style={({ pressed }) => [
            styles.playBtn,
            { backgroundColor: nrmTokens.color.primary },
            pressed && styles.playBtnPressed,
          ]}
          accessibilityRole="button"
          accessibilityLabel={isPlaying ? '일시 정지' : '재생'}>
          {isLoading ? (
            <ActivityIndicator size="small" color={nrmTokens.color.onPrimary} />
          ) : (
            <Ionicons
              name={isPlaying ? 'pause' : 'play'}
              size={26}
              color={nrmTokens.color.onPrimary}
            />
          )}
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: nrmTokens.radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    padding: nrmTokens.space.md,
    marginTop: nrmTokens.space.sm,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: nrmTokens.space.sm,
    marginBottom: nrmTokens.space.sm,
  },
  thumb: {
    width: 64,
    height: 64,
    borderRadius: nrmTokens.radius.sm,
    backgroundColor: '#000',
  },
  thumbPlaceholder: {
    opacity: 0.15,
  },
  meta: {
    flex: 1,
    gap: nrmTokens.space.xxs,
  },
  title: {
    fontSize: nrmTokens.font.body,
    fontWeight: '600',
    lineHeight: 20,
  },
  channel: {
    fontSize: nrmTokens.font.caption,
  },
  stopBtn: {
    padding: 4,
    alignSelf: 'flex-start',
  },
  progressTrack: {
    height: 3,
    borderRadius: 2,
    overflow: 'hidden',
    marginBottom: nrmTokens.space.xxs,
  },
  progressFill: {
    height: '100%',
    borderRadius: 2,
  },
  timeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: nrmTokens.space.sm,
  },
  time: {
    fontSize: 11,
  },
  controls: {
    flexDirection: 'row',
    justifyContent: 'center',
  },
  playBtn: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
  },
  playBtnPressed: {
    opacity: 0.88,
    transform: [{ scale: 0.96 }],
  },
});
