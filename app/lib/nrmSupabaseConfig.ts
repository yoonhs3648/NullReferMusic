/** Supabase 프로젝트 연결 (클라이언트용 publishable key — APK에 내장 가능) */
export const NRM_SUPABASE_URL = 'https://bwkiaapffroyveqqjhom.supabase.co';

/** Publishable Key (구 Anon Key). RLS 정책 하에서 앱 CRUD */
export const NRM_SUPABASE_PUBLISHABLE_KEY =
  'sb_publishable_NJwirVJ8KPm8ricLz6hBUQ_20SwCMoi';

/** 문의 첨부 Storage 버킷 */
export const NRM_SUPABASE_INQUIRY_BUCKET = 'inquiry-attachments';

/** PostgREST 테이블명 */
export const NRM_SUPABASE_TABLES = {
  apkVersion: 'nrm_apk_version',
  alarm: 'nrm_alarm',
  userBanList: 'nrm_user_ban_list',
  inquiry: 'nrm_inquiry',
  userList: 'nrm_user_list',
  musicList: 'nrm_music_list',
  llmProvider: 'LLMProvider',
  llmUserPermission: 'LLMUserPermission',
  chatSession: 'ChatSession',
  chatMessage: 'ChatMessage',
} as const;

/** AI Lab 채팅 전송 Edge Function 이름 (ApiKey는 여기서만 서버사이드로 사용) */
export const NRM_SUPABASE_LLM_CHAT_SEND_FUNCTION = 'llm-chat-send';

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
