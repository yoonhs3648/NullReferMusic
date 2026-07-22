/** web/iOS stub — SAF는 Android 전용. */

export type SafPathStatus = 'ok' | 'no_path' | 'path_invalid';

export async function checkSafDownloadPath(): Promise<SafPathStatus> {
  return 'ok';
}

export function safUriToDisplayPath(_uri: string): string | null {
  return null;
}

export async function loadStoredSafGrant(): Promise<string | null> {
  return null;
}

export type SafGrantWithEntries = { dirUri: string; entries: string[] };

export async function loadStoredSafGrantWithEntries(): Promise<SafGrantWithEntries | null> {
  return null;
}

export async function acquireSafDirUri(_folderHint?: string): Promise<string | null> {
  return null;
}

export async function requestNewSafDirUri(_folderHint?: string): Promise<string | null> {
  return null;
}

export async function clearSafDownloadGrant(): Promise<void> {
  /* noop */
}
