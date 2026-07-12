/** 웹·tsc용 스텁 — 네이티브 decipher는 WebView 브리지를 씁니다. */
export type NrmDecipherResult = { n?: string; sig?: string };

export type WebViewMediaDownloadOptions = {
  isCancelled?: () => boolean;
  deadlineMs?: number;
  timeoutMs?: number;
};

export const NRM_GOOGLEVIDEO_WEBVIEW_TIMEOUT_MS = 45_000;

export function attachDecipherWebView(_ref: unknown): void {}

export function markDecipherWebViewLoading(): void {}

export function markDecipherWebViewReady(): void {}

export function routeDecipherWebViewMessage(_raw: string): void {}

/** 네이티브 WebView 스트림 수신 — 웹에서는 미사용 */
export function routeYoutubeWebViewMessage(_raw: string): void {}

/** 웹/tsc 스텁 — 네이티브에서만 동작 */
export function registerDecipherWebViewCallbacks(
  _requestMount: (() => void) | null,
  _releaseMount: (() => void) | null,
): void {}

export async function downloadMediaUrlViaWebView(
  _fullUrl: string,
  _destUri: string,
  _options?: WebViewMediaDownloadOptions,
): Promise<void> {
  throw new Error('downloadMediaUrlViaWebView: native only');
}

export function cancelActiveStreamDownload(_reason?: string): void {}

export function cancelActiveInnertubeExtractions(_reason?: string): void {}

export function isYoutubeWebViewAllowed(): boolean {
  return true;
}

export async function evalYoutubePlayerInWebView(
  _code: string,
): Promise<NrmDecipherResult> {
  throw new Error('evalYoutubePlayerInWebView: native only');
}
