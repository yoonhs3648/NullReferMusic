/** 웹·tsc용 스텁 — 네이티브 decipher는 WebView 브리지를 씁니다. */
export type NrmDecipherResult = { n?: string; sig?: string };

export function attachDecipherWebView(_ref: unknown): void {}

export function markDecipherWebViewLoading(): void {}

export function markDecipherWebViewReady(): void {}

export function routeDecipherWebViewMessage(_raw: string): void {}

/** 네이티브 WebView 스트림 수신 — 웹에서는 미사용 */
export function routeYoutubeWebViewMessage(_raw: string): void {}

export async function downloadMediaUrlViaWebView(
  _fullUrl: string,
  _destUri: string,
): Promise<void> {
  throw new Error('downloadMediaUrlViaWebView: native only');
}

export async function evalYoutubePlayerInWebView(
  _code: string,
): Promise<NrmDecipherResult> {
  throw new Error('evalYoutubePlayerInWebView: native only');
}
