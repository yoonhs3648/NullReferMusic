import { logNrmDev } from '@/lib/nrmDevLog';

export type NrmDownloadStageProcess =
  | 'ytdlp'
  | 'innertube'
  | 'ffmpeg'
  | 'whisper'
  | 'translate'
  | 'persist'
  | 'pipeline';

/** JS 측 단위 프로세스 단계 로그 — Android nrm-debug.log `download-stage` 태그와 동일 */
export function logDownloadStage(
  process: NrmDownloadStageProcess,
  event: string,
  fields: Record<string, unknown> = {},
): void {
  logNrmDev('download-stage', { process, event, ...fields });
}
