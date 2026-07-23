/** AI Lab 채팅 UI 전용 타입·상수 (Supabase ChatSession/ChatMessage 기반 실 데이터). */

import type { NrmAiLabChoice } from '@/lib/nrmAiLabDownloadTools';

export type NrmAiLabMessageRole = 'user' | 'assistant' | 'system';

export type NrmAiLabMessage = {
  /** `${MessageID}` — 낙관적 전송 중에는 임시 id */
  id: string;
  role: NrmAiLabMessageRole;
  content: string;
  /** 전송 중(로컬 낙관적 메시지, 서버 확정 전) */
  pending?: boolean;
  /** 어시스턴트가 아직 답변을 만드는 중(첫 delta 도착 전) — 타이핑 인디케이터 표시용 */
  typing?: boolean;
  /** 플랫폼/트랙/가사 선택 칩 — 탭하면 사용자 메시지로 전송 */
  choices?: NrmAiLabChoice[];
};

export type NrmAiLabConversation = {
  /** `${SessionID}` */
  id: string;
  title: string;
  updatedAtLabel: string;
  /** 정렬용 원본 시각 (최근 대화순 정렬) */
  updatedAtIso: string;
  modelId: number;
  /** 메시지는 대화 진입 시 지연 로딩 — 목록 단계에서는 빈 배열일 수 있음 */
  messages: NrmAiLabMessage[];
  messagesLoaded: boolean;
};

export const NRM_AI_LAB_COMPOSER_PLACEHOLDER = '무엇이든 물어보세요!';

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

/** 목록/헤더 표기용 상대 시각. */
export function nrmAiLabRelativeTimeLabel(iso: string): string {
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return '';
  const diffMs = Date.now() - t;
  if (diffMs < 0 || diffMs < 60_000) return '지금';
  const diffMin = Math.floor(diffMs / 60_000);
  if (diffMin < 60) return `${diffMin}분 전`;
  const diffHour = Math.floor(diffMin / 60);
  if (diffHour < 24) return `${diffHour}시간 전`;
  const diffDay = Math.floor(diffHour / 24);
  if (diffDay < 7) return `${diffDay}일 전`;
  const d = new Date(t);
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`;
}
