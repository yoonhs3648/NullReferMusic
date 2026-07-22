/**
 * 다운로드 시점의 원본 앨범 커버(coverUrl)를 Supabase Storage `album-covers` 버킷에 업로드한다.
 * 실패해도 예외를 던지지 않는다 - 다운로드 완료 흐름을 절대 막지 않기 위함(호출부는 항상 fire-and-forget).
 * 성공 시 오브젝트 경로(TrackHistory.AlbumCoverPath에 저장할 값)를 반환, 실패/스킵 시 null.
 *
 * 파일명은 "가수이름 - 노래제목" (예: aespa - Next Level.jpg) 형태로 만들고, 사용자·다운로드
 * 시점과 무관하게 버킷 전체에서 공유되는 전역 이름이다. 같은 곡을 다른 사용자가(또는 같은
 * 사용자가 다시) 다운로드해도 이미 버킷에 그 이름의 파일이 있으면 재업로드(원본 이미지 재요청
 * 포함)를 스킵하고 기존 경로를 그대로 재사용한다.
 */
import { logNrmDev, logNrmRunError } from '@/lib/nrmDevLog';
import { NRM_SUPABASE_ALBUM_COVER_BUCKET } from '@/lib/nrmSupabaseConfig';
import { nrmSbStorageList, nrmSbStorageUpload } from '@/lib/nrmSupabaseCrud';

const KNOWN_EXTENSIONS = ['jpg', 'png', 'webp'] as const;

function sanitizeNamePart(value: string): string {
  const trimmed = value.trim().slice(0, 80);
  const withoutSeparators = trimmed.replace(/[\\/:*?"<>|\u0000-\u001F]+/g, ' ');
  const collapsed = withoutSeparators.replace(/\s+/g, ' ').trim();
  return collapsed || 'unknown';
}

export function buildAlbumCoverBaseName(
  artist: string | undefined,
  title: string | undefined,
): string {
  const safeArtist = sanitizeNamePart(artist || 'unknown');
  const safeTitle = sanitizeNamePart(title || 'unknown');
  const combined = safeArtist + ' - ' + safeTitle;
  return combined.slice(0, 160);
}

function extensionFromContentType(contentType: string | null): 'jpg' | 'png' | 'webp' {
  const ct = (contentType ?? '').toLowerCase();
  if (ct.includes('png')) return 'png';
  if (ct.includes('webp')) return 'webp';
  return 'jpg';
}

function contentTypeFromExtension(ext: string): string {
  if (ext === 'png') return 'image/png';
  if (ext === 'webp') return 'image/webp';
  return 'image/jpeg';
}

async function findExistingAlbumCoverPath(baseName: string): Promise<string | null> {
  const rows = await nrmSbStorageList(NRM_SUPABASE_ALBUM_COVER_BUCKET, '', {
    search: baseName,
    limit: 20,
  });
  for (const ext of KNOWN_EXTENSIONS) {
    const candidate = baseName + '.' + ext;
    const found = rows.some((row) => row.name === candidate);
    if (found) return candidate;
  }
  return null;
}

export async function uploadAlbumCoverForTrackHistory(
  coverUrl: string | undefined,
  artist: string | undefined,
  title: string | undefined,
): Promise<string | null> {
  const url = (coverUrl ?? '').trim();
  const isHttpUrl = /^https?:\/\//i.test(url);
  if (!url || !isHttpUrl) return null;

  const baseName = buildAlbumCoverBaseName(artist, title);

  try {
    const existingPath = await findExistingAlbumCoverPath(baseName);
    if (existingPath) {
      logNrmDev('trackHistory.cover', { event: 'upload-skip-existing', path: existingPath });
      return existingPath;
    }

    logNrmDev('trackHistory.cover', { event: 'upload-start', urlPreview: url.slice(0, 160), baseName });
    const res = await fetch(url);
    if (!res.ok) {
      logNrmDev('trackHistory.cover', { event: 'upload-skip-fetch-status', status: res.status });
      return null;
    }
    const buf = await res.arrayBuffer();
    if (buf.byteLength === 0) return null;

    const ext = extensionFromContentType(res.headers.get('content-type'));
    const path = baseName + '.' + ext;

    await nrmSbStorageUpload(NRM_SUPABASE_ALBUM_COVER_BUCKET, path, new Uint8Array(buf), {
      contentType: contentTypeFromExtension(ext),
      upsert: true,
    });
    logNrmDev('trackHistory.cover', { event: 'upload-ok', path, bytes: buf.byteLength });
    return path;
  } catch (e) {
    logNrmRunError('trackHistory.cover', e, { event: 'upload-error', urlPreview: url.slice(0, 160), baseName });
    return null;
  }
}
