/** History 탭 표시용 — Supabase `TrackHistory` 행 → 라벨/날짜 포맷 (로컬 nrmActivityHistory.ts와 호환되는 스타일) */
import { displayLabelFromAudioFileName } from '@/lib/nrmYoutubeDownloadMeta';
import type { NrmTrackHistoryRow } from '@/lib/nrmTrackHistoryTypes';

export type NrmTrackHistorySection = {
  title: string;
  data: NrmTrackHistoryRow[];
};

function trackLabel(row: NrmTrackHistoryRow): string {
  const artist = (row.Artist ?? '').trim();
  const title = (row.Title ?? '').trim();
  if (artist && title) return `${artist} - ${title}`;
  if (title) return title;
  const fromFile = (row.FileName ?? '').trim();
  if (fromFile) return displayLabelFromAudioFileName(fromFile);
  return '알 수 없는 트랙';
}

export function formatTrackHistoryLabel(row: NrmTrackHistoryRow): string {
  const base = trackLabel(row);
  switch (row.Kind) {
    case 'down':
      return `${base} 저장`;
    case 'downFail':
      return `${base} 다운로드 실패`;
    case 'del':
      return `${base} 제거`;
    case 'lyrics':
      return `${base} 가사 생성`;
    case 'lyricsFail':
      return `${base} 가사 생성 실패`;
    case 'delLyrics':
      return `${base} 가사 제거`;
    case 'transdLyrics':
      return `${base} 가사 생성(번역지원)`;
    case 'transdLyricsFail':
      return `${base} 가사 생성(번역 실패)`;
    case 'delTransdLyrics':
      return `${base} 가사 번역제거`;
    case 'metadataEdit':
      return `${base} 메타데이터 수정`;
    default:
      return base;
  }
}

export type NrmTrackHistoryKindBadge = {
  label: string;
  tone: 'primary' | 'success' | 'neutral' | 'warning' | 'danger';
};

export function trackHistoryKindBadge(row: NrmTrackHistoryRow): NrmTrackHistoryKindBadge {
  switch (row.Kind) {
    case 'down':
      return { label: '저장', tone: 'success' };
    case 'downFail':
      return { label: '실패', tone: 'danger' };
    case 'del':
      return { label: '제거', tone: 'danger' };
    case 'lyrics':
      return { label: '가사', tone: 'primary' };
    case 'lyricsFail':
      return { label: '가사 실패', tone: 'danger' };
    case 'delLyrics':
      return { label: '가사 제거', tone: 'warning' };
    case 'transdLyrics':
      return { label: '가사·번역', tone: 'primary' };
    case 'transdLyricsFail':
      return { label: '번역 실패', tone: 'warning' };
    case 'delTransdLyrics':
      return { label: '번역 제거', tone: 'warning' };
    case 'metadataEdit':
      return { label: '메타', tone: 'neutral' };
    default:
      return { label: '기록', tone: 'neutral' };
  }
}

/** 삭제·다운로드 실패 등 — 파일을 열 수 없는 기록 (History에서 탭 비활성) */
export function trackHistoryEntryOpensTrack(row: NrmTrackHistoryRow): boolean {
  return row.Kind !== 'downFail' && row.Kind !== 'del';
}

export function formatTrackHistoryTime(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function trackHistoryDateKey(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function groupTrackHistoryByDate(rows: NrmTrackHistoryRow[]): NrmTrackHistorySection[] {
  const map = new Map<string, NrmTrackHistoryRow[]>();
  for (const row of rows) {
    const key = trackHistoryDateKey(row.DownloadDate);
    const bucket = map.get(key);
    if (bucket) bucket.push(row);
    else map.set(key, [row]);
  }
  return [...map.entries()]
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([title, data]) => ({ title, data }));
}
