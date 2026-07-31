/**
 * AI Lab — YouTube 후보 확인 카드 (오디오 미리듣기 + 맞다/아니다).
 * 표시 라벨은 Melon 가수-곡명만 사용 (YouTube title 미표시).
 */
import { Ionicons } from '@expo/vector-icons';
import { Audio, type AVPlaybackStatus } from 'expo-av';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
  type GestureResponderEvent,
  type LayoutChangeEvent,
} from 'react-native';

import { nrmTokens } from '@/constants/nrmTokens';
import {
  getAiLabYoutubeConfirmSession,
  refreshAiLabYoutubeConfirmStream,
  setAiLabYoutubeConfirmDuration,
  setAiLabYoutubeConfirmUiStatus,
  subscribeAiLabYoutubeConfirm,
  type AiLabYoutubeConfirmSession,
  type AiLabYoutubeConfirmUiStatus,
} from '@/lib/nrmAiLabYoutubeConfirm';
import { logNrmRunError } from '@/lib/nrmDevLog';

type Props = {
  sessionId: string;
  isDark: boolean;
  disabled?: boolean;
  onConfirm: (sessionId: string) => void;
  onReject: (sessionId: string) => void;
};

function formatMs(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return '00:00';
  const total = Math.floor(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export function NrmAiLabYoutubeConfirmCard({
  sessionId,
  isDark,
  disabled,
  onConfirm,
  onReject,
}: Props) {
  const [session, setSession] = useState<AiLabYoutubeConfirmSession | null>(() =>
    getAiLabYoutubeConfirmSession(sessionId),
  );
  const [positionMs, setPositionMs] = useState(0);
  const [durationMs, setDurationMs] = useState(0);
  const [buffering, setBuffering] = useState(false);
  const [barWidth, setBarWidth] = useState(0);
  const soundRef = useRef<Audio.Sound | null>(null);
  const loadedUrlRef = useRef<string | null>(null);
  const refreshTriedRef = useRef(false);
  const seekingRef = useRef(false);
  const lastIndexRef = useRef<number | null>(null);

  const titleColor = isDark ? nrmTokens.color.bodyOnDark : nrmTokens.color.ink;
  const mutedColor = isDark ? nrmTokens.color.textMuted : nrmTokens.color.inkMuted80;
  const hairline = isDark ? nrmTokens.color.borderOnDark : nrmTokens.color.hairline;
  const cardBg = isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)';
  const primary = isDark ? nrmTokens.color.primaryOnDark : nrmTokens.color.primary;

  useEffect(() => {
    return subscribeAiLabYoutubeConfirm(sessionId, setSession);
  }, [sessionId]);

  const unloadSound = useCallback(async () => {
    const sound = soundRef.current;
    soundRef.current = null;
    loadedUrlRef.current = null;
    if (sound) {
      try {
        await sound.stopAsync();
      } catch {
        /* ignore */
      }
      try {
        await sound.unloadAsync();
      } catch {
        /* ignore */
      }
    }
  }, []);

  useEffect(() => {
    return () => {
      void unloadSound();
    };
  }, [unloadSound]);

  const onPlaybackStatus = useCallback(
    (status: AVPlaybackStatus) => {
      if (!status.isLoaded) {
        if (status.error) {
          logNrmRunError('ailab.ytConfirm.playback', new Error(status.error), {
            sessionId,
          });
          if (!refreshTriedRef.current) {
            refreshTriedRef.current = true;
            void (async () => {
              await unloadSound();
              const url = await refreshAiLabYoutubeConfirmStream(sessionId);
              if (!url) setAiLabYoutubeConfirmUiStatus(sessionId, 'FAILED');
            })();
          } else {
            setAiLabYoutubeConfirmUiStatus(sessionId, 'FAILED');
          }
        }
        return;
      }
      if (!seekingRef.current) {
        setPositionMs(status.positionMillis);
      }
      if (status.durationMillis != null && status.durationMillis > 0) {
        setDurationMs(status.durationMillis);
        setAiLabYoutubeConfirmDuration(sessionId, status.durationMillis);
      }
      setBuffering(!!status.isBuffering);
      if (status.didJustFinish) {
        setAiLabYoutubeConfirmUiStatus(sessionId, 'PAUSED');
        setPositionMs(0);
        void soundRef.current?.setPositionAsync(0);
        return;
      }
      if (status.isPlaying) {
        setAiLabYoutubeConfirmUiStatus(sessionId, 'PLAYING');
      } else if (!status.isBuffering) {
        const cur = getAiLabYoutubeConfirmSession(sessionId);
        if (cur && (cur.uiStatus === 'PLAYING' || cur.uiStatus === 'PAUSED')) {
          setAiLabYoutubeConfirmUiStatus(sessionId, 'PAUSED');
        }
      }
    },
    [sessionId, unloadSound],
  );

  useEffect(() => {
    const url = session?.streamUrl;
    const status = session?.uiStatus;
    if (!url || !status || status === 'PREPARING' || status === 'FAILED') {
      return;
    }
    if (loadedUrlRef.current === url && soundRef.current) return;

    let cancelled = false;
    void (async () => {
      try {
        await unloadSound();
        await Audio.setAudioModeAsync({
          playsInSilentModeIOS: true,
          staysActiveInBackground: false,
          shouldDuckAndroid: true,
        });
        const { sound } = await Audio.Sound.createAsync(
          { uri: url },
          { shouldPlay: false, progressUpdateIntervalMillis: 250 },
          onPlaybackStatus,
        );
        if (cancelled) {
          await sound.unloadAsync();
          return;
        }
        soundRef.current = sound;
        loadedUrlRef.current = url;
        refreshTriedRef.current = false;
        const st = await sound.getStatusAsync();
        if (st.isLoaded && st.durationMillis) {
          setDurationMs(st.durationMillis);
          setAiLabYoutubeConfirmDuration(sessionId, st.durationMillis);
        }
      } catch (e) {
        if (cancelled) return;
        logNrmRunError('ailab.ytConfirm.load', e, { sessionId });
        if (!refreshTriedRef.current) {
          refreshTriedRef.current = true;
          const next = await refreshAiLabYoutubeConfirmStream(sessionId);
          if (!next) setAiLabYoutubeConfirmUiStatus(sessionId, 'FAILED');
        } else {
          setAiLabYoutubeConfirmUiStatus(sessionId, 'FAILED');
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [session?.streamUrl, session?.uiStatus, sessionId, onPlaybackStatus, unloadSound]);

  // 후보 교체 시 사운드 언로드
  useEffect(() => {
    const idx = session?.index;
    if (idx == null) return;
    if (lastIndexRef.current === null) {
      lastIndexRef.current = idx;
      return;
    }
    if (lastIndexRef.current === idx) return;
    lastIndexRef.current = idx;
    void unloadSound();
    setPositionMs(0);
    setDurationMs(0);
    refreshTriedRef.current = false;
  }, [session?.index, unloadSound]);

  const togglePlay = useCallback(async () => {
    if (disabled || !session) return;
    if (session.uiStatus === 'PREPARING' || session.uiStatus === 'FAILED') return;
    const sound = soundRef.current;
    if (!sound) return;
    try {
      const st = await sound.getStatusAsync();
      if (!st.isLoaded) return;
      if (st.isPlaying) {
        await sound.pauseAsync();
        setAiLabYoutubeConfirmUiStatus(sessionId, 'PAUSED');
      } else {
        await sound.playAsync();
        setAiLabYoutubeConfirmUiStatus(sessionId, 'PLAYING');
      }
    } catch (e) {
      logNrmRunError('ailab.ytConfirm.toggle', e, { sessionId });
    }
  }, [disabled, session, sessionId]);

  const seekTo = useCallback(
    async (ratio: number) => {
      const sound = soundRef.current;
      if (!sound || durationMs <= 0) return;
      const clamped = Math.max(0, Math.min(1, ratio));
      const pos = Math.floor(durationMs * clamped);
      seekingRef.current = true;
      setPositionMs(pos);
      try {
        await sound.setPositionAsync(pos);
      } catch (e) {
        logNrmRunError('ailab.ytConfirm.seek', e, { sessionId });
      } finally {
        seekingRef.current = false;
      }
    },
    [durationMs, sessionId],
  );

  const onBarLayout = useCallback((e: LayoutChangeEvent) => {
    setBarWidth(e.nativeEvent.layout.width);
  }, []);

  const onBarPress = useCallback(
    (e: GestureResponderEvent) => {
      if (barWidth <= 0) return;
      const x = e.nativeEvent.locationX;
      void seekTo(x / barWidth);
    },
    [barWidth, seekTo],
  );

  const handleConfirm = useCallback(async () => {
    if (disabled) return;
    await unloadSound();
    onConfirm(sessionId);
  }, [disabled, onConfirm, sessionId, unloadSound]);

  const handleReject = useCallback(async () => {
    if (disabled) return;
    await unloadSound();
    onReject(sessionId);
  }, [disabled, onReject, sessionId, unloadSound]);

  if (!session || session.confirmed || session.exhausted) return null;

  const uiStatus: AiLabYoutubeConfirmUiStatus = session.uiStatus;
  const progress =
    durationMs > 0 ? Math.max(0, Math.min(1, positionMs / durationMs)) : 0;
  const canPlay = uiStatus === 'READY' || uiStatus === 'PLAYING' || uiStatus === 'PAUSED';
  const showBuffering = uiStatus === 'PREPARING' || buffering;

  return (
    <View style={[styles.card, { backgroundColor: cardBg, borderColor: hairline }]}>
      <Text style={[styles.title, { color: titleColor }]} numberOfLines={2}>
        {'\u{1F3B5} '}
        {session.displayLabel}
      </Text>

      {uiStatus === 'PREPARING' ? (
        <View style={styles.preparingRow}>
          <ActivityIndicator size="small" color={primary} />
          <Text style={[styles.preparingText, { color: mutedColor }]}>
            음악 준비중...
          </Text>
        </View>
      ) : uiStatus === 'FAILED' ? (
        <Text style={[styles.preparingText, { color: mutedColor }]}>
          미리듣기를 준비하지 못했습니다. 「아니다」로 다음 후보를 시도해 주세요.
        </Text>
      ) : (
        <View style={styles.playerRow}>
          <Pressable
            onPress={() => void togglePlay()}
            disabled={!canPlay || disabled}
            hitSlop={8}
            style={styles.playBtn}
            accessibilityRole="button"
            accessibilityLabel={uiStatus === 'PLAYING' ? '일시정지' : '재생'}>
            {showBuffering && uiStatus !== 'PLAYING' ? (
              <ActivityIndicator size="small" color={primary} />
            ) : (
              <Ionicons
                name={uiStatus === 'PLAYING' ? 'pause' : 'play'}
                size={22}
                color={canPlay ? primary : mutedColor}
              />
            )}
          </Pressable>
          <Text style={[styles.time, { color: mutedColor }]}>{formatMs(positionMs)}</Text>
          <Pressable
            style={styles.barHit}
            onLayout={onBarLayout}
            onPress={onBarPress}
            disabled={!canPlay || durationMs <= 0 || disabled}>
            <View style={[styles.barTrack, { backgroundColor: hairline }]}>
              <View
                style={[
                  styles.barFill,
                  { width: `${progress * 100}%`, backgroundColor: primary },
                ]}
              />
            </View>
          </Pressable>
          <Text style={[styles.time, { color: mutedColor }]}>
            {formatMs(durationMs || session.durationMs || 0)}
          </Text>
        </View>
      )}

      <View style={styles.actions}>
        <Pressable
          onPress={() => void handleConfirm()}
          disabled={!!disabled}
          style={({ pressed }) => [
            styles.actionBtn,
            styles.actionYes,
            { borderColor: primary, opacity: pressed || disabled ? 0.7 : 1 },
          ]}>
          <Text style={[styles.actionYesText, { color: primary }]}>맞다</Text>
        </Pressable>
        <Pressable
          onPress={() => void handleReject()}
          disabled={!!disabled}
          style={({ pressed }) => [
            styles.actionBtn,
            { borderColor: hairline, opacity: pressed || disabled ? 0.7 : 1 },
          ]}>
          <Text style={[styles.actionNoText, { color: titleColor }]}>아니다</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    marginTop: nrmTokens.space.sm,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: nrmTokens.radius.md,
    padding: nrmTokens.space.md,
    gap: nrmTokens.space.sm,
    alignSelf: 'stretch',
    maxWidth: '100%',
  },
  title: {
    fontSize: nrmTokens.font.body,
    fontWeight: '600',
  },
  preparingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: nrmTokens.space.sm,
    minHeight: 36,
  },
  preparingText: {
    fontSize: nrmTokens.font.caption,
  },
  playerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: nrmTokens.space.xs,
    minHeight: 36,
  },
  playBtn: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  time: {
    fontSize: 11,
    fontVariant: ['tabular-nums'],
    minWidth: 40,
  },
  barHit: {
    flex: 1,
    height: 28,
    justifyContent: 'center',
  },
  barTrack: {
    height: 4,
    borderRadius: 2,
    overflow: 'hidden',
  },
  barFill: {
    height: 4,
    borderRadius: 2,
  },
  actions: {
    flexDirection: 'row',
    gap: nrmTokens.space.sm,
    marginTop: nrmTokens.space.xs,
  },
  actionBtn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: nrmTokens.space.sm,
    borderRadius: nrmTokens.radius.md,
    borderWidth: StyleSheet.hairlineWidth,
  },
  actionYes: {
    backgroundColor: 'rgba(0, 102, 204, 0.08)',
  },
  actionYesText: {
    fontSize: nrmTokens.font.body,
    fontWeight: '600',
  },
  actionNoText: {
    fontSize: nrmTokens.font.body,
    fontWeight: '500',
  },
});
