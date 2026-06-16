import {
  findGenreCategoryByExactTag,
  loadNrmGenreTagCatalog,
  normalizeGenreTagInput,
  type NrmGenreCategory,
  type NrmGenreTagCatalog,
} from '@/lib/nrmGenreTagSettings';

export type GenreResolveInput = {
  /** 멜론·시드·기존 메타의 장르 문자열 (쉼표 구분 가능) */
  rawGenre?: string;
  /** Last.fm 태그 이름 (우선순위: rawGenre 토큰 다음) */
  lastfmTagNames?: string[];
};

export type GenrePlatformResolveResult = {
  /** 카탈로그 장르 이름 — 드롭다운 선택 */
  categoryName: string | null;
  /** 직접입력 값 — 플랫폼 원문 */
  manualGenre: string;
};

/** 플랫폼 장르 문자열을 쉼표 기준 토큰으로 분리 */
export function tokenizePlatformGenreRaw(rawGenre: string): string[] {
  const tokens: string[] = [];
  const seen = new Set<string>();
  for (const piece of rawGenre.split(',')) {
    const trimmed = piece.trim();
    if (!trimmed) continue;
    const norm = normalizeGenreTagInput(trimmed);
    if (seen.has(norm)) continue;
    seen.add(norm);
    tokens.push(trimmed);
  }
  return tokens;
}

/**
 * 멜론·Last.fm 장르 메타 → 드롭다운/직접입력.
 * 해시태그와 100% 일치(trim·대소문자 무시)할 때만 카탈로그 장르를 선택한다.
 * 멜론은 쉼표로 나뉜 값을 앞에서부터 순서대로 검사한다.
 */
export function resolveGenreFromPlatform(
  catalog: NrmGenreTagCatalog,
  input: GenreResolveInput,
): GenrePlatformResolveResult {
  const rawGenre = (input.rawGenre ?? '').trim();
  const tokens = tokenizePlatformGenreRaw(rawGenre);

  for (const tagName of input.lastfmTagNames ?? []) {
    const trimmed = tagName.trim();
    if (!trimmed) continue;
    const norm = normalizeGenreTagInput(trimmed);
    if (tokens.some((t) => normalizeGenreTagInput(t) === norm)) continue;
    tokens.push(trimmed);
  }

  for (const token of tokens) {
    const cat = findGenreCategoryByExactTag(catalog, token);
    if (cat) {
      return {
        categoryName: cat.name.trim(),
        manualGenre: rawGenre,
      };
    }
  }

  const manualGenre =
    rawGenre ||
    (input.lastfmTagNames ?? [])
      .map((t) => t.trim())
      .filter(Boolean)
      .join(', ');

  return { categoryName: null, manualGenre };
}

export async function resolveGenreFromPlatformAsync(
  input: GenreResolveInput,
): Promise<GenrePlatformResolveResult> {
  const catalog = await loadNrmGenreTagCatalog();
  return resolveGenreFromPlatform(catalog, input);
}

/** @deprecated resolveGenreFromPlatform 사용 */
export function resolveGenreCategoryName(
  catalog: NrmGenreTagCatalog,
  input: GenreResolveInput,
): string {
  const resolved = resolveGenreFromPlatform(catalog, input);
  return resolved.categoryName ?? resolved.manualGenre;
}

/** @deprecated resolveGenreFromPlatformAsync 사용 — enricher는 원문 genre 유지 */
export async function resolveEmbedGenre(input: GenreResolveInput): Promise<string> {
  const resolved = await resolveGenreFromPlatformAsync(input);
  return resolved.categoryName ?? resolved.manualGenre;
}

export function lastfmTagsToNames(
  tags: Array<{ name?: string }> | undefined,
): string[] {
  return (tags ?? [])
    .map((t) => (t.name ?? '').trim())
    .filter(Boolean);
}

/** 다운로드 모달 드롭다운 초기값 */
export function resolveGenreDropdownSelection(
  catalog: NrmGenreTagCatalog,
  input: GenreResolveInput,
): { selection: string | null; custom: string } {
  const resolved = resolveGenreFromPlatform(catalog, input);
  if (resolved.categoryName) {
    return { selection: resolved.categoryName, custom: '' };
  }
  return { selection: null, custom: resolved.manualGenre };
}

export type { NrmGenreCategory };
