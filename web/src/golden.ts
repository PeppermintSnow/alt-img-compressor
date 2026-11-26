/**
 * Acceptance ("golden") test from the plan: 8x8 worked example, k = 3, epsilon = 10, B = 2.
 */
export const GOLDEN = {
  k: 3,
  size: 8,
  epsilon: 10,
  B: 2,
  structure: 'D | D e d d d | D d e e d | D d e e a | D d d d d',
  symbols: 21,
  deferredBlocks: 10,
  deferredPixels: 40,
  x0: 111,
};

/**
 * TODO: paste the 64 pixel values (row-major) of the worked example from the paper / Appendix B.
 * While this is null, the golden panel runs on the stand-in below, which only exercises the
 * structure string and the counts; x0 and the round trip can only be confirmed with the real data.
 */
export const GOLDEN_PIXELS: Uint8Array | null = null;

type Kind = 'e' | 'a' | 'd';
// Quadrants NW, NE, SW, SE; blocks inside each in the same order. Matches the golden structure.
const STAND_IN_LAYOUT: Kind[][] = [
  ['e', 'd', 'd', 'd'],
  ['d', 'e', 'e', 'd'],
  ['d', 'e', 'e', 'a'],
  ['d', 'd', 'd', 'd'],
];

/** An 8x8 image invented to produce the golden structure under the mock rules (NOT the paper's pixels). */
export function buildStandIn(): Uint8Array {
  const px = new Uint8Array(64);
  const bases = [96, 128, 160, 190];
  const detail = [[0, 220, 40, 255], [250, 10, 180, 60], [30, 240, 90, 200]];
  let d = 0;
  STAND_IN_LAYOUT.forEach((blocks, q) => {
    blocks.forEach((kind, b) => {
      const ox = (q % 2) * 4 + (b % 2) * 2;
      const oy = Math.floor(q / 2) * 4 + Math.floor(b / 2) * 2;
      const base = bases[(q + b) % bases.length]!;
      const vals: number[] =
        kind === 'e' ? [base, base, base, base]
        : kind === 'a' ? [base, base + 2, base - 1, base + 1]
        : detail[d++ % detail.length]!;
      for (let i = 0; i < 4; i++) px[(oy + (i >> 1)) * 8 + ox + (i & 1)] = vals[i]!;
    });
  });
  return px;
}

export const STAND_IN_PIXELS = buildStandIn();
