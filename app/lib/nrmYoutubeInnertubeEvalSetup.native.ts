/**
 * youtubei.js v17+: `Player.decipher`가 붙인 `data.output`는 `new Function(body)`로 실행되는
 * **함수 본문**입니다.
 *
 * Hermes에서 컴파일/실행이 실패하는 경우가 있어, 마지막 수단으로 **시스템 WebView**의
 * JS 엔진에서 동일 코드를 실행합니다 (jintr는 플레이어의 `class` 등을 지원하지 않음).
 */
import { Platform } from 'youtubei.js';

import { evalYoutubePlayerInWebView } from '@/lib/nrmYoutubeDecipherBridge';

type DecipherResult = { n?: string; sig?: string };

function runWithNewFunction(code: string): DecipherResult {
  // eslint-disable-next-line @typescript-eslint/no-implied-eval, no-new-func
  const fn = new Function(code) as () => DecipherResult;
  return fn();
}

function runWithNewFunctionIife(code: string): DecipherResult {
  // eslint-disable-next-line @typescript-eslint/no-implied-eval, no-new-func
  const fn = new Function(
    `return (function () {\n${code}\n})();`,
  ) as () => DecipherResult;
  return fn();
}

Platform.shim.eval = async (data: { output: string }) => {
  const code = data.output;
  try {
    return runWithNewFunction(code);
  } catch {
    try {
      return runWithNewFunctionIife(code);
    } catch {
      return await evalYoutubePlayerInWebView(code);
    }
  }
};
