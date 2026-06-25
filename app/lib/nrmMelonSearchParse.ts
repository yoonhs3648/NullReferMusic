import type {
  MelonAlbumDetail,
  MelonAlbumSearchHit,
  MelonAlbumTrack,
  MelonArtistDetail,
  MelonArtistSearchHit,
  MelonDebutSong,
  MelonExternalLink,
  MelonGroupMember,
  MelonTrackCredits,
  MelonTrackSearchHit,
  MelonTrackSummary,
} from '@/lib/nrmMelonSearchTypes';
import { isMelonPlaceholderCoverUrl, normalizeCoverArtUrl } from '@/lib/nrmCoverArtUrl';
import { decodeHtmlEntities } from '@/lib/nrmHtmlText';

export const MELON_BASE = 'https://www.melon.com';
/** 멜론 검색 1페이지당 항목 수 (아티스트 listArtists.htm 기준) */
export const MELON_ARTIST_SEARCH_PAGE_SIZE = 20;
export const MELON_ALBUM_SEARCH_PAGE_SIZE = 21;
export const MELON_SONG_SEARCH_PAGE_SIZE = 50;
export const MELON_SIMILAR_LIMIT = 12;
export const MELON_ARTIST_POPULAR_TRACK_LIMIT = 15;
export const MELON_ARTIST_POPULAR_ALBUM_LIMIT = 12;
const BIO_PREVIEW_MAX = 480;
const ALBUM_DESC_MAX = 360;

const ARTIST_BLOCK_SPLIT = /<div class="wrap_atist12">/gi;
const ALBUM_BLOCK_SPLIT = /<div class="wrap_album04">/gi;
const SONG_ROW_SPLIT = /<tr[\s>]/gi;

const GO_ARTIST_RE = /goArtistDetail\(['"]?(\d+)['"]?\)/;
const GO_ALBUM_RE = /goAlbumDetail\(['"]?(\d+)['"]?\)/;
const GO_SONG_RE = /goSongDetail\(['"]?(\d+)['"]?\)/;
const IMG_SRC_RE = /<img[^>]+src="([^"]+)"/i;
const HIDDEN_ARTIST_ID_RE = /name="artistId"\s+value="(\d+)"/;

function cleanText(raw: string): string {
  return decodeHtmlEntities(raw)
    .replace(/<b>|<\/b>/gi, '')
    .replace(/<[^>]+>/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function truncateText(text: string, max: number): string {
  const t = text.trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max).trim()}…`;
}

/** Melon HTML의 `[싱글]`·`싱글` → UI용 `싱글` */
export function normalizeMelonAlbumKind(raw: string): string {
  const t = cleanText(raw);
  const m = t.match(/^\[(.+)\]$/);
  return m ? m[1]!.trim() : t;
}

function stripMelonPageMoveSuffix(name: string): string {
  return name.replace(/\s*-\s*페이지\s*이동\s*$/u, '').trim();
}

function cleanMelonLinkLabel(raw: string): string {
  return stripMelonPageMoveSuffix(cleanText(raw));
}

export { stripMelonPageMoveSuffix, cleanMelonLinkLabel };

function cleanMultilineText(raw: string): string {
  return decodeHtmlEntities(raw)
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/\r\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function normalizeImg(src: string): string {
  let url = src.trim();
  if (!url) return '';
  if (url.startsWith('//')) url = `https:${url}`;
  const out = normalizeCoverArtUrl(url);
  return isMelonPlaceholderCoverUrl(out) ? '' : out;
}

function parseEllipsisAnchorInDt(chunk: string): { title: string; innerHtml: string } | null {
  const dtBlock = chunk.match(/<dt>[\s\S]*?<\/dt>/i)?.[0] ?? '';
  if (!dtBlock) return null;
  const anchorMatch = dtBlock.match(/<a[^>]*class="ellipsis"[^>]*>([\s\S]*?)<\/a>/i);
  if (!anchorMatch) return null;
  const anchorTag = anchorMatch[0];
  const titleRaw = anchorTag.match(/title="([^"]*)"/i)?.[1] ?? '';
  return { title: titleRaw, innerHtml: anchorMatch[1] ?? '' };
}

function parseArtistSearchName(chunk: string): string {
  const anchor = parseEllipsisAnchorInDt(chunk);
  if (anchor) {
    const fromTitle = stripMelonPageMoveSuffix(cleanText(anchor.title));
    if (fromTitle) return fromTitle;
    const fromInner = cleanText(anchor.innerHtml.replace(/<[^>]+>/g, ''));
    if (fromInner) return fromInner;
  }
  const fallback = chunk.match(/class="ellipsis"[^>]*>([\s\S]*?)<\/a>\s*<\/dt>/i);
  return cleanText(fallback?.[1]?.replace(/<[^>]+>/g, '') ?? '');
}

function parseArtistSearchGenre(chunk: string): string {
  const block = chunk.match(/class="genre-info"[^>]*>([\s\S]*?)<\/div>/i)?.[1] ?? '';
  const parts: string[] = [];
  for (const span of block.match(/<span>([^<]*)<\/span>/gi) ?? []) {
    const text = cleanText(span.replace(/<\/?span>/gi, ''));
    if (text) parts.push(text);
  }
  return parts.join(', ');
}

function parseArtistSearchProfile(chunk: string): string {
  return cleanText(chunk.match(/<dd class="gubun">\s*([^<]+)/i)?.[1] ?? '');
}

function parseThumbImage(chunk: string, className: string): string {
  const patterns = [
    new RegExp(`class="${className}"[^>]*>[\\s\\S]*?<img[^>]+src="([^"]+)"`, 'i'),
    new RegExp(`class="${className}"[\\s\\S]*?<img[^>]+src="([^"]+)"`, 'i'),
  ];
  for (const re of patterns) {
    const m = chunk.match(re);
    if (m?.[1]) {
      const out = normalizeImg(m[1]);
      if (out) return out;
    }
  }
  return '';
}

export function parseMelonAlbumCoverFromDetailHtml(html: string): string {
  const patterns = [
    /id="d_album_org"[\s\S]*?<img[^>]+src="([^"]+)"/i,
    /class="wrap_thumb"[\s\S]*?<img[^>]+src="([^"]+)"/i,
    /class="section_info"[\s\S]*?class="thumb"[\s\S]*?<img[^>]+src="([^"]+)"/i,
    /property="og:image"\s+content="([^"]+)"/i,
  ];
  for (const re of patterns) {
    const m = html.match(re);
    if (m?.[1]) {
      const out = normalizeImg(m[1]);
      if (out) return out;
    }
  }
  return '';
}

