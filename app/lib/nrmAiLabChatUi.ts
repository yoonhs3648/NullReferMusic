/** AI Lab 채팅 UI 전용 타입·상수 (실 LLM 연동 전 목업). */

export type NrmAiLabMessageRole = 'user' | 'assistant';

export type NrmAiLabLlmModelId = 'gemini' | 'chatgpt';

export type NrmAiLabLlmModelOption = {
  id: NrmAiLabLlmModelId;
  label: string;
  disabled: boolean;
};

export const NRM_AI_LAB_DEFAULT_LLM_MODEL: NrmAiLabLlmModelId = 'gemini';

export const NRM_AI_LAB_LLM_MODEL_OPTIONS: readonly NrmAiLabLlmModelOption[] = [
  { id: 'gemini', label: 'Gemini', disabled: false },
  { id: 'chatgpt', label: 'Chat GPT', disabled: true },
] as const;

export type NrmAiLabMessage = {
  id: string;
  role: NrmAiLabMessageRole;
  content: string;
};

export type NrmAiLabConversation = {
  id: string;
  title: string;
  updatedAtLabel: string;
  messages: NrmAiLabMessage[];
};

export const NRM_AI_LAB_COMPOSER_PLACEHOLDER = '무엇이든 물어보세요!';

/** 전송 직후 UI 데모용 응답 (실 LLM 아님). */
export const NRM_AI_LAB_DEMO_ASSISTANT_REPLY = 'LLM 준비중입니다.';

export function nrmAiLabTitleFromPrompt(prompt: string): string {
  const t = prompt.replace(/\s+/g, ' ').trim();
  if (!t) return '새 대화';
  return t.length > 28 ? `${t.slice(0, 28)}…` : t;
}

export function nrmAiLabEmptyGreeting(userName: string): { line1: string; line2: string } {
  const name = userName.trim();
  return {
    line1: name ? `${name}님 안녕하세요.` : '안녕하세요.',
    line2: '무엇이 궁금하신가요?',
  };
}
