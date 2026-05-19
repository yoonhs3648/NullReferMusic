/**
 * react-native-track-player 백그라운드 서비스 핸들러.
 * app.config.ts의 plugins에 등록하거나 index.js에서 등록해야 한다.
 */

export async function PlaybackService() {
  let mod: any;
  try {
    mod = require('react-native-track-player');
  } catch (_) {
    // TrackPlayer 모듈 로딩 실패 시 서비스 초기화를 건너뛴다.
    return;
  }
  const TrackPlayer = mod.default ?? mod;
  const Event = mod.Event ?? {};

  TrackPlayer.addEventListener(Event.RemotePlay, () => {
    void TrackPlayer.play();
  });
  TrackPlayer.addEventListener(Event.RemotePause, () => {
    void TrackPlayer.pause();
  });
  TrackPlayer.addEventListener(Event.RemoteStop, () => {
    void TrackPlayer.reset();
  });
  TrackPlayer.addEventListener(Event.RemoteSeek, ({ position }: { position: number }) => {
    void TrackPlayer.seekTo(position);
  });
}
