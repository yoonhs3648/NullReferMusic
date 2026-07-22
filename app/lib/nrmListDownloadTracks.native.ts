import * as FileSystem from 'expo-file-system/src/legacy/FileSystem';
import { StorageAccessFramework } from 'expo-file-system/src/legacy/FileSystem';
import { Platform } from 'react-native';

import {
  NRM_DOWNLOAD_PUBLIC_FOLDER_NAME,
  type PersistedAudioLocation,
} from '@/lib/nrmPersistDownload.native';
import { loadStoredSafGrantWithEntries } from '@/lib/nrmDownloadSafGrant';
import { siblingLrcUri } from '@/lib/nrmSiblingLrc';

const AUDIO_EXT = new Set(['.mp3', '.m4a', '.mp4', '.aac', '.flac', '.wav', '.ogg']);

import type { NrmDownloadTrackItem } from '@/lib/nrmDownloadTrackTypes';

export type { NrmDownloadTrackItem } from '@/lib/nrmDownloadTrackTypes';

function extractSafEntryName(uri: string): string {
  const decoded = decodeURIComponent(uri);
  const nameFromDoc = decoded.match(/\/document\/[^:]+:(?:.*\/)?([^/?#]+)/i)?.[1];
  if (nameFromDoc) return nameFromDoc;
  const tail = decoded.split('/').pop() ?? '';
  return tail.split('?')[0];
}

function isAudioFileName(name: string): boolean {
  const dot = name.lastIndexOf('.');
  if (dot < 0) return false;
  return AUDIO_EXT.has(name.slice(dot).toLowerCase());
}

function joinFolderFile(folderUri: string, fileName: string): string {
  const sep = folderUri.endsWith('/') ? '' : '/';
  return `${folderUri}${sep}${fileName}`;
}

async function listFromFolder(
  folderUri: string,
  kind: 'file' | 'saf',
  dirUri?: string,
): Promise<NrmDownloadTrackItem[]> {
  const names = await FileSystem.readDirectoryAsync(folderUri).catch(() => []);
  // readDirectoryAsync가 이미 폴더 내 모든 파일 이름을 반환하므로,
  // LRC 파일 존재 여부는 Set으로 O(1) 조회 — 파일당 FileSystem.getInfoAsync 제거
  const nameSet = new Set(names.map((n) => n.toLowerCase()));
  const items: NrmDownloadTrackItem[] = [];
  for (const name of names.sort((a, b) => a.localeCompare(b, 'ko'))) {
    if (!isAudioFileName(name)) continue;
    const audioUri =
      kind === 'saf' && dirUri
        ? await resolveSafChildUri(dirUri, name)
        : joinFolderFile(folderUri, name);
    const ext = name.slice(name.lastIndexOf('.')).toLowerCase();
    const lrcName = name.replace(/\.[^.]+$/, '.lrc');
    const lrcExists = nameSet.has(lrcName.toLowerCase());
    const lrcUri = lrcExists ? siblingLrcUri(audioUri) : undefined;
    const location: PersistedAudioLocation =
      kind === 'saf' && dirUri
        ? { kind: 'saf', audioUri, dirUri, fileName: name }
        : { kind: 'file', audioUri, folderUri, fileName: name };
    const stem = name.replace(/\.[^.]+$/, '');
    items.push({
      fileName: name,
      audioUri,
      extension: ext,
      location,
      lrcUri,
      displayLabel: stem,
    });
  }
  return items;
}

async function resolveSafChildUri(dirUri: string, fileName: string): Promise<string> {
  const entries = await StorageAccessFramework.readDirectoryAsync(dirUri).catch(() => []);
  const target = fileName.toLowerCase();
  for (const entryUri of entries) {
    if (extractSafEntryName(entryUri).toLowerCase() === target) {
      return entryUri;
    }
  }
  return joinFolderFile(dirUri, fileName);
}

/** 다운로드 경로 내 오디오 파일 목록 */
export async function listDownloadAudioTracks(): Promise<NrmDownloadTrackItem[]> {
  if (Platform.OS === 'ios') {
    const docRoot = FileSystem.documentDirectory;
    if (!docRoot) return [];
    const folderUri = `${docRoot}${NRM_DOWNLOAD_PUBLIC_FOLDER_NAME}/`;
    await FileSystem.makeDirectoryAsync(folderUri, { intermediates: true }).catch(() => {});
    return listFromFolder(folderUri, 'file');
  }

  if (Platform.OS !== 'android') return [];

  if ((Platform.Version as number) < 29) {
    const folderUri = `file:///storage/emulated/0/${NRM_DOWNLOAD_PUBLIC_FOLDER_NAME}`;
    await FileSystem.makeDirectoryAsync(folderUri, { intermediates: true }).catch(() => {});
    return listFromFolder(folderUri, 'file');
  }

  // 허가 검증(readDirectoryAsync)과 목록 조회를 한 번의 스캔으로 통합
  // (기존에는 loadStoredSafGrant()의 검증 스캔 + 아래 목록 스캔으로 동일 폴더를 2번 읽었음)
  const grant = await loadStoredSafGrantWithEntries();
  if (!grant) return [];
  const { dirUri, entries } = grant;

  // 이름 조회를 O(1)로 만들기 위해 한 번만 디코딩해 맵으로 구성
  // (기존에는 오디오 파일마다 전체 entries를 다시 순회 + 재디코딩하는 O(n²) 매칭이었음)
  const entryNameByUri = new Map<string, string>();
  const uriByLowerName = new Map<string, string>();
  for (const entryUri of entries) {
    const name = extractSafEntryName(entryUri);
    entryNameByUri.set(entryUri, name);
    uriByLowerName.set(name.toLowerCase(), entryUri);
  }

  const items: NrmDownloadTrackItem[] = [];
  for (const entryUri of entries) {
    const name = entryNameByUri.get(entryUri) ?? extractSafEntryName(entryUri);
    if (!isAudioFileName(name)) continue;
    const ext = name.slice(name.lastIndexOf('.')).toLowerCase();
    const lrcName = name.replace(/\.[^.]+$/, '.lrc');
    const lrcUri = uriByLowerName.get(lrcName.toLowerCase());
    const location: PersistedAudioLocation = {
      kind: 'saf',
      audioUri: entryUri,
      dirUri,
      fileName: name,
    };
    items.push({
      fileName: name,
      audioUri: entryUri,
      extension: ext,
      location,
      lrcUri,
      displayLabel: name.replace(/\.[^.]+$/, ''),
    });
  }
  return items.sort((a, b) => a.fileName.localeCompare(b.fileName, 'ko'));
}
