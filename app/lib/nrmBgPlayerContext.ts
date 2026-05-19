import { createContext, useContext } from 'react';

export type BgPlayerItem = {
  videoId: string;
  title: string;
  channelTitle?: string;
  thumbnailUrl?: string;
};

export type BgPlayerContextValue = {
  bgEnabled: boolean;
  setBgEnabled: (v: boolean) => void;
  currentItem: BgPlayerItem | null;
  isLoadingStream: boolean;
  playbackState: 'idle' | 'loading' | 'playing' | 'paused' | 'stopped' | 'error';
  playItem: (item: BgPlayerItem) => Promise<void>;
  pauseOrResume: () => Promise<void>;
  stop: () => Promise<void>;
};

export const BgPlayerContext = createContext<BgPlayerContextValue>({
  bgEnabled: false,
  setBgEnabled: () => {},
  currentItem: null,
  isLoadingStream: false,
  playbackState: 'idle',
  playItem: async () => {},
  pauseOrResume: async () => {},
  stop: async () => {},
});

export function useBgPlayer() {
  return useContext(BgPlayerContext);
}
