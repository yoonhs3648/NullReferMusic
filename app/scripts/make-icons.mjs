/**
 * 런처 아이콘(ic_launcher*)만 생성. 소스: tempLogo.png
 * 인앱 logo-mark / notification-icon 등은 건드리지 않는다.
 */
import sharp from 'sharp';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const src = path.join(root, 'assets', 'images', 'tempLogo.png');

async function makeIcon(destPath, size) {
  await sharp(src).resize(size, size, { kernel: sharp.kernel.lanczos3 }).webp({ lossless: true }).toFile(destPath);
  console.log('icon:', destPath);
}

async function makeRoundIcon(destPath, size) {
  const half = size / 2;
  const circle = Buffer.from(
    `<svg><circle cx="${half}" cy="${half}" r="${half}"/></svg>`
  );
  await sharp(src)
    .resize(size, size, { kernel: sharp.kernel.lanczos3 })
    .composite([{ input: circle, blend: 'dest-in' }])
    .webp({ lossless: true })
    .toFile(destPath);
  console.log('round:', destPath);
}

async function makeForeground(destPath, size) {
  // adaptive icon 안전 영역(~66%)에 맞춰 투명 캔버스 중앙에 배치
  const foregroundSize = Math.round(size * 0.68);
  const foreground = await sharp(src)
    .resize(foregroundSize, foregroundSize, { kernel: sharp.kernel.lanczos3 })
    .png()
    .toBuffer();
  await sharp({
    create: {
      width: size,
      height: size,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite([{ input: foreground, gravity: 'center' }])
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

console.log('All icons generated from tempLogo.png');
