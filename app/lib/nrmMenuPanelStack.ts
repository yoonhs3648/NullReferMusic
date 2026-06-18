/** 메뉴 드로어 패널 스택 — 뒤로가기 시 직전 depth로 복귀 */

export function pushMenuPanel<T extends string>(
  stack: readonly T[],
  next: T,
): T[] {
  if (stack.length > 0 && stack[stack.length - 1] === next) {
    return [...stack];
  }
  return [...stack, next];
}

export function popMenuPanel<T extends string>(stack: readonly T[]): T[] {
  if (stack.length <= 1) {
    const root = stack[0];
    return root != null ? [root] : ([] as T[]);
  }
  return stack.slice(0, -1);
}

export function resetMenuPanelStack<T extends string>(panel: T): T[] {
  return [panel];
}

export function peekMenuPanel<T extends string>(stack: readonly T[]): T {
  return stack[stack.length - 1] ?? ('root' as T);
}

export function openMenuPanelStack<T extends string>(
  stack: readonly T[],
  next: T,
): T[] {
  const base = stack.length > 0 ? stack : resetMenuPanelStack('root' as T);
  return pushMenuPanel(base, next);
}
