/**
 * Supabase Postgres 테이블 타입 (nrm_*).
 * 앱 마이그레이션 시 NrmAlarmItem 등과 매핑.
 */
export type NrmSupabaseApkVersionRow = {
  id: number;
  version: string;
  created_date: string;
  inserted_at: string;
  updated_at: string;
};

export type NrmSupabaseAlarmRow = {
  id: number;
  is_noti: boolean;
  title: string;
  content: string;
  serial_no: string;
  alarm_date: string;
  inserted_at: string;
  updated_at: string;
};

export type NrmSupabaseUserBanRow = {
  id: number;
  user_name: string;
  serial_no: string;
  content: string;
  is_banned: boolean;
  ban_date: string;
  inserted_at: string;
  updated_at: string;
};

export type NrmSupabaseInquiryRow = {
  id: number;
  user_name: string;
  serial_no: string;
  version: string;
  content: string;
  attached_file: string;
  is_answered: boolean;
  reply_content: string;
  created_date: string;
  inserted_at: string;
  updated_at: string;
};

export type NrmSupabaseUserListRow = {
  id: number;
  app_name: string;
  user_name: string;
  serial_no: string;
  version: string;
  created_date: string;
  device_id: string | null;
  last_access_date: string | null;
  inserted_at: string;
  updated_at: string;
};

export type NrmSupabaseMusicListRow = {
  id: number;
  rank: number;
  year: number;
  artist: string;
  title: string;
  album: string;
  genre: string;
  inserted_at: string;
  updated_at?: string | null;
};

/** LLMProvider — ApiKey 등 비공개 컬럼은 앱에서 select 하지 않는다. */
export type NrmSupabaseLlmProviderPublicRow = {
  ProviderID: number;
  ProviderName: string;
  Type: string;
  ModelName: string;
  ModelDisplayName: string;
  Version: string;
  Description: string | null;
  IsActive: boolean;
};

/** ChatSession — AI Lab 좌측 대화 목록 대응. SerialNo/SessionID 복합 PK. */
export type NrmSupabaseChatSessionRow = {
  SessionID: number;
  SerialNo: string;
  ProviderID: number;
  Title: string;
  IsDeleted: boolean;
  RegDate: string;
  UpdateDate: string;
};

/** ChatMessage — Role: 사용자 SerialNo(사용자 발화) | 'assistant' | 'system'. */
export type NrmSupabaseChatMessageRow = {
  MessageID: number;
  SessionID: number;
  Role: string;
  Content: string;
  InputToken: number;
  OutputToken: number;
  TotalToken: number;
  RegDate: string;
};

/** JSON 필드명 ↔ DB snake_case 매핑 참고 */
export const NRM_SUPABASE_FIELD_MAP = {
  SerialNo: 'serial_no',
  Createddate: 'created_date',
  appName: 'app_name',
  userName: 'user_name',
  isNoti: 'is_noti',
  isBanned: 'is_banned',
  isAnswered: 'is_answered',
  replyContent: 'reply_content',
  attachedFile: 'attached_file',
  deviceId: 'device_id',
  lastAccessDate: 'last_access_date',
  date: 'alarm_date', // alarm / ban 컨텍스트별
  ban_date: 'ban_date',
} as const;
