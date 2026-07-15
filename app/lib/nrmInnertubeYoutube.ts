/**
 * 플랫폼 분리: 웹은 `nrmInnertubeYoutube.web`, 네이티브는 `.native`만 로드합니다.
 * (`youtubei.js` / `jintr` 가 웹 Metro 번들에서 깨지는 문제 방지)
 */
import { Platform } from 'react-native';

import type { NrmAudioFileMetadata } from '@/lib/nrmDownloadAudioMetadata';
import type { YoutubeSearchOutcome } from '@/lib/youtubeSearchTypes';

export async function searchYoutubePageOnDevice(
  query: string,
  cursor: string | null = null,
): Promise<YoutubeSearchOutcome> {
  if (Platform.OS === 'web') {
    const m = await import('./nrmInnertubeYoutube.web');
    return m.searchYoutubePageOnDevice(query, cursor);
  }
  const m = await import('./nrmInnertubeYoutube.native');
  return m.searchYoutubePageOnDevice(query, cursor);
}

export async function searchYoutubeOnDevice(
  query: string,
): Promise<YoutubeSearchOutcome> {
  return searchYoutubePageOnDevice(query, null);
}

export async function getInnertube() {
  if (Platform.OS === 'web') {
    const m = await import('./nrmInnertubeYoutube.web');
    return m.getInnertube();
  }
  const m = await import('./nrmInnertubeYoutube.native');
  return m.getInnertube();
}

/** 네이티브: 최초 YouTube 검색 시 android/ios 기본 세션을 생성·재사용 */
export async function warmInnertubeSessions(): Promise<void> {
  if (Platform.OS === 'web') {
    const m = await import('./nrmInnertubeYoutube.web');
    return m.warmInnertubeSessions();
  }
  const m = await import('./nrmInnertubeYoutube.native');
  return m.warmInnertubeSessions();
}

/** UI: InnerTube 워밍 완료 여부 (웹은 항상 true) */
export async function isInnertubeWarmSettled(): Promise<boolean> {
  if (Platform.OS === 'web') {
    const m = await import('./nrmInnertubeYoutube.web');
    return m.isInnertubeWarmSettled();
  }
  const m = await import('./nrmInnertubeYoutube.native');
  return m.isInnertubeWarmSettled();
}

export async function ensureInnertubeWarmedOnFirstSearch(): Promise<void> {
  if (Platform.OS === 'web') {
    const m = await import('./nrmInnertubeYoutube.web');
    return m.ensureInnertubeWarmedOnFirstSearch();
  }
  const m = await import('./nrmInnertubeYoutube.native');
  return m.ensureInnertubeWarmedOnFirstSearch();
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
): Promise<{ savedLabel: string; lyricsWarning?: 'not_embedded' | 'translation_failed' | 'translation_exhausted' | 'melon_align_failed' | 'memory_insufficient' }> {
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

export { YtdlpExtractTimeoutError } from './nrmInnertubeYoutube.native';
