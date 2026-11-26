/**
 * PROVISIONAL contract between web/ and core/.
 *
 * The plan fixes only the two layer outputs:
 *   Layer 1 -> { structure, colors, residuals, deferredPixels }
 *   Layer 2 -> { freqTable, bitstream, x0 }
 * Function names and the extra fields below (streamBits, container, trace) are the UI's
 * request to the core pair. Align them on Day 1, then change ONLY src/core/adapter.ts.
 *
 * `structure` is a string over the symbols D e a d. The UI strips whitespace and "|",
 * so the core may return either "DDedd..." or the paper format "D | D e d d d | ...".
 */

export type SymbolChar = 'D' | 'e' | 'a' | 'd';

export interface Params {
  /** Smallest quadtree block (power of two, 1..size). Deferred blocks are B x B. */
  B: number;
  /** Integer tolerance for the sigma test (0..255). */
  epsilon: number;
}

export interface Layer1Result {
  structure: string;
  /** One color per e/a leaf, in preorder. */
  colors: number[];
  /** Signed residuals of the a-leaves, raster order inside each leaf, preorder. */
  residuals: number[];
  /** Raw pixels of the d-blocks (B*B each, raster order), preorder. Input of Layer 2. */
  deferredPixels: number[];
}

export interface Layer2Result {
  freqTable: Array<[symbol: number, count: number]>;
  bitstream: Uint8Array;
  /** Final ANS state. The golden 8x8 example must give 111. */
  x0: number;
}

/** Size of every stream in the container, in bits (header includes length prefixes). */
export interface StreamBits {
  header: number;
  structure: number;
  colors: number;
  residuals: number;
  deferred: number;
}

export interface CompressResult {
  size: number;
  k: number;
  params: Params;
  layer1: Layer1Result;
  layer2: Layer2Result;
  streamBits: StreamBits;
  /** The full file: header + 4 streams. Download/Load use these bytes. */
  container: Uint8Array;
  timing: { layer1Ms: number; layer2Ms: number; totalMs: number };
}

export interface DecompressResult {
  size: number;
  k: number;
  params: Params;
  pixels: Uint8Array;
  structure: string;
  streamBits: StreamBits;
  x0: number;
  timingMs: number;
}

export type PdaAction = 'split' | 'leaf-e' | 'leaf-a' | 'leaf-d';

export interface PdaStep {
  /** 0-based index of the structure symbol consumed in this step. */
  step: number;
  symbol: SymbolChar;
  action: PdaAction;
  /** Image region this step resolves. */
  region: { x: number; y: number; size: number };
  /** Stack AFTER the step, top first. Region entries look like "4@0,4" (size@x,y). */
  stack: string[];
}

export interface PdaTrace {
  steps: PdaStep[];
  /** Total number of symbols in the structure (steps may be capped by `limit`). */
  total: number;
  truncated: boolean;
}

export interface CoreAPI {
  compress(pixels: Uint8Array, size: number, params: Params): CompressResult;
  decompress(container: Uint8Array): DecompressResult;
  pdaTrace(structure: string, size: number, B: number, limit?: number): PdaTrace;
}

export type CoreErrorCode = 'BAD_ARGS' | 'BAD_MAGIC' | 'UNSUPPORTED_VERSION' | 'TRUNCATED' | 'CORRUPT';

/** Error type the UI knows how to explain. Real core errors may carry the same `code`s. */
export class CoreError extends Error {
  readonly code: CoreErrorCode;
  constructor(code: CoreErrorCode, message: string) {
    super(message);
    this.name = 'CoreError';
    this.code = code;
  }
}
