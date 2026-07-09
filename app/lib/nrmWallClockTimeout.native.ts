import { NativeEventEmitter, NativeModules } from 'react-native';

type NrmBackgroundWorkNative = {
  scheduleWallClockTimeout?: (id: string, delayMs: number) => void;
  cancelWallClockTimeout?: (id: string) => void;
};

const mod = NativeModules.NrmBackgroundWork as NrmBackgroundWorkNative | undefined;

const handlers = new Map<string, () => void>();
let listenerReady = false;

function ensureWallClockListener(): void {
  if (listenerReady || !mod) return;
  listenerReady = true;
  const emitter = new NativeEventEmitter(
    mod as unknown as ConstructorParameters<typeof NativeEventEmitter>[0],
  );
  emitter.addListener('NrmWallClockTimeout', (body: { id?: string }) => {
    const id = body?.id?.trim();
    if (!id) return;
    const fn = handlers.get(id);
    if (fn) {
      handlers.delete(id);
      fn();
    }
  });
}

/** Android Handler wall-clock — JS setTimeout 백그라운드 스로틀 회피 */
export function armWallClockTimeout(
  id: string,
  delayMs: number,
  onFire: () => void,
): () => void {
  const key = id.trim();
  if (!key || !mod?.scheduleWallClockTimeout) {
    const timer = setTimeout(onFire, Math.max(0, delayMs));
    return () => clearTimeout(timer);
  }
  ensureWallClockListener();
  handlers.set(key, onFire);
  mod.scheduleWallClockTimeout(key, Math.max(0, delayMs));
  return () => disarmWallClockTimeout(key);
}

export function disarmWallClockTimeout(id: string): void {
  const key = id.trim();
  if (!key) return;
  handlers.delete(key);
  mod?.cancelWallClockTimeout?.(key);
}
