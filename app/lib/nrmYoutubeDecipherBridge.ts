/**
 * 타입체크·IDE용 진입점.
 * Metro: iOS/Android는 `nrmYoutubeDecipherBridge.native.ts`, 웹은 `.web.ts`를 번들합니다.
 */
export type { NrmDecipherResult, WebViewMediaDownloadOptions } from './nrmYoutubeDecipherBridge.web';
export {
  attachDecipherWebView,
  markDecipherWebViewLoading,
  markDecipherWebViewReady,
  routeDecipherWebViewMessage,
  routeYoutubeWebViewMessage,
  downloadMediaUrlViaWebView,
  evalYoutubePlayerInWebView,
  registerDecipherWebViewCallbacks,
  cancelActiveStreamDownload,
  cancelActiveInnertubeExtractions,
  NRM_GOOGLEVIDEO_WEBVIEW_TIMEOUT_MS,
} from './nrmYoutubeDecipherBridge.web';