export function parseMelonSongCoverFromDetailHtml(html: string): string {
  return normalizeImg(
    firstMatch(html, /id="d_song_org"[\s\S]*?<img[^>]+src="([^"]+)"/i) ?? '',
  );
}

export function parseMelonArtistCoverFromDetailHtml(html: string): string {
  return normalizeImg(
    firstMatch(html, /id="artistImgArea"[\s\S]*?<img[^>]+src="([^"]+)"/i) ?? '',
  );
}

function parseCount(raw: string | undefined): number {
  const t = (raw ?? '').replace(/,/g, '').trim();
  if (!t || t === '0') return 0;
  if (t.includes('+')) return 99999;
  const n = parseInt(t, 10);
  return Number.isFinite(n) ? n : 0;
}

function firstMatch(text: string, re: RegExp): string | null {
  const m = text.match(re);
  return m?.[1] ?? null;
}

function parseDefineBlock(html: string, sectionMarker: string): Record<string, string> {
  const block =
    html.match(
      new RegExp(`${sectionMarker}[\\s\\S]*?<dl class="list_define[^"]*">([\\s\\S]*?)</dl>`, 'i'),
    )?.[1] ?? '';
  const out: Record<string, string> = {};
  for (const row of block.match(/<dt>([^<]+)<\/dt>\s*<dd>([\s\S]*?)<\/dd>/gi) ?? []) {
    const m = row.match(/<dt>([^<]+)<\/dt>\s*<dd>([\s\S]*?)<\/dd>/i);
    if (!m) continue;
    out[cleanText(m[1]!)] = cleanText(m[2]!);
  }
  return out;
}

function parseDebutSong(html: string): MelonDebutSong | null {
  const block = html.match(/class="debutsong_info"[\s\S]*?<\/div>\s*<\/div>/i)?.[0] ?? '';
  if (!block) return null;
  const songId = firstMatch(block, GO_SONG_RE);
  if (!songId) return null;
  const name =
    cleanText(firstMatch(block, /title="([^"]+)"\s+class="ellipsis"/i) ?? '') ||
    cleanText(firstMatch(block, /title="([^"]+)"\s+class="thumb"/i) ?? '');
  if (!name) return null;
  return {
    songId,
    name,
    imageUrl: normalizeImg(firstMatch(block, IMG_SRC_RE) ?? ''),
  };
}

function parseGroupMembers(html: string): MelonGroupMember[] {
  const block = html.match(/class="wrap_gmem"[\s\S]*?<ul class="list_atist13[^"]*">([\s\S]*?)<\/ul>/i)?.[1] ?? '';
  if (!block) return [];
  const parts = block.split(/<li>/i).slice(1);
  const out: MelonGroupMember[] = [];
  for (const chunk of parts) {
    const artistId = firstMatch(chunk, GO_ARTIST_RE);
    if (!artistId) continue;
    const name =
      cleanText(firstMatch(chunk, /title="([^"]+)"\s+class="ellipsis"/i) ?? '') ||
      cleanText(firstMatch(chunk, /title="([^"]+)"\s+class="thumb"/i) ?? '');
    if (!name) continue;
    const profile = cleanText(firstMatch(chunk, /<dd class="gubun">([\s\S]*?)<\/dd>/i) ?? '');
    out.push({
      artistId,
      name,
      imageUrl: normalizeImg(firstMatch(chunk, IMG_SRC_RE) ?? ''),
      profile,
    });
  }
  return out;
}

