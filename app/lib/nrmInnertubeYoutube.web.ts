/**
 * 웹 번들은 `youtubei.js` → `jintr` 등을 타지 않습니다.
 * 검색·다운로드는 `youtubeSearchClient` / 웹 전용 경로를 쓰며 이 모듈은 번들 링크용입니다.
 */
import type { NrmAudioFileMetadata } from '@/lib/nrmDownloadAudioMetadata';
import { sanitizeFileBase } from '@/lib/nrmYoutubeDownloadMeta';
import type { YoutubeSearchOutcome } from '@/lib/youtubeSearchTypes';
import {
  nrmYoutubeSearchEmptyQueryMessage,
  nrmYoutubeSearchOnDeviceErrorMessage,
} from '@/lib/nrmYoutubeStrings';

export function getInnertube(): Promise<never> {
  return Promise.reject(
    new Error('Innertube 기반 기능은 iOS/Android 앱에서만 사용됩니다.'),
  );
}

export async function warmInnertubeSessions(): Promise<void> {
  /* web stub — no-op */
}

export async function searchYoutubePageOnDevice(
  _query: string,
  _cursor: string | null,
): Promise<YoutubeSearchOutcome> {
  return searchYoutubeOnDevice(_query);
}

export async function searchYoutubeOnDevice(
  query: string,
): Promise<YoutubeSearchOutcome> {
  const q = query.trim();
  if (!q.length) {
    return {
      ok: false,
      userMessage: nrmYoutubeSearchEmptyQueryMessage,
      dev: { where: 'innertube.web.stub.emptyQuery' },
    };
  }
  return {
    ok: false,
    userMessage: nrmYoutubeSearchOnDeviceErrorMessage,
    dev: { where: 'innertube.web.stub' },
  };
}

export function finalAudioFileName(
  userFileName: string,
  streamMime: string,
): string {
  const stem = userFileName.replace(/\.(mp3|m4a|webm|opus|mp4)$/i, '').trim();
  const base = sanitizeFileBase(stem || 'track');
  const m = streamMime.toLowerCase();
  const ext = m.includes('webm')
    ? '.webm'
    : m.includes('mpeg') || m.includes('mp3')
      ? '.mp3'
      : '.m4a';
  return `${base}${ext}`;
}

export async function downloadYoutubeAudioOnDevice(
  _videoId: string,
  _userSuggestedFileName: string,
  _metadata?: NrmAudioFileMetadata,
): Promise<{ savedLabel: string }> {
  throw new Error('기기 저장 다운로드는 iOS/Android 앱에서만 사용됩니다.');
}

export async function getAudioStreamUrlWithInnertube(
  _videoId: string,
): Promise<string> {
  throw new Error('스트림 추출은 iOS/Android 앱에서만 사용됩니다.');
}
