import * as FileSystem from 'expo-file-system/src/legacy/FileSystem';
import { Platform } from 'react-native';
import { NativeModules } from 'react-native';

import type { NrmAudioFileMetadata } from '@/lib/nrmDownloadAudioMetadata';
import { normalizeDownloadMetadata } from '@/lib/nrmDownloadAudioMetadata';
import { isBogusEmbeddedAudioTitle } from '@/lib/nrmAudioMetadataTitle';

type NativeReadResult = {
  title?: string;
  artist?: string;
  album?: string;
  albumArtist?: string;
  genre?: string;
  releaseDate?: string;
  trackNumber?: string;
  discNumber?: string;
  composer?: string;
  bpm?: string;
  copyright?: string;
  website?: string;
  producer?: string;
  remixer?: string;
  coverUrl?: string;
};

type NativeAudioMetadata = {
  readMetadata?: (inputPath: string) => Promise<NativeReadResult>;
};

function toFsPath(uri: string): string {
  return uri.startsWith('file://') ? uri.slice(7) : uri;
}

async function materializeAudioForRead(audioUri: string, fileName: string): Promise<string> {
  const trimmed = audioUri.trim();
  if (trimmed.startsWith('file://') || trimmed.startsWith('/')) {
    return trimmed.startsWith('file://') ? trimmed : `file://${trimmed}`;
  }
  const cacheRoot = FileSystem.cacheDirectory;
  if (!cacheRoot) throw new Error('캐시를 사용할 수 없습니다.');
  const ext = fileName.includes('.') ? fileName.slice(fileName.lastIndexOf('.')) : '.mp3';
  const dest = `${cacheRoot}nrm-read-audio-${Date.now()}-${Math.random().toString(36).slice(2, 10)}${ext}`;
  try {
    await FileSystem.copyAsync({ from: trimmed, to: dest });
    const info = await FileSystem.getInfoAsync(dest);
    if (info.exists && 'size' in info && (info.size ?? 0) > 0) return dest;
  } catch {
    /* base64 폴백 */
  }
  const b64 = await FileSystem.readAsStringAsync(trimmed, { encoding: 'base64' });
  await FileSystem.writeAsStringAsync(dest, b64, { encoding: 'base64' });
  return dest;
}

export async function readAudioFileMetadata(
  audioUri: string,
  fileName: string,
): Promise<NrmAudioFileMetadata> {
  if (Platform.OS !== 'android' && Platform.OS !== 'ios') {
    return normalizeDownloadMetadata({
      artist: '',
      title: '',
      album: '',
      genre: '',
      releaseDate: '',
      coverUrl: '',
    });
  }

  const mod = NativeModules.NrmAudioMetadata as NativeAudioMetadata | undefined;
  if (!mod?.readMetadata) {
    return normalizeDownloadMetadata({
      artist: '',
      title: '',
      album: '',
      genre: '',
      releaseDate: '',
      coverUrl: '',
    });
  }

  const localUri = await materializeAudioForRead(audioUri, fileName);
  const raw = await mod.readMetadata(toFsPath(localUri));
  const rawTitle = (raw.title ?? '').trim();
  const rawArtist = (raw.artist ?? '').trim();
  const meta = normalizeDownloadMetadata({
    artist: rawArtist,
    title: isBogusEmbeddedAudioTitle(rawTitle) ? '' : rawTitle,
    album: (raw.album ?? '').trim(),
    genre: (raw.genre ?? '').trim(),
    releaseDate: (raw.releaseDate ?? '').trim(),
    coverUrl: (raw.coverUrl ?? '').trim(),
    albumArtist: (raw.albumArtist ?? '').trim() || undefined,
    trackNumber: (raw.trackNumber ?? '').trim() || undefined,
    discNumber: (raw.discNumber ?? '').trim() || undefined,
    composer: (raw.composer ?? '').trim() || undefined,
    bpm: (raw.bpm ?? '').trim() || undefined,
    copyright: (raw.copyright ?? '').trim() || undefined,
    website: (raw.website ?? '').trim() || undefined,
    producer: (raw.producer ?? '').trim() || undefined,
    remixer: (raw.remixer ?? '').trim() || undefined,
  });

  if (localUri.includes('/cache/') || localUri.includes('cache%2F')) {
    await FileSystem.deleteAsync(localUri, { idempotent: true }).catch(() => {});
  }
  return meta;
}
