/**
 * 다운로드 설정 화면으로 이동하기 위한 전역 이벤트.
 * NrmAppMenu가 리스너를 등록하면 어디서든 openDownloadSettingsPanel()로 이동 가능.
 */

type Listener = () => void;

let listener: Listener | null = null;

export function registerOpenDownloadSettingsListener(fn: Listener | null): void {
  listener = fn;
}

/** 메뉴를 열고 다운로드 설정 패널로 이동합니다. 리스너 미등록 시 noop. */
export function openDownloadSettingsPanel(): void {
  listener?.();
}
