import { NRM_MUSIC_QUOTES, type NrmMusicQuoteEntry } from '@/lib/nrmMusicQuotes.generated';

export type { NrmMusicQuoteEntry };

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

export function formatMusicQuoteArtistLine(entry: NrmMusicQuoteEntry): string {
  const years = entry.years.trim();
  if (!entry.nameKo && !entry.nameEn) return '';
  if (!entry.nameEn && !years) return entry.nameKo;
  if (!years) return `${entry.nameKo} (${entry.nameEn})`;
  return `${entry.nameKo} (${entry.nameEn}, ${years})`;
}
