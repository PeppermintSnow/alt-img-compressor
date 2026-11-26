export type SampleKind = 'flat' | 'gradient' | 'shapes' | 'noise';

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Synthetic stand-ins for the validation set (upload Lena yourself): flat, smooth, edgy, worst-case. */
export function makeSample(kind: SampleKind, n: number): Uint8Array {
  const px = new Uint8Array(n * n);
  const rnd = mulberry32(2026);
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      let v: number;
      switch (kind) {
        case 'flat': v = 128; break;
        case 'gradient': v = Math.round(((x + y) / (2 * (n - 1))) * 255); break;
        case 'noise': v = Math.floor(rnd() * 256); break;
        case 'shapes': {
          v = 40 + Math.round((y / n) * 50); // soft background
          const cx = x - n * 0.35, cy = y - n * 0.4, r = n * 0.22;
          if (cx * cx + cy * cy < r * r) v = 220;
          if (x > n * 0.55 && x < n * 0.9 && y > n * 0.5 && y < n * 0.85) v = 90 + Math.round(((x - n * 0.55) / (n * 0.35)) * 60);
          if (Math.abs(x - y) < Math.max(1, n / 64)) v = 255;
          break;
        }
      }
      px[y * n + x] = v;
    }
  }
  return px;
}
