import { NRM_MUSIC_QUOTES, type NrmMusicQuoteEntry } from '@/lib/nrmMusicQuotes.generated';

export type { NrmMusicQuoteEntry };

export type MusicQuoteYears = {
  birth: string;
  death: string;
  /** 원본 문자열(파싱 실패 시 표시용) */
  raw: string;
};

export function pickRandomMusicQuote(): NrmMusicQuoteEntry {
  if (NRM_MUSIC_QUOTES.length === 0) {
    return {
      nameKo: '',
      nameEn: '',
      years: '',
      quoteEn: '',
      quoteKo: '',
    };
  }
  const idx = Math.floor(Math.random() * NRM_MUSIC_QUOTES.length);
  return NRM_MUSIC_QUOTES[idx]!;
}

/** "1770–1827" / "1770-1827" → birth·death 분리 */
export function parseMusicQuoteYears(years: string): MusicQuoteYears | null {
  const raw = years.trim();
  if (!raw) return null;
  const m = raw.match(/^(\d{4})\s*[–\-—~]\s*(\d{4})$/);
  if (m) {
    return { birth: m[1]!, death: m[2]!, raw };
  }
  return { birth: '', death: '', raw };
}

function stripOuterQuotes(text: string): string {
  const s = text.trim();
  if (
    (s.startsWith('"') && s.endsWith('"')) ||
    (s.startsWith("'") && s.endsWith("'"))
  ) {
    return s.slice(1, -1).trim();
  }
  return s;
}

/** 화면용 영문 명언 — 장식 따옴표·굵은 톤 완화 */
export function presentMusicQuoteEn(quoteEn: string): string {
  return stripOuterQuotes(quoteEn)
    .replace(/\s+/g, ' ')
    .replace(/\s+([,.;:!?])/g, '$1');
}

/** 화면용 한국어 번역 — 직역체·딱딱한 어미를 조금 다듬음 */
export function presentMusicQuoteKo(quoteKo: string): string {
  return quoteKo
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/ 것이다\./g, '다.')
    .replace(/있는 것이 아니라/g, '있지 않고')
    .replace(/하는 것이 아니라/g, '하는 일이 아니라');
}
