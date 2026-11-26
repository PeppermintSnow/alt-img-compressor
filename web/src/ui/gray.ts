/** RGBA (already composited on white) -> 8-bit luma, integer math: (77R + 150G + 29B + 128) >> 8. */
export function toGray(rgba: Uint8ClampedArray | Uint8Array, count: number): Uint8Array {
  const out = new Uint8Array(count);
  for (let i = 0, p = 0; i < count; i++, p += 4) {
    out[i] = (77 * rgba[p]! + 150 * rgba[p + 1]! + 29 * rgba[p + 2]! + 128) >> 8;
  }
  return out;
}

export const isPow2 = (n: number): boolean => Number.isInteger(n) && n > 0 && (n & (n - 1)) === 0;

/** Gray array -> RGBA bytes for a canvas. */
export function grayToRgba(gray: Uint8Array) {
  const out = new Uint8ClampedArray(gray.length * 4);
  for (let i = 0, p = 0; i < gray.length; i++, p += 4) {
    const v = gray[i]!;
    out[p] = v; out[p + 1] = v; out[p + 2] = v; out[p + 3] = 255;
  }
  return out;
}
