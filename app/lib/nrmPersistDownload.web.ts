/** 웹 전용: expo-file-system 미사용 (Metro가 legacy 서브패스를 못 찾는 문제 회피) */

export const NRM_DOWNLOAD_DIR_NAME = 'NullReferenceMusic';

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
  try {
    return await picker({
      suggestedName,
      types: [
        {
          description: 'MP3 오디오',
          accept: { 'audio/mpeg': ['.mp3'] },
        },
      ],
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
}

async function persistAudioOnWeb(
  fileUrl: string,
  suggestedName: string,
): Promise<WebSaveMode> {
  const res = await fetch(fileUrl);
  if (!res.ok) {
    throw new Error(`파일을 받지 못했습니다 (HTTP ${res.status})`);
  }
  const blob = await res.blob();

  const picker = getShowSaveFilePicker();
  if (picker) {
    try {
      const handle = await picker({
        suggestedName,
        types: [
          {
            description: 'MP3 오디오',
            accept: { 'audio/mpeg': ['.mp3'] },
          },
        ],
      });
      const writable = await handle.createWritable();
      try {
        await writable.write(blob);
      } finally {
        await writable.close();
      }
      return 'save_as';
    } catch (e) {
      if (
        e instanceof Error &&
        (e.name === 'AbortError' ||
          (typeof DOMException !== 'undefined' &&
            e instanceof DOMException &&
            e.name === 'AbortError'))
      ) {
        throw new Error('저장이 취소되었습니다.');
      }
    }
  }

  const objectUrl = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = objectUrl;
  a.download = suggestedName;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(objectUrl);
  return 'download_fallback';
}

export async function persistAudioAfterServerJob(
  apiBase: string,
  jobId: string,
  options: { fileName: string },
): Promise<{ savedLabel: string }> {
  const base = normalizedApiBase(apiBase);
  const url = `${base}/api/download/file?jobId=${encodeURIComponent(jobId)}`;
  const suggestedName = options.fileName.endsWith('.mp3')
    ? options.fileName
    : `${options.fileName}.mp3`;

  const mode = await persistAudioOnWeb(url, suggestedName);
  return {
    savedLabel:
      mode === 'save_as'
        ? '파일 이름 및 저장 위치를 선택해 저장했습니다.'
        : '브라우저 기본 다운로드로 저장했습니다. (보통 다운로드 폴더)',
  };
}
