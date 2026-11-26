import type { SymbolChar } from './core/contract';

export const LIMITS = {
  MIN_SIZE: 4,
  MAX_SIZE: 512, // plan: at most 512x512 (~262k values)
  MAX_FILE_BYTES: 20 * 1024 * 1024,
  MAX_TRACE_STEPS: 5000,
  WORKER_TIMEOUT_MS: 30_000,
};

/** TODO(Day-1 decision #3): replace with the agreed defaults. These are the golden-test values. */
export const DEFAULTS = { B: 2, epsilon: 10 };

/** Day-1 decision #2. false = warn and resize non-2^k images; true = reject them. */
export const STRICT_POW2 = false;

/** Child visiting order of the quadtree: NW, NE, SW, SE as [dx, dy]. Must match core/. */
export const CHILD_ORDER: ReadonlyArray<readonly [number, number]> = [[0, 0], [1, 0], [0, 1], [1, 1]];

export const FILE_EXT = 'tlac';

/** ASSUMED meaning of the symbols (see src/core/mock.ts). Confirm with the Layer 1 owner. */
export const SYMBOLS: Record<SymbolChar, { name: string; short: string; css: string }> = {
  D: { name: 'Divide', short: 'split into 4 quadrants', css: 'var(--c-D)' },
  e: { name: 'Exact', short: 'flat block: one color', css: 'var(--c-e)' },
  a: { name: 'Approximate', short: 'within \u03B5: color + residuals', css: 'var(--c-a)' },
  d: { name: 'Deferred', short: 'B\u00D7B raw pixels to tANS', css: 'var(--c-d)' },
};

export const SYMBOL_HEX: Record<SymbolChar, string> = { D: '#94a3b8', e: '#22a06b', a: '#3b82f6', d: '#f59e0b' };
