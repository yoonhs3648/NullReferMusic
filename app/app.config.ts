import type { ExpoConfig } from 'expo/config';

const config: ExpoConfig = {
  name: 'NullReferenceMusic',
  slug: 'nullrefer-music',
  version: '1.4.7',
  orientation: 'portrait',
  icon: './assets/images/icon.png',
  scheme: 'nullreferencemusic',
  userInterfaceStyle: 'automatic',
  newArchEnabled: true,
  splash: {
    image: './assets/images/splash-icon.png',
    resizeMode: 'contain',
    backgroundColor: '#f5f5f7',
  },
  ios: {
    supportsTablet: true,
    bundleIdentifier: 'com.nullrefer.music',
    infoPlist: {
      UIFileSharingEnabled: true,
      LSSupportsOpeningDocumentsInPlace: true,
    },
  },
  android: {
    adaptiveIcon: {
      foregroundImage: './assets/images/adaptive-icon.png',
      backgroundColor: '#0066cc',
    },
    edgeToEdgeEnabled: true,
    predictiveBackGestureEnabled: false,
    package: 'com.nullrefer.music',
    permissions: ['FOREGROUND_SERVICE', 'FOREGROUND_SERVICE_MEDIA_PLAYBACK', 'RECEIVE_BOOT_COMPLETED', 'POST_NOTIFICATIONS'],
  },
  web: {
    bundler: 'metro',
    output: 'static',
    favicon: './assets/images/favicon.png',
  },
  plugins: [
    'expo-router',
    'expo-web-browser',
    [
      'expo-notifications',
      {
        /** 흰 실루엣 + 검은 배경 원 (scripts/generate-android-notification-icon.mjs) */
        icon: './assets/images/notification-icon.png',
        color: '#000000',
        sounds: [],
        enableBackgroundRemoteNotifications: false,
      },
    ],
    [
      'expo-media-library',
      {
        photosPermission:
          '다운로드한 MP3를 기기의 미디어 라이브러리에 저장합니다.',
        savePhotosPermission:
          '다운로드한 오디오 파일을 미디어 라이브러리에 저장합니다.',
        isAccessMediaLocationEnabled: false,
        /** Android 13+: READ_MEDIA_AUDIO 등 매니페스트 선언 (요청 전 필수) */
        granularPermissions: ['audio'],
      },
    ],
  ],
  experiments: {
    typedRoutes: true,
  },
  extra: {
    eas: {
      projectId: '168e33b3-d69a-4e68-a5ae-bd3ee1a07a9d',
    },
    apiBaseUrl:
      process.env.EXPO_PUBLIC_API_BASE_URL ?? 'http://localhost:8787',
  },
};

export default config;
