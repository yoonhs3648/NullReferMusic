/**
 * Evaluation — 휴리스틱 스냅샷 (LLM-as-judge 불필요).
 */

import type { AgentEvaluationSnapshot, AgentResponse } from '../contract/types.ts';

export interface AnswerEvaluator {
  id: string;
  evaluate(response: AgentResponse): Promise<AgentEvaluationSnapshot> | AgentEvaluationSnapshot;
}

const evaluators = new Map<string, AnswerEvaluator>();

export function registerAnswerEvaluator(e: AnswerEvaluator): void {
  evaluators.set(e.id, e);
}

registerAnswerEvaluator({
  id: 'heuristic_v1',
  evaluate(response) {
    const answerLen = response.answer.trim().length;
    const intentConf = response.intent?.confidence ?? 0;
    const hasFaq = response.contextUsed.some((c) => c.provider === 'faq');
    const toolOk =
      response.toolCalls.length === 0
        ? true
        : response.ok;
    let answerScore = 0;
    if (response.ok && answerLen > 0) {
      answerScore = 0.45 + Math.min(0.35, answerLen / 2000);
      if (hasFaq) answerScore = Math.min(1, answerScore + 0.1);
      if (response.searchUsed) answerScore = Math.min(1, answerScore + 0.05);
    }
    const hallucinationRisk =
      response.searchUsed || hasFaq || response.ragUsed
        ? Math.max(0, 0.35 - intentConf * 0.2)
        : Math.max(0.2, 0.55 - intentConf * 0.3);

    return {
      ...response.evaluation,
      answerScore: Math.round(answerScore * 100) / 100,
      confidence: Math.round(intentConf * 100) / 100,
      hallucinationRisk: Math.round(hallucinationRisk * 100) / 100,
      toolSuccess: toolOk,
      answerLength: response.answer.length,
      toolCount: response.toolCalls.length,
      contextCount: response.contextUsed.length,
      searchUsed: response.searchUsed,
      ragUsed: response.ragUsed,
      recommendationUsed: response.recommendationUsed,
    };
  },
});

export async function runEvaluation(response: AgentResponse): Promise<AgentEvaluationSnapshot> {
  const e = evaluators.get('heuristic_v1') ?? [...evaluators.values()][0];
  if (!e) return response.evaluation;
  return await e.evaluate(response);
}
