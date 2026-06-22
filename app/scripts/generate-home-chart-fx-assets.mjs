/**
 * Generate raster FX assets for home chart podium.
 * Raster assets render consistently across web, Expo Go, and release APK.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const dir = path.join(root, 'assets', 'images', 'home-chart');

const TIERS = {
  gold: {
    // 다크모드용: 검은 배경 위에서 밝게 빛나는 금색
    glowDark: { color: [255, 198, 64], aStart: 0.92, aEnd: 0.5 },
    // 라이트모드용: 밝은 배경에서도 또렷한 진한 금색
    glowLight: { color: [201, 132, 8], aStart: 0.8, aEnd: 0.46 },
    glint: {
      core: [255, 255, 245],
      ray: [255, 228, 118],
    },
  },
  silver: {
    glowDark: { color: [200, 220, 240], aStart: 0.92, aEnd: 0.5 },
    glowLight: { color: [78, 112, 144], aStart: 0.8, aEnd: 0.46 },
    glint: {
      core: [255, 255, 255],
      ray: [220, 232, 244],
    },
  },
  bronze: {
    glowDark: { color: [230, 138, 66], aStart: 0.92, aEnd: 0.5 },
    glowLight: { color: [156, 76, 24], aStart: 0.8, aEnd: 0.46 },
    glint: {
      core: [255, 248, 238],
      ray: [232, 176, 128],
    },
  },
};

function clamp01(v) {
  return Math.max(0, Math.min(1, v));
}

function mix(a, b, t) {
  return a + (b - a) * t;
}

function addPixel(data, width, x, y, rgb, alpha) {
  if (x < 0 || y < 0 || x >= width || y >= data.length / (width * 4)) return;
  const i = (y * width + x) * 4;
  const a = clamp01(alpha);
  const inv = 1 - a;
  data[i] = Math.round(data[i] * inv + rgb[0] * a);
  data[i + 1] = Math.round(data[i + 1] * inv + rgb[1] * a);
  data[i + 2] = Math.round(data[i + 2] * inv + rgb[2] * a);
  data[i + 3] = Math.round(255 * (a + (data[i + 3] / 255) * (1 - a)));
}

function addEllipticalGlow(data, width, height, spec, colors) {
  const { cx, cy, rx, ry, alpha } = spec;
  const minX = Math.max(0, Math.floor(cx - rx));
  const maxX = Math.min(width - 1, Math.ceil(cx + rx));
  const minY = Math.max(0, Math.floor(cy - ry));
  const maxY = Math.min(height - 1, Math.ceil(cy + ry));

  for (let y = minY; y <= maxY; y += 1) {
    for (let x = minX; x <= maxX; x += 1) {
      const nx = (x - cx) / rx;
      const ny = (y - cy) / ry;
      const d = Math.sqrt(nx * nx + ny * ny);
      if (d >= 1) continue;

      const falloff = Math.pow(1 - d, 1.85);
      const t = clamp01(d / 0.86);
      const rgb =
        t < 0.38
          ? colors.core.map((c, i) => mix(c, colors.mid[i], t / 0.38))
          : colors.mid.map((c, i) => mix(c, colors.wash[i], (t - 0.38) / 0.62));
      addPixel(data, width, x, y, rgb, alpha * falloff);
    }
  }
}

/** 앵커→타깃 방향으로 길이에 따라 반경/진하기가 변하는 빔 콘. 한 가지 색으로 채운다. */
function addTaperedBeam(data, width, height, spec) {
  const { x0, y0, x1, y1, rStart, rEnd, aStart, aEnd, color, power = 1.5 } = spec;
  const dx = x1 - x0;
  const dy = y1 - y0;
  const len2 = dx * dx + dy * dy || 1;
  const rMax = Math.max(rStart, rEnd);
  const minX = Math.max(0, Math.floor(Math.min(x0, x1) - rMax));
  const maxX = Math.min(width - 1, Math.ceil(Math.max(x0, x1) + rMax));
  const minY = Math.max(0, Math.floor(Math.min(y0, y1) - rMax));
  const maxY = Math.min(height - 1, Math.ceil(Math.max(y0, y1) + rMax));

  for (let y = minY; y <= maxY; y += 1) {
    for (let x = minX; x <= maxX; x += 1) {
      const t = clamp01(((x - x0) * dx + (y - y0) * dy) / len2);
      const px = x0 + dx * t;
      const py = y0 + dy * t;
      const r = rStart + (rEnd - rStart) * t;
      const d = Math.hypot(x - px, y - py);
      if (d > r) continue;
      const along = aStart + (aEnd - aStart) * t;
      const radial = Math.pow(1 - d / r, power);
      addPixel(data, width, x, y, color, along * radial);
    }
  }
}

