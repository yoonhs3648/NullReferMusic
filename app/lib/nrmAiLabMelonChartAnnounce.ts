/**
 * AI Lab — 멜론 차트 1건 다운로드 시, LLM 추가 호출 없이
 * 클라이언트에서 단계별 안내 말풍선 문구를 만든다.
 */

import type { NrmAiLabTrackHit } from '@/lib/nrmAiLabDownloadTools';

export function formatAiLabTrackLabel(hit: Pick<NrmAiLabTrackHit, 'artist' | 'title'>): string {
  const artist = String(hit.artist ?? '').trim();
  const title = String(hit.title ?? '').trim();
  if (artist && title) return `${artist} - ${title}`;
  return title || artist || '알 수 없는 곡';
}

/** 차트 조회 직전 */
export function aiLabMelonChartCheckingMessage(): string {
  return '해당 곡이 어떤 곡인지 확인을 하겠습니다.';
}

/** 차트 1건 확정 직후 */
export function aiLabMelonChartIdentifiedMessage(
  hit: Pick<NrmAiLabTrackHit, 'artist' | 'title' | 'rank'>,
): string {
  const label = formatAiLabTrackLabel(hit);
  const rank =
    hit.rank != null && Number.isFinite(Number(hit.rank)) ? Math.floor(Number(hit.rank)) : null;
  if (rank != null && rank >= 1) {
    return `해당 곡은 **#${rank} ${label}** 입니다.`;
  }
  return `해당 곡은 **${label}** 입니다.`;
}

function chartScopePhrase(params: {
  period?: string | null;
  rank?: number | null;
}): string {
  const period = String(params.period ?? '').trim().toLowerCase();
  const rank =
    params.rank != null && Number.isFinite(Number(params.rank))
      ? Math.floor(Number(params.rank))
      : null;
  const rankLabel = rank != null && rank >= 1 ? `${rank}위` : '순위';
  if (period === 'realtime' || !period) {
    return `오늘 멜론 실시간 차트 ${rankLabel} 곡`;
  }
  if (period === 'daily') return `멜론 일간 차트 ${rankLabel} 곡`;
  if (period === 'weekly') return `멜론 주간 차트 ${rankLabel} 곡`;
  if (period === 'monthly') return `멜론 월간 차트 ${rankLabel} 곡`;
  if (period === 'yearly') return `멜론 연간 차트 ${rankLabel} 곡`;
  return `멜론 차트 ${rankLabel} 곡`;
}

/**
 * YouTube 미리듣기(오디오 플레이 UI) 직전에 내보내는 안내.
 * 실제 파일 다운로드는 「맞다」확인 후 시작되지만, 차트→음원 확인 플로우 시작을 알린다.
 */
export function aiLabMelonChartDownloadStartedMessage(params: {
  hit: Pick<NrmAiLabTrackHit, 'artist' | 'title' | 'rank'>;
  period?: string | null;
}): string {
  const label = formatAiLabTrackLabel(params.hit);
  const title = String(params.hit.title ?? '').trim() || label;
  const scope = chartScopePhrase({
    period: params.period,
    rank: params.hit.rank ?? null,
  });
  return (
    `우선 ${scope}인 **${label}** 다운로드를 시작했습니다. ` +
    `잠시 후 나타나는 화면에서 **${title}** 생성 여부를 안내해 드리겠습니다.`
  );
}
