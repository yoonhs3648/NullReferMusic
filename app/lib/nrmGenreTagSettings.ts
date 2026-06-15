import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = 'nrmGenreTagCatalog_v3';
const LEGACY_STORAGE_KEY = 'nrmGenreTagCatalog_v2';

/** 국내·해외로 나뉘었던 동일 장르 → 단일 카테고리 */
const DOMESTIC_OVERSEAS_MERGE: Array<{
  keepId: string;
  absorbId: string;
  unifiedName: string;
}> = [
  { keepId: 'melon-gn0300', absorbId: 'melon-gn1200', unifiedName: '랩/힙합' },
  { keepId: 'melon-gn0400', absorbId: 'melon-gn1300', unifiedName: 'R&B/Soul' },
  { keepId: 'melon-gn0600', absorbId: 'melon-gn1000', unifiedName: '록/메탈' },
];

/** 멜론·Last.fm 통합 장르 (해시태그 = Last.fm tag / 멜론 키워드 매칭용) */
export type NrmGenreCategory = {
  id: string;
  /** 표시 이름 — 다운로드 메타데이터 genre 필드에 저장 */
  name: string;
  /** Last.fm tag·멜론 장르 키워드 (소문자·공백 정규화) */
  tags: string[];
};

export type NrmGenreTagCatalog = {
  version: 1 | 2 | 3;
  categories: NrmGenreCategory[];
};

function category(
  id: string,
  name: string,
  tags: string[],
): NrmGenreCategory {
  return { id, name, tags: [...tags] };
}

/** 웹·Expo Go·APK 공통 기본 장르·태그 (멜론 차트 13종 + 기존 Last.fm 해시태그) */
export function getDefaultNrmGenreTagCatalog(): NrmGenreTagCatalog {
  return {
    version: 3,
    categories: [
      category('melon-gn0000', '장르종합', [
        'jazz',
        'smooth jazz',
        'bebop',
        'classical',
        'piano',
        'orchestral',
        'instrumental',
        'world music',
        'folk',
        'acoustic',
        'new age',
        '재즈',
        '클래식',
        '뉴에이지',
        '월드',
        '포크',
        '블루스',
        '컨트리',
      ]),
      category('melon-dm0000', '국내종합', [
        'korean music',
        'k-pop',
        'korean pop',
        '가요',
        '국내',
        '한국',
        'korean',
      ]),
      category('melon-ab0000', '해외종합', [
        'foreign',
        'international',
        'overseas',
        '해외',
        '글로벌',
        'global',
      ]),
      category('melon-gn0100', '발라드', [
        'korean ballad',
        'k-ballad',
        'ballad',
        'adult contemporary',
        '발라드',
        '발라드/pop',
      ]),
      category('melon-gn0200', '댄스', [
        'dance pop',
        'synthpop',
        'electropop',
        'dance',
        'girl group',
        'boy group',
        'korean idol',
        'idol',
        '댄스',
        '댄스/pop',
        '유로댄스',
      ]),
      category('melon-gn0300', '랩/힙합', [
        'korean hip hop',
        'korean hip-hop',
        'khiphop',
        'korean rap',
        'khh',
        'hip hop',
        'hip-hop',
        'rap',
        'trap',
        'drill',
        'conscious hip hop',
        'boom bap',
        'cloud rap',
        'emo rap',
        'gangsta rap',
        'underground hip hop',
        '랩/힙합',
        '랩',
        '힙합',
        '국내 랩',
        '국내 힙합',
        '해외 랩',
        '해외 힙합',
      ]),
      category('melon-gn0400', 'R&B/Soul', [
        'korean rnb',
        'korean r&b',
        'krnb',
        'korean soul',
        'rnb',
        'r&b',
        'soul',
        'neo soul',
        'contemporary rnb',
        'funk',
        '알앤비',
        '국내 r&b',
        '국내 soul',
        '해외 r&b',
        '해외 soul',
      ]),
      category('melon-gn0500', '인디음악', [
        'korean indie',
        'korean alternative',
        'korean band',
        'indie pop',
        'indie rock',
        'shoegaze',
        'emo',
        'indie',
        '인디',
        '인디음악',
        '인디팝',
        '인디록',
      ]),
      category('melon-gn0600', '록/메탈', [
        'korean indie rock',
        'korean rock',
        'k-rock',
        'rock',
        'alternative rock',
        'classic rock',
        'hard rock',
        'punk rock',
        'pop punk',
        'post-rock',
        'grunge',
        'metal',
        'heavy metal',
        '록/메탈',
        '록',
        '메탈',
        '국내 록',
        '국내 메탈',
        '해외 록',
        '해외 메탈',
        '하드록',
        '헤비메탈',
      ]),
      category('melon-gn0900', 'POP', [
        'pop',
        'art pop',
        'dream pop',
        'bedroom pop',
        '팝',
        'pop rock',
        'teen pop',
      ]),
      category('melon-gn1100', '일렉트로니카', [
        'electronic',
        'edm',
        'house',
        'techno',
        'trance',
        'dubstep',
        'drum and bass',
        'ambient',
        'synthwave',
        'chillout',
        'lo-fi',
        'vaporwave',
        'electronica',
        '일렉트로니카',
        '일렉트로닉',
        '전자',
      ]),
      category('melon-gn1500', 'OST', [
        'korean ost',
        'kdrama ost',
        'drama ost',
        'ost',
        'soundtrack',
        'musical',
        '뮤지컬',
        '드라마',
        '영화',
        '게임',
        '애니메이션',
      ]),
      category('melon-gn1900', 'J-POP', [
        'j-pop',
        'jpop',
        'japanese pop',
        'japanese',
        'japanese music',
        'anime',
        'j-rock',
        'jpop',
        '일본',
      ]),
    ],
  };
}

