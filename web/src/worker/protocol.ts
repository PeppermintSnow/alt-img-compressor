import type { CompressResult, DecompressResult, Params, PdaTrace } from '../core/contract';

export type Request =
  | { id: number; type: 'compress'; pixels: Uint8Array; size: number; params: Params }
  | { id: number; type: 'decompress'; container: Uint8Array }
  | { id: number; type: 'trace'; structure: string; size: number; B: number; limit: number };

export type ResultOf<T extends Request['type']> =
  T extends 'compress' ? CompressResult : T extends 'decompress' ? DecompressResult : PdaTrace;

export interface WireError { name: string; message: string; code?: string; stack?: string }

export type Response =
  | { id: number; ok: true; result: CompressResult | DecompressResult | PdaTrace; mock: boolean }
  | { id: number; ok: false; error: WireError };
