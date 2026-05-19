/**
 * Hermes에는 `EventTarget`/`CustomEvent`가 없을 수 있음 — `youtubei.js`의 `EventEmitterLike`가 상속합니다.
 * 외부 패키지 없음: Metro가 항상 해석하는 의존성을 줄이고, 웹 번들과 완전히 분리합니다(.web.ts).
 * `youtubei` RN 플랫폼 코드가 `window.crypto`를 참조할 수 있어 `window`를 글로벌에 맞춥니다.
 */

import { Platform } from 'react-native';

type ListenerRecord = {
  callback: (event: Event) => void;
  capture: boolean;
};

class NrmMinimalEventTarget {
  private readonly _listeners = new Map<string, ListenerRecord[]>();

  addEventListener(
    type: string,
    callback: EventListener | null,
    options?: boolean | AddEventListenerOptions,
  ): void {
    if (callback == null || typeof callback !== 'function') return;
    const capture =
      typeof options === 'boolean'
        ? options
        : Boolean(options && 'capture' in options && options.capture);
    const cb = callback as (e: Event) => void;
    const list = this._listeners.get(type) ?? [];
    list.push({ callback: cb, capture });
    this._listeners.set(type, list);
  }

  removeEventListener(
    type: string,
    callback: EventListener | null,
    options?: boolean | EventListenerOptions,
  ): void {
    if (callback == null || typeof callback !== 'function') return;
    const capture =
      typeof options === 'boolean'
        ? options
        : Boolean(options && 'capture' in options && options.capture);
    const cb = callback as (e: Event) => void;
    const list = this._listeners.get(type);
    if (!list) return;
    const idx = list.findIndex(
      (l) => l.callback === cb && l.capture === capture,
    );
    if (idx >= 0) list.splice(idx, 1);
  }

  dispatchEvent(event: Event): boolean {
    const list = this._listeners.get(event.type);
    if (!list?.length) return true;
    for (const { callback } of [...list]) {
      try {
        callback.call(this as unknown as EventTarget, event);
      } catch {
        /* youtubei 내부 이벤트 — 로깅 생략 */
      }
    }
    return !event.defaultPrevented;
  }
}

function install(): void {
  if (Platform.OS !== 'web' && typeof globalThis.window === 'undefined') {
    (globalThis as { window?: typeof globalThis }).window = globalThis;
  }

  const g = globalThis as typeof globalThis & {
    EventTarget?: typeof EventTarget;
    CustomEvent?: typeof CustomEvent;
  };

  if (typeof g.EventTarget === 'undefined') {
    g.EventTarget = NrmMinimalEventTarget as unknown as typeof EventTarget;
  }

  if (typeof g.CustomEvent === 'undefined' && typeof Event !== 'undefined') {
    g.CustomEvent = class extends Event {
      constructor(type: string, eventInitDict?: CustomEventInit<unknown>) {
        super(type, eventInitDict);
        Object.defineProperty(this, 'detail', {
          value: eventInitDict?.detail ?? null,
          writable: false,
          configurable: true,
        });
      }
    } as unknown as typeof CustomEvent;
  }
}

install();
