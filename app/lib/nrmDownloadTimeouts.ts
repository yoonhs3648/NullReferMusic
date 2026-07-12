/**
 * 다운로드 추출 타임아웃·스톨 상수.
 *
 * 긴 wall-clock “추출 전체 타임아웃”으로 yt-dlp 에 넘기지 않는다.
 * InnerTube 는 네이티브 HTTP readTimeout + 진행 스톨 워치독으로 막힌 뒤 yt-dlp 로 폴백한다.
 */

/** InnerTube API 1회 네이티브 HttpURLConnection readTimeout */
export const NRM_YOUTUBE_INNERTUBE_HTTP_READ_MS = 25_000;

/**
 * InnerTube 추출 중 HTTP/단계 진행이 이 시간 없으면 stall → yt-dlp.
 * HTTP readTimeout 보다 약간 길게 두어 한 요청이 끝나기 전에 오탐하지 않게 한다.
 */
export const NRM_INNERTUBE_STALL_MS = 35_000;

/** @deprecated 긴 추출 타임아웃 폴백 제거 — 호환·참조용 */
export const NRM_INNERTUBE_PER_CLIENT_TIMEOUT_MS = 28_000;

/** @deprecated */
export const NRM_INNERTUBE_EXTRACT_TOTAL_MS = 90_000;

/** @deprecated 합산 상한은 [NRM_INNERTUBE_EXTRACT_TOTAL_MS] 사용 */
export const NRM_INNERTUBE_EXTRACT_TIMEOUT_MS = NRM_INNERTUBE_EXTRACT_TOTAL_MS;

/** @deprecated */
export const NRM_YTDLP_EXTRACT_TIMEOUT_MS = 5 * 60_000;
