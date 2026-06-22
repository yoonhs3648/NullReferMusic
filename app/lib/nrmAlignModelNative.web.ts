import { usesPcBackendInDev } from '@/lib/nrmDevRuntime';

export {
  alignMelonLyricsViaBackend as alignMelonLyricsToLrcNative,
  alignModelDownloadCompleteMessage,
  fetchAlignModelStatusesFromBackend as fetchAlignModelStatuses,
  isAlignModelInstalledOnBackend as isAlignModelInstalled,
  isAnyAlignModelInstalledOnBackend as isAnyAlignModelInstalled,
  startAlignModelDownloadOnBackend as startAlignModelDownload,
  startWav2Vec2BundleDownloadOnBackend as startWav2Vec2BundleDownload,
  subscribeAlignModelDownloadEventsOnBackend as subscribeAlignModelDownloadEvents,
  type AlignModelStatusRow,
  type MelonAlignNativeResult,
  type Wav2Vec2BundlePackProgress,
} from '@/lib/nrmAlignModelBackend';

/** 웹 dev: PC Spring 백엔드 align (aeneas) */
export function isAlignModelNativeAvailable(): boolean {
  return usesPcBackendInDev();
}
