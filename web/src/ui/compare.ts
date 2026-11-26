export interface LosslessReport {
  ok: boolean;
  mismatches: number;
  maxDiff: number;
  first?: { x: number; y: number; expected: number; actual: number };
}

export function compareImages(expected: Uint8Array, actual: Uint8Array, n: number): LosslessReport {
  let mismatches = 0, maxDiff = 0;
  let first: LosslessReport['first'];
  const len = Math.min(expected.length, actual.length);
  for (let i = 0; i < len; i++) {
    const d = Math.abs(expected[i]! - actual[i]!);
    if (d !== 0) {
      mismatches++;
      if (d > maxDiff) maxDiff = d;
      first ??= { x: i % n, y: Math.floor(i / n), expected: expected[i]!, actual: actual[i]! };
    }
  }
  if (expected.length !== actual.length) mismatches += Math.abs(expected.length - actual.length);
  return { ok: mismatches === 0, mismatches, maxDiff, first };
}
