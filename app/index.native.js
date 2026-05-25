/**
 * Android/iOS 네이티브 전용 진입점.
 * react-native-track-player 의 registerPlaybackService 는
 * AppRegistry.registerComponent 보다 먼저 실행되어야 한다.
 * expo-router/entry 가 AppRegistry.registerComponent 를 호출하므로
 * 이 파일에서 먼저 등록한 뒤 expo-router/entry 를 import 한다.
 */
try {
  const TrackPlayer = require('react-native-track-player').default;
  TrackPlayer.registerPlaybackService(() =>
    require('./app/lib/nrmTrackPlayerService').PlaybackService,
  );
} catch (_) {
  // react-native-track-player 를 사용할 수 없는 환경 (Expo Go 표준 빌드 등)
}

// AppRegistry.registerComponent + Expo Router 초기화
require('expo-router/entry');
