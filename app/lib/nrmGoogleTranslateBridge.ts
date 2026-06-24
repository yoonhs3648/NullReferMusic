/**
 * 타입체크·IDE용 진입점.
 * Metro: iOS/Android는 `nrmGoogleTranslateBridge.native.ts`, 웹은 `.web.ts`를 번들합니다.
 */
export {
  attachGoogleTranslateWebView,
  markGoogleTranslateWebViewLoading,
  markGoogleTranslateWebViewReady,
  routeGoogleTranslateWebViewMessage,
  translateTextsViaGoogleTranslateWeb,
  registerGoogleTranslateWebViewCallbacks,
} from './nrmGoogleTranslateBridge.web';
