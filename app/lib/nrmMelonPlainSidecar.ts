/** 멜론 plain 가사 — 오디오와 같은 폴더의 `.nrmplain` 사이드카 */

export const NRM_PLAIN_SIDECAR_EXT = '.nrmplain';

export function siblingNrmPlainFsPath(audioPathOrUri: string): string {
  const p = audioPathOrUri.replace(/^file:\/\//, '');
  const dot = p.lastIndexOf('.');
  const stem = dot > 0 ? p.slice(0, dot) : p;
  return `${stem}${NRM_PLAIN_SIDECAR_EXT}`;
}

export function siblingNrmPlainUri(audioPathOrUri: string): string {
  const fs = siblingNrmPlainFsPath(audioPathOrUri);
  return fs.startsWith('file://') ? fs : `file://${fs}`;
}

export function nrmPlainSidecarNameFromAudioFileName(fileName: string): string {
  const dot = fileName.lastIndexOf('.');
  const stem = dot > 0 ? fileName.slice(0, dot) : fileName;
  return `${stem}${NRM_PLAIN_SIDECAR_EXT}`;
}
