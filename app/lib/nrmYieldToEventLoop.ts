/**
 * 무거운 I/O·변환 사이에 JS 이벤트 루프에 한 틱 양보합니다.
 *
 * InteractionManager.runAfterInteractions는 모달 닫힘·스크롤 등이 끝날 때까지
 * 대기해 다운로드 finalize가 수 분 지연될 수 있어 사용하지 않습니다.
 *
 * requestAnimationFrame도 차트 캐러셀·홈 애니메이션이 있으면 다음 프레임까지
 * 대기하거나 JS가 바쁠 때 finalize가 수 분 멈출 수 있어 critical 경로에서는 쓰지 않습니다.
 */
export function nrmYieldToEventLoop(options?: { critical?: boolean }): Promise<void> {
  const critical = options?.critical === true;
  return new Promise((resolve) => {
    setTimeout(() => {
      if (!critical && typeof requestAnimationFrame === 'function') {
        requestAnimationFrame(() => resolve());
        return;
      }
      resolve();
    }, 0);
  });
}
