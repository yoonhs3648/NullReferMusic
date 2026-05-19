import sharp from 'sharp';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const src = path.join(root, 'assets', 'images', 'icon.png');

// 투명 배경 + 흰색 로고 (밝기 → 알파)
async function makeSplashLogo(destPath, logoSize, canvasSize) {
  const { data, info } = await sharp(src)
    .resize(logoSize, logoSize)
    .raw()
    .toBuffer({ resolveWithObject: true });

  const fg = Buffer.alloc(info.width * info.height * 4);
  for (let i = 0; i < info.width * info.height; i++) {
    const r = data[i * 3];
    const g = data[i * 3 + 1];
    const b = data[i * 3 + 2];
    const alpha = Math.round(r * 0.299 + g * 0.587 + b * 0.114);
    fg[i * 4] = 255; fg[i * 4 + 1] = 255; fg[i * 4 + 2] = 255;
    fg[i * 4 + 3] = alpha;
  }

  const logoImg = await sharp(fg, { raw: { width: info.width, height: info.height, channels: 4 } })
    .png()
    .toBuffer();

  // 중앙 배치 캔버스
  await sharp({
    create: {
      width: canvasSize,
      height: canvasSize,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite([{ input: logoImg, gravity: 'center' }])
    .png()
    .toFile(destPath);

  console.log('splash:', destPath);
}

const drawableSizes = [
  ['drawable-mdpi',    160, 200],
  ['drawable-hdpi',    240, 300],
  ['drawable-xhdpi',   320, 400],
  ['drawable-xxhdpi',  480, 600],
  ['drawable-xxxhdpi', 640, 800],
];

const resBase = path.join(root, 'android', 'app', 'src', 'main', 'res');
for (const [dir, logoSize, canvasSize] of drawableSizes) {
  await makeSplashLogo(
    path.join(resBase, dir, 'splashscreen_logo.png'),
    logoSize,
    canvasSize,
  );
}

console.log('All splash images generated!');
