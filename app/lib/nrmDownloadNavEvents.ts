/**
 * 다운로드 설정 화면으로 이동하기 위한 전역 이벤트.
 * NrmAppMenu가 리스너를 등록하면 어디서든 openDownloadSettingsPanel()로 이동 가능.
 */

type Listener = () => void;

let pathListener: Listener | null = null;
let lyricsEmbedListener: Listener | null = null;

export function registerOpenDownloadSettingsListener(fn: Listener | null): void {
  pathListener = fn;
}

export function registerOpenLyricsEmbedSettingsListener(fn: Listener | null): void {
  lyricsEmbedListener = fn;
}

/** 메뉴를 열고 다운로드 경로 설정으로 이동합니다. */
export function openDownloadSettingsPanel(): void {
  pathListener?.();
}

/** 메뉴를 열고 가사 임베드(Whisper 모델) 설정으로 이동합니다. */
export function openLyricsEmbedSettingsPanel(): void {
  lyricsEmbedListener?.();
}
