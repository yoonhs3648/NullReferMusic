/**
 * FAQ 매칭 — KB 순회만 (엔트리별 switch/if 없음).
 * 내일 Embedding 시 FAQ_KB 문서를 vector로 옮기면 됨.
 */

import { FAQ_KB, type FaqKbEntry } from './faqKb.ts';

export type FaqHit = {
  id: string;
  title: string;
  answer: string;
  score: number;
};

function scoreEntry(queryNorm: string, entry: FaqKbEntry): number {
  let score = 0;
  for (const kw of entry.keywords) {
    const k = kw.trim().toLowerCase();
    if (!k) continue;
    if (queryNorm.includes(k)) score += k.length >= 3 ? 2 : 1;
  }
  return score;
}

export function matchFaqHits(userMessage: string, topK = 3): FaqHit[] {
  const q = userMessage.trim().toLowerCase().replace(/\s+/g, ' ');
  if (!q) return [];
  return FAQ_KB.map((e) => ({
    id: e.id,
    title: e.title,
    answer: e.answer,
    score: scoreEntry(q, e),
  }))
    .filter((h) => h.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, topK);
}

export function formatFaqHitsForPrompt(hits: FaqHit[]): string {
  if (hits.length === 0) return '';
  const lines = hits.map(
    (h, i) => `FAQ_HIT_${i + 1} id=${h.id} title=${h.title}\n${h.answer}`,
  );
  return `FAQ_HITS (우선 근거):\n${lines.join('\n\n')}`;
}

/** @deprecated 호환 — FAQ_KB 사용 */
export const FAQ_ENTRIES = FAQ_KB;
