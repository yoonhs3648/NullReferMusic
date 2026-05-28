/** 실시간 차트 화면용 API 실패 코드(설정·토큰 발급 화면과 분리). */



export type ChartPlatformId = 'spotify' | 'lastfm' | 'appleMusic';



export type ChartErrorCode =

  | 'not_configured'

  | 'charts_session'

  | 'auth_failed'

  | 'access_blocked'

  | 'premium_required'

  | 'forbidden'

  | 'not_found'

  | 'empty'

  | 'network'

  | 'backend_unreachable'

  | 'rate_limited'

  | 'server'

  | 'unknown';



const SPOTIFY_MESSAGES: Record<ChartErrorCode, string> = {

  not_configured:

    'Spotify API Client ID·Secret이 없습니다. 메뉴 → 앱 설정 → API 설정에서 등록하세요.',

  charts_session:

    'Spotify Charts Bearer 토큰이 없습니다. API 설정에서 charts.spotify.com 로그인 후 저장하세요.',

  auth_failed:

    'Spotify 토큰이 만료되었거나 잘못되었습니다. API 설정에서 다시 발급·저장하세요.',

  access_blocked:

    '이 기기에서는 토큰 자동 발급이 막혀 있습니다. charts.spotify.com Network의 Bearer를 복사해 저장하세요.',

  premium_required:

    'Premium 계정이 아닙니다. Spotify Premium으로 업그레이드하세요.',

  forbidden:

    'Spotify가 요청을 거부했습니다(403). 토큰·계정 권한을 확인하세요.',

  not_found: '요청한 차트를 찾을 수 없습니다.',

  empty: '지금은 표시할 곡이 없습니다.',

  network: '네트워크에 연결되지 않았습니다. Wi‑Fi·데이터를 확인하세요.',

  backend_unreachable:

    'PC 차트 서버(8787)에 연결하지 못했습니다. 서버 실행·같은 Wi‑Fi를 확인하세요.',

  rate_limited: 'API 요청이 너무 많습니다. 나중에 다시 시도하세요.',

  server: 'Spotify 서버 오류입니다. 잠시 후 다시 시도하세요.',

  unknown: 'Spotify 차트를 불러올 수 없습니다.',

};



const LASTFM_MESSAGES: Record<ChartErrorCode, string> = {

  access_blocked: 'Last.fm 차트를 불러올 수 없습니다.',

  charts_session: 'Last.fm API Key가 없습니다. API 설정에서 등록하세요.',

  not_configured:

    'Last.fm API Key가 없습니다. 메뉴 → 앱 설정 → API 설정에서 등록하세요.',

  auth_failed:
    '잘못된 API 키입니다. 메뉴 → 앱 설정 → API 설정 → Last.fm API 토큰 관리에서 다시 등록하세요.',

  premium_required:

    'Last.fm가 이 요청을 허용하지 않았습니다. API Key를 확인하세요.',

  forbidden: 'Last.fm가 요청을 거부했습니다(403). API Key를 확인하세요.',

  not_found: '요청한 차트를 찾을 수 없습니다.',

  empty: '지금은 표시할 곡이 없습니다.',

  network: '네트워크에 연결되지 않았습니다. Wi‑Fi·데이터를 확인하세요.',

  backend_unreachable:

    'PC 차트 서버(8787)에 연결하지 못했습니다. 서버 실행·같은 Wi‑Fi를 확인하세요.',

  rate_limited: 'API 요청이 너무 많습니다. 나중에 다시 시도하세요.',

  server: 'Last.fm 서버 오류입니다. 잠시 후 다시 시도하세요.',

  unknown: 'Last.fm 차트를 불러올 수 없습니다.',

};



