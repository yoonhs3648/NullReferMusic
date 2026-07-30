/**
 * AI Lab — 사용자에게 보이는 채팅 본문만 남긴다.
 * 내부 정책·도구·마커·코드 지시문은 어떤 경로로든 UI에 노출하지 않는다.
 */

export function sanitizeAiLabUserVisibleContent(raw: string): string {
  let t = String(raw ?? '');
  if (!t.trim()) return '';

  // 구버전: 칩 선택 시 API 전문이 ChatMessage.Content에 저장된 경우
  if (/\[AI_LAB_TRACK_SELECT\]/.test(t)) {
    const labelLine = t.match(/사용자가 곡을 선택했다:\s*(.+)/);
    const label = labelLine?.[1]?.trim().split(/\r?\n/)[0]?.trim();
    if (label) return label;
    const jsonMatch = t.match(/\[AI_LAB_TRACK_SELECT\](\{[\s\S]*?\})/);
    if (jsonMatch?.[1]) {
      try {
        const obj = JSON.parse(jsonMatch[1]) as { artist?: string; title?: string; album?: string };
        const artist = String(obj.artist ?? '').trim();
        const title = String(obj.title ?? '').trim();
        const album = String(obj.album ?? '').trim();
        if (artist && title) {
          return album ? `${artist} - ${title} (${album})` : `${artist} - ${title}`;
        }
        if (title) return title;
      } catch {
        // fall through
      }
    }
    return '선택한 곡';
  }

  if (/\[AI_LAB_DOWNLOAD_STARTED\]/.test(t)) {
    const artist = t.match(/\bartist=([^\n]+)/)?.[1]?.trim();
    const title = t.match(/\btitle=([^\n]+?)(?:\s+artist=|$)/)?.[1]?.trim();
    if (artist && title) return `${artist} - ${title}`;
    if (title) return title;
    return '선택한 곡';
  }

  // 클라이언트/Edge 내부 상태 블록
  t = t.replace(/\[INTERNAL_CLIENT_STATE\][\s\S]*$/g, '');
  t = t.replace(/\[INTERNAL\][\s\S]*$/g, '');
  t = t.replace(/\[AI_LAB_[A-Z0-9_]+\][\s\S]*$/g, '');

  // 프롬프트/정책 섹션이 그대로 새어 나온 경우
  t = t.replace(/\[DOWNLOAD_RULES\][\s\S]*?(?=\n\[[A-Z_]+\]|\n*$)/g, '');
  t = t.replace(/\[TOOL_USAGE_RULES\][\s\S]*?(?=\n\[[A-Z_]+\]|\n*$)/g, '');
  t = t.replace(/\[TOOLS\][\s\S]*?(?=\n\[[A-Z_]+\]|\n*$)/g, '');
  t = t.replace(/\[WEB_SEARCH[^\]]*\][\s\S]*?(?=\n\[[A-Z_]+\]|\n*$)/g, '');
  t = t.replace(/\[CURRENT_DATETIME\][^\n]*/g, '');
  t = t.replace(/\[ROLE\][\s\S]*?(?=\n\[[A-Z_]+\]|\n*$)/g, '');
  t = t.replace(/\[ANSWER_RULES\][\s\S]*?(?=\n\[[A-Z_]+\]|\n*$)/g, '');
  t = t.replace(/\[OUTPUT[^\]]*\][\s\S]*?(?=\n\[[A-Z_]+\]|\n*$)/g, '');

  // 도구/스키마 지시 문장(사용자 메시지에 섞인 경우)
  t = t.replace(/^.*\b(?:search_music|start_music_download|function call|lyricsOption)\b.*$/gim, '');
  t = t.replace(/^.*호출 금지.*$/gim, '');
  t = t.replace(/^.*도구 호출이 필수.*$/gim, '');
  t = t.replace(/^.*위 JSON hit로.*$/gim, '');

  t = t.replace(/[ \t]{2,}/g, ' ');
  t = t.replace(/\n{3,}/g, '\n\n');
  return t.replace(/^\s+|\s+$/g, '').trim();
}
