export function armWallClockTimeout(
  id: string,
  delayMs: number,
  onFire: () => void,
): () => void {
  const timer = setTimeout(onFire, Math.max(0, delayMs));
  return () => clearTimeout(timer);
}

export function disarmWallClockTimeout(_id: string): void {}
