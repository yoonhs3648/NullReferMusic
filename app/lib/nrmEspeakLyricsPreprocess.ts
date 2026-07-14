/** EN→KO transliterator — FA 전처리(영어→한국어 발음) 및 LRC 원문 복원. FA 엔진 코드는 건드리지 않음. */

export type EspeakLineMapping = {
  originalLine: string;
  phoneticLine: string;
};

export type EspeakPreprocessResult = {
  phoneticPlain: string;
  lineMappings: EspeakLineMapping[];
};

/** @deprecated Use EspeakLineMapping — 동일 매핑 구조 */
export type EnKoLineMapping = EspeakLineMapping;

/** @deprecated Use EspeakPreprocessResult — 동일 결과 구조 */
export type EnKoPreprocessResult = EspeakPreprocessResult;

const LRC_LINE_RE = /^\[([^\]]+)\]\s*(.*)$/;

export function splitPlainLyricLines(plain: string): string[] {
  return plain
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
}

export function parseLrcTimedLines(lrc: string): { ts: string; text: string }[] {
  const out: { ts: string; text: string }[] = [];
  for (const raw of lrc.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    const m = LRC_LINE_RE.exec(line);
    if (!m) continue;
    out.push({ ts: `[${m[1]}]`, text: m[2] });
  }
  return out;
}

/**
 * FA에 넣기 전 plain → 한국어 발음 plain (라인 1:1 유지).
 * 네이티브 미가용 시 원문 그대로 반환.
 */
export async function preprocessPlainForEnKoAlign(
  plain: string,
): Promise<EnKoPreprocessResult> {
  const lines = splitPlainLyricLines(plain);
  if (lines.length === 0) {
    return { phoneticPlain: '', lineMappings: [] };
  }

  const { transliteratePlainLinesForEnKo } = await import(
    '@/lib/nrmEnKoTransliteratorNative'
  );
  const phoneticLines = await transliteratePlainLinesForEnKo(lines);

  const lineMappings: EnKoLineMapping[] = lines.map((originalLine, i) => ({
    originalLine,
    phoneticLine: phoneticLines[i] ?? originalLine,
  }));

  return {
    phoneticPlain: lineMappings.map((m) => m.phoneticLine).join('\n'),
    lineMappings,
  };
}

/** @deprecated Use preprocessPlainForEnKoAlign */
export async function preprocessPlainForEspeakAlign(
  plain: string,
): Promise<EspeakPreprocessResult> {
  return preprocessPlainForEnKoAlign(plain);
}

/** LRC 타임스탬프 유지, 가사 텍스트만 원문으로 복원 (라인 순서 1:1). */
export function restoreLrcWithOriginalLyrics(
  lrc: string,
  lineMappings: EspeakLineMapping[],
): string {
  const timed = parseLrcTimedLines(lrc);
  if (timed.length === 0 || lineMappings.length === 0) return lrc;

  const restored = timed.map((row, i) => {
    const original = lineMappings[i]?.originalLine ?? row.text;
    return `${row.ts}${original}`;
  });
  return restored.join('\n');
}
