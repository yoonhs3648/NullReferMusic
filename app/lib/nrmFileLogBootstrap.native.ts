import Constants, { ExecutionEnvironment } from 'expo-constants';
import { Platform } from 'react-native';

import { appendNrmFileLog, getNrmLogFilePath } from '@/lib/nrmFileLog';

function envLabel(): string {
  const env = Constants.executionEnvironment;
  if (env === ExecutionEnvironment.Standalone) return 'standalone';
  if (env === ExecutionEnvironment.Bare) return 'bare';
  if (env === ExecutionEnvironment.StoreClient) return 'expo-go';
  return String(env ?? 'unknown');
}

void (async () => {
  if (Platform.OS !== 'android') return;

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
})();
