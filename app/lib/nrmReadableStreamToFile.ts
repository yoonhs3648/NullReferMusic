import * as FileSystem from 'expo-file-system/src/legacy/FileSystem';
import { EncodingType } from 'expo-file-system/src/legacy/FileSystem.types';

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

/**
 * Base64로 임시 파일에 쓰는 중(대용량) — 오디오 전용으로 사용하세요.
 */
export async function writeStreamToFileUri(
  stream: ReadableStream<Uint8Array>,
  destUri: string,
): Promise<void> {
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) chunks.push(value);
  }
  const total = chunks.reduce((n, c) => n + c.length, 0);
  const merged = new Uint8Array(total);
  let o = 0;
  for (const c of chunks) {
    merged.set(c, o);
    o += c.length;
  }
  const cacheDir = FileSystem.cacheDirectory;
  if (cacheDir) {
    const free = await FileSystem.getFreeDiskStorageAsync();
    if (Number.isFinite(free) && free < total + 8 * 1024 * 1024) {
      throw new Error('기기 저장 공간이 부족할 수 있습니다. 공간을 비운 뒤 다시 시도해 주세요.');
    }
  }
  await FileSystem.writeAsStringAsync(destUri, uint8ToBase64(merged), {
    encoding: EncodingType.Base64,
  });
}
