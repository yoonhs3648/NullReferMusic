try {
  const mod = require('react-native-track-player');
  const TrackPlayer = mod.default ?? mod;
  TrackPlayer.registerPlaybackService(() => {
    const serviceMod = require('./nrmTrackPlayerService');
    return serviceMod.PlaybackService;
  });
} catch (_) {
  // 네이티브 모듈 초기화 전 오류 방지
}
