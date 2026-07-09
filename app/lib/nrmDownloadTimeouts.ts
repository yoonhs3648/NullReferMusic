/** innertube 클라이언트 1회 시도 상한 (getBasicInfo·decipher·googlevideo 합산) */
export const NRM_INNERTUBE_PER_CLIENT_TIMEOUT_MS = 28_000;

/** 모든 innertube 클라이언트 폴백 합산 상한 — 이후 yt-dlp */
export const NRM_INNERTUBE_EXTRACT_TOTAL_MS = 90_000;

/** @deprecated 합산 상한은 [NRM_INNERTUBE_EXTRACT_TOTAL_MS] 사용 */
export const NRM_INNERTUBE_EXTRACT_TIMEOUT_MS = NRM_INNERTUBE_EXTRACT_TOTAL_MS;

/** yt-dlp 추출 — 5분 초과 시 해당 다운로드 요청 전체 취소 */
export const NRM_YTDLP_EXTRACT_TIMEOUT_MS = 5 * 60_000;