async function generateGlow(name, mode, glow) {
  // 가로로 넓게(빔이 화면 좌우 끝까지 뻗도록) 그린 뒤 컴포넌트에서 화면 폭에 stretch 한다.
  const width = 1280;
  const height = 900;
  const data = Buffer.alloc(width * height * 4);
  const ax = width / 2;
  const ay = 48;
  const { color, aStart, aEnd } = glow;

  // 앨범커버 바로 아래 중앙 bloom
  addEllipticalGlow(
    data,
    width,
    height,
    { cx: ax, cy: 150, rx: 300, ry: 150, alpha: aStart * 0.9 },
    { core: color, mid: color, wash: color },
  );

  // 5시·7시 방향 — 화면 좌우 하단 끝까지 뻗는 메인 빔
  addTaperedBeam(data, width, height, {
    x0: ax, y0: 70, x1: 28, y1: height - 16,
    rStart: 90, rEnd: 150, aStart, aEnd, color,
  });
  addTaperedBeam(data, width, height, {
    x0: ax, y0: 70, x1: width - 28, y1: height - 16,
    rStart: 90, rEnd: 150, aStart, aEnd, color,
  });

  // 뒤쪽 넓고 옅은 확산 빔 (부피감)
  addTaperedBeam(data, width, height, {
    x0: ax, y0: 60, x1: 150, y1: height - 8,
    rStart: 140, rEnd: 250, aStart: aStart * 0.42, aEnd: aEnd * 0.5, color, power: 1.2,
  });
  addTaperedBeam(data, width, height, {
    x0: ax, y0: 60, x1: width - 150, y1: height - 8,
    rStart: 140, rEnd: 250, aStart: aStart * 0.42, aEnd: aEnd * 0.5, color, power: 1.2,
  });

  const suffix = mode === 'light' ? '-light' : '';
  await sharp(data, { raw: { width, height, channels: 4 } })
    .blur(18)
    .png({ compressionLevel: 9, adaptiveFiltering: true })
    .toFile(path.join(dir, `podium-glow-${name}${suffix}.png`));
}

function addLineGlow(data, width, height, x0, y0, x1, y1, rgb, alpha, radius) {
  const minX = Math.max(0, Math.floor(Math.min(x0, x1) - radius));
  const maxX = Math.min(width - 1, Math.ceil(Math.max(x0, x1) + radius));
  const minY = Math.max(0, Math.floor(Math.min(y0, y1) - radius));
  const maxY = Math.min(height - 1, Math.ceil(Math.max(y0, y1) + radius));
  const dx = x1 - x0;
  const dy = y1 - y0;
  const len2 = dx * dx + dy * dy || 1;

  for (let y = minY; y <= maxY; y += 1) {
    for (let x = minX; x <= maxX; x += 1) {
      const t = clamp01(((x - x0) * dx + (y - y0) * dy) / len2);
      const px = x0 + dx * t;
      const py = y0 + dy * t;
      const d = Math.hypot(x - px, y - py);
      if (d > radius) continue;
      addPixel(data, width, x, y, rgb, alpha * Math.pow(1 - d / radius, 1.3));
    }
  }
}

async function generateGlint(name, colors) {
  const width = 160;
  const height = 160;
  const cx = width / 2;
  const cy = height / 2;
  const data = Buffer.alloc(width * height * 4);

  addLineGlow(data, width, height, cx, 4, cx, height - 4, colors.ray, 0.7, 2.1);
  addLineGlow(data, width, height, 4, cy, width - 4, cy, colors.ray, 0.62, 1.9);
  addLineGlow(data, width, height, cx - 30, cy - 30, cx + 30, cy + 30, colors.ray, 0.26, 1.15);
  addLineGlow(data, width, height, cx + 30, cy - 30, cx - 30, cy + 30, colors.ray, 0.26, 1.15);
  addEllipticalGlow(data, width, height, { cx, cy, rx: 28, ry: 28, alpha: 0.78 }, {
    core: colors.core,
    mid: colors.ray,
    wash: colors.ray,
  });

  await sharp(data, { raw: { width, height, channels: 4 } })
    .blur(0.4)
    .png({ compressionLevel: 9, adaptiveFiltering: true })
    .toFile(path.join(dir, `rank-glint-${name}.png`));
}

for (const [name, tier] of Object.entries(TIERS)) {
  await generateGlow(name, 'dark', tier.glowDark);
  await generateGlow(name, 'light', tier.glowLight);
  await generateGlint(name, tier.glint);
  console.log('generated fx', name);
}