function parseArtistLinks(html: string): MelonExternalLink[] {
  const links: MelonExternalLink[] = [];
  const snsBlock = html.match(/id="artist_sns_list"[\s\S]*?<\/dl>/i)?.[0] ?? '';
  const snsItems: { label: string; url: string }[] = [];
  for (const btn of snsBlock.match(/onclick="window\.open\('([^']+)'/gi) ?? []) {
    const url = btn.match(/window\.open\('([^']+)'/)?.[1] ?? '';
    if (!url) continue;
    if (url.includes('facebook')) snsItems.push({ label: 'Facebook', url });
    else if (url.includes('twitter') || url.includes('x.com')) snsItems.push({ label: 'X', url });
  }
  const infoBlock = html.match(/class="section_atistinfo05"[\s\S]*?<\/div>\s*<!-- \/\/연관정보 -->/i)?.[0] ?? '';
  for (const row of infoBlock.match(/<dt>([^<]+)<\/dt>\s*<dd>([\s\S]*?)<\/dd>/gi) ?? []) {
    const m = row.match(/<dt>([^<]+)<\/dt>\s*<dd>([\s\S]*?)<\/dd>/i);
    if (!m) continue;
    const label = cleanText(m[1]!);
    if (label === 'Facebook' || label === 'X' || label === 'SNS') continue;
    const raw = m[2]!;
    const url = raw.match(/href="([^"]+)"/i)?.[1] ?? '';
    const value = cleanText(raw.replace(/<[^>]+>/g, ' ').replace(/\s*\|\s*/g, ' · '));
    if (label && value) links.push({ label, value, url });
  }
  if (snsItems.length > 0) {
    links.push({
      label: 'SNS',
      value: snsItems.map((s) => s.label).join(', '),
      url: '',
      snsItems,
    });
  }
  return links;
}

export function parseMelonArtistSearchHtml(
  html: string,
  limit = MELON_ARTIST_SEARCH_PAGE_SIZE,
): MelonArtistSearchHit[] {
  const parts = html.split(ARTIST_BLOCK_SPLIT);
  const hits: MelonArtistSearchHit[] = [];
  const seen = new Set<string>();
  for (let i = 1; i < parts.length && hits.length < limit; i++) {
    const chunk = parts[i]!;
    const artistId =
      firstMatch(chunk, HIDDEN_ARTIST_ID_RE) ?? firstMatch(chunk, GO_ARTIST_RE);
    if (!artistId || seen.has(artistId)) continue;
    seen.add(artistId);
    const name = parseArtistSearchName(chunk);
    if (!name) continue;
    const fanMatch = chunk.match(new RegExp(`d_fan_cnt_${artistId}[^>]*>([^<]*)`, 'i'));
    const fanCount = parseCount(fanMatch?.[1]);
    hits.push({
      artistId,
      name,
      imageUrl: parseThumbImage(chunk, 'thumb'),
      genre: parseArtistSearchGenre(chunk),
      profile: parseArtistSearchProfile(chunk),
      fanCount,
      url: `${MELON_BASE}/artist/detail.htm?artistId=${artistId}`,
    });
  }
  return hits;
}

export function parseMelonAlbumSearchHtml(
  html: string,
  limit = MELON_ALBUM_SEARCH_PAGE_SIZE,
): MelonAlbumSearchHit[] {
  const parts = html.split(ALBUM_BLOCK_SPLIT);
  const hits: MelonAlbumSearchHit[] = [];
  for (let i = 1; i < parts.length && hits.length < limit; i++) {
    const hit = parseMelonAlbumBlockChunk(parts[i]!);
    if (hit) hits.push(hit);
  }
  return hits;
}

