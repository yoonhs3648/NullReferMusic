/**
 * 멜론 로그인·성인인증 WebView 시작 URL
 * 카카오계정 / 멜론아이디 중 로그인 방식을 선택하는 페이지.
 * redirectURL: 로그인 완료 후 이동할 멜론 모바일 홈 (MLCP 쿠키가 여기서 설정됨)
 */
export const NRM_MELON_LOGIN_URL =
  'https://accounts.melon.com/login/login.htm' +
  '?redirectURL=https%3A%2F%2Fm2.melon.com%2Findex.htm' +
  '&cpId=AS20';

/** 성인인증 안내 — 19금 곡 상세에서 인증 팝업을 띄우기 위한 예시 */
export const NRM_MELON_HOME_URL = 'https://www.melon.com/';
