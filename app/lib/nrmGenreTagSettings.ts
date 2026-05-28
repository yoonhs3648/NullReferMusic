import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = 'nrmGenreTagCatalog_v1';

/** Last.fm 장르별 차트용 장르 종류 */
export type NrmGenreCategory = {
  id: string;
  /** 표시 이름 (예: K-POP) */
  name: string;
  /** Last.fm tag 이름 목록 */
  tags: string[];
};

export type NrmGenreTagCatalog = {
  version: 1;
  categories: NrmGenreCategory[];
};

function category(
  id: string,
  name: string,
  tags: string[],
): NrmGenreCategory {
  return { id, name, tags: [...tags] };
}

/** 웹·Expo Go·APK 공통 기본 장르·태그 */
export function getDefaultNrmGenreTagCatalog(): NrmGenreTagCatalog {
  return {
    version: 1,
    categories: [
      category('k-pop', 'K-POP', [
        'k-pop',
        'korean pop',
        'korean music',
        'korean idol',
        'girl group',
        'boy group',
      ]),
      category('korean-hip-hop', '한국 힙합', [
        'korean hip hop',
        'korean hip-hop',
        'khiphop',
        'korean rap',
        'khh',
      ]),
      category('korean-rnb-soul', '한국 R&B / SOUL', [
        'korean rnb',
        'korean r&b',
        'krnb',
        'korean soul',
      ]),
      category('korean-indie-rock', '한국 인디 / 락', [
        'korean indie',
        'korean rock',
        'korean indie rock',
        'korean alternative',
        'korean band',
      ]),
      category('korean-ballad', '한국 발라드', [
        'korean ballad',
        'k-ballad',
      ]),
      category('korean-ost', '한국 OST', [
        'korean ost',
        'kdrama ost',
        'drama ost',
      ]),
      category('global-pop', 'Global POP', [
        'pop',
        'dance pop',
        'synthpop',
        'electropop',
        'indie pop',
        'art pop',
        'dream pop',
        'bedroom pop',
      ]),
      category('global-hip-hop', 'Global 힙합', [
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
      ]),
      category('global-rnb-soul', 'Global R&B / SOUL', [
        'rnb',
        'r&b',
        'soul',
        'neo soul',
        'contemporary rnb',
        'funk',
      ]),
      category('global-indie-rock', 'Global 인디 / 락', [
        'rock',
        'alternative rock',
        'indie rock',
        'classic rock',
        'hard rock',
        'punk rock',
        'pop punk',
        'post-rock',
        'grunge',
        'shoegaze',
        'emo',
      ]),
      category('electronic-edm', 'ELECTRONIC / EDM', [
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
      ]),
      category('jazz-classic', 'JAZZ / CLASSIC', [
        'jazz',
        'smooth jazz',
        'bebop',
        'classical',
        'piano',
        'orchestral',
        'instrumental',
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
    version: 1,
    categories: catalog.categories.map((c) => ({
      id: c.id,
      name: c.name,
      tags: [...c.tags],
    })),
  };
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
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return getDefaultNrmGenreTagCatalog();
    const parsed = JSON.parse(raw) as NrmGenreTagCatalog;
    if (
      parsed?.version !== 1 ||
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
    return { version: 1, categories };
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
    version: 1,
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
