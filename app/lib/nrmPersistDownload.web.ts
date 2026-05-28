/** 웹 전용: expo-file-system 미사용 (Metro가 legacy 서브패스를 못 찾는 문제 회피) */

import {
  applyDownloadExtension,
  loadDownloadAudioExtension,
  mimeTypeForExtension,
  type NrmAudioExtension,
} from '@/lib/nrmDownloadSettings';

export const NRM_DOWNLOAD_DIR_NAME = 'NullReferenceMusic';

function pickerTypesForExtension(ext: NrmAudioExtension) {
  return [
    {
      description: `${ext} 오디오`,
      accept: { [mimeTypeForExtension(ext)]: [ext] },
    },
  ];
}

function normalizedApiBase(base: string): string {
  return base.trim().replace(/\/+$/, '');
}

type WebSaveMode = 'save_as' | 'download_fallback';

type SavePickerFn = (opts: {
  suggestedName?: string;
  types?: { description: string; accept: Record<string, string[]> }[];
}) => Promise<FileSystemFileHandle>;

function getShowSaveFilePicker(): SavePickerFn | undefined {
  const g = globalThis as typeof globalThis & {
    showSaveFilePicker?: SavePickerFn;
  };
  return typeof g.showSaveFilePicker === 'function'
    ? g.showSaveFilePicker
    : undefined;
}

/** Chromium 계열: 저장 위치·파일명을 먼저 고를 수 있음 */
export function isWebSaveFilePickerSupported(): boolean {
  return getShowSaveFilePicker() != null;
}

/**
 * 저장 대화상자만 연다. 사용자가 취소하면 null.
 * (서버 변환·다운로드 전에 호출할 것)
 */
export async function pickWebSaveFileHandle(
  suggestedName: string,
): Promise<FileSystemFileHandle | null> {
  const picker = getShowSaveFilePicker();
  if (!picker) return null;
  const ext = await loadDownloadAudioExtension();
  const name = applyDownloadExtension(suggestedName, ext);
  try {
    return await picker({
      suggestedName: name,
      types: pickerTypesForExtension(ext),
    });
  } catch (e) {
    if (
      e instanceof Error &&
      (e.name === 'AbortError' ||
        (typeof DOMException !== 'undefined' &&
          e instanceof DOMException &&
          e.name === 'AbortError'))
    ) {
      return null;
    }
    throw e;
  }
}

/** 서버에서 내려준 MP3 URL을 이미 선택한 파일 핸들에 기록 */
export async function writeJobMp3BlobToHandle(
  handle: FileSystemFileHandle,
  fileUrl: string,
  options?: { lrcUrl?: string; lrcSuggestedName?: string },
): Promise<void> {
  const res = await fetch(fileUrl);
  if (!res.ok) {
    throw new Error(`파일을 받지 못했습니다 (HTTP ${res.status})`);
  }
  const blob = await res.blob();
  const writable = await handle.createWritable();
  try {
    await writable.write(blob);
  } finally {
    await writable.close();
  }
  if (options?.lrcUrl && options.lrcSuggestedName) {
    try {
      const picker = getShowSaveFilePicker();
      if (!picker) return;
      const lrcRes = await fetch(options.lrcUrl);
      if (!lrcRes.ok) return;
      const lrcBlob = await lrcRes.blob();
      const lrcHandle = await picker({
        suggestedName: options.lrcSuggestedName,
        types: [{ description: 'LRC 가사', accept: { 'text/plain': ['.lrc'] } }],
      });
      const lrcWritable = await lrcHandle.createWritable();
      try {
        await lrcWritable.write(lrcBlob);
      } finally {
        await lrcWritable.close();
      }
    } catch {
      // LRC 저장 실패는 무시
    }
  }
}

export async function cleanupServerJobArtifacts(apiBase: string, jobId: string): Promise<void> {
  const base = normalizedApiBase(apiBase);
  await fetch(`${base}/api/download/cleanup`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jobId }),
  }).catch(() => null);
}

async function downloadLrcOnWeb(
  lrcSuggestedName: string,
  lrcUrl?: string,
  lrcText?: string,
): Promise<void> {
  if (!lrcSuggestedName) return;
  try {
    let lrcBlob: Blob;
    if (lrcText?.trim()) {
      lrcBlob = new Blob([`${lrcText.trim()}\n`], { type: 'text/plain;charset=utf-8' });
    } else if (lrcUrl) {
      const lrcRes = await fetch(lrcUrl);
      if (!lrcRes.ok) return;
      lrcBlob = await lrcRes.blob();
    } else {
      return;
    }
    const lrcObj = URL.createObjectURL(lrcBlob);
    const la = document.createElement('a');
    la.href = lrcObj;
    la.download = lrcSuggestedName;
    la.rel = 'noopener';
    document.body.appendChild(la);
    la.click();
    document.body.removeChild(la);
    URL.revokeObjectURL(lrcObj);
  } catch {
    // ignore
  }
}

async function persistAudioOnWeb(
  fileUrl: string,
  suggestedName: string,
  lrcUrl?: string,
  lrcSuggestedName?: string,
  lrcText?: string,
): Promise<WebSaveMode> {
  const res = await fetch(fileUrl);
  if (!res.ok) {
    throw new Error(`파일을 받지 못했습니다 (HTTP ${res.status})`);
  }
  const blob = await res.blob();

  const objectUrl = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = objectUrl;
  a.download = suggestedName;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(objectUrl);
  if (lrcSuggestedName && (lrcText?.trim() || lrcUrl)) {
    await downloadLrcOnWeb(lrcSuggestedName, lrcUrl, lrcText);
  }
  return 'download_fallback';
}

export async function persistAudioAfterServerJob(
  apiBase: string,
  jobId: string,
  options: { fileName: string; lrcText?: string },
): Promise<{ savedLabel: string }> {
  const base = normalizedApiBase(apiBase);
  const url = `${base}/api/download/file?jobId=${encodeURIComponent(jobId)}`;
  const ext = await loadDownloadAudioExtension();
  const suggestedName = applyDownloadExtension(options.fileName, ext);
  const lrcName = suggestedName.replace(/\.[^.]+$/, '.lrc');
  const lrcUrl = `${base}/api/download/lrc?jobId=${encodeURIComponent(jobId)}`;

  const mode = await persistAudioOnWeb(
    url,
    suggestedName,
    lrcUrl,
    lrcName,
    options.lrcText,
  );
  await cleanupServerJobArtifacts(base, jobId);
  return {
    savedLabel:
      mode === 'download_fallback'
        ? '브라우저 기본 다운로드로 저장했습니다. (보통 다운로드 폴더)'
        : '브라우저 기본 다운로드로 저장했습니다. (보통 다운로드 폴더)',
  };
}
