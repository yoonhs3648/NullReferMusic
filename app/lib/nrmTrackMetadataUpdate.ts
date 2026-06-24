import type {
  ApplyTrackMetadataUpdateInput,
  ApplyTrackMetadataUpdateResult,
} from '@/lib/nrmTrackMetadataUpdate.native';

export type { ApplyTrackMetadataUpdateInput, ApplyTrackMetadataUpdateResult };

export async function applyTrackMetadataUpdate(
  _input: ApplyTrackMetadataUpdateInput,
): Promise<ApplyTrackMetadataUpdateResult> {
  throw new Error('트랙 메타데이터 설정은 앱에서만 사용할 수 있습니다.');
}
