export type NotifyPayload = {
  message: string;
  /** 기본 '알겠어요' */
  actionLabel?: string;
  onAction?: () => void;
  /** true면 배경 탭으로 닫기 불가 */
  blocking?: boolean;
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

export type PromptPayload = {
  message: string;
  secure?: boolean;
  confirmLabel?: string;
  cancelLabel?: string;
  resolve: (value: string | null) => void;
};

type NotifyListener = (p: NotifyPayload) => void;
type ConfirmListener = (p: ConfirmPayload) => void;
type ChoiceListener = (p: ChoicePayload) => void;
type PromptListener = (p: PromptPayload) => void;

let notifyListener: NotifyListener | null = null;
let confirmListener: ConfirmListener | null = null;
let choiceListener: ChoiceListener | null = null;
let menuNotifyListener: NotifyListener | null = null;
let menuConfirmListener: ConfirmListener | null = null;
let menuChoiceListener: ChoiceListener | null = null;
let promptListener: PromptListener | null = null;
let menuPromptListener: PromptListener | null = null;

export function registerNotifyListener(fn: NotifyListener | null): void {
  notifyListener = fn;
}

export function registerConfirmListener(fn: ConfirmListener | null): void {
  confirmListener = fn;
}

export function registerChoiceListener(fn: ChoiceListener | null): void {
  choiceListener = fn;
}

export function registerPromptListener(fn: PromptListener | null): void {
  promptListener = fn;
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

export function registerMenuPromptListener(fn: PromptListener | null): void {
  menuPromptListener = fn;
}

export function notifyUser(
  message: string,
  options?: Pick<NotifyPayload, 'actionLabel' | 'onAction' | 'blocking'>,
): void {
  const body = message.trim() || ' ';
  const payload: NotifyPayload = { message: body, ...options };
  if (menuNotifyListener) {
    menuNotifyListener(payload);
    return;
  }
  notifyListener?.(payload);
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

/** 텍스트 입력 팝업(NrmNotifyHost). 취소 시 `null`. */
export function promptUser(
  message: string,
  options?: {
    secure?: boolean;
    confirmLabel?: string;
    cancelLabel?: string;
  },
): Promise<string | null> {
  return new Promise((resolve) => {
    const listener = menuPromptListener ?? promptListener;
    if (!listener) {
      resolve(null);
      return;
    }
    listener({
      message: message.trim() || ' ',
      secure: options?.secure === true,
      confirmLabel: options?.confirmLabel ?? '확인',
      cancelLabel: options?.cancelLabel ?? '취소',
      resolve,
    });
  });
}
