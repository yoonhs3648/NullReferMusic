export type NotifyPayload = {
  message: string;
};

export type ConfirmPayload = {
  message: string;
  /** message 앞에 강조 색으로 표시할 문구 (예: "가수 - 곡제목") */
  highlight?: string;
  cancelLabel: string;
  confirmLabel: string;
  resolve: (confirmed: boolean) => void;
};

export type ChoiceOption<T extends string = string> = {
  id: T;
  label: string;
};

export type ChoicePayload<T extends string = string> = {
  message: string;
  options: ChoiceOption<T>[];
  cancelLabel?: string;
  resolve: (value: T | null) => void;
};

type NotifyListener = (p: NotifyPayload) => void;
type ConfirmListener = (p: ConfirmPayload) => void;
type ChoiceListener = (p: ChoicePayload) => void;

let notifyListener: NotifyListener | null = null;
let confirmListener: ConfirmListener | null = null;
let choiceListener: ChoiceListener | null = null;
let menuNotifyListener: NotifyListener | null = null;
let menuConfirmListener: ConfirmListener | null = null;
let menuChoiceListener: ChoiceListener | null = null;

export function registerNotifyListener(fn: NotifyListener | null): void {
  notifyListener = fn;
}

export function registerConfirmListener(fn: ConfirmListener | null): void {
  confirmListener = fn;
}

export function registerChoiceListener(fn: ChoiceListener | null): void {
  choiceListener = fn;
}

/** 메뉴 드로어가 열려 있을 때 — 알림이 메뉴 Modal 위에 보이도록 */
export function registerMenuNotifyListener(fn: NotifyListener | null): void {
  menuNotifyListener = fn;
}

export function registerMenuConfirmListener(fn: ConfirmListener | null): void {
  menuConfirmListener = fn;
}

export function registerMenuChoiceListener(fn: ChoiceListener | null): void {
  menuChoiceListener = fn;
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
  options?: { cancelLabel?: string; confirmLabel?: string; highlight?: string },
): Promise<boolean> {
  return new Promise((resolve) => {
    const listener = menuConfirmListener ?? confirmListener;
    if (!listener) {
      resolve(false);
      return;
    }
    listener({
      message: message.trim() || ' ',
      highlight: options?.highlight?.trim() || undefined,
      cancelLabel: options?.cancelLabel ?? '아니요',
      confirmLabel: options?.confirmLabel ?? '네',
      resolve,
    });
  });
}

/** 여러 선택지 팝업(NrmNotifyHost). 리스너가 없으면 `null`. */
export function choiceUser<T extends string>(
  message: string,
  options: ChoiceOption<T>[],
  cancelLabel = '취소',
): Promise<T | null> {
  return new Promise((resolve) => {
    const listener = menuChoiceListener ?? choiceListener;
    if (!listener || options.length === 0) {
      resolve(null);
      return;
    }
    listener({
      message: message.trim() || ' ',
      options,
      cancelLabel,
      resolve: (value) => resolve(value as T | null),
    });
  });
}
