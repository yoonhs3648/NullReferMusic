/**
 * FAQ KB — 데이터만 (Embedding 전환 용이).
 * 매칭 로직은 faqMatch.ts.
 */

export type FaqKbEntry = {
  id: string;
  title: string;
  keywords: string[];
  answer: string;
};

/** JSON-like KB. 필드 추가 시 Embedding 문서와 동일 스키마 유지 */
export const FAQ_KB: FaqKbEntry[] = [
  {
    id: 'login',
    title: '로그인',
    keywords: ['로그인', 'login', '로그인이', '접속', '계정', '인증'],
    answer:
      '앱 로그인 문제: 네트워크·앱 최신 버전을 확인한 뒤, 설정에서 로그아웃 재시도하세요. 계속 실패하면 관리자에게 SerialNo와 함께 문의하세요.',
  },
  {
    id: 'download',
    title: '음악 다운로드',
    keywords: ['다운로드', '받기', '받아', '넣어줘', '저장', 'download'],
    answer:
      '음악 넣기: AI Lab에서 곡 제목·아티스트를 말하거나 「찾아줘」로 검색한 뒤, 목록에서 곡을 고르고 가사 옵션을 선택하면 YouTube 오디오로 다운로드됩니다.',
  },
  {
    id: 'lyrics',
    title: '가사',
    keywords: ['가사', 'lyrics', '싱크', '정렬', '번역'],
    answer:
      '가사: 다운로드 시 가사 모드(없음/생성/번역/Melon 등)를 고를 수 있습니다. 설정 > 다운로드·가사에서 기본 순서를 바꿀 수 있습니다.',
  },
  {
    id: 'token',
    title: 'AI 토큰',
    keywords: ['토큰', '할당', '한도', '쿼터', 'token', 'ai 사용'],
    answer:
      'AI 토큰: 관리자가 할당한 AllocatedToken이 소진되면 AI Lab을 쓸 수 없습니다. 「할당된 AI 토큰을 다 썼어요」 안내가 뜨면 관리자에게 문의하세요. (Gemini API 429와는 다릅니다.)',
  },
  {
    id: 'model',
    title: '모델 선택',
    keywords: ['모델', 'gemini', 'groq', '모델 변경', 'provider'],
    answer:
      '모델: AI Lab 상단/사이드에서 사용 가능한 LLM을 고를 수 있습니다. 권한이 없는 모델은 목록에 없거나 거부됩니다.',
  },
  {
    id: 'chart',
    title: '차트',
    keywords: ['차트', '빌보드', 'spotify', '멜론차트', '순위'],
    answer:
      '차트: 홈/차트 메뉴에서 Melon·Spotify 등 차트를 볼 수 있습니다. Spotify Charts는 로그인·세션이 필요할 수 있습니다.',
  },
  {
    id: 'update',
    title: '앱 업데이트',
    keywords: ['업데이트', '버전', 'apk', '최신', '설치'],
    answer:
      '앱 업데이트: 새 APK가 있으면 실행 시 업데이트 안내가 뜹니다. 메뉴의 버전 정보에서 현재 버전을 확인할 수 있습니다.',
  },
  {
    id: 'permission',
    title: '권한',
    keywords: ['권한', '저장소', '알림', 'permission', '허용'],
    answer:
      '권한: 다운로드·알림을 쓰려면 시스템 설정에서 저장소/알림 권한을 허용하세요. 거부 시 다운로드가 실패할 수 있습니다.',
  },
];
