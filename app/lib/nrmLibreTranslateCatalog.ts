/** LibreTranslate(Argos) 오프라인 언어 팩 ID — 영어→한국어만 지원 */
export type NrmLibreTranslatePackageId = 'libretranslate:pack-en-ko';

export type NrmLibreTranslateCatalogEntry = {
  id: NrmLibreTranslatePackageId;
  label: string;
  description: string;
  fileName: string;
  downloadUrls: string[];
  minBytes: number;
  required: boolean;
};

export const NRM_LIBRETRANSLATE_PACKAGES: NrmLibreTranslateCatalogEntry[] = [
  {
    id: 'libretranslate:pack-en-ko',
    label: '영어 → 한국어',
    description: '',
    fileName: 'translate-en_ko-1_1.argosmodel',
    downloadUrls: [
      'https://argos-net.com/v1/translate-en_ko-1_1.argosmodel',
      'https://ipfs.io/ipfs/QmWecr5i4tJNnokusm97rTUyQtUqNNPufGF7ake1hJVu6G',
      'https://dweb.link/ipfs/QmWecr5i4tJNnokusm97rTUyQtUqNNPufGF7ake1hJVu6G',
    ],
    minBytes: 30_000_000,
    required: true,
  },
];

export const NRM_LIBRETRANSLATE_PACKAGE_IDS = NRM_LIBRETRANSLATE_PACKAGES.map((p) => p.id);

export function getLibreTranslateCatalogEntry(
  id: NrmLibreTranslatePackageId,
): NrmLibreTranslateCatalogEntry {
  const row = NRM_LIBRETRANSLATE_PACKAGES.find((p) => p.id === id);
  if (!row) throw new Error(`unknown libretranslate package: ${id}`);
  return row;
}

export function libreTranslatePackageCompleteMessage(id: NrmLibreTranslatePackageId): string {
  const entry = getLibreTranslateCatalogEntry(id);
  return `${entry.label} 언어 팩 설치가 완료되었습니다.`;
}
