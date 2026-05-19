export type NotifyPayload = {
  message: string;
};

type Listener = (p: NotifyPayload) => void;

let listener: Listener | null = null;

export function registerNotifyListener(fn: Listener | null): void {
  listener = fn;
}

export function notifyUser(message: string): void {
  const body = message.trim() || ' ';
  listener?.({ message: body });
}
