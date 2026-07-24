/** 과거 메시지 Content에 붙었던 출처 마커만 제거(출처 UI는 사용하지 않음). */

const NRM_SOURCES_WRAP_START = '\n\n\u001eNRM_SOURCES:';
const NRM_SOURCES_WRAP_END = '\u001e';

export function stripNrmAiLabSourcesMarker(raw: string): string {
  const text = raw ?? '';
  const start = text.lastIndexOf(NRM_SOURCES_WRAP_START);
  if (start < 0) return text;
  const payloadStart = start + NRM_SOURCES_WRAP_START.length;
  const end = text.indexOf(NRM_SOURCES_WRAP_END, payloadStart);
  if (end < 0) return text;
  return text.slice(0, start).replace(/\s+$/g, '');
}
