/** innertube 추출 — 성공·실패 무관 1분 초과 시 중단 후 yt-dlp 폴백 */
export const NRM_INNERTUBE_EXTRACT_TIMEOUT_MS = 60_000;

/** yt-dlp 추출 — 5분 초과 시 해당 다운로드 요청 전체 취소 */
export const NRM_YTDLP_EXTRACT_TIMEOUT_MS = 5 * 60_000;
