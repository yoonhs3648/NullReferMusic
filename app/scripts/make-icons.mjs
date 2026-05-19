import sharp from 'sharp';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const src = path.join(root, 'assets', 'images', 'icon.png');

async function makeIcon(destPath, size) {
  await sharp(src).resize(size, size).webp({ lossless: true }).toFile(destPath);
  console.log('icon:', destPath);
}

async function makeRoundIcon(destPath, size) {
  const half = size / 2;
  const circle = Buffer.from(
    `<svg><circle cx="${half}" cy="${half}" r="${half}"/></svg>`
  );
  await sharp(src)
    .resize(size, size)
    .composite([{ input: circle, blend: 'dest-in' }])
    .webp({ lossless: true })
    .toFile(destPath);
  console.log('round:', destPath);
}

async function makeForeground(destPath, size) {
  // icon.png(검정 배경+흰 로고) → 밝기를 알파로: 투명배경+흰 로고
  const { data, info } = await sharp(src).resize(size, size).raw().toBuffer({ resolveWithObject: true });
  const out = Buffer.alloc(info.width * info.height * 4);
  for (let i = 0; i < info.width * info.height; i++) {
    const r = data[i * 3];
    const g = data[i * 3 + 1];
    const b = data[i * 3 + 2];
    const alpha = Math.round(r * 0.299 + g * 0.587 + b * 0.114);
    out[i * 4] = 255; out[i * 4 + 1] = 255; out[i * 4 + 2] = 255;
    out[i * 4 + 3] = alpha;
  }
  await sharp(out, { raw: { width: info.width, height: info.height, channels: 4 } })
    .webp({ lossless: true })
    .toFile(destPath);
  console.log('fg:', destPath);
}

const mipmapLauncher = [
  ['mipmap-mdpi', 48],
  ['mipmap-hdpi', 72],
  ['mipmap-xhdpi', 96],
  ['mipmap-xxhdpi', 144],
  ['mipmap-xxxhdpi', 192],
];

const mipmapForeground = [
  ['mipmap-mdpi', 108],
  ['mipmap-hdpi', 162],
  ['mipmap-xhdpi', 216],
  ['mipmap-xxhdpi', 324],
  ['mipmap-xxxhdpi', 432],
];

const resBase = path.join(root, 'android', 'app', 'src', 'main', 'res');

for (const [dir, size] of mipmapLauncher) {
  await makeIcon(path.join(resBase, dir, 'ic_launcher.webp'), size);
  await makeRoundIcon(path.join(resBase, dir, 'ic_launcher_round.webp'), size);
}

for (const [dir, size] of mipmapForeground) {
  await makeForeground(path.join(resBase, dir, 'ic_launcher_foreground.webp'), size);
}

console.log('All icons generated!');
