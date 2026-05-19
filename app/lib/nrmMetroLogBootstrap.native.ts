/**
 * 처리되지 않은 JS 예외를 Metro 터미널에 남깁니다. (Expo Go 포함)
 */
import { Platform } from 'react-native';

import { logNrmRunError } from '@/lib/nrmDevLog';

type ErrorUtilsShape = {
  getGlobalHandler?: () =>
    | ((error: Error, isFatal?: boolean) => void)
    | undefined;
  setGlobalHandler?: (fn: (error: Error, isFatal?: boolean) => void) => void;
};

if (Platform.OS !== 'web') {
  const EU = (globalThis as { ErrorUtils?: ErrorUtilsShape }).ErrorUtils;
  if (EU?.getGlobalHandler && EU.setGlobalHandler) {
    const prev = EU.getGlobalHandler();
    EU.setGlobalHandler((error, isFatal) => {
      logNrmRunError('uncaught', error, { isFatal: Boolean(isFatal) });
      prev?.(error, isFatal);
    });
  }
}
