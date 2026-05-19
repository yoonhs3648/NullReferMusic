/**
 * react-native-track-player 래퍼.
 * 웹에서는 no-op stub을 사용한다.
 */

export type NrmTrack = {
  id: string;
  url: string;
  title: string;
  artist?: string;
  artwork?: string;
  duration?: number;
};

export type NrmPlaybackState =
  | 'idle'
  | 'loading'
  | 'playing'
  | 'paused'
  | 'stopped'
  | 'error';

export interface NrmTrackPlayerApi {
  setup(): Promise<void>;
  play(track: NrmTrack): Promise<void>;
  pause(): Promise<void>;
  resume(): Promise<void>;
  stop(): Promise<void>;
  getState(): Promise<NrmPlaybackState>;
  isSetup(): boolean;
}

// Metro가 플랫폼별로 .native.ts / .web.ts 를 선택한다.
// TypeScript는 이 파일을 기준으로 타입을 보므로 stub export를 추가한다.
const noop = async () => {};
export const nrmTrackPlayer: NrmTrackPlayerApi = {
  setup: noop,
  play: noop as (t: NrmTrack) => Promise<void>,
  pause: noop,
  resume: noop,
  stop: noop,
  getState: async (): Promise<NrmPlaybackState> => 'idle',
  isSetup: () => false,
};

export const Event = {} as Record<string, string>;
export function useTrackPlayerEvents(_events: string[], _handler: () => void): void {}
export function usePlaybackState() { return { state: undefined }; }
export function useProgress() { return { position: 0, duration: 0, buffered: 0 }; }
