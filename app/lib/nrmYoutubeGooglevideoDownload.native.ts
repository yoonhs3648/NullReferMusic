/**
 * youtubei `FormatUtils.download`는 JS `fetch`로 googlevideo를 받습니다.
 * Android/iOS에서는 네이티브 `FileSystem.downloadAsync`가 웹·시스템 다운로더에 가깝게 동작해
 * 동일 URL이 200으로 내려오는 경우가 많습니다 (앱 내 전용, PC 백엔드 없음).
 */
import * as FileSystem from 'expo-file-system/src/legacy/FileSystem';
import { EncodingType } from 'expo-file-system/src/legacy/FileSystem.types';

import { downloadMediaUrlViaWebView } from '@/lib/nrmYoutubeDecipherBridge';

/** youtubei `Constants.STREAM_HEADERS` + UA (프리셋 순으로 시도) */
const STREAM_HEADER_PRESETS: Record<string, string>[] = [
  {
    Accept: '*/*',
    Origin: 'https://www.youtube.com',
    Referer: 'https://www.youtube.com/',
    DNT: '?1',
    'User-Agent':
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  },
  {
    Accept: '*/*',
    Origin: 'https://www.youtube.com',
    Referer: 'https://www.youtube.com/',
    DNT: '?1',
    'User-Agent':
      'com.google.android.youtube/21.03.36(Linux; U; Android 16; en_US; SM-S908E Build/TP1A.220624.014) gzip',
  },
  {
    Accept: '*/*',
    Origin: 'https://www.youtube.com',
    Referer: 'https://www.youtube.com/',
    DNT: '?1',
    'User-Agent':
      'com.google.ios.youtube/20.11.6 (iPhone10,4; U; CPU iOS 16_7_7 like Mac OS X)',
  },
];

const CHUNK_BYTES = 10485760; // youtubei FormatUtils 와 동일 10MB

function uint8ToBase64(u8: Uint8Array): string {
  const CHUNK = 0x1000;
  let binary = '';
  for (let i = 0; i < u8.length; i += CHUNK) {
    const end = Math.min(i + CHUNK, u8.length);
    const sub = u8.subarray(i, end);
    binary += String.fromCharCode.apply(
      null,
      sub as unknown as number[],
    );
  }
  return btoa(binary);
}

function base64ToUint8Array(b64: string): Uint8Array {
  const bin = atob(b64);
  const u8 = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
  return u8;
}

async function mergePartFiles(
  partUris: string[],
  destUri: string,
): Promise<void> {
  const arrays = await Promise.all(
    partUris.map((uri) =>
      FileSystem.readAsStringAsync(uri, { encoding: EncodingType.Base64 }).then(
        base64ToUint8Array,
      ),
    ),
  );
  const total = arrays.reduce((n, a) => n + a.length, 0);
  const merged = new Uint8Array(total);
  let o = 0;
  for (const a of arrays) {
    merged.set(a, o);
    o += a.length;
  }
  await FileSystem.writeAsStringAsync(destUri, uint8ToBase64(merged), {
    encoding: EncodingType.Base64,
  });
  for (const uri of partUris) {
    await FileSystem.deleteAsync(uri, { idempotent: true }).catch(() => {});
  }
}

function throwNon2xx(status: number): never {
  throw new Error(
    `The server responded with a non 2xx status code (${status})`,
  );
}

async function downloadSingleOrChunked(
  urlWithCpn: string,
  destUri: string,
  contentLength: number,
  headers: Record<string, string>,
): Promise<void> {
  const single = await FileSystem.downloadAsync(urlWithCpn, destUri, {
    headers,
  });
  if (single.status >= 200 && single.status < 300) {
    return;
  }
  await FileSystem.deleteAsync(destUri, { idempotent: true }).catch(() => {});

  const partUris: string[] = [];
  const len = Number.isFinite(contentLength) && contentLength > 0 ? contentLength : 0;

  try {
    if (len > 0) {
      let chunkStart = 0;
      let chunkEnd = CHUNK_BYTES;
      for (;;) {
        const rangeEnd = Math.min(chunkEnd, len) - 1;
        const rangeUrl = `${urlWithCpn}&range=${chunkStart}-${rangeEnd}`;
        const partPath = `${destUri}.nrm.part-${partUris.length}`;
        const res = await FileSystem.downloadAsync(rangeUrl, partPath, {
          headers,
        });
        if (res.status < 200 || res.status >= 300) {
          throwNon2xx(res.status);
        }
        partUris.push(partPath);
        if (rangeEnd >= len - 1) {
          break;
        }
        chunkStart = rangeEnd + 1;
        chunkEnd = chunkStart + CHUNK_BYTES;
      }
    } else {
      /** `content_length` 없을 때 FormatUtils 는 사실상 첫 구간 한 번만 요청 */
      const rangeUrl = `${urlWithCpn}&range=0-${CHUNK_BYTES - 1}`;
      const partPath = `${destUri}.nrm.part-0`;
      const res = await FileSystem.downloadAsync(rangeUrl, partPath, {
        headers,
      });
      if (res.status < 200 || res.status >= 300) {
        throwNon2xx(res.status);
      }
      partUris.push(partPath);
    }

    if (partUris.length === 1) {
      try {
        await FileSystem.moveAsync({ from: partUris[0], to: destUri });
      } catch {
        await mergePartFiles(partUris, destUri);
      }
    } else {
      await mergePartFiles(partUris, destUri);
    }
  } catch (e) {
    for (const p of partUris) {
      await FileSystem.deleteAsync(p, { idempotent: true }).catch(() => {});
    }
    throw e;
  }
}

type FormatLike = {
  content_length?: number | string;
};

/**
 * 복호화된 `format_url`과 `cpn`으로 googlevideo를 네이티브 다운로드합니다.
 */
export async function downloadGooglevideoAudioToFileUri(
  formatUrl: string,
  cpn: string,
  destUri: string,
  format: FormatLike,
): Promise<void> {
  const rawLen = format.content_length;
  const contentLength =
    rawLen != null && rawLen !== '' ? Number(rawLen) : 0;

  const urlWithCpn = `${formatUrl}&cpn=${encodeURIComponent(cpn)}`;
  try {
    await downloadMediaUrlViaWebView(urlWithCpn, destUri);
    return;
  } catch {
    await FileSystem.deleteAsync(destUri, { idempotent: true }).catch(() => {});
  }

  let lastErr: unknown;
  for (const headers of STREAM_HEADER_PRESETS) {
    try {
      await downloadSingleOrChunked(
        urlWithCpn,
        destUri,
        contentLength,
        headers,
      );
      return;
    } catch (e) {
      lastErr = e;
      await FileSystem.deleteAsync(destUri, { idempotent: true }).catch(
        () => {},
      );
    }
  }
  throw lastErr instanceof Error
    ? lastErr
    : new Error(String(lastErr));
}
