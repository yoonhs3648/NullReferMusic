/**
 * Clean crown PNG alpha fringes without changing the crown design.
 *
 * Fixes three problems from keyed stock PNGs:
 * - bright matte colors in transparent pixels
 * - tiny background speckles around the crown
 * - accidental transparent holes inside crown highlights
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const dir = path.join(root, 'assets', 'images', 'home-chart');

const CROWN_FILES = [
  { name: 'crown-gold.png', transparentRgb: [154, 114, 9], tone: 'gold' },
  { name: 'crown-bronze.png', transparentRgb: [122, 78, 42], tone: 'bronze' },
];

const NEIGHBORS = [
  [-1, 0],
  [1, 0],
  [0, -1],
  [0, 1],
  [-1, -1],
  [1, -1],
  [-1, 1],
  [1, 1],
];

function clampByte(value) {
  return Math.max(0, Math.min(255, Math.round(value)));
}

function luminance(r, g, b) {
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function idxOf(x, y, width) {
  return y * width + x;
}

function removeTinyAlphaComponents(data, width, height) {
  const visited = new Uint8Array(width * height);
  let largest = [];

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const start = idxOf(x, y, width);
      if (visited[start] || data[start * 4 + 3] === 0) continue;

      const stack = [start];
      const component = [];
      visited[start] = 1;

      while (stack.length > 0) {
        const p = stack.pop();
        component.push(p);
        const px = p % width;
        const py = Math.floor(p / width);

        for (const [dx, dy] of NEIGHBORS) {
          const nx = px + dx;
          const ny = py + dy;
          if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
          const np = idxOf(nx, ny, width);
          if (visited[np] || data[np * 4 + 3] === 0) continue;
          visited[np] = 1;
          stack.push(np);
        }
      }

      if (component.length > largest.length) {
        largest = component;
      }
    }
  }

  const keep = new Uint8Array(width * height);
  for (const p of largest) keep[p] = 1;

  for (let p = 0; p < keep.length; p += 1) {
    if (keep[p]) continue;
    data[p * 4 + 3] = 0;
  }
}

function fillInternalAlphaHoles(data, width, height) {
  const outside = new Uint8Array(width * height);
  const queue = [];

  function enqueueIfTransparent(x, y) {
    const p = idxOf(x, y, width);
    if (outside[p] || data[p * 4 + 3] !== 0) return;
    outside[p] = 1;
    queue.push(p);
  }

  for (let x = 0; x < width; x += 1) {
    enqueueIfTransparent(x, 0);
    enqueueIfTransparent(x, height - 1);
  }
  for (let y = 0; y < height; y += 1) {
    enqueueIfTransparent(0, y);
    enqueueIfTransparent(width - 1, y);
  }

  for (let q = 0; q < queue.length; q += 1) {
    const p = queue[q];
    const x = p % width;
    const y = Math.floor(p / width);
    for (const [dx, dy] of NEIGHBORS) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
      enqueueIfTransparent(nx, ny);
    }
  }

  const holes = [];
  const known = new Uint8Array(width * height);
  for (let p = 0; p < known.length; p += 1) {
    const alpha = data[p * 4 + 3];
    if (alpha > 0) {
      known[p] = 1;
    } else if (!outside[p]) {
      holes.push(p);
    }
  }

  let remaining = holes.length;
  while (remaining > 0) {
    let changed = 0;
    for (const p of holes) {
      if (known[p]) continue;
      const x = p % width;
      const y = Math.floor(p / width);
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      let count = 0;

      for (const [dx, dy] of NEIGHBORS) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
        const np = idxOf(nx, ny, width);
        if (!known[np]) continue;
        const ni = np * 4;
        r += data[ni];
        g += data[ni + 1];
        b += data[ni + 2];
        a += data[ni + 3];
        count += 1;
      }

      if (count === 0) continue;
      const i = p * 4;
      data[i] = clampByte(r / count);
      data[i + 1] = clampByte(g / count);
      data[i + 2] = clampByte(b / count);
      data[i + 3] = clampByte(Math.max(180, a / count));
      known[p] = 1;
      remaining -= 1;
      changed += 1;
    }
    if (changed === 0) break;
  }
}

function toneVisiblePixels(data, tone) {
  if (tone === 'gold') return;

  for (let i = 0; i < data.length; i += 4) {
    const alpha = data[i + 3];
    if (alpha === 0) continue;

    const y = luminance(data[i], data[i + 1], data[i + 2]);
    if (tone === 'silver') {
      const v = clampByte((y - 118) * 1.08 + 136);
      data[i] = clampByte(v + 10);
      data[i + 1] = clampByte(v + 8);
      data[i + 2] = clampByte(v + 4);
    } else if (tone === 'bronze') {
      const t = Math.max(0, Math.min(1, y / 255));
      data[i] = clampByte(54 + t * 184);
      data[i + 1] = clampByte(28 + t * 126);
      data[i + 2] = clampByte(12 + t * 66);
    }
  }
}

function setTransparentRgb(data, rgb) {
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] !== 0) continue;
    data[i] = rgb[0];
    data[i + 1] = rgb[1];
    data[i + 2] = rgb[2];
  }
}

function dropVeryLowAlphaNoise(data) {
  for (let i = 0; i < data.length; i += 4) {
    const alpha = data[i + 3];
    if (alpha >= 18) continue;
    data[i + 3] = 0;
  }
}

async function cleanCrown({ name, transparentRgb, tone }) {
  const filePath = path.join(dir, name);
  const { data, info } = await sharp(filePath).ensureAlpha().raw().toBuffer({ resolveWithObject: true });

  removeTinyAlphaComponents(data, info.width, info.height);
  fillInternalAlphaHoles(data, info.width, info.height);
  toneVisiblePixels(data, tone);
  dropVeryLowAlphaNoise(data);
  setTransparentRgb(data, transparentRgb);

  const outPath = `${filePath}.tmp.png`;
  await sharp(data, { raw: { width: info.width, height: info.height, channels: 4 } })
    .png({ compressionLevel: 9, adaptiveFiltering: true })
    .toFile(outPath);

  const fs = await import('node:fs/promises');
  await fs.rename(outPath, filePath);
  console.log('cleaned', name);
}

for (const crown of CROWN_FILES) {
  await cleanCrown(crown);
}

async function regenerateSilverFromGold() {
  const src = path.join(dir, 'crown-gold.png');
  const dest = path.join(dir, 'crown-silver.png');
  const { data, info } = await sharp(src).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const silverTransparent = [112, 112, 108];

  for (let i = 0; i < data.length; i += 4) {
    const alpha = data[i + 3];
    if (alpha === 0) {
      data[i] = silverTransparent[0];
      data[i + 1] = silverTransparent[1];
      data[i + 2] = silverTransparent[2];
      continue;
    }

    const y = luminance(data[i], data[i + 1], data[i + 2]);
    const contrast = (y - 122) * 1.05 + 138;
    data[i] = clampByte(contrast + 14);
    data[i + 1] = clampByte(contrast + 12);
    data[i + 2] = clampByte(contrast + 8);
  }

  const outPath = `${dest}.tmp.png`;
  await sharp(data, { raw: { width: info.width, height: info.height, channels: 4 } })
    .png({ compressionLevel: 9, adaptiveFiltering: true })
    .toFile(outPath);

  const fs = await import('node:fs/promises');
  await fs.rename(outPath, dest);
  console.log('regenerated crown-silver.png');
}

await regenerateSilverFromGold();
