/**
 * UI 한 프레임 양보 — InteractionManager.runAfterInteractions 대신 사용.
 * (메뉴·캐러셀 등 상시 애니메이션이 있으면 runAfterInteractions가 영구 대기할 수 있음)
 */
export function nrmDeferUiWork(): Promise<void> {
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
