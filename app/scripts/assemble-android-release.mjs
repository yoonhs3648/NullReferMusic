/**
 * Release APK Gradle entry — Windows uses subst + short GRADLE_USER_HOME (MAX_PATH).
 * Does not affect app runtime; build tooling only.
 */
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..', '..');
const androidDir = path.join(__dirname, '..', 'android');

const syncResult = spawnSync('node', [path.join(__dirname, 'sync-nrm-brand.mjs')], {
  stdio: 'inherit',
});
if (syncResult.status !== 0) {
  process.exit(syncResult.status ?? 1);
}

if (process.platform === 'win32') {
  const ps1 = path.join(repoRoot, 'scripts', 'Invoke-NrmAndroidReleaseBuild.ps1');
  const result = spawnSync(
    'powershell',
    ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', ps1, '-RepoRoot', repoRoot],
    { stdio: 'inherit' },
  );
  process.exit(result.status ?? 1);
}

const gradlew = process.platform === 'win32' ? 'gradlew.bat' : './gradlew';
const result = spawnSync(gradlew, ['assembleRelease', '--no-daemon'], {
  cwd: androidDir,
  stdio: 'inherit',
  shell: true,
});
process.exit(result.status ?? 1);
