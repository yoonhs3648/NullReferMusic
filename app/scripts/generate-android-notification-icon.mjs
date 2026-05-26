/**
 * 메인 CI(icon.png)에서 Android 다운로드 알림용 아이콘 생성.
 * - small icon: 흰 로고 실루엣(알파) + notification_icon_color 검은 배경 원
 * - drawable-*dpi/notification_icon.png
 */
import { generateImageAsync } from '@expo/image-utils';
import fs from 'fs';
import path from 'path';
import { PNG } from 'pngjs';

const PROJECT_ROOT = path.resolve(import.meta.dirname, '..');
const SRC = path.join(PROJECT_ROOT, 'assets/images/icon.png');
const OUT_ASSET = path.join(PROJECT_ROOT, 'assets/images/notification-icon.png');
const ANDROID_RES = path.join(PROJECT_ROOT, 'android/app/src/main/res');
const BASELINE_PX = 24;
const OUT_ASSET_PX = 96;
const LOGO_FILL_RATIO = 0.82;
const DPI = {
  mdpi: 1,
  hdpi: 1.5,
  xhdpi: 2,
  xxhdpi: 3,
  xxxhdpi: 4,
};

function findLogoBounds(png) {
  const { width, height, data } = png;
  let minX = width;
  let minY = height;
  let maxX = 0;
  let maxY = 0;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const lum = (data[i] * 299 + data[i + 1] * 587 + data[i + 2] * 114) / 1000;
      if (lum > 48) {
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
      }
    }
  }
  if (maxX < minX) return null;
  return { minX, minY, maxX, maxY };
}

/** 검은 배경 제거 → 투명 + 흰 실루엣, 로고를 캔버스 대부분으로 확대 */
function makeNotificationSilhouette(inputPath, outputPath, outSize) {
  const src = PNG.sync.read(fs.readFileSync(inputPath));
  const bounds = findLogoBounds(src);
  if (!bounds) throw new Error('No logo pixels in ' + inputPath);

  const cropW = bounds.maxX - bounds.minX + 1;
  const cropH = bounds.maxY - bounds.minY + 1;
  const target = Math.round(outSize * LOGO_FILL_RATIO);
  const scale = target / Math.max(cropW, cropH);
  const outW = Math.round(cropW * scale);
  const outH = Math.round(cropH * scale);

  const out = new PNG({ width: outSize, height: outSize });
  const ox = Math.floor((outSize - outW) / 2);
  const oy = Math.floor((outSize - outH) / 2);

  for (let y = 0; y < outSize; y++) {
    for (let x = 0; x < outSize; x++) {
      const oi = (y * outSize + x) * 4;
      out.data[oi] = 0;
      out.data[oi + 1] = 0;
      out.data[oi + 2] = 0;
      out.data[oi + 3] = 0;

      const sx = Math.floor((x - ox) / scale) + bounds.minX;
      const sy = Math.floor((y - oy) / scale) + bounds.minY;
      if (x < ox || y < oy || x >= ox + outW || y >= oy + outH) continue;
      if (sx < 0 || sy < 0 || sx >= src.width || sy >= src.height) continue;

      const si = (sy * src.width + sx) * 4;
      const lum =
        (src.data[si] * 299 + src.data[si + 1] * 587 + src.data[si + 2] * 114) /
        1000;
      if (lum > 40) {
        out.data[oi] = 255;
        out.data[oi + 1] = 255;
        out.data[oi + 2] = 255;
        out.data[oi + 3] = 255;
      }
    }
  }

  fs.writeFileSync(outputPath, PNG.sync.write(out));
}

async function writeDpiIcons() {
  for (const [dpi, scale] of Object.entries(DPI)) {
    const folder = path.join(ANDROID_RES, `drawable-${dpi}`);
    fs.mkdirSync(folder, { recursive: true });
    const size = Math.round(BASELINE_PX * scale);
    const { source } = await generateImageAsync(
      { projectRoot: PROJECT_ROOT, cacheType: 'android-notification' },
      {
        src: OUT_ASSET,
        width: size,
        height: size,
        resizeMode: 'contain',
        backgroundColor: 'transparent',
      },
    );
    fs.writeFileSync(path.join(folder, 'notification_icon.png'), source);
  }
}

function ensureNotificationColor() {
  const colorsPath = path.join(ANDROID_RES, 'values/colors.xml');
  let xml = fs.readFileSync(colorsPath, 'utf8');
  if (xml.includes('notification_icon_color')) {
    xml = xml.replace(
      /<color name="notification_icon_color">[^<]*<\/color>/,
      '<color name="notification_icon_color">#000000</color>',
    );
  } else {
    xml = xml.replace(
      '</resources>',
      '  <color name="notification_icon_color">#000000</color>\n</resources>',
    );
  }
  fs.writeFileSync(colorsPath, xml);
}

makeNotificationSilhouette(SRC, OUT_ASSET, OUT_ASSET_PX);
await writeDpiIcons();
ensureNotificationColor();
console.log('Android notification_icon generated from', SRC);
