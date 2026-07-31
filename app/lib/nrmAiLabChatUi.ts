/** AI Lab 채팅 UI 전용 타입·상수 (Supabase ChatSession/ChatMessage 기반 실 데이터). */

import type { NrmAiLabChoice } from '@/lib/nrmAiLabDownloadTools';

export type NrmAiLabMessageRole = 'user' | 'assistant' | 'system';

export type NrmAiLabAgentUiBadge = {
  id: string;
  label: string;
  icon?: string;
};

export type NrmAiLabAgentUiAction = {
  id: string;
  label: string;
  kind?: string;
};

export type NrmAiLabAgentUiWarning = {
  id: string;
  message: string;
};

/** Edge AgentResponse.ui — badges / actions / warnings */
export type NrmAiLabAgentUiHints = {
  badges: NrmAiLabAgentUiBadge[];
  actions: NrmAiLabAgentUiAction[];
  warnings: NrmAiLabAgentUiWarning[];
  providerLabel?: string;
  latencyMs?: number;
};

export type NrmAiLabMessage = {
  id: string;
  role: NrmAiLabMessageRole;
  content: string;
  pending?: boolean;
  typing?: boolean;
  choices?: NrmAiLabChoice[];
  agentUi?: NrmAiLabAgentUiHints;
  /** YouTube 후보 확인·미리듣기 카드 */
  youtubeConfirm?: { sessionId: string };
};

export type NrmAiLabConversation = {
  id: string;
  title: string;
  updatedAtLabel: string;
  updatedAtIso: string;
  modelId: number;
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

function asStringArrayObject(
  raw: unknown,
  labelKey: 'label' | 'message',
): Array<{ id: string; label?: string; message?: string; icon?: string; kind?: string }> {
  if (!Array.isArray(raw)) return [];
  const out: Array<{ id: string; label?: string; message?: string; icon?: string; kind?: string }> =
    [];
  for (const row of raw) {
    if (!row || typeof row !== 'object') continue;
    const r = row as Record<string, unknown>;
    const id = String(r.id ?? '').trim();
    if (!id) continue;
    if (labelKey === 'label') {
      const label = String(r.label ?? '').trim();
      if (!label) continue;
      out.push({
        id,
        label,
        icon: typeof r.icon === 'string' ? r.icon : undefined,
        kind: typeof r.kind === 'string' ? r.kind : undefined,
      });
    } else {
      const message = String(r.message ?? '').trim();
      if (!message) continue;
      out.push({ id, message });
    }
  }
  return out;
}

export function parseAgentUiFromDiag(diag: unknown): NrmAiLabAgentUiHints | undefined {
  if (!diag || typeof diag !== 'object') return undefined;
  const ar = (diag as { agentResponse?: unknown }).agentResponse;
  if (!ar || typeof ar !== 'object') return undefined;
  const ui = (ar as { ui?: unknown }).ui;
  if (!ui || typeof ui !== 'object') return undefined;
  const u = ui as Record<string, unknown>;

  const badges = asStringArrayObject(u.badges, 'label').map((b) => ({
    id: b.id,
    label: String(b.label ?? ''),
    icon: b.icon,
  }));
  const actions = asStringArrayObject(u.actions, 'label').map((a) => ({
    id: a.id,
    label: String(a.label ?? ''),
    kind: a.kind,
  }));
  const warnings = asStringArrayObject(u.warnings, 'message').map((w) => ({
    id: w.id,
    message: String(w.message ?? ''),
  }));

  // 구버전 show* 플래그 폴백
  if (badges.length === 0) {
    if (u.showSearchIcon) badges.push({ id: 'web', label: 'Web', icon: 'globe' });
    if (u.showMusicIcon) badges.push({ id: 'music', label: 'Music', icon: 'musical-notes' });
    if (u.showRagIcon) badges.push({ id: 'rag', label: 'RAG', icon: 'library' });
    if (u.showRecommendIcon) {
      badges.push({ id: 'recommend', label: 'Recommend', icon: 'sparkles' });
    }
    if (u.showCitations) badges.push({ id: 'citations', label: '출처', icon: 'book' });
    if (typeof u.providerLabel === 'string' && u.providerLabel) {
      badges.push({ id: 'provider', label: u.providerLabel, icon: 'chip' });
    }
    if (typeof u.latencyMs === 'number' && u.latencyMs > 0) {
      badges.push({
        id: 'latency',
        label: `${(u.latencyMs / 1000).toFixed(1)}초`,
        icon: 'flash',
      });
    }
  }

  if (badges.length === 0 && actions.length === 0 && warnings.length === 0) {
    return undefined;
  }

  return {
    badges,
    actions,
    warnings,
    providerLabel: typeof u.providerLabel === 'string' ? u.providerLabel : undefined,
    latencyMs: typeof u.latencyMs === 'number' ? u.latencyMs : undefined,
  };
}

export function agentUiBadgeIconName(icon?: string): string {
  switch (icon) {
    case 'globe':
      return 'globe-outline';
    case 'musical-notes':
      return 'musical-notes-outline';
    case 'library':
      return 'library-outline';
    case 'sparkles':
      return 'sparkles-outline';
    case 'book':
      return 'book-outline';
    case 'bulb':
      return 'bulb-outline';
    case 'chip':
      return 'hardware-chip-outline';
    case 'flash':
      return 'flash-outline';
    default:
      return 'ellipse-outline';
  }
}
