import { InteractionManager } from 'react-native';

/** 무거운 I/O·변환 사이에 JS 이벤트 루프에 양보해 터치·뒤로가기가 처리되도록 합니다. */
export function nrmYieldToEventLoop(): Promise<void> {
  return new Promise((resolve) => {
    InteractionManager.runAfterInteractions(() => {
      if (typeof requestAnimationFrame === 'function') {
        requestAnimationFrame(() => resolve());
        return;
      }
      setTimeout(resolve, 0);
    });
  });
}
