export const nrmYoutubeSearchPlaceholder = '가수, 곡 제목';

/** 최초 Android/iOS InnerTube 세션 워밍 중 — 검색 결과 영역 표시 */
export const nrmYoutubeInnertubeWarmingMessage = '초기화 중...';

export const nrmYoutubeSearchEmptyQueryMessage = '검색어를 입력하세요.';

/** 웹 전용: `/api/youtube/search` 등 백엔드 HTTP 검색 fetch 실패 */
export const nrmYoutubeSearchBackendConnectionMessage =
  '검색 서버에 연결할 수 없습니다. 백엔드가 실행 중인지(기본 포트 8787), 앱이 가리키는 주소가 맞는지 확인하세요.';

/**
 * iOS/Android 전용(Expo Go·APK·IPA 동일): Innertube·YouTube 검색 실패 시.
 * 백엔드·8787 문구를 쓰지 않습니다.
 */
export const nrmYoutubeSearchOnDeviceErrorMessage =
  'YouTube 검색에 실패했습니다. 네트워크를 확인한 뒤 다시 시도하세요.';

/** 서버에 YouTube Data API 키 없음 → HTTP 503 */
export const nrmYoutubeSearchApiKeyMissingMessage =
  '검색은 백엔드가 YouTube Data API로 조회합니다. 서버 환경 변수 NRM_YOUTUBE_API_KEY를 설정한 뒤 백엔드를 다시 실행하세요.';

export const nrmYoutubeSearchYoutubeApiErrorMessage =
  'YouTube 검색 API에서 오류가 났습니다. 잠시 후 다시 시도하세요.';

export const nrmYoutubeSearchParseErrorMessage =
  '검색 응답을 해석할 수 없습니다.';

export const nrmYoutubeSearchBadResponseMessage =
  '검색 서버 응답 형식이 올바르지 않습니다.';

export const nrmYoutubeSearchEndpointMissingMessage =
  '검색 API 경로를 찾을 수 없습니다(404). 백엔드를 최신 코드로 다시 실행하세요.';

/** 서버·Expo Go(PC 백엔드) yt-dlp 추출 실패 */
export const nrmYoutubeDownloadYtDlpFailedMessage =
  'YouTube 오디오 추출에 실패했습니다. 네트워크를 확인하고, 웹·Expo Go에서는 백엔드(8787)의 yt-dlp·ffmpeg 설치 여부를 확인하세요.';
