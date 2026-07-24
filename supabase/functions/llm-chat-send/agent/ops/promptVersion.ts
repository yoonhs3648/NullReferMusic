/**
 * Prompt Version — Semantic Version 태그 (예: music-1.0.0).
 * 본문은 LLMSystemPrompt + PromptBuilder 섹션, 버전만 추적.
 */

export type PromptVersionRecord = {
  version: string;
  label?: string;
  active: boolean;
  contentHash?: string;
};

const versions = new Map<string, PromptVersionRecord>();

export function registerPromptVersion(rec: PromptVersionRecord): void {
  versions.set(rec.version, rec);
}

registerPromptVersion({ version: 'music-1.0.0', label: 'baseline', active: true });

export function getActivePromptVersion(): string {
  for (const v of versions.values()) {
    if (v.active) return v.version;
  }
  return 'music-1.0.0';
}

export function listPromptVersions(): PromptVersionRecord[] {
  return [...versions.values()];
}