const APPLE_MESSAGES: Record<ChartErrorCode, string> = {

  access_blocked: 'Apple Music 차트를 불러올 수 없습니다.',

  charts_session: 'Apple Music 차트를 불러올 수 없습니다.',

  not_configured: 'Apple Music 차트를 불러올 수 없습니다.',

  auth_failed: 'Apple Music 차트를 불러올 수 없습니다.',

  premium_required: 'Apple Music 차트를 불러올 수 없습니다.',

  forbidden: 'Apple Music이 차트 요청을 거부했습니다(403).',

  not_found: '요청한 차트를 찾을 수 없습니다.',

  empty: '지금은 표시할 곡이 없습니다.',

  network: '네트워크에 연결되지 않았습니다. Wi‑Fi·데이터를 확인하세요.',

  backend_unreachable:

    'PC 차트 서버(8787)에 연결하지 못했습니다. 서버 실행·같은 Wi‑Fi를 확인하세요.',

  rate_limited: 'API 요청이 너무 많습니다. 나중에 다시 시도하세요.',

  server: 'Apple Music 차트 서버 오류입니다. 잠시 후 다시 시도하세요.',

  unknown: 'Apple Music 차트를 불러올 수 없습니다.',

};



export function chartUserMessage(

  platform: ChartPlatformId,

  code: ChartErrorCode,

): string {

  const table =

    platform === 'spotify'

      ? SPOTIFY_MESSAGES

      : platform === 'lastfm'

        ? LASTFM_MESSAGES

        : APPLE_MESSAGES;

  return table[code] ?? table.unknown;

}



export function spotifyErrorFromApi(

  apiCode: string | undefined,

  httpStatus: number,

): ChartErrorCode {

  if (apiCode === 'spotify_charts_not_configured') {

    return 'charts_session';

  }

  if (apiCode === 'spotify_charts_access_blocked') {

    return 'access_blocked';

  }

  if (apiCode === 'spotify_charts_login_failed') {

    return 'auth_failed';

  }

  if (apiCode === 'spotify_not_configured' || apiCode === 'spotify_playlist_not_configured') {

    return 'not_configured';

  }

  if (apiCode === 'spotify_premium_required') {

    return 'premium_required';

  }

  if (apiCode === 'spotify_charts_auth_failed') {

    return 'auth_failed';

  }

  if (apiCode === 'spotify_auth_failed' || httpStatus === 401) {

    return 'auth_failed';

  }

  if (httpStatus === 403) {

    return 'forbidden';

  }

  if (httpStatus === 429 || apiCode === 'spotify_charts_rate_limited') {

    return 'rate_limited';

  }

  if (

    apiCode === 'spotify_charts_not_found' ||

    apiCode === 'spotify_playlist_not_accessible' ||

    apiCode === 'spotify_charts_empty' ||

    httpStatus === 404

  ) {

    return apiCode === 'spotify_charts_empty' ? 'empty' : 'not_found';

  }

  if (httpStatus === 503) {

    return 'not_configured';

  }

  if (httpStatus >= 500 || apiCode === 'spotify_api_error') {

    return 'server';

  }

  return 'unknown';

}



export function lastfmErrorFromApi(

  apiCode: string | undefined,

  httpStatus: number,

): ChartErrorCode {

  if (apiCode === 'lastfm_not_configured') {

    return 'not_configured';

  }

  if (apiCode === 'lastfm_auth_failed' || httpStatus === 401 || httpStatus === 403) {
    return 'auth_failed';
  }

  if (apiCode === 'lastfm_charts_empty' || httpStatus === 404) {

    return 'empty';

  }

  if (httpStatus === 429) {

    return 'rate_limited';

  }

  if (httpStatus === 503) {

    return 'not_configured';

  }

  if (
    apiCode === 'lastfm_api_error' &&
    (httpStatus === 401 || httpStatus === 403)
  ) {
    return 'auth_failed';
  }

  if (httpStatus >= 500 || apiCode === 'lastfm_api_error') {

    return 'server';

  }

  return 'unknown';

}



export function appleMusicErrorFromApi(

  apiCode: string | undefined,

  httpStatus: number,

): ChartErrorCode {

  if (apiCode === 'apple_music_charts_empty') {

    return 'empty';

  }

  if (apiCode === 'apple_music_charts_not_found' || httpStatus === 404) {

    return 'not_found';

  }

  if (apiCode === 'apple_music_forbidden' || httpStatus === 403) {

    return 'forbidden';

  }

  if (httpStatus === 429) {

    return 'rate_limited';

  }

  if (httpStatus >= 500 || apiCode === 'apple_music_api_error') {

    return 'server';

  }

  return 'unknown';

}

