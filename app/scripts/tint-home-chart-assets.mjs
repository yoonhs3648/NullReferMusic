/**
 * crown-gold / laurel-gold → silver·bronze 변형 + 흰 배경 투명화
 * npm run generate:home-chart-assets
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const dir = path.join(root, 'assets', 'images', 'home-chart');

/** 밝은 배경·체크보 패턴을 알파로 변환 (왕관·월계수 PNG) */
async function keyLightBackgroundToAlpha(filePath) {
  const { data, info } = await sharp(filePath).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width, height, channels } = info;

  for (let i = 0; i < data.length; i += channels) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const lightness = (r + g + b) / 3;
    const chroma = max - min;

    if (lightness > 248 && chroma < 12) {
      data[i + 3] = 0;
    } else if (lightness > 228 && chroma < 28) {
      const t = Math.min(1, (lightness - 228) / 20);
      data[i + 3] = Math.round(data[i + 3] * (1 - t * 0.98));
    }
  }

  const outPath = `${filePath}.tmp.png`;
  await sharp(data, { raw: { width, height, channels: 4 } }).png().toFile(outPath);
  const fs = await import('node:fs/promises');
  await fs.rename(outPath, filePath);
}

/**
 * 왕관 알파를 RGB 기준으로 재구성·복구한다 (알파 채널이 손상돼도 RGB만 온전하면 복구 가능).
 * 배경은 단일 색([154,114,9] 등)으로 채워져 있으므로:
 *  1) 배경색과 (거의) 일치하는 픽셀 = 투명 후보
 *  2) 테두리에서 flood-fill 한 것만 진짜 배경 → 내부 구멍은 메움 (라이트 모드 흰 깨짐 제거)
 *  3) 알파에 수동 박스블러 페더링 → 하드 엣지 안티에일리어싱 (다크 모드 울퉁불퉁 제거)
 */
async function repairCrownAlpha(filePath, { tolerance = 4, featherPasses = 1 } = {}) {
  const { data, info } = await sharp(filePath).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width, height } = info;
  const n = width * height;

  // 코너 픽셀 색을 배경 기준색으로 사용
  const bgR = data[0];
  const bgG = data[1];
  const bgB = data[2];
  const isBgColor = (p) => {
    const i = p * 4;
    return (
      Math.abs(data[i] - bgR) <= tolerance &&
      Math.abs(data[i + 1] - bgG) <= tolerance &&
      Math.abs(data[i + 2] - bgB) <= tolerance
    );
  };

  // 1) 배경색 후보 표시
  const isCandidate = new Uint8Array(n);
  for (let p = 0; p < n; p += 1) isCandidate[p] = isBgColor(p) ? 1 : 0;

  // 2) 테두리에서 flood-fill → 진짜 배경만
  const bg = new Uint8Array(n);
  const stack = [];
  for (let x = 0; x < width; x += 1) {
    stack.push(x);
    stack.push((height - 1) * width + x);
  }
  for (let y = 0; y < height; y += 1) {
    stack.push(y * width);
    stack.push(y * width + width - 1);
  }
  while (stack.length) {
    const p = stack.pop();
    if (bg[p]) continue;
    if (!isCandidate[p]) continue;
    bg[p] = 1;
    const x = p % width;
    const y = (p - x) / width;
    if (x > 0) stack.push(p - 1);
    if (x < width - 1) stack.push(p + 1);
    if (y > 0) stack.push(p - width);
    if (y < height - 1) stack.push(p + width);
  }

  // 배경=0, 그 외(왕관 본체 + 내부 구멍)=255
  let alpha = new Float32Array(n);
  for (let p = 0; p < n; p += 1) alpha[p] = bg[p] ? 0 : 255;

  // 3) 수동 3x3 박스블러 페더링 (sharp 블러 라운드트립 줄무늬 버그 회피)
  const boxBlur = (src) => {
    const out = new Float32Array(n);
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        let sum = 0;
        let cnt = 0;
        for (let dy = -1; dy <= 1; dy += 1) {
          const yy = y + dy;
          if (yy < 0 || yy >= height) continue;
          for (let dx = -1; dx <= 1; dx += 1) {
            const xx = x + dx;
            if (xx < 0 || xx >= width) continue;
            sum += src[yy * width + xx];
            cnt += 1;
          }
        }
        out[y * width + x] = sum / cnt;
      }
    }
    return out;
  };
  for (let i = 0; i < featherPasses; i += 1) alpha = boxBlur(alpha);

  for (let p = 0; p < n; p += 1) {
    const v = Math.round(alpha[p]);
    data[p * 4 + 3] = v < 0 ? 0 : v > 255 ? 255 : v;
  }

  const outPath = `${filePath}.tmp.png`;
  await sharp(data, { raw: { width, height, channels: 4 } }).png().toFile(outPath);
  const fs = await import('node:fs/promises');
  await fs.rename(outPath, filePath);
}

/** 검은 배경 → 알파 (월계수 PNG) */
async function keyDarkBackgroundToAlpha(filePath) {
  const { data, info } = await sharp(filePath).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width, height, channels } = info;

  for (let i = 0; i < data.length; i += channels) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const lightness = (r + g + b) / 3;
    const chroma = max - min;

    if (lightness < 32 && chroma < 20) {
      data[i + 3] = 0;
    } else if (lightness < 52 && chroma < 32) {
      const t = Math.min(1, (52 - lightness) / 20);
      data[i + 3] = Math.round(data[i + 3] * (1 - t * 0.96));
    }
  }

  const outPath = `${filePath}.tmp.png`;
  await sharp(data, { raw: { width, height, channels: 4 } }).png().toFile(outPath);
  const fs = await import('node:fs/promises');
  await fs.rename(outPath, filePath);
}

async function tintLaurel(srcName, destName, { saturation, hue, brightness }) {
  const src = path.join(dir, srcName);
  const dest = path.join(dir, destName);
  await sharp(src).modulate({ saturation, hue, brightness }).png().toFile(dest);
  await keyDarkBackgroundToAlpha(dest);
  console.log('wrote', destName);
}

// 금 왕관 알파 복구(내부 구멍 메움 + 엣지 페더링). 은·동은 여기서 색상만 파생한다.
await repairCrownAlpha(path.join(dir, 'crown-gold.png'));
console.log('repaired', 'crown-gold.png');

await keyDarkBackgroundToAlpha(path.join(dir, 'laurel-gold.png'));
console.log('alpha', 'laurel-gold.png');

// 이미 투명 배경인 금 왕관에서 색상만 변조하고 알파는 그대로 둔다.
// (재-keying을 하면 동색의 어두운 림 하이라이트가 부분투명 구간에 걸려 구멍이 뚫림 → 깨짐)
async function tintCrownKeepAlpha(srcName, destName, opts) {
  const src = path.join(dir, srcName);
  const dest = path.join(dir, destName);
  await sharp(src).modulate(opts).png().toFile(dest);
  console.log('wrote', destName);
}

await tintCrownKeepAlpha('crown-gold.png', 'crown-silver.png', { saturation: 0.12, hue: 0, brightness: 1.08 });
await tintCrownKeepAlpha('crown-gold.png', 'crown-bronze.png', { saturation: 0.92, hue: -20, brightness: 0.74 });
await tintLaurel('laurel-gold.png', 'laurel-silver.png', { saturation: 0.1, hue: 0, brightness: 1.06 });
await tintLaurel('laurel-gold.png', 'laurel-bronze.png', { saturation: 0.9, hue: -20, brightness: 0.78 });
