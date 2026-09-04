import type { ExpoConfig } from 'expo/config';

import brandConfig from './nrm-brand.config.json';
import oauthConfig from './nrm-oauth.config.json';

const googleNativeSchemes = [
  process.env.EXPO_PUBLIC_NRM_GOOGLE_ANDROID_CLIENT_ID ??
    String(oauthConfig.googleAndroidClientId ?? ''),
  process.env.EXPO_PUBLIC_NRM_GOOGLE_IOS_CLIENT_ID ??
    String(oauthConfig.googleIosClientId ?? ''),
]
  .map((clientId) => clientId.trim())
  .filter((clientId) => clientId.endsWith('.apps.googleusercontent.com'))
  .map(
    (clientId) =>
      `com.googleusercontent.apps.${clientId.slice(0, -'.apps.googleusercontent.com'.length)}`,
  );
const kakaoNativeAppKey = (
  process.env.EXPO_PUBLIC_NRM_KAKAO_NATIVE_APP_KEY ??
  String(oauthConfig.kakaoNativeAppKey ?? '')
).trim();
const kakaoPlugins: NonNullable<ExpoConfig['plugins']> = kakaoNativeAppKey
  ? [
      [
        '@react-native-kakao/core',
        {
          nativeAppKey: kakaoNativeAppKey,
          android: { authCodeHandlerActivity: true },
          ios: { handleKakaoOpenUrl: true },
        },
      ],
    ]
  : [];

const config: ExpoConfig = {
  name: (brandConfig.versionInfoProductName || brandConfig.displayName || 'NullReference Music').trim(),
  slug: 'nullrefer-music',
  version: '3.6.2',
  orientation: 'portrait',
  /** 런처 아이콘은 밝은 배경, 스플래시는 tempLogo. 인앱 logo-mark / 알림 아이콘 등은 기존 유지 */
  icon: './assets/images/app-icon-light.png',
  scheme: ['nullrefermusic', ...googleNativeSchemes],
  userInterfaceStyle: 'automatic',
  newArchEnabled: true,
  splash: {
    image: './assets/images/tempLogo.png',
    resizeMode: 'contain',
    backgroundColor: '#0c0c12',
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
      foregroundImage: './assets/images/tempLogo.png',
      backgroundColor: '#ffffff',
    },
    edgeToEdgeEnabled: true,
    predictiveBackGestureEnabled: false,
    allowBackup: false,
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
    ...kakaoPlugins,
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
    oauthGoogleWebClientId:
      process.env.EXPO_PUBLIC_NRM_GOOGLE_WEB_CLIENT_ID ??
      String(oauthConfig.googleWebClientId ?? ''),
    oauthGoogleAndroidClientId:
      process.env.EXPO_PUBLIC_NRM_GOOGLE_ANDROID_CLIENT_ID ??
      String(oauthConfig.googleAndroidClientId ?? ''),
    oauthGoogleIosClientId:
      process.env.EXPO_PUBLIC_NRM_GOOGLE_IOS_CLIENT_ID ??
      String(oauthConfig.googleIosClientId ?? ''),
    oauthKakaoRestApiKey:
      process.env.EXPO_PUBLIC_NRM_KAKAO_REST_API_KEY ??
      String(oauthConfig.kakaoRestApiKey ?? ''),
    oauthKakaoNativeAppKey: kakaoNativeAppKey,
  },
};

export default config;
