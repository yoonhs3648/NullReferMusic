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

/** LLMModel — 개별 모델(제공자별). ApiKey는 LLMProvider 소유(정규화) — 여기 없음. */
export type NrmSupabaseLlmModelPublicRow = {
  ModelID: number;
  ProviderID: number;
  Type: string;
  ModelName: string;
  ModelDisplayName: string;
  Version: string;
  Description: string | null;
  IsActive: boolean;
};

/** LLMProvider — ApiKey는 앱에서 select 하지 않는다(컬럼 단위 GRANT로 차단됨). */
export type NrmSupabaseLlmProviderRow = {
  ProviderID: number;
  ProviderName: string;
  RegDate: string;
};

/** ChatSession — AI Lab 좌측 대화 목록 대응. SerialNo/SessionID 복합 PK. */
export type NrmSupabaseChatSessionRow = {
  SessionID: number;
  SerialNo: string;
  ProviderID: number;
  ModelID: number;
  Title: string;
  IsDeleted: boolean;
  RegDate: string;
  UpdateDate: string;
};

/** LLMUserPermission — 사용자×제공자 승인·할당 토큰. AllocatedToken=0은 무제한. */
export type NrmSupabaseLlmUserPermissionRow = {
  PermissionID: number;
  SerialNo: string;
  ProviderID: number;
  IsApproved: boolean;
  AllocatedToken: number;
};

/** LLMUserQuota — 사용자×제공자×월(YYYYMM) 누적 토큰 사용량. */
export type NrmSupabaseLlmUserQuotaRow = {
  QuotaID: number;
  SerialNo: string;
  ProviderID: number;
  TargetMonth: string;
  InputToken: number;
  OutputToken: number;
  TotalToken: number;
};

/** LLMProvider — 관리자 AI토큰 조회/할당 화면의 제공자 선택 목록용(ApiKey 제외). */
export type NrmSupabaseLlmProviderAdminRow = {
  ProviderID: number;
  ProviderName: string;
  RegDate: string;
};

/** LLMUserMonthlyAllocation — 관리자 AI토큰 할당 화면의 월별(YYYYMM) 설정 이력. */
export type NrmSupabaseLlmUserMonthlyAllocationRow = {
  AllocationID: number;
  SerialNo: string;
  ProviderID: number;
  TargetMonth: string;
  AllocatedToken: number;
  UpdatedBySerialNo: string | null;
  RegDate: string;
  UpdateDate: string;
};

/** LLMSystemPrompt — AI Lab 전역 시스템 프롬프트(모든 모델 동일 적용). */
export type NrmSupabaseLlmSystemPromptRow = {
  PromptID: number;
  Title: string;
  Content: string;
  SortOrder: number;
  IsActive: boolean;
  UpdatedBySerialNo: string | null;
  RegDate: string;
  UpdateDate: string;
};

/** AI Lab 추천 질문 응답 모드 */
export type NrmAiLabSuggestionAnswerMode =
  | 'plain'
  | 'web_search'
  | 'vector_plain'
  | 'vector_web';

export type NrmSupabaseLlmAiLabSuggestionCategoryRow = {
  CategoryID: number;
  CategoryCode: string;
  Title: string;
  AnswerMode: NrmAiLabSuggestionAnswerMode;
  SortOrder: number;
  IsActive: boolean;
};

export type NrmSupabaseLlmAiLabSuggestionPromptRow = {
  PromptID: number;
  CategoryID: number;
  PromptText: string;
  SortOrder: number;
  IsActive: boolean;
};

/** UI 칩용(선정 결과) */
export type NrmAiLabSuggestionChip = {
  promptId: number;
  categoryId: number;
  categoryCode: string;
  categoryTitle: string;
  answerMode: NrmAiLabSuggestionAnswerMode;
  promptText: string;
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
