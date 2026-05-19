import type { NrmPlaybackState, NrmTrack, NrmTrackPlayerApi } from './nrmTrackPlayer';

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

export function useTrackPlayerEvents(_events: string[], _handler: () => void) {}
export function usePlaybackState() { return { state: undefined }; }
export function useProgress() { return { position: 0, duration: 0, buffered: 0 }; }
