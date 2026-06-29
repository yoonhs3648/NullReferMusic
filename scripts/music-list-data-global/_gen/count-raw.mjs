import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const yearRawDir = path.join(path.dirname(fileURLToPath(import.meta.url)), 'year-raw');
for (let y = 2000; y <= 2025; y++) {
  const p = path.join(yearRawDir, `${y}.mjs`);
  if (!fs.existsSync(p)) {
    console.log(`${y}: missing`);
    continue;
  }
  const m = fs.readFileSync(p, 'utf8').match(/"([^"]+)"/g);
  console.log(`${y}: ${m?.length ?? 0}`);
}
