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
  // 풀컬러 CI를 adaptive icon의 안전 영역에 맞춰 투명 캔버스 중앙에 배치한다.
  const foregroundSize = Math.round(size * 0.68);
  const foreground = await sharp(src)
    .resize(foregroundSize, foregroundSize)
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

console.log('All icons generated!');
