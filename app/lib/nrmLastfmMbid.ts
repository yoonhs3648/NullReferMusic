/** MusicBrainz ID (Last.fm `mbid`) — UUID 형식 */
const MBID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isValidLastfmMbid(value: string | undefined | null): boolean {
  const s = (value ?? '').trim();
  return s.length > 0 && MBID_RE.test(s);
}

export function normalizeLastfmMbid(value: string | undefined | null): string {
  const s = (value ?? '').trim();
  return isValidLastfmMbid(s) ? s.toLowerCase() : '';
}
