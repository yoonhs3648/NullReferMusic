import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { trackKey } from '../../music-list-shared.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoScripts = path.join(__dirname, '..', '..');

const dirs = ['music-list-data', 'music-list-data-global'];
const keys = new Set();
const korean = [];

for (const dir of dirs) {
  const full = path.join(repoScripts, dir);
  for (const f of fs.readdirSync(full).filter((x) => x.endsWith('.json'))) {
    for (const r of JSON.parse(fs.readFileSync(path.join(full, f), 'utf8'))) {
      keys.add(trackKey(r.artist, r.title));
      const blob = `${r.artist} ${r.title}`.toLowerCase();
      if (
        /psy|bts|blackpink|big ?bang|g-?dragon|zico|epik|dynamic duo|dean|crush|heize|jay park|loco|gray|simon d|punchnello|colde|bobby|mino|tablo|primary|beenzino|palo alto|verbal|dok2|the qui|don mills|deepflow|nafla|loopy|kid milli|changmo|ph-1|coogie|giriboy|swings|illinit|myun|leessang|drunken tiger|tiger jk|yoon mi|yoonmirae|mc sniper|mc mong|mc몽|outsider|san e|san\.e|mad clown|madclown|jessi|korean/i.test(
          blob,
        )
      ) {
        korean.push({ f, artist: r.artist, title: r.title });
      }
    }
  }
}

console.log('exclude count:', keys.size);
console.log('korean-ish in global:', korean.length);
for (const x of korean) console.log(JSON.stringify(x));
