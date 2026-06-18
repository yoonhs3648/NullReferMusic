/**
 * 무거운 I/O·변환 사이에 JS 이벤트 루프에 한 틱 양보합니다.
 *
 * InteractionManager.runAfterInteractions는 모달 닫힘·스크롤 등이 끝날 때까지
 * 대기해 다운로드 finalize가 수 분 지연될 수 있어 setTimeout+rAF만 사용합니다.
 */
export function nrmYieldToEventLoop(): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(() => {
      if (typeof requestAnimationFrame === 'function') {
        requestAnimationFrame(() => resolve());
        return;
      }
      resolve();
    }, 0);
  });
}
