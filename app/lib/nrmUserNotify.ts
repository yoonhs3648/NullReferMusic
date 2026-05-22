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

export function registerNotifyListener(fn: NotifyListener | null): void {
  notifyListener = fn;
}

export function registerConfirmListener(fn: ConfirmListener | null): void {
  confirmListener = fn;
}

export function notifyUser(message: string): void {
  const body = message.trim() || ' ';
  notifyListener?.({ message: body });
}

/** 예/아니오 확인 오버레이(NrmNotifyHost). 리스너가 없으면 `false`. */
export function confirmUser(
  message: string,
  options?: { cancelLabel?: string; confirmLabel?: string },
): Promise<boolean> {
  return new Promise((resolve) => {
    if (!confirmListener) {
      resolve(false);
      return;
    }
    confirmListener({
      message: message.trim() || ' ',
      cancelLabel: options?.cancelLabel ?? '아니요',
      confirmLabel: options?.confirmLabel ?? '네',
      resolve,
    });
  });
}
