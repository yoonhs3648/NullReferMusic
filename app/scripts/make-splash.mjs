import sharp from 'sharp';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const src = path.join(root, 'assets', 'images', 'icon.png');

// 투명 배경 중앙에 풀컬러 CI를 배치한다.
async function makeSplashLogo(destPath, logoSize, canvasSize) {
  const logoImg = await sharp(src)
    .resize(logoSize, logoSize)
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
