import { getNrmAuthSessionSerialNo } from '@/lib/nrmAuthSession';
import { getNrmSupabase } from '@/lib/nrmSupabaseClient';

const CAPACITY_FUNCTION_NAME = 'music-admin-capacity';

export type NrmSupabaseCapacityState = 'normal' | 'discovery_disabled';

export type NrmSupabaseRelationCapacity = {
  schemaName: string;
  relationName: string;
  totalBytes: number;
  tableBytes: number;
  indexBytes: number;
};

export type NrmSupabaseProjectCapacity = {
  projectRef: string;
  projectLabel: string;
  databaseBytes: number;
  hardLimitBytes: number;
  usageRatio: number;
  capacityState: NrmSupabaseCapacityState;
  thresholds: {
    warningBytes: number;
    disableDiscoveryBytes: number;
    writeStopBytes: number;
  };
  relations: NrmSupabaseRelationCapacity[];
  capturedAt: string;
};

export type NrmSupabaseCapacitySnapshot = {
  projects: NrmSupabaseProjectCapacity[];
  fetchedAt: string;
};

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('용량 응답 형식이 올바르지 않습니다.');
  }
  return value as Record<string, unknown>;
}

function requiredString(value: unknown): string {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error('용량 응답의 문자열 값이 올바르지 않습니다.');
  }
  return value;
}

function requiredNonNegativeNumber(value: unknown): number {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) {
    throw new Error('용량 응답의 숫자 값이 올바르지 않습니다.');
  }
  return number;
}

function parseState(value: unknown): NrmSupabaseCapacityState {
  if (value === 'normal' || value === 'discovery_disabled') {
    return value;
  }
  // Legacy server payloads may still emit warning/write_stopped; map to the new UX states.
  if (value === 'write_stopped' || value === 'warning') {
    return value === 'write_stopped' ? 'discovery_disabled' : 'normal';
  }
  throw new Error('용량 상태 값이 올바르지 않습니다.');
}

function parseRelation(value: unknown): NrmSupabaseRelationCapacity {
  const row = asRecord(value);
  return {
    schemaName: requiredString(row.schema_name),
    relationName: requiredString(row.relation_name),
    totalBytes: requiredNonNegativeNumber(row.total_bytes),
    tableBytes: requiredNonNegativeNumber(row.table_bytes),
    indexBytes: requiredNonNegativeNumber(row.index_bytes),
  };
}

function parseProject(value: unknown): NrmSupabaseProjectCapacity {
  const row = asRecord(value);
  const thresholds = asRecord(row.thresholds);
  if (!Array.isArray(row.relations)) {
    throw new Error('relation 용량 응답 형식이 올바르지 않습니다.');
  }
  return {
    projectRef: requiredString(row.project_ref),
    projectLabel: requiredString(row.project_label),
    databaseBytes: requiredNonNegativeNumber(row.database_bytes),
    hardLimitBytes: requiredNonNegativeNumber(row.hard_limit_bytes),
    usageRatio: requiredNonNegativeNumber(row.usage_ratio),
    capacityState: parseState(row.capacity_state),
    thresholds: {
      warningBytes: requiredNonNegativeNumber(thresholds.warning_bytes),
      disableDiscoveryBytes: requiredNonNegativeNumber(thresholds.disable_discovery_bytes),
      writeStopBytes: requiredNonNegativeNumber(thresholds.write_stop_bytes),
    },
    relations: row.relations.map(parseRelation),
    capturedAt: requiredString(row.captured_at),
  };
}

export async function fetchNrmSupabaseCapacityForAdmin(): Promise<NrmSupabaseCapacitySnapshot> {
  const callerSerial = await getNrmAuthSessionSerialNo();
  if (!callerSerial) throw new Error('관리자 로그인 정보가 없습니다.');

  const { data, error } = await getNrmSupabase().functions.invoke(CAPACITY_FUNCTION_NAME, {
    body: { callerSerial },
  });
  if (error) throw new Error(`Supabase 용량 조회 실패: ${error.message}`);

  const payload = asRecord(data);
  if (!Array.isArray(payload.projects) || payload.projects.length !== 2) {
    throw new Error('두 프로젝트의 용량 응답이 필요합니다.');
  }
  return {
    projects: payload.projects.map(parseProject),
    fetchedAt: requiredString(payload.fetched_at),
  };
}
