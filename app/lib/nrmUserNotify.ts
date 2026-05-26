export type NotifyPayload = {
  message: string;
};

export type ConfirmPayload = {
  message: string;
  cancelLabel: string;
  confirmLabel: string;
  resolve: (confirmed: boolean) => void;
};

type NotifyListener = (p: NotifyPayload) => void;
type ConfirmListener = (p: ConfirmPayload) => void;

let notifyListener: NotifyListener | null = null;
let confirmListener: ConfirmListener | null = null;
let menuNotifyListener: NotifyListener | null = null;
let menuConfirmListener: ConfirmListener | null = null;

export function registerNotifyListener(fn: NotifyListener | null): void {
  notifyListener = fn;
}

export function registerConfirmListener(fn: ConfirmListener | null): void {
  confirmListener = fn;
}

/** 메뉴 드로어가 열려 있을 때 — 알림이 메뉴 Modal 위에 보이도록 */
export function registerMenuNotifyListener(fn: NotifyListener | null): void {
  menuNotifyListener = fn;
}

export function registerMenuConfirmListener(fn: ConfirmListener | null): void {
  menuConfirmListener = fn;
}

export function notifyUser(message: string): void {
  const body = message.trim() || ' ';
  if (menuNotifyListener) {
    menuNotifyListener({ message: body });
    return;
  }
  notifyListener?.({ message: body });
}

/** 예/아니오 확인 오버레이(NrmNotifyHost). 리스너가 없으면 `false`. */
export function confirmUser(
  message: string,
  options?: { cancelLabel?: string; confirmLabel?: string },
): Promise<boolean> {
  return new Promise((resolve) => {
    const listener = menuConfirmListener ?? confirmListener;
    if (!listener) {
      resolve(false);
      return;
    }
    listener({
      message: message.trim() || ' ',
      cancelLabel: options?.cancelLabel ?? '아니요',
      confirmLabel: options?.confirmLabel ?? '네',
      resolve,
    });
  });
}
