import type { NrmPlaybackState, NrmTrack, NrmTrackPlayerApi } from './nrmTrackPlayer';

let _setup = false;
let _tp: any | null | undefined;

function getTrackPlayerModule(): any | null {
  if (_tp !== undefined) return _tp;
  try {
    // New Architecture에서 모듈 파싱 실패 시 앱 전체 크래시를 막기 위해 지연 로딩한다.
    _tp = require('react-native-track-player');
  } catch (_) {
    _tp = null;
  }
  return _tp;
}

async function setup(): Promise<void> {
  const mod = getTrackPlayerModule();
  if (!mod) return;
  const TrackPlayer = mod.default ?? mod;
  const AppKilledPlaybackBehavior = mod.AppKilledPlaybackBehavior;
  const Capability = mod.Capability;
  const RepeatMode = mod.RepeatMode;

  if (_setup) return;
  try {
    await TrackPlayer.setupPlayer({
      autoHandleInterruptions: true,
    });
  } catch (e: unknown) {
    // 이미 초기화된 경우 무시 (player already setup 오류)
    const msg = e instanceof Error ? e.message : String(e);
    if (!msg.includes('already')) throw e;
  }
  await TrackPlayer.updateOptions({
    android: {
      appKilledPlaybackBehavior: AppKilledPlaybackBehavior.StopPlaybackAndRemoveNotification,
    },
    capabilities: [
      Capability.Play,
      Capability.Pause,
      Capability.Stop,
      Capability.SeekTo,
    ],
    compactCapabilities: [Capability.Play, Capability.Pause, Capability.Stop],
    progressUpdateEventInterval: 2,
  });
  await TrackPlayer.setRepeatMode(RepeatMode.Off);
  _setup = true;
}

async function play(track: NrmTrack): Promise<void> {
  const mod = getTrackPlayerModule();
  if (!mod) return;
  const TrackPlayer = mod.default ?? mod;
  if (!_setup) await setup();
  await TrackPlayer.reset();
  await TrackPlayer.add({
    id: track.id,
    url: track.url,
    title: track.title,
    artist: track.artist ?? 'NullReferenceMusic',
    artwork: track.artwork,
    duration: track.duration,
  });
  await TrackPlayer.play();
}

async function pause(): Promise<void> {
  const mod = getTrackPlayerModule();
  if (!mod) return;
  const TrackPlayer = mod.default ?? mod;
  await TrackPlayer.pause();
}

async function resume(): Promise<void> {
  const mod = getTrackPlayerModule();
  if (!mod) return;
  const TrackPlayer = mod.default ?? mod;
  await TrackPlayer.play();
}

async function stop(): Promise<void> {
  const mod = getTrackPlayerModule();
  if (!mod) return;
  const TrackPlayer = mod.default ?? mod;
  await TrackPlayer.reset();
}

async function getState(): Promise<NrmPlaybackState> {
  const mod = getTrackPlayerModule();
  if (!mod) return 'idle';
  const TrackPlayer = mod.default ?? mod;
  const State = mod.State;
  if (!_setup) return 'idle';
  const s = await TrackPlayer.getPlaybackState();
  switch (s.state) {
    case State.Playing: return 'playing';
    case State.Paused: return 'paused';
    case State.Loading:
    case State.Buffering: return 'loading';
    case State.Stopped:
    case State.None: return 'idle';
    default: return 'idle';
  }
}

function isSetup(): boolean {
  return _setup;
}

export const nrmTrackPlayer: NrmTrackPlayerApi = {
  setup,
  play,
  pause,
  resume,
  stop,
  getState,
  isSetup,
};

export const Event: Record<string, string> = (getTrackPlayerModule()?.Event ?? {}) as Record<string, string>;
export function useTrackPlayerEvents(events: string[], handler: () => void): void {
  const hook = getTrackPlayerModule()?.useTrackPlayerEvents as ((e: string[], h: () => void) => void) | undefined;
  if (hook) hook(events, handler);
}
export function usePlaybackState(): { state: unknown } {
  const hook = getTrackPlayerModule()?.usePlaybackState as (() => { state: unknown }) | undefined;
  return hook ? hook() : { state: undefined };
}
export function useProgress(): { position: number; duration: number; buffered: number } {
  const hook = getTrackPlayerModule()?.useProgress as (() => { position: number; duration: number; buffered: number }) | undefined;
  return hook ? hook() : { position: 0, duration: 0, buffered: 0 };
}
