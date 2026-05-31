import { Platform } from 'react-native';

import { prefetchFfmpegOnDevice } from '@/lib/nrmFfmpegPrefetch';
import { NRM_FILE_LOGGING_ENABLED } from '@/lib/nrmFileLoggingPolicy';

void (async () => {
  if (Platform.OS !== 'android') return;

  if (NRM_FILE_LOGGING_ENABLED) {
    const { appendNrmFileLog, getNrmLogFilePath } = await import('@/lib/nrmFileLog');
    const Constants = (await import('expo-constants')).default;
    const { ExecutionEnvironment } = await import('expo-constants');

    function envLabel(): string {
      const env = Constants.executionEnvironment;
      if (env === ExecutionEnvironment.Standalone) return 'standalone';
      if (env === ExecutionEnvironment.Bare) return 'bare';
      if (env === ExecutionEnvironment.StoreClient) return 'expo-go';
      return String(env ?? 'unknown');
    }

    const logPath = await getNrmLogFilePath();
    appendNrmFileLog(
      'js-bootstrap',
      'info',
      JSON.stringify({
        phase: 'js_bundle_loaded',
        env: envLabel(),
        appVersion: Constants.expoConfig?.version ?? Constants.nativeAppVersion,
        nativeVersion: Constants.nativeAppVersion,
        nativeBuild: Constants.nativeBuildVersion,
        dev: typeof __DEV__ !== 'undefined' ? __DEV__ : null,
        logPath,
      }),
    );
  }

  void prefetchFfmpegOnDevice();
})();
