import * as FileSystem from 'expo-file-system/src/legacy/FileSystem';
import { Platform } from 'react-native';

const YTDLP_TMP_DIR = 'nrm-ytdlp-tmp';

const STALE_CACHE_PREFIXES = [
  'nrm-local-',
  'nrm-dl-',
  'nrm-whisper-src-',
  'nrm-lrc-',
  'nrm-whisper-',
  'nrm-whisper-out-',
  'nrm-meta-',
  'nrm-cover-',
  'nrm-shine-',
] as const;

function isStaleCacheEntry(name: string): boolean {
  if (name === YTDLP_TMP_DIR) return true;
  if (name.startsWith('nrm_yt_cookies_')) return true;
  return STALE_CACHE_PREFIXES.some((prefix) => name.startsWith(prefix));
}

function cacheEntryUri(root: string, name: string): string {
  return root.endsWith('/') ? `${root}${name}` : `${root}/${name}`;
}

/** JS 번들 cold start — cacheDirectory의 orphan `nrm-*` 임시 파일 제거 */
export async function reconcileStaleArtifactsOnColdStart(): Promise<void> {
  if (Platform.OS !== 'android') return;

  const root = FileSystem.cacheDirectory;
  if (!root) return;

  try {
    const entries = await FileSystem.readDirectoryAsync(root);
    await Promise.all(
      entries
        .filter(isStaleCacheEntry)
        .map((name) =>
          FileSystem.deleteAsync(cacheEntryUri(root, name), { idempotent: true }).catch(() => {}),
        ),
    );
  } catch {
    /* cache 읽기 실패 — 무시 */
  }
}
