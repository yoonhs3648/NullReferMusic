/** Supabase 프로젝트 연결 (클라이언트용 publishable key — APK에 내장 가능) */
export const NRM_SUPABASE_URL = 'https://bwkiaapffroyveqqjhom.supabase.co';

/** Publishable Key (구 Anon Key). RLS 정책 하에서 앱 CRUD */
export const NRM_SUPABASE_PUBLISHABLE_KEY =
  'sb_publishable_NJwirVJ8KPm8ricLz6hBUQ_20SwCMoi';

/** 문의 첨부 Storage 버킷 */
export const NRM_SUPABASE_INQUIRY_BUCKET = 'inquiry-attachments';

/** 앨범 커버 이미지 Storage 버킷 (다운로드 시 원본 coverUrl 업로드 → TrackHistory.AlbumCoverPath) */
export const NRM_SUPABASE_ALBUM_COVER_BUCKET = 'album-covers';

/** PostgREST 테이블명 */
export const NRM_SUPABASE_TABLES = {
  apkVersion: 'nrm_apk_version',
  alarm: 'nrm_alarm',
  userBanList: 'nrm_user_ban_list',
  inquiry: 'nrm_inquiry',
  userList: 'nrm_user_list',
  musicList: 'nrm_music_list',
  llmModel: 'LLMModel',
  llmProvider: 'LLMProvider',
  llmUserPermission: 'LLMUserPermission',
  llmUserQuota: 'LLMUserQuota',
  llmUserMonthlyAllocation: 'LLMUserMonthlyAllocation',
  chatSession: 'ChatSession',
  chatMessage: 'ChatMessage',
  trackHistory: 'TrackHistory',
} as const;

/** AI Lab 채팅 전송 Edge Function 이름 (ApiKey는 여기서만 서버사이드로 사용) */
export const NRM_SUPABASE_LLM_CHAT_SEND_FUNCTION = 'llm-chat-send';

/** 관리자 AI토큰 조회 — 제공자 쿼터(키 유효성 + DB 합산). 공식 잔여쿼터 REST가 없으면 used만 반환 */
export const NRM_SUPABASE_LLM_PROVIDER_QUOTA_FUNCTION = 'llm-provider-quota';

/**
 * Edge Function 절대 URL. 스트리밍 응답(NDJSON)을 읽으려면 `@supabase/supabase-js`의
 * `functions.invoke()`(RN 기본 fetch로 응답을 통째로 버퍼링) 대신 `expo/fetch`로
 * 직접 호출해야 한다 — `app/lib/nrmLlmChatSend.ts` 참고.
 */
export function getNrmSupabaseFunctionUrl(functionName: string): string {
  return `${NRM_SUPABASE_URL}/functions/v1/${functionName}`;
}

/**
 * nrm_apk_version 최신 1건 조회 (뷰 없음).
 * PostgREST: .../nrm_apk_version?select=version,created_date&order=created_date.desc,id.desc&limit=1
 */
export const NRM_SUPABASE_APK_VERSION_LATEST_QUERY =
  'select=version,created_date&order=created_date.desc,id.desc&limit=1';

/** Storage 공개 URL (attached_file에 저장할 object path 기준) */
export function getNrmSupabaseStoragePublicUrl(objectPath: string): string {
  const trimmed = objectPath.replace(/^\/+/, '');
  return `${NRM_SUPABASE_URL}/storage/v1/object/public/${NRM_SUPABASE_INQUIRY_BUCKET}/${trimmed}`;
}

/** 앨범 커버 공개 URL (TrackHistory.AlbumCoverPath 기준) */
export function getNrmSupabaseAlbumCoverPublicUrl(objectPath: string): string {
  const trimmed = objectPath.replace(/^\/+/, '');
  return `${NRM_SUPABASE_URL}/storage/v1/object/public/${NRM_SUPABASE_ALBUM_COVER_BUCKET}/${trimmed}`;
}
