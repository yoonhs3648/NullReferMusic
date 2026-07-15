/**
 * Fails if APK-update UI sources contain raw Hangul syllables.
 * User-visible Korean must use ASCII `\uXXXX` escapes only.
 *
 * Usage: node scripts/check-apk-update-copy-ascii.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.resolve(__dirname, '..');

const STRICT_FILES = [
  'lib/nrmApkUpdateCopy.ts',
  'components/nrm/NrmApkUpdateGate.tsx',
  'lib/nrmApkUpdate.ts',
];

const HANGUL_RE = /[\uAC00-\uD7A3]/;

let failed = false;

for (const rel of STRICT_FILES) {
  const abs = path.join(appRoot, rel);
  if (!fs.existsSync(abs)) {
    console.error(`[check-apk-update-copy] missing: ${rel}`);
    failed = true;
    continue;
  }
  const text = fs.readFileSync(abs, 'utf8');
  const lines = text.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    if (HANGUL_RE.test(lines[i])) {
      console.error(`[check-apk-update-copy] raw Hangul in ${rel}:${i + 1}`);
      console.error(`  ${lines[i].trim().slice(0, 120)}`);
      failed = true;
    }
  }
}

const copyAbs = path.join(appRoot, 'lib/nrmApkUpdateCopy.ts');
const copyText = fs.readFileSync(copyAbs, 'utf8');
if (!copyText.includes('\\uB2E4\\uC6B4\\uB85C\\uB4DC')) {
  console.error('[check-apk-update-copy] expected \\uXXXX download escapes missing from nrmApkUpdateCopy.ts');
  failed = true;
}

const gateText = fs.readFileSync(path.join(appRoot, 'components/nrm/NrmApkUpdateGate.tsx'), 'utf8');
if (!gateText.includes('nrmApkUpdateCopy')) {
  console.error('[check-apk-update-copy] NrmApkUpdateGate.tsx must import nrmApkUpdateCopy');
  failed = true;
}

if (failed) {
  console.error(
    '\n[check-apk-update-copy] FAILED. Put UI Korean in nrmApkUpdateCopy.ts as \\uXXXX only.\nSee docs/NRM-UTF8-HANGUL-RULE.md',
  );
  process.exit(1);
}

console.log('[check-apk-update-copy] OK — APK update UI sources are Hangul-literal-free');
