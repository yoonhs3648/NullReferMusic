/**
 * 네이티브 스플래시(splashscreen_logo) 생성. 소스: tempLogo.png
 *
 * Android 12+ SplashScreen animated icon은 원형 마스크(약 2/3 safe zone)를 쓰므로
 * 가장자리에 여백을 두고, density별 고해상도 PNG를 만든다(소스 1024 초과 업스케일 금지).
 */
import sharp from 'sharp';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const src = path.join(root, 'assets', 'images', 'tempLogo.png');

/** 원형 마스크에 잘리지 않도록 캔버스 대비 로고 비율 (≈ safe zone) */
const LOGO_RATIO = 0.66;
const BG = { r: 12, g: 12, b: 18, alpha: 1 };

async function makeSplashLogo(destPath, size) {
  const logoSize = Math.max(1, Math.round(size * LOGO_RATIO));
  const logo = await sharp(src)
    .resize(logoSize, logoSize, {
      kernel: sharp.kernel.lanczos3,
      fit: 'contain',
      background: BG,
    })
    .png()
    .toBuffer();

  await sharp({
    create: {
      width: size,
      height: size,
      channels: 4,
      background: BG,
    },
  })
    .composite([{ input: logo, gravity: 'centre' }])
    .png({ compressionLevel: 6 })
    .toFile(destPath);

  console.log('splash:', destPath, `${size}x${size} (logo ${logoSize})`);
}

/** animated icon / windowBackground용 density별 px */
const drawableSizes = [
  ['drawable-mdpi', 288],
  ['drawable-hdpi', 432],
  ['drawable-xhdpi', 576],
  ['drawable-xxhdpi', 864],
  ['drawable-xxxhdpi', 1024],
];

const resBase = path.join(root, 'android', 'app', 'src', 'main', 'res');
for (const [dir, size] of drawableSizes) {
  await makeSplashLogo(path.join(resBase, dir, 'splashscreen_logo.png'), size);
}

console.log('All splash images generated from tempLogo.png');
