import {
  needsMelonCoverFallback,
  normalizeCoverArtUrl,
  pickLastfmCoverUrl,
} from '@/lib/nrmCoverArtUrl';
import { resolveLastfmArtistImageUrl } from '@/lib/nrmLastfmArtistImageClient';
import { searchLastfmAlbums, searchLastfmTracks } from '@/lib/nrmLastfmSearchClient';

function normalizeOut(url: string): string {
  return normalizeCoverArtUrl(url.trim());
}

function artistMatches(hitArtist: string, expected: string): boolean {
  const a = hitArtist.trim().toLowerCase();
  const b = expected.trim().toLowerCase();
  if (!a || !b) return true;
  return a.includes(b) || b.includes(a);
}

/** Last.fm — 아티스트 사진 (API 키 없으면 빈 문자열) */
export async function fallbackMelonArtistCover(artist: string): Promise<string> {
  const name = artist.trim();
  if (!name) return '';
  try {
    const out = await resolveLastfmArtistImageUrl(name, '');
    return normalizeOut(out.imageUrl);
  } catch {
    return '';
  }
}

/** Last.fm — 앨범 커버 */
export async function fallbackMelonAlbumCover(
  artist: string,
  album: string,
): Promise<string> {
  const albumName = album.trim();
  if (!albumName) return '';
  try {
    const out = await searchLastfmAlbums(albumName);
    if (!out.ok) return '';
    const hits = out.data.albums ?? [];
    const exact =
      hits.find(
        (h) =>
          !needsMelonCoverFallback(h.imageUrl) &&
          artistMatches(h.artist, artist),
      ) ??
      hits.find((h) => !needsMelonCoverFallback(h.imageUrl));
    return normalizeOut(exact?.imageUrl ?? '');
  } catch {
    return '';
  }
}

/** Last.fm — 트랙(앨범 커버 우선) */
export async function fallbackMelonTrackCover(
  artist: string,
  title: string,
  album?: string,
): Promise<string> {
  const albumName = (album ?? '').trim();
  if (albumName) {
    const fromAlbum = await fallbackMelonAlbumCover(artist, albumName);
    if (fromAlbum) return fromAlbum;
  }
  const trackTitle = title.trim();
  if (!trackTitle) return '';
  try {
    const query = artist.trim() ? `${artist.trim()} ${trackTitle}` : trackTitle;
    const out = await searchLastfmTracks(query);
    if (!out.ok) return '';
    const hits = out.data.tracks ?? [];
    const exact =
      hits.find(
        (h) =>
          !needsMelonCoverFallback(h.imageUrl) &&
          artistMatches(h.artist, artist) &&
          h.name.trim().toLowerCase() === trackTitle.toLowerCase(),
      ) ??
      hits.find(
        (h) => !needsMelonCoverFallback(h.imageUrl) && artistMatches(h.artist, artist),
      ) ??
      hits.find((h) => !needsMelonCoverFallback(h.imageUrl));
    return normalizeOut(exact?.imageUrl ?? '');
  } catch {
    return '';
  }
}

/** Last.fm track.getInfo 스타일이 아닌 search 응답 image[] — 타입 호환용 */
export function pickLastfmSearchHitCover(
  images: { '#text'?: string; size?: string }[] | undefined,
): string {
  return pickLastfmCoverUrl(images);
}
