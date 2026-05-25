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
  | 'server'
  | 'unknown';

const SPOTIFY_MESSAGES: Record<ChartErrorCode, string> = {
  not_configured:
    'Spotify 공식 API 차트를 보려면 설정에서 Client ID·Secret을 먼저 등록해 주세요.',
  charts_session:
    'Spotify Charts 계정이 등록되지 않았습니다.',
  auth_failed:
    'Bearer 토큰이 만료되었거나 유효하지 않습니다. 갱신 안내에 따라 charts.spotify.com에서 Bearer 토큰을 다시 저장해 주세요.',
  access_blocked:
    '이 환경에서는 Spotify 토큰 자동 발급이 차단됩니다. charts.spotify.com Network의 Authorization Bearer 값을 설정 → Bearer 토큰에 저장해 주세요.',
  premium_required:
    '권한이 없는 계정입니다. Premium 계정으로 업그레이드 하세요.',
  forbidden: 'Spotify에서 이 차트 보기를 허용하지 않았습니다.',
  not_found: '요청한 차트를 찾지 못했습니다.',
  empty: '지금은 표시할 곡이 없습니다.',
  network:
    '차트를 불러오지 못했습니다. 인터넷 연결을 확인해 주세요.',
  server: 'Spotify 차트를 잠시 불러올 수 없습니다. 잠시 후 다시 시도해 주세요.',
  unknown: 'Spotify 차트를 불러오지 못했습니다.',
};

const LASTFM_MESSAGES: Record<ChartErrorCode, string> = {
  access_blocked: '차트를 불러올 수 없습니다.',
  charts_session:
    '차트를 보려면 설정에서 API 정보를 먼저 등록해 주세요.',
  not_configured:
    'Last.fm 차트를 보려면 설정에서 API Key를 먼저 등록해 주세요.',
  auth_failed: 'Last.fm API Key가 올바르지 않습니다. 설정에서 다시 확인해 주세요.',
  premium_required:
    'Last.fm에서 이 요청을 허용하지 않았습니다. API Key를 확인해 주세요.',
  forbidden: 'Last.fm에서 이 차트 보기를 허용하지 않았습니다.',
  not_found: '요청한 차트를 찾지 못했습니다.',
  empty: '지금은 표시할 곡이 없습니다.',
  network:
    '차트를 불러오지 못했습니다. 인터넷 연결을 확인해 주세요.',
  server: 'Last.fm 차트를 잠시 불러올 수 없습니다. 잠시 후 다시 시도해 주세요.',
  unknown: 'Last.fm 차트를 불러오지 못했습니다.',
};

const APPLE_MESSAGES: Record<ChartErrorCode, string> = {
  access_blocked: 'Apple Music 차트를 불러올 수 없습니다.',
  charts_session: 'Apple Music 차트를 불러올 수 없습니다.',
  not_configured: 'Apple Music 차트를 불러올 수 없습니다.',
  auth_failed: 'Apple Music 차트를 불러올 수 없습니다.',
  premium_required: 'Apple Music 차트를 불러올 수 없습니다.',
  forbidden: 'Apple Music에서 차트 데이터를 제공하지 않았습니다.',
  not_found: '요청한 차트를 찾지 못했습니다.',
  empty: '지금은 표시할 곡이 없습니다.',
  network:
    '인터넷에 연결되지 않았거나 Apple Music 차트 서버에 닿지 못했습니다.',
  server: 'Apple Music 차트를 잠시 불러올 수 없습니다. 잠시 후 다시 시도해 주세요.',
  unknown: 'Apple Music 차트를 불러오지 못했습니다.',
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
    return 'premium_required';
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
    return httpStatus === 403 ? 'forbidden' : 'auth_failed';
  }
  if (apiCode === 'lastfm_charts_empty' || httpStatus === 404) {
    return 'empty';
  }
  if (httpStatus === 503) {
    return 'not_configured';
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
  if (httpStatus >= 500 || apiCode === 'apple_music_api_error') {
    return 'server';
  }
  return 'unknown';
}