export function parseMelonSongSearchHtml(
  html: string,
  limit = MELON_SONG_SEARCH_PAGE_SIZE,
): MelonTrackSearchHit[] {
  const parts = html.split(SONG_ROW_SPLIT);
  const hits: MelonTrackSearchHit[] = [];
  for (let i = 1; i < parts.length && hits.length < limit; i++) {
    const chunk = `<tr${parts[i]}`;
    if (!chunk.includes('input_check')) continue;
    const songId =
      firstMatch(chunk, /name="input_check"\s+value="(\d+)"/) ??
      firstMatch(chunk, GO_SONG_RE);
    if (!songId) continue;
    let title = '';
    const titleLink = chunk.match(/class="fc_gray"\s+title="([^"]+)"/i);
    if (titleLink) title = cleanText(titleLink[1]!);
    else {
      const playTitle = chunk.match(/title="([^"]+) 재생"/i);
      title = cleanText(playTitle?.[1] ?? '');
    }
    if (!title) continue;
    const artistBlock = chunk.match(/wrapArtistName[\s\S]*?<\/td>/i)?.[0] ?? chunk;
    const artistMatch = artistBlock.match(
      /goArtistDetail\(['"]?(\d+)['"]?\)[^>]*title="([^"]+)[^"]*"[^>]*>([^<]*)<\/a>/i,
    );
    const artistId = artistMatch?.[1] ?? firstMatch(artistBlock, GO_ARTIST_RE) ?? '';
    const artist = cleanMelonLinkLabel(artistMatch?.[2] || artistMatch?.[3] || '');
    const albumMatch = chunk.match(
      /goAlbumDetail\(['"]?(\d+)['"]?\)[^>]*title="([^"]+)[^"]*"[^>]*>([^<]*)<\/a>/i,
    );
    const albumId = albumMatch?.[1] ?? '';
    const album = cleanMelonLinkLabel(albumMatch?.[2] || albumMatch?.[3] || '');
    hits.push({
      songId,
      name: title,
      artist,
      artistId,
      album,
      albumId,
      imageUrl: '',
      url: `${MELON_BASE}/song/detail.htm?songId=${songId}`,
    });
  }
  return hits;
}

export function parseMelonArtistDetailHtml(html: string, artistId: string): MelonArtistDetail {
  const name = cleanText(
    html.match(/class="title_atist"[^>]*>(?:<strong[^>]*>[^<]*<\/strong>)?([^<]+)</)?.[1] ?? '',
  );
  const imageUrl = normalizeImg(
    firstMatch(html, /id="artistImgArea"[\s\S]*?<img[^>]+src="([^"]+)"/i) ?? '',
  );
  const bioRaw =
    html.match(/id="d_artist_intro"[^>]*>([\s\S]*?)<\/div>\s*<div class="wrap_btn">/i)?.[1] ?? '';
  const bioSummary = truncateText(cleanText(bioRaw), BIO_PREVIEW_MAX);

  const activity = parseDefineBlock(html, 'section_atistinfo03');
  const personal = parseDefineBlock(html, 'section_atistinfo04');

  return {
    info: {
      artistId,
      name,
      imageUrl,
      bioSummary,
      genre: activity['장르'] ?? '',
      fanCount: 0,
      debutDate: activity['데뷔'] ?? '',
      artistType: activity['유형'] ?? '',
      activeEra: activity['활동년대'] ?? '',
      agency: activity['소속사명'] ?? '',
      nationality: personal['국적'] ?? '',
      debutSong: parseDebutSong(html),
      groupMembers: parseGroupMembers(html),
      links: parseArtistLinks(html),
      url: `${MELON_BASE}/artist/detail.htm?artistId=${artistId}`,
    },
    popularTracks: [],
    popularAlbums: [],
  };
}

export function parseMelonFanCountJson(json: string): number {
  try {
    const root = JSON.parse(json) as { fanInfo?: { SUMMCNT?: number } };
    return Math.max(0, root.fanInfo?.SUMMCNT ?? 0);
  } catch {
    return 0;
  }
}

export function applyArtistFanCount(detail: MelonArtistDetail, fanCount: number): MelonArtistDetail {
  return { ...detail, info: { ...detail.info, fanCount } };
}

export function parseMelonAlbumDetailHtml(html: string, albumId: string): MelonAlbumDetail {
  let name = cleanText(
    html.match(/class="song_name"[\s\S]*?<strong[^>]*>[\s\S]*?<\/strong>\s*([^<\r\n]+)/i)?.[1] ?? '',
  );
  let nameFromOgTitle = false;
  if (!name) {
    name = cleanText(
      html.match(/property="og:title"\s+content="([^"]+)"/i)?.[1] ?? '',
    ).replace(/\s*\|.*$/, '').trim();
    nameFromOgTitle = true;
  }
  const imageUrl = parseMelonAlbumCoverFromDetailHtml(html);
  const artistMatch = html.match(
    /class="artist"[\s\S]*?goArtistDetail\(['"]?(\d+)['"]?\)[^>]*title="([^"]+)"[^>]*>([^<]*)</i,
  );
  const artistId = artistMatch?.[1] ?? '';
  const artist = cleanText(artistMatch?.[2] || artistMatch?.[3] || '');
  if (nameFromOgTitle && artist && name) {
    const escaped = artist.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const stripped = name.replace(new RegExp(`\\s*-\\s*${escaped}\\s*$`, 'i'), '').trim();
    if (stripped) name = stripped;
  }
  const albumKind =
    normalizeMelonAlbumKind(
      cleanText(firstMatch(html, /class="gubun"[\s\S]*?\[([^[\]]+)\]/) ?? '') ||
        cleanText(firstMatch(html, /class="vdo_name">([^<]+)</) ?? ''),
    );

  let releaseDate = '';
  let genre = '';
  let label = '';
  let agency = '';
  const metaBlock = html.match(/class="meta"[\s\S]*?<dl class="list">([\s\S]*?)<\/dl>/i)?.[1] ?? '';
  for (const row of metaBlock.match(/<dt>([^<]+)<\/dt>\s*<dd>([\s\S]*?)<\/dd>/gi) ?? []) {
    const m = row.match(/<dt>([^<]+)<\/dt>\s*<dd>([\s\S]*?)<\/dd>/i);
    if (!m) continue;
    const key = cleanText(m[1]!);
    const val = cleanText(m[2]!);
    if (key === '발매일') releaseDate = val;
    else if (key === '장르') genre = val;
    else if (key === '발매사') label = val;
    else if (key === '기획사') agency = val;
  }

  const likeCount = parseCount(
    firstMatch(html, /id="d_like_count"[^>]*>\s*<span class="none">[^<]*<\/span>\s*([^<]+)/i) ?? '',
  );
  const trackCount = parseInt(
    firstMatch(html, /수록곡\s*<span class="sum">\((\d+)\)<\/span>/i) ?? '0',
    10,
  );
  const descRaw =
    html.match(/id="d_video_summary"[^>]*>([\s\S]*?)<\/div>\s*<!-- \/\/앨범소개글 -->/i)?.[1] ?? '';
  const description = truncateText(cleanText(descRaw), ALBUM_DESC_MAX);
  const tracks = parseMelonAlbumTrackList(html);

  return {
    info: {
      albumId,
      name,
      artist,
      artistId,
      imageUrl,
      releaseDate,
      genre,
      albumKind,
      likeCount,
      trackCount: trackCount || tracks.length,
      label,
      agency,
      description,
      url: `${MELON_BASE}/album/detail.htm?albumId=${albumId}`,
      tracks,
    },
  };
}

export function parseMelonAlbumTrackList(html: string): MelonAlbumTrack[] {
  const listBlock =
    html.match(/class="service_list_song[^"]*d_song_list"[\s\S]*?<tbody>([\s\S]*?)<\/tbody>/i)?.[1] ??
    '';
  const rows = listBlock.split(/<tr/i).slice(1);
  const tracks: MelonAlbumTrack[] = [];
  for (const row of rows) {
    const chunk = `<tr${row}`;
    const songId =
      firstMatch(chunk, /name="input_check"\s+value="(\d+)"/) ??
      firstMatch(chunk, GO_SONG_RE);
    if (!songId) continue;
    const rank = parseInt(firstMatch(chunk, /class="rank\s*">(\d+)</) ?? `${tracks.length + 1}`, 10);
    let title = '';
    const infoTitle = chunk.match(/goSongDetail\([^)]+\)[^>]*title="([^"]+)\s*곡정보"/i);
    if (infoTitle) title = cleanText(infoTitle[1]!);
    else {
      const playTitle = chunk.match(/title="([^"]+) 재생">([^<]*)</i);
      title = cleanText(playTitle?.[1] || playTitle?.[2] || '');
    }
    const trackArtist = cleanText(firstMatch(chunk, /rank02[\s\S]*?<a[^>]*>([^<]+)<\/a>/i) ?? '');
    if (!title) continue;
    tracks.push({ songId, name: title, rank, artist: trackArtist });
  }
  return tracks;
}

function extractMelonSongLyricsBlock(html: string): string {
  const legacy = html.match(/<!--\s*가사\s*-->[\s\S]*?<!--\s*\/\/가사\s*-->/i)?.[0];
  if (legacy) return legacy;
  return (
    html.match(
      /class="section_lyric"[\s\S]*?id="lyricArea"[\s\S]*?<\/div>\s*<\/div>/i,
    )?.[0] ?? ''
  );
}

function extractMelonLyricAreaInner(html: string): string {
  const block = extractMelonSongLyricsBlock(html);
  if (!block) return '';
  return block.match(/id="lyricArea"[^>]*>([\s\S]*?)<\/div>/i)?.[1] ?? '';
}

function extractMelonLyricNoneText(html: string): string {
  const inner = extractMelonLyricAreaInner(html);
  if (!inner || !/lyric_none/i.test(inner)) return '';
  const raw = inner.match(/class="lyric_none"[^>]*>([\s\S]*?)<\/div>/i)?.[1] ?? '';
  return cleanMultilineText(raw);
}

function extractMelonSongLyricsRawText(html: string): string {
  const block = extractMelonSongLyricsBlock(html);
  const legacy =
    block.match(/class="lyric"[^>]*id="d_video_summary"[^>]*>([\s\S]*?)<\/div>/i)?.[1] ??
    block.match(/id="d_video_summary"[^>]*>([\s\S]*?)<\/div>/i)?.[1] ??
    '';
  if (legacy && !/lyric_none/i.test(legacy)) {
    const text = cleanMultilineText(legacy);
    if (text && !isMelonAdultAuthBlockedLyrics(text)) return text;
  }

  const inner = extractMelonLyricAreaInner(html);
  if (inner) {
    if (/lyric_none/i.test(inner)) return '';
    const lyricDiv =
      inner.match(/class="lyric"[^>]*id="d_video_summary"[^>]*>([\s\S]*?)<\/div>/i)?.[1] ??
      inner.match(/class="lyric"[^>]*>([\s\S]*?)<\/div>/i)?.[1] ??
      '';
    const text = cleanMultilineText(lyricDiv);
    if (text && !isMelonAdultAuthBlockedLyrics(text)) return text;
  }

  if (legacy) {
    const text = cleanMultilineText(legacy);
    return isMelonAdultAuthBlockedLyrics(text) ? '' : text;
  }
  return '';
}

function parseMelonSongLyrics(html: string): string {
  const text = extractMelonSongLyricsRawText(html);
  if (isMelonAdultAuthBlockedLyrics(text)) return '';
  return text;
}

/** 가사 영역에 성인인증 안내만 있는 경우 */
export function isMelonAdultAuthBlockedLyrics(text: string | undefined): boolean {
  const t = (text ?? '').trim();
  if (!t) return false;
  if (t.length > 200) return false;
  return /성인\s*인증|19\s*세\s*이상|본인\s*인증|청소년\s*보호법|청소년\s*유해/i.test(t);
}

/** 멜론 [가사 준비중]·가사등록하기 안내 */
export function isMelonLyricsSectionPending(html: string): boolean {
  const block = extractMelonSongLyricsBlock(html);
  if (!block.trim()) return false;
  if (/가사\s*준비중|가사등록하기|d_register/i.test(block)) return true;
  const lyricNone = extractMelonLyricNoneText(html);
  if (!lyricNone) return false;
  if (isMelonAdultAuthBlockedLyrics(lyricNone)) return false;
  return true;
}

/**
 * 가사 섹션(<!-- 가사 --> 또는 section_lyric) 안에서만 성인인증 필요 여부 판별.
 * 실제 가사가 없어서 빈 경우와 구분할 수 있을 때만 true.
 */
export function isMelonLyricsSectionAdultAuthRequired(html: string): boolean {
  const block = extractMelonSongLyricsBlock(html);
  if (!block.trim()) return false;
  if (/adult_register|adultcheck|goAdult|btn_adult|needAdult|성인\s*인증\s*후/i.test(block)) {
    return true;
  }
  const lyricNone = extractMelonLyricNoneText(html);
  if (lyricNone && isMelonAdultAuthBlockedLyrics(lyricNone)) return true;
  return isMelonAdultAuthBlockedLyrics(extractMelonSongLyricsRawText(html));
}

function parseMelonSongCredits(html: string): MelonTrackCredits {
  const block = html.match(/class="section_prdcr"[\s\S]*?<!--\s*\/\/작사/i)?.[0] ?? '';
  const lyricists: string[] = [];
  const composers: string[] = [];
  const arrangers: string[] = [];
  for (const li of block.match(/<li>[\s\S]*?<\/li>/gi) ?? []) {
    const name = cleanText(li.match(/class="artist_name"[^>]*>([^<]*)</i)?.[1] ?? '');
    const type = cleanText(li.match(/class="type">([^<]*)</i)?.[1] ?? '');
    if (!name) continue;
    if (type.includes('작사')) lyricists.push(name);
    else if (type.includes('작곡')) composers.push(name);
    else if (type.includes('편곡')) arrangers.push(name);
  }
  return {
    lyricists: lyricists.join(', '),
    composers: composers.join(', '),
    arrangers: arrangers.join(', '),
  };
}

export function parseMelonSongDetailHtml(html: string, songId: string) {
  // Java와 동일하게: cleanText 후 빈 문자열이면 다음 폴백으로 이동
  let name = cleanText(
    html.match(/class="song_name"[\s\S]*?<strong[^>]*>[\s\S]*?<\/strong>\s*([^<\r\n]+)/i)?.[1] ?? '',
  );
  let nameFromOgTitle = false;
  if (!name) {
    // og:title 폴백: Melon og:title = "곡명 - 아티스트 | 멜론" 형식
    // "| 사이트명" 접미사 제거 후 사용 (아티스트 접미사는 artist 파싱 후 제거)
    name = cleanText(
      html.match(/property="og:title"\s+content="([^"]+)"/i)?.[1] ?? '',
    ).replace(/\s*\|.*$/, '').trim();
    nameFromOgTitle = true;
  }
  const imageUrl = normalizeImg(
    firstMatch(html, /id="d_song_org"[\s\S]*?<img[^>]+src="([^"]+)"/i) ?? '',
  );
  const artistMatch = html.match(
    /class="artist"[\s\S]*?goArtistDetail\(['"]?(\d+)['"]?\)[^>]*title="([^"]+)"[^>]*>([^<]*)</i,
  );
  const artistId = artistMatch?.[1] ?? '';
  const artist = cleanText(artistMatch?.[2] || artistMatch?.[3] || '');
  // og:title "곡명 - 아티스트" 포맷에서 " - 아티스트" 접미사 제거
  if (nameFromOgTitle && artist && name) {
    const escaped = artist.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const stripped = name.replace(new RegExp(`\\s*-\\s*${escaped}\\s*$`, 'i'), '').trim();
    if (stripped) name = stripped;
  }

  let album = '';
  let albumId = '';
  let releaseDate = '';
  let genre = '';
  const metaBlock = html.match(/class="meta"[\s\S]*?<dl class="list">([\s\S]*?)<\/dl>/i)?.[1] ?? '';
  for (const row of metaBlock.match(/<dt>([^<]+)<\/dt>\s*<dd>([\s\S]*?)<\/dd>/gi) ?? []) {
    const m = row.match(/<dt>([^<]+)<\/dt>\s*<dd>([\s\S]*?)<\/dd>/i);
    if (!m) continue;
    const key = cleanText(m[1]!);
    const valRaw = m[2]!;
    if (key === '앨범') {
      albumId = firstMatch(valRaw, GO_ALBUM_RE) ?? '';
      album = cleanText(valRaw.replace(/<[^>]+>/g, ''));
    } else if (key === '발매일') releaseDate = cleanText(valRaw);
    else if (key === '장르') genre = cleanText(valRaw);
  }

  const likeCount = parseCount(
    firstMatch(html, /id="d_like_count"[^>]*>\s*<span class="none">[^<]*<\/span>\s*([^<]+)/i) ?? '',
  );
  const similarBlock =
    html.match(
      /스타일이 유사한 인기곡[\s\S]*?class="service_list_song[^"]*d_song_list"[\s\S]*?<tbody>([\s\S]*?)<\/tbody>/i,
    )?.[1] ?? '';

  const lyrics = parseMelonSongLyrics(html);

  return {
    info: {
      songId,
      name,
      artist,
      artistId,
      album,
      albumId,
      imageUrl,
      releaseDate,
      genre,
      likeCount,
      url: `${MELON_BASE}/song/detail.htm?songId=${songId}`,
      lyrics,
      lyricsAdultAuthRequired: isMelonLyricsSectionAdultAuthRequired(html) && !lyrics,
      lyricsNotRegistered: isMelonLyricsSectionPending(html) && !lyrics,
      credits: parseMelonSongCredits(html),
    },
    similarTracks: parseMelonSimilarTrackRows(similarBlock),
    albumDetail: null,
  };
}

function parseMelonSimilarTrackRows(tbody: string): MelonTrackSummary[] {
  const rows = tbody.split(/<tr/i).slice(1);
  const out: MelonTrackSummary[] = [];
  for (const row of rows) {
    const chunk = `<tr${row}`;
    const rowSongId =
      firstMatch(chunk, /name="input_check"\s+value="(\d+)"/) ??
      firstMatch(chunk, GO_SONG_RE);
    if (!rowSongId) continue;
    const rank = parseInt(firstMatch(chunk, /class="rank\s*">(\d+)</) ?? `${out.length + 1}`, 10);
    let title = '';
    const infoTitle = chunk.match(/goSongDetail\([^)]+\)[^>]*title="([^"]+)\s*곡정보"/i);
    if (infoTitle) title = cleanText(infoTitle[1]!);
    else {
      const playTitle = chunk.match(/title="([^"]+) 재생">([^<]*)</i);
      title = cleanText(playTitle?.[1] || playTitle?.[2] || '');
    }
    if (!title) continue;
    out.push({
      songId: rowSongId,
      name: title,
      artist: cleanText(firstMatch(chunk, /rank02[\s\S]*?<a[^>]*>([^<]+)<\/a>/i) ?? ''),
      artistId: firstMatch(chunk, GO_ARTIST_RE) ?? '',
      album: cleanText(firstMatch(chunk, /rank03[\s\S]*?<a[^>]*>([^<]+)<\/a>/i) ?? ''),
      albumId: firstMatch(chunk, /goAlbumDetail\(['"]?(\d+)['"]?\)/) ?? '',
      imageUrl: normalizeImg(firstMatch(chunk, IMG_SRC_RE) ?? ''),
      rank,
      likeCount: 0,
    });
    if (out.length >= MELON_SIMILAR_LIMIT) break;
  }
  return out;
}

function parseMelonAlbumBlockChunk(chunk: string): MelonAlbumSearchHit | null {
  const albumId = firstMatch(chunk, GO_ALBUM_RE);
  if (!albumId) return null;
  const anchor = parseEllipsisAnchorInDt(chunk);
  let rawName = '';
  if (anchor) {
    rawName =
      stripMelonPageMoveSuffix(cleanText(anchor.title)) ||
      cleanText(anchor.innerHtml.replace(/<[^>]+>/g, ''));
  }
  if (!rawName) {
    const nameFallback = chunk.match(
      /<dt>[\s\S]*?<a[^>]*class="ellipsis"[^>]*>([\s\S]*?)<\/a>/i,
    );
    rawName = cleanText(nameFallback?.[1]?.replace(/<[^>]+>/g, '') ?? '');
  }
  const name = stripMelonPageMoveSuffix(rawName);
  if (!name) return null;
  const artistMatch = chunk.match(
    /class="atistname"[\s\S]*?goArtistDetail\(['"]?(\d+)['"]?\)[^>]*title="([^"]*?)"[^>]*>([\s\S]*?)<\/a>/i,
  );
  const artistFallback = chunk.match(
    /class="atistname"[\s\S]*?goArtistDetail\(['"]?(\d+)['"]?\)[^>]*>([\s\S]*?)<\/a>/i,
  );
  const artistId = artistMatch?.[1] ?? artistFallback?.[1] ?? firstMatch(chunk, GO_ARTIST_RE) ?? '';
  const artist = cleanMelonLinkLabel(
    artistMatch?.[2] ||
      cleanText(artistMatch?.[3]?.replace(/<[^>]+>/g, '') ?? '') ||
      cleanText(artistFallback?.[2]?.replace(/<[^>]+>/g, '') ?? '') ||
      '',
  );
  const releaseDate = cleanText(firstMatch(chunk, /class="cnt_view">([^<]+)</) ?? '');
  const albumKind = normalizeMelonAlbumKind(
    cleanText(firstMatch(chunk, /class="vdo_name">([^<]+)</) ?? ''),
  );
  const trackCountMatch = chunk.match(/class="tot_song">(\d+)곡</);
  const trackCount = trackCountMatch ? parseInt(trackCountMatch[1]!, 10) : 0;
  return {
    albumId,
    name,
    artist,
    artistId,
    imageUrl: parseThumbImage(chunk, 'thumb'),
    releaseDate,
    albumKind,
    trackCount,
    url: `${MELON_BASE}/album/detail.htm?albumId=${albumId}`,
  };
}

function parseMelonArtistSongRow(chunk: string, rankFallback: number): MelonTrackSummary | null {
  const songId =
    firstMatch(chunk, /name="input_check"\s+value="(\d+)"/) ?? firstMatch(chunk, GO_SONG_RE);
  if (!songId) return null;
  const rank = parseInt(
    firstMatch(chunk, /class="no"[^>]*>[\s\S]*?>(\d+)</) ??
      firstMatch(chunk, /class="rank\s*">(\d+)</) ??
      `${rankFallback}`,
    10,
  );
  let name = '';
  const infoTitle = chunk.match(/goSongDetail\([^)]+\)[^>]*title="([^"]+?)\s*곡정보"/i);
  if (infoTitle) name = cleanText(infoTitle[1]!);
  else {
    const span = chunk.match(/btn_icon_detail[^>]*><span class="odd_span">([^<]+)/i);
    name = cleanText(span?.[1] ?? '');
  }
  if (!name) return null;
  const artistBlock = chunk.match(/wrapArtistName[\s\S]*?<\/td>/i)?.[0] ?? chunk;
  const artistMatch = artistBlock.match(
    /goArtistDetail\(['"]?(\d+)['"]?\)[^>]*title="([^"]+)[^"]*"[^>]*>([^<]*)<\/a>/i,
  );
  const artistId = artistMatch?.[1] ?? firstMatch(artistBlock, GO_ARTIST_RE) ?? '';
  const artist = cleanMelonLinkLabel(artistMatch?.[2] || artistMatch?.[3] || '');
  const albumMatch = chunk.match(
    /goAlbumDetail\(['"]?(\d+)['"]?\)[^>]*title="([^"]+)[^"]*"[^>]*>([^<]*)<\/a>/i,
  );
  const albumId = albumMatch?.[1] ?? '';
  const album = cleanMelonLinkLabel(albumMatch?.[2] || albumMatch?.[3] || '');
  const likeCount = parseCount(
    firstMatch(chunk, /class="cnt"[^>]*>[\s\S]*?>([^<]+)</i) ?? '',
  );
  return {
    songId,
    name,
    artist,
    artistId,
    album,
    albumId,
    imageUrl: '',
    rank,
    likeCount,
  };
}

/** 아티스트 곡 탭 — 인기순 페이징 HTML */
export function parseMelonArtistPopularSongsHtml(
  html: string,
  limit = MELON_ARTIST_POPULAR_TRACK_LIMIT,
): MelonTrackSummary[] {
  const tbody = html.match(/<tbody>([\s\S]*?)<\/tbody>/i)?.[1] ?? html;
  const rows = tbody.split(/<tr/i).slice(1);
  const out: MelonTrackSummary[] = [];
  for (const row of rows) {
    if (out.length >= limit) break;
    const hit = parseMelonArtistSongRow(`<tr${row}`, out.length + 1);
    if (hit) out.push(hit);
  }
  return out;
}

/** 아티스트 앨범 탭 — 인기순 페이징 HTML */
export function parseMelonArtistPopularAlbumsHtml(
  html: string,
  limit = MELON_ARTIST_POPULAR_ALBUM_LIMIT,
): MelonAlbumSearchHit[] {
  const parts = html.split(ALBUM_BLOCK_SPLIT);
  const hits: MelonAlbumSearchHit[] = [];
  for (let i = 1; i < parts.length && hits.length < limit; i++) {
    const hit = parseMelonAlbumBlockChunk(parts[i]!);
    if (hit) hits.push(hit);
  }
  return hits;
}

export function encodeMelonQuery(query: string): string {
  return encodeURIComponent(query.trim());
}

export function melonArtistSearchUrl(query: string, startIndex = 1): string {
  const q = encodeMelonQuery(query);
  if (startIndex <= 1) {
    return `${MELON_BASE}/search/artist/index.htm?q=${q}`;
  }
  return `${MELON_BASE}/search/artist/listArtists.htm?q=${q}&startIndex=${startIndex}`;
}

export function melonAlbumSearchUrl(query: string, startIndex = 1): string {
  const q = encodeMelonQuery(query);
  const base = `${MELON_BASE}/search/album/index.htm?q=${q}`;
  return startIndex <= 1 ? base : `${base}&startIndex=${startIndex}`;
}

export function melonSongSearchUrl(query: string, startIndex = 1): string {
  const q = encodeMelonQuery(query);
  const base = `${MELON_BASE}/search/song/index.htm?q=${q}`;
  return startIndex <= 1 ? base : `${base}&startIndex=${startIndex}`;
}

export function melonArtistSearchNextCursor(
  startIndex: number,
  itemCount: number,
  pageSize = MELON_ARTIST_SEARCH_PAGE_SIZE,
): string | null {
  return itemCount >= pageSize ? String(startIndex + pageSize) : null;
}

export function melonAlbumSearchNextCursor(
  startIndex: number,
  itemCount: number,
  pageSize = MELON_ALBUM_SEARCH_PAGE_SIZE,
): string | null {
  return itemCount >= pageSize ? String(startIndex + pageSize) : null;
}

export function melonSongSearchNextCursor(
  startIndex: number,
  itemCount: number,
  pageSize = MELON_SONG_SEARCH_PAGE_SIZE,
): string | null {
  return itemCount >= pageSize ? String(startIndex + pageSize) : null;
}

export function parseMelonSearchStartIndex(cursor: string | null | undefined): number {
  if (!cursor?.trim()) return 1;
  const n = parseInt(cursor, 10);
  return Number.isFinite(n) && n > 0 ? n : 1;
}

export function melonArtistDetailUrl(artistId: string): string {
  return `${MELON_BASE}/artist/detail.htm?artistId=${artistId}`;
}

export function melonArtistSongUrl(artistId: string): string {
  return `${MELON_BASE}/artist/song.htm?artistId=${artistId}`;
}

export function melonArtistAlbumUrl(artistId: string): string {
  return `${MELON_BASE}/artist/album.htm?artistId=${artistId}`;
}

export function melonArtistPopularSongsUrl(artistId: string): string {
  const params = new URLSearchParams({
    listType: 'A',
    orderBy: 'POPULAR_SONG_LIST',
    artistId,
    startIndex: '1',
  });
  return `${MELON_BASE}/artist/songPaging.htm?${params}`;
}

export function melonArtistPopularAlbumsUrl(artistId: string): string {
  const params = new URLSearchParams({
    listType: '0',
    orderBy: 'POPULAR_ALBUM_LIST',
    artistId,
    startIndex: '1',
  });
  return `${MELON_BASE}/artist/albumPaging.htm?${params}`;
}

export function melonAlbumDetailUrl(albumId: string): string {
  return `${MELON_BASE}/album/detail.htm?albumId=${albumId}`;
}

export function melonSongDetailUrl(songId: string): string {
  return `${MELON_BASE}/song/detail.htm?songId=${songId}`;
}

export function melonFanCountUrl(artistId: string): string {
  return `${MELON_BASE}/artist/getArtistFanNTemper.json?artistId=${artistId}`;
}
