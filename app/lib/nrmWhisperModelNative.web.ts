import { usesPcBackendInDev } from '@/lib/nrmDevRuntime';

export {
  fetchWhisperModelStatusesFromBackend as fetchWhisperModelStatuses,
  hasAnyWhisperModelOnBackend as hasAnyWhisperModelOnDevice,
  isWhisperModelInstalledOnBackend as isWhisperModelInstalled,
  startWhisperModelDownloadOnBackend as startWhisperModelDownloadOnDevice,
  subscribeWhisperModelDownloadEventsOnBackend as subscribeWhisperModelDownloadEvents,
  whisperModelDownloadCompleteMessage,
  type WhisperModelStatusRow,
} from '@/lib/nrmWhisperModelBackend';

/** 웹(개발): PC Spring 백엔드 `library/whisper` */
export function isWhisperModelNativeAvailable(): boolean {
  return usesPcBackendInDev();
}
