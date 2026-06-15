import {
  loadNrmGenreTagCatalog,
  normalizeGenreTagInput,
  type NrmGenreCategory,
  type NrmGenreTagCatalog,
} from '@/lib/nrmGenreTagSettings';

/** 종합 장르는 구체 장르 매칭 시 우선순위를 낮춘다 */
const AGGREGATE_CATEGORY_IDS = new Set([
  'melon-gn0000',
  'melon-dm0000',
  'melon-ab0000',
]);

export type GenreResolveInput = {
  /** 멜론·시드·기존 메타의 장르 문자열 (쉼표 구분 가능) */
  rawGenre?: string;
  /** Last.fm 태그 이름 */
  lastfmTagNames?: string[];
};

function tokenizeGenreInput(input: GenreResolveInput): string[] {
  const tokens: string[] = [];
  const seen = new Set<string>();
  const push = (raw: string) => {
    const t = normalizeGenreTagInput(raw);
    if (!t || seen.has(t)) return;
    seen.add(t);
    tokens.push(t);
  };
  for (const piece of (input.rawGenre ?? '').split(/[,/|·]/)) {
    push(piece);
  }
  for (const tag of input.lastfmTagNames ?? []) {
    push(tag);
  }
  return tokens;
}

function scoreCategory(cat: NrmGenreCategory, tokens: string[]): number {
  if (tokens.length === 0) return 0;
  const tagSet = new Set(cat.tags.map((t) => normalizeGenreTagInput(t)));
  const nameNorm = normalizeGenreTagInput(cat.name);
  let score = 0;
  for (const token of tokens) {
    if (tagSet.has(token)) {
      score += 3;
      continue;
    }
    for (const tag of tagSet) {
      if (tag.length >= 2 && (token.includes(tag) || tag.includes(token))) {
        score += 2;
        break;
      }
    }
    if (nameNorm && (token === nameNorm || token.includes(nameNorm) || nameNorm.includes(token))) {
      score += 4;
    }
  }
  if (AGGREGATE_CATEGORY_IDS.has(cat.id)) {
    score = Math.floor(score * 0.6);
  }
  return score;
}

/** 카탈로그 기준 단일 장르 이름으로 정규화. 매칭 실패 시 빈 문자열 */
export function resolveGenreCategoryName(
  catalog: NrmGenreTagCatalog,
  input: GenreResolveInput,
): string {
  const tokens = tokenizeGenreInput(input);
  if (tokens.length === 0) return '';

  let best: NrmGenreCategory | null = null;
  let bestScore = 0;
  for (const cat of catalog.categories) {
    const score = scoreCategory(cat, tokens);
    if (score > bestScore) {
      bestScore = score;
      best = cat;
    }
  }
  if (best && bestScore > 0) {
    return best.name.trim();
  }

  const raw = (input.rawGenre ?? '').trim();
  if (!raw) return '';

  const lower = normalizeGenreTagInput(raw);
  for (const cat of catalog.categories) {
    const name = normalizeGenreTagInput(cat.name);
    if (lower === name || lower.includes(name) || name.includes(lower)) {
      return cat.name.trim();
    }
  }

  if (/korean|k-pop|kpop|가요|국내|한국/.test(lower)) {
    const domestic = catalog.categories.find((c) => c.id === 'melon-dm0000');
    if (domestic) return domestic.name.trim();
  }
  if (/j-pop|jpop|japanese|일본|애니/.test(lower)) {
    const jpop = catalog.categories.find((c) => c.id === 'melon-gn1900');
    if (jpop) return jpop.name.trim();
  }

  const fallback = catalog.categories.find((c) => c.id === 'melon-ab0000');
  return fallback?.name.trim() ?? '';
}

export async function resolveEmbedGenre(input: GenreResolveInput): Promise<string> {
  const catalog = await loadNrmGenreTagCatalog();
  return resolveGenreCategoryName(catalog, input);
}

export function lastfmTagsToNames(
  tags: Array<{ name?: string }> | undefined,
): string[] {
  return (tags ?? [])
    .map((t) => (t.name ?? '').trim())
    .filter(Boolean);
}
