/** 오디오 경로/URI와 같은 위치의 `.lrc` 사이드카 경로 */

export function siblingLrcFsPath(audioPathOrUri: string): string {
  const p = audioPathOrUri.replace(/^file:\/\//, '');
  const dot = p.lastIndexOf('.');
  const stem = dot > 0 ? p.slice(0, dot) : p;
  return `${stem}.lrc`;
}

export function siblingLrcUri(audioPathOrUri: string): string {
  const fs = siblingLrcFsPath(audioPathOrUri);
  return fs.startsWith('file://') ? fs : `file://${fs}`;
}
