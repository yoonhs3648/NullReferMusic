import history from '@/release-notes/history.json';

export type ReleaseNoteEntry = {
  version: string;
  lines: string[];
};

type HistoryFile = {
  entries: ReleaseNoteEntry[];
};

function parseVersionParts(v: string): number[] {
  return v.split(/[.+]/).map((s) => {
    const n = parseInt(s, 10);
    return Number.isFinite(n) ? n : 0;
  });
}

/** 최신 버전이 위로 오도록 정렬 */
export function sortReleaseNoteEntriesNewestFirst(
  entries: ReleaseNoteEntry[],
): ReleaseNoteEntry[] {
  return [...entries].sort((a, b) => {
    const pa = parseVersionParts(a.version);
    const pb = parseVersionParts(b.version);
    const len = Math.max(pa.length, pb.length);
    for (let i = 0; i < len; i += 1) {
      const da = (pb[i] ?? 0) - (pa[i] ?? 0);
      if (da !== 0) return da;
    }
    return 0;
  });
}

export function getReleaseNoteEntries(): ReleaseNoteEntry[] {
  const raw = history as HistoryFile;
  const list = raw.entries ?? [];
  return sortReleaseNoteEntriesNewestFirst(list);
}