/** 태그 입력 정규화 (공백·대소문자) */
export function normalizeGenreTagInput(raw: string): string {
  return raw.trim().replace(/\s+/g, ' ').toLowerCase();
}

function cloneCatalog(catalog: NrmGenreTagCatalog): NrmGenreTagCatalog {
  return {
    version: 3,
    categories: catalog.categories.map((c) => ({
      id: c.id,
      name: c.name,
      tags: [...c.tags],
    })),
  };
}

/** 저장된 v2 카탈로그·사용자 편집본에서 국내/해외 분리 장르를 병합 */
function mergeDomesticOverseasGenreCategories(
  categories: NrmGenreCategory[],
): NrmGenreCategory[] {
  const byId = new Map(categories.map((c) => [c.id, c]));
  const removed = new Set<string>();
  const inserted = new Set<string>();

  for (const { keepId, absorbId, unifiedName } of DOMESTIC_OVERSEAS_MERGE) {
    const keep = byId.get(keepId);
    const absorb = byId.get(absorbId);
    if (!keep && !absorb) continue;
    if (absorb) removed.add(absorbId);
    const tags = [...(keep?.tags ?? []), ...(absorb?.tags ?? [])];
    byId.set(keepId, sanitizeCategory({ id: keepId, name: unifiedName, tags }));
    if (!keep && absorb) inserted.add(keepId);
    if (absorb) byId.delete(absorbId);
  }

  const out: NrmGenreCategory[] = [];
  const seen = new Set<string>();
  for (const c of categories) {
    if (removed.has(c.id)) continue;
    const merged = byId.get(c.id) ?? c;
    if (seen.has(merged.id)) continue;
    seen.add(merged.id);
    out.push(merged);
  }
  for (const id of inserted) {
    if (!seen.has(id) && byId.has(id)) {
      out.push(byId.get(id)!);
    }
  }
  return out;
}

function needsDomesticOverseasMerge(categories: NrmGenreCategory[]): boolean {
  const ids = new Set(categories.map((c) => c.id));
  for (const { keepId, absorbId, unifiedName } of DOMESTIC_OVERSEAS_MERGE) {
    if (ids.has(absorbId)) return true;
    const keep = categories.find((c) => c.id === keepId);
    if (keep && keep.name.trim() !== unifiedName) return true;
  }
  return false;
}

function sanitizeCategory(c: NrmGenreCategory): NrmGenreCategory {
  const name = c.name.trim();
  const seen = new Set<string>();
  const tags: string[] = [];
  for (const raw of c.tags) {
    const t = normalizeGenreTagInput(raw);
    if (!t || seen.has(t)) continue;
    seen.add(t);
    tags.push(t);
  }
  return { id: c.id, name, tags };
}

/** 저장 가능 여부 검사. 문제 시 사용자용 메시지 반환 */
export function validateGenreTagCatalog(
  categories: NrmGenreCategory[],
): string | null {
  if (categories.length === 0) {
    return '장르를 하나 이상 등록해 주세요.';
  }
  for (const c of categories) {
    const name = c.name.trim();
    if (!name) {
      return '장르 이름이 비어 있는 항목이 있습니다.';
    }
    const sanitized = sanitizeCategory(c);
    if (sanitized.tags.length === 0) {
      return `「${name}」 장르에 태그가 하나 이상 필요합니다.`;
    }
  }
  return null;
}

export function sanitizeGenreTagCatalog(
  categories: NrmGenreCategory[],
): NrmGenreCategory[] {
  return categories.map(sanitizeCategory).filter((c) => c.name.length > 0);
}

export async function loadNrmGenreTagCatalog(): Promise<NrmGenreTagCatalog> {
  try {
    let raw = await AsyncStorage.getItem(STORAGE_KEY);
    let fromLegacy = false;
    if (!raw) {
      raw = await AsyncStorage.getItem(LEGACY_STORAGE_KEY);
      fromLegacy = !!raw;
    }
    if (!raw) return getDefaultNrmGenreTagCatalog();
    const parsed = JSON.parse(raw) as NrmGenreTagCatalog;
    if (
      (parsed?.version !== 1 && parsed?.version !== 2 && parsed?.version !== 3) ||
      !Array.isArray(parsed.categories) ||
      parsed.categories.length === 0
    ) {
      return getDefaultNrmGenreTagCatalog();
    }
    const categories = parsed.categories
      .filter(
        (c): c is NrmGenreCategory =>
          typeof c?.id === 'string' &&
          typeof c?.name === 'string' &&
          Array.isArray(c?.tags),
      )
      .map((c) => sanitizeCategory(c));
    if (categories.length === 0) return getDefaultNrmGenreTagCatalog();

    const merged = mergeDomesticOverseasGenreCategories(categories);
    const catalog: NrmGenreTagCatalog = { version: 3, categories: merged };
    if (
      fromLegacy ||
      parsed.version !== 3 ||
      needsDomesticOverseasMerge(categories)
    ) {
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(catalog));
    }
    return catalog;
  } catch {
    return getDefaultNrmGenreTagCatalog();
  }
}

export async function saveNrmGenreTagCatalog(
  catalog: NrmGenreTagCatalog,
): Promise<void> {
  const err = validateGenreTagCatalog(catalog.categories);
  if (err) throw new Error(err);
  const payload: NrmGenreTagCatalog = {
    version: 3,
    categories: sanitizeGenreTagCatalog(catalog.categories),
  };
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
}

export async function resetNrmGenreTagCatalogToDefault(): Promise<NrmGenreTagCatalog> {
  const defaults = cloneCatalog(getDefaultNrmGenreTagCatalog());
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(defaults));
  return defaults;
}

export function createNewGenreCategoryId(): string {
  return `genre-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}
