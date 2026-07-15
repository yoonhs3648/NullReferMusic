/**
 * Ensures youtubei.js has the SearchMobileHeader patch applied.
 * Without it, Android InnerTube search throws:
 *   Cannot cast SearchMobileHeader to one of SearchHeader
 * and falls back to web on every query.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const searchJs = path.join(
  root,
  'node_modules',
  'youtubei.js',
  'dist',
  'src',
  'parser',
  'youtube',
  'Search.js',
);
const mobileHeaderJs = path.join(
  root,
  'node_modules',
  'youtubei.js',
  'dist',
  'src',
  'parser',
  'classes',
  'SearchMobileHeader.js',
);

function fail(msg) {
  console.error(`[verify-youtubei-search-mobile-header] ${msg}`);
  console.error('Run: npx patch-package');
  process.exit(1);
}

if (!fs.existsSync(searchJs)) {
  fail(`missing ${path.relative(root, searchJs)}`);
}
if (!fs.existsSync(mobileHeaderJs)) {
  fail(`missing ${path.relative(root, mobileHeaderJs)} — SearchMobileHeader patch not applied`);
}

const src = fs.readFileSync(searchJs, 'utf8');
if (!src.includes('SearchMobileHeader')) {
  fail(`${path.relative(root, searchJs)} does not mention SearchMobileHeader — patch not applied`);
}
if (/\.as\(\s*SearchHeader\s*\)/.test(src) && !src.includes('SearchMobileHeader')) {
  fail(`${path.relative(root, searchJs)} still casts header to SearchHeader only`);
}

console.log('[verify-youtubei-search-mobile-header] OK');
