/**
 * 타입체크·IDE용 진입점.
 * Metro: iOS/Android는 `nrmYoutubeDecipherBridge.native.ts`, 웹은 `.web.ts`를 번들합니다.
 */
export type { NrmDecipherResult } from './nrmYoutubeDecipherBridge.web';
export {
  attachDecipherWebView,
  markDecipherWebViewLoading,
  markDecipherWebViewReady,
  routeDecipherWebViewMessage,
  routeYoutubeWebViewMessage,
  downloadMediaUrlViaWebView,
  evalYoutubePlayerInWebView,
  registerDecipherWebViewCallbacks,
} from './nrmYoutubeDecipherBridge.web';
