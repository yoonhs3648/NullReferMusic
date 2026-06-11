import type { ChartTrackItem } from '@/lib/nrmChartsTypes';
import { normalizeCoverArtUrl } from '@/lib/nrmCoverArtUrl';
import { cleanMelonLinkLabel } from '@/lib/nrmMelonSearchParse';
import { cleanHtmlText } from '@/lib/nrmHtmlText';

const MELON_BASE = 'https://www.melon.com';
const ROW_SPLIT = /<tr class="lst(?:50|100)"/gi;
const RANK_RE = /class="rank[^"]*">\s*(\d+)\s*</;
const SONG_ID_ATTR_RE = /data-song-no="(\d+)"/;
const SONG_ID_LINK_RE = /songId=(\d+)/;
const CHECKBOX_VALUE_RE = /name="input_check" value="(\d+)"/;
const IMG_SRC_RE = /<img[^>]+src="([^"]+)"/;
const TITLE_STRONG_RE =
  /rank01[\s\S]*?<strong>\s*<a[^>]*title="([^"]+)"[^>]*>([^<]*)<\/a>/i;
const TITLE_LINK_RE =
  /rank01[\s\S]*?<a[^>]*title="([^"]+) 재생"[^>]*>([^<]*)<\/a>/i;
const ARTIST_RE = /rank02[\s\S]*?<a[^>]*>([^<]+)<\/a>/i;
const ALBUM_RE = /rank03[\s\S]*?<a[^>]*>([^<]+)<\/a>/i;

function cleanText(raw: string): string {
  return cleanHtmlText(raw);
}

function firstMatch(text: string, re: RegExp): string | null {
  const m = text.match(re);
  return m?.[1] ?? null;
}

/** 멜론 차트 HTML(table fragment) → 트랙 목록 */
export function parseMelonGenreChartHtml(html: string): ChartTrackItem[] {
  if (!html.trim()) return [];
  const parts = html.split(ROW_SPLIT);
  const items: ChartTrackItem[] = [];
  for (let i = 1; i < parts.length && items.length < 100; i++) {
    const chunk = parts[i]!;
    let songId =
      firstMatch(chunk, SONG_ID_ATTR_RE) ??
      firstMatch(chunk, CHECKBOX_VALUE_RE) ??
      firstMatch(chunk, SONG_ID_LINK_RE);
    if (!songId) continue;

    const rank = Number(firstMatch(chunk, RANK_RE) ?? items.length + 1);
    let title = '';
    const strong = chunk.match(TITLE_STRONG_RE);
    if (strong) {
      title = cleanText(strong[1] || strong[2] || '');
    } else {
      const link = chunk.match(TITLE_LINK_RE);
      if (link) title = cleanText(link[1] || link[2] || '');
    }
    const artists = cleanMelonLinkLabel(firstMatch(chunk, ARTIST_RE) ?? '');
    const album = cleanMelonLinkLabel(firstMatch(chunk, ALBUM_RE) ?? '');
    let imageUrl = firstMatch(chunk, IMG_SRC_RE) ?? '';
    if (imageUrl.startsWith('//')) imageUrl = `https:${imageUrl}`;
    imageUrl = normalizeCoverArtUrl(imageUrl);

    items.push({
      rank: Number.isFinite(rank) && rank > 0 ? rank : items.length + 1,
      trackId: songId,
      title,
      artists,
      album,
      imageUrl,
      externalUrl: `${MELON_BASE}/song/detail.htm?songId=${songId}`,
      durationMs: 0,
      popularity: 0,
      releaseDate: '',
    });
  }
  return items;
}
