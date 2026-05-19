import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { Platform } from 'react-native';

import { getBgPlayEnabled, setBgPlayEnabled } from '@/lib/nrmBackgroundPlaySettings';
import {
  BgPlayerContext,
  type BgPlayerContextValue,
  type BgPlayerItem,
} from '@/lib/nrmBgPlayerContext';
import type { NrmPlaybackState } from '@/lib/nrmTrackPlayer';
import { logNrmRunError } from '@/lib/nrmDevLog';
import { notifyUser } from '@/lib/nrmUserNotify';

type Props = { children: ReactNode };

export function NrmBgPlayerProvider({ children }: Props) {
  const [bgEnabled, setBgEnabledState] = useState(false);
  const [currentItem, setCurrentItem] = useState<BgPlayerItem | null>(null);
  const [isLoadingStream, setIsLoadingStream] = useState(false);
  const [playbackState, setPlaybackState] = useState<NrmPlaybackState>('idle');
  const playerRef = useRef<import('@/lib/nrmTrackPlayer').NrmTrackPlayerApi | null>(null);

  useEffect(() => {
    void getBgPlayEnabled().then(setBgEnabledState);
  }, []);

  // TrackPlayer는 네이티브에서만 초기화
  useEffect(() => {
    if (Platform.OS === 'web') return;
    void (async () => {
      const { nrmTrackPlayer } = await import('@/lib/nrmTrackPlayer');
      playerRef.current = nrmTrackPlayer;
    })();
  }, []);

  const setBgEnabled = useCallback(async (v: boolean) => {
    setBgEnabledState(v);
    await setBgPlayEnabled(v);
    // 끄면 현재 재생 중이면 중지
    if (!v && playerRef.current) {
      await playerRef.current.stop();
      setCurrentItem(null);
      setPlaybackState('idle');
    }
  }, []);

  const playItem = useCallback(async (item: BgPlayerItem) => {
    if (!bgEnabled || Platform.OS === 'web') return;
    const player = playerRef.current;
    if (!player) return;

    setIsLoadingStream(true);
    setPlaybackState('loading');
    setCurrentItem(item);

    try {
      const { getAudioStreamUrlOnDevice } = await import('@/lib/onDeviceDownload');
      let streamUrl: string;
      try {
        streamUrl = await getAudioStreamUrlOnDevice(item.videoId);
      } catch (e) {
        // Android 일부 기기에서 yt-dlp 실행 권한(error=13) 실패 시 innertube 폴백
        const { getAudioStreamUrlWithInnertube } = await import(
          '@/lib/nrmInnertubeYoutube'
        );
        logNrmRunError('bg.stream.ondevice.failed', e, { videoId: item.videoId });
        streamUrl = await getAudioStreamUrlWithInnertube(item.videoId);
      }
      await player.play({
        id: item.videoId,
        url: streamUrl,
        title: item.title,
        artist: item.channelTitle,
        artwork: item.thumbnailUrl,
      });
      setPlaybackState('playing');
    } catch (e) {
      setPlaybackState('error');
      setCurrentItem(null);
      notifyUser('백그라운드 재생을 시작하지 못했습니다.');
      throw e;
    } finally {
      setIsLoadingStream(false);
    }
  }, [bgEnabled]);

  const pauseOrResume = useCallback(async () => {
    const player = playerRef.current;
    if (!player) return;
    const state = await player.getState();
    if (state === 'playing') {
      await player.pause();
      setPlaybackState('paused');
    } else if (state === 'paused') {
      await player.resume();
      setPlaybackState('playing');
    }
  }, []);

  const stop = useCallback(async () => {
    const player = playerRef.current;
    if (!player) return;
    await player.stop();
    setCurrentItem(null);
    setPlaybackState('idle');
  }, []);

  const value: BgPlayerContextValue = {
    bgEnabled,
    setBgEnabled,
    currentItem,
    isLoadingStream,
    playbackState,
    playItem,
    pauseOrResume,
    stop,
  };

  return (
    <BgPlayerContext.Provider value={value}>
      {children}
    </BgPlayerContext.Provider>
  );
}
