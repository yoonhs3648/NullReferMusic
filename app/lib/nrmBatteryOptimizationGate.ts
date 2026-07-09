import { Platform } from 'react-native';

export async function ensureBatteryOptimizationExemptForDownload(): Promise<boolean> {
  if (Platform.OS === 'web') {
    const m = await import('./nrmBatteryOptimizationGate.web');
    return m.ensureBatteryOptimizationExemptForDownload();
  }
  const m = await import('./nrmBatteryOptimizationGate.native');
  return m.ensureBatteryOptimizationExemptForDownload();
}
