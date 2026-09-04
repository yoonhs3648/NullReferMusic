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
  device_id: string;
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
  app_kind: string;
  user_name: string;
  user_custom_name: string | null;
  user_email: string;
  oauth_user_id: string;
  serial_no: string;
  version: string;
  created_date: string;
  device_id: string | null;
  last_access_date: string | null;
  is_admin: string;
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

/** MusicBrainz 관리자 RPC가 반환하는 수집 스케줄 행. */
export type NrmSupabaseMusicCollectionScheduleRow = {
  schedule_id: string;
  schedule_key: string;
  display_name: string;
  schedule_kind: 'daily' | 'interval';
  daily_time_kst: string | null;
  interval_minutes: number | null;
  next_run_at: string;
  is_enabled: boolean;
  claimed_until: string | null;
  claim_fence_token: string | null;
  claimed_by: string | null;
  date_from_offset_days: number;
  date_to_offset_days: number;
  country_codes: string[];
  primary_types: string[];
  secondary_types: string[];
  release_statuses: string[];
  max_artist_count: number;
  max_request_count: number;
  max_new_recording_count: number;
  priority: number;
  last_disabled_reason: string | null;
  created_at: string;
  updated_at: string;
};

/** 공통 시스템 스케줄 원장 (`nrm_system_schedule`) + 관리자 list RPC 확장 필드. */
export type NrmSupabaseSystemScheduleRow = {
  schedule_id: string;
  schedule_key: string;
  display_name: string;
  job_kind: 'musicbrainz_collection' | 'ailab_chat_retention' | 'track_history_retention';
  is_enabled: boolean;
  schedule_kind: 'daily' | 'interval';
  daily_time_kst: string | null;
  interval_minutes: number | null;
  next_run_at: string;
  config: Record<string, unknown>;
  created_at: string;
  updated_at: string;
  retention_days: number | null;
  music_schedule: NrmSupabaseMusicCollectionScheduleRow | null;
};

/** MusicBrainz 관리자 RPC가 반환하는 스케줄 실행 집계 행. */
export type NrmSupabaseMusicScheduleRunRow = {
  schedule_run_id: string;
  schedule_id: string;
  request_key: string;
  run_status: 'running' | 'completed' | 'partial' | 'failed' | 'cancelled';
  fence_token: string;
  worker_id: string;
  lease_until: string;
  date_from: string;
  date_to: string;
  request_count: number;
  discovered_count: number;
  inserted_count: number;
  updated_count: number;
  duplicate_count: number;
  failure_count: number;
  capacity_before_bytes: number | null;
  capacity_after_bytes: number | null;
  started_at: string;
  finished_at: string | null;
  error_message: string | null;
};

export type NrmSupabaseMusicCapacitySnapshotRow = {
  snapshot_id: string;
  source: string;
  database_bytes: number;
  relation_bytes: Record<string, number>;
  capacity_state: 'normal' | 'warning' | 'discovery_disabled' | 'write_stopped';
  captured_at: string;
};

/** music_rpc_admin_overview(jsonb)의 실제 반환 계약. */
export type NrmSupabaseMusicAdminOverview = {
  schedules: NrmSupabaseMusicCollectionScheduleRow[];
  allowlist_count: number;
  pending_jobs: number;
  recent_runs: NrmSupabaseMusicScheduleRunRow[];
  capacity: NrmSupabaseMusicCapacitySnapshotRow | null;
};

export type NrmSupabaseMusicArtistAllowlistRow = {
  artist_mbid: string;
  display_name: string;
  cohort: string;
  priority: number;
  is_pinned: boolean;
  is_enabled: boolean;
  verified_at: string | null;
  selection_note: string | null;
  artist_id: string | null;
  created_at: string;
  updated_at: string;
};

export type NrmSupabaseMusicDeadLetterRow = {
  dead_letter_id: string;
  source_kind: 'sync_job' | 'lastfm_fetch' | 'vector_outbox';
  source_id: string;
  reason: string;
  sanitized_payload: Record<string, unknown>;
  failed_at: string;
  resolved_at: string | null;
  resolution_note: string | null;
  job_kind: string | null;
  entity_type: string | null;
  job_status: string | null;
  http_status: number | null;
  api_error_code: number | null;
  attempt_count: number | null;
  available_at: string | null;
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
  /** AI Lab 피커 정렬 우선순위(낮을수록 상단). NULL이면 후순위. */
  preference: number | null;
  /** AI Lab 피커 추천 배지. */
  isRecommand: boolean;
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
  /** choices / agentUi / youtubeConfirm 스냅샷 */
  UiMeta?: unknown | null;
};

/** JSON 필드명 ↔ DB snake_case 매핑 참고 */
export const NRM_SUPABASE_FIELD_MAP = {
  SerialNo: 'serial_no',
  Createddate: 'created_date',
  appKind: 'app_kind',
  userEmail: 'user_email',
  isAdmin: 'is_admin',
  userName: 'user_name',
  userCustomName: 'user_custom_name',
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
