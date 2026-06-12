/**
 * 플랫폼 분리: 웹은 `nrmInnertubeYoutube.web`, 네이티브는 `.native`만 로드합니다.
 * (`youtubei.js` / `jintr` 가 웹 Metro 번들에서 깨지는 문제 방지)
 */
import { Platform } from 'react-native';

import type { NrmAudioFileMetadata } from '@/lib/nrmDownloadAudioMetadata';
import type { YoutubeSearchOutcome } from '@/lib/youtubeSearchTypes';

export async function searchYoutubeOnDevice(
  query: string,
): Promise<YoutubeSearchOutcome> {
  if (Platform.OS === 'web') {
    const m = await import('./nrmInnertubeYoutube.web');
    return m.searchYoutubeOnDevice(query);
  }
  const m = await import('./nrmInnertubeYoutube.native');
  return m.searchYoutubeOnDevice(query);
}

export async function getInnertube() {
  if (Platform.OS === 'web') {
    const m = await import('./nrmInnertubeYoutube.web');
    return m.getInnertube();
  }
  const m = await import('./nrmInnertubeYoutube.native');
  return m.getInnertube();
}

export async function downloadYoutubeAudioOnDevice(
  videoId: string,
  userSuggestedFileName: string,
  metadata?: NrmAudioFileMetadata,
): Promise<{ savedLabel: string }> {
  if (Platform.OS === 'web') {
    const m = await import('./nrmInnertubeYoutube.web');
    return m.downloadYoutubeAudioOnDevice(videoId, userSuggestedFileName, metadata);
  }
  const m = await import('./nrmInnertubeYoutube.native');
  return m.downloadYoutubeAudioOnDevice(videoId, userSuggestedFileName, metadata);
}

export async function extractYoutubeAudioOnDevice(
  videoId: string,
): Promise<{ fileUri: string }> {
  if (Platform.OS === 'web') {
    throw new Error('extractYoutubeAudioOnDevice is native-only');
  }
  const m = await import('./nrmInnertubeYoutube.native');
  return m.extractYoutubeAudioOnDevice(videoId);
}

export async function finalizeYoutubeAudioOnDevice(
  fileUri: string,
  userSuggestedFileName: string,
  metadata?: NrmAudioFileMetadata,
): Promise<{ savedLabel: string; lyricsWarning?: 'not_embedded' | 'translation_failed' | 'translation_exhausted' }> {
  if (Platform.OS === 'web') {
    throw new Error('finalizeYoutubeAudioOnDevice is native-only');
  }
  const m = await import('./nrmInnertubeYoutube.native');
  return m.finalizeYoutubeAudioOnDevice(fileUri, userSuggestedFileName, metadata);
}

export async function getAudioStreamUrlWithInnertube(
  videoId: string,
): Promise<string> {
  if (Platform.OS === 'web') {
    const m = await import('./nrmInnertubeYoutube.web');
    return m.getAudioStreamUrlWithInnertube(videoId);
  }
  const m = await import('./nrmInnertubeYoutube.native');
  return m.getAudioStreamUrlWithInnertube(videoId);
}
