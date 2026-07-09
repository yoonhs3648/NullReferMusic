import { Platform } from 'react-native';

export function armWallClockTimeout(
  id: string,
  delayMs: number,
  onFire: () => void,
): () => void {
  if (Platform.OS === 'web') {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require('./nrmWallClockTimeout.web').armWallClockTimeout(id, delayMs, onFire);
  }
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require('./nrmWallClockTimeout.native').armWallClockTimeout(id, delayMs, onFire);
}

export function disarmWallClockTimeout(id: string): void {
  if (Platform.OS === 'web') {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    require('./nrmWallClockTimeout.web').disarmWallClockTimeout(id);
    return;
  }
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require('./nrmWallClockTimeout.native').disarmWallClockTimeout(id);
}
