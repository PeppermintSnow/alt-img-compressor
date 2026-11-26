import { AppError } from '../errors';
import { LIMITS } from '../config';
import type { CompressResult, DecompressResult, Params, PdaTrace } from '../core/contract';
import type { Request, Response } from './protocol';

type Pending = { resolve: (v: unknown) => void; reject: (e: unknown) => void; timer: number };
type Body = Request extends infer R ? (R extends { id: number } ? Omit<R, 'id'> : never) : never;

/** Promise wrapper around the core worker, with a watchdog and automatic restart. */
export class CoreClient {
  private worker!: Worker;
  private nextId = 1;
  private pending = new Map<number, Pending>();

  constructor() { this.spawn(); }

  private spawn(): void {
    this.worker = new Worker(new URL('./core.worker.ts', import.meta.url), { type: 'module' });
    this.worker.onmessage = (e: MessageEvent<Response>) => {
      const res = e.data;
      const p = this.pending.get(res.id);
      if (!p) return;
      window.clearTimeout(p.timer);
      this.pending.delete(res.id);
      if (res.ok) p.resolve(res.result); else p.reject(res.error);
    };
    this.worker.onerror = (ev) => {
      this.restart(new AppError('WORKER_CRASH', 'The compression worker crashed.', { hint: 'Reload the page if this keeps happening.', detail: ev.message }));
    };
  }

  private restart(reason: AppError): void {
    this.worker.terminate();
    for (const p of this.pending.values()) { window.clearTimeout(p.timer); p.reject(reason); }
    this.pending.clear();
    this.spawn();
  }

  private call<T>(body: Body): Promise<T> {
    const id = this.nextId++;
    return new Promise<T>((resolve, reject) => {
      const timer = window.setTimeout(() => {
        this.restart(new AppError('TIMEOUT', 'The core took too long and was stopped.', { hint: 'Try a smaller image or a larger B.' }));
      }, LIMITS.WORKER_TIMEOUT_MS);
      this.pending.set(id, { resolve: resolve as (v: unknown) => void, reject, timer });
      this.worker.postMessage({ ...body, id } as Request);
    });
  }

  compress(pixels: Uint8Array, size: number, params: Params): Promise<CompressResult> {
    return this.call({ type: 'compress', pixels, size, params });
  }
  decompress(container: Uint8Array): Promise<DecompressResult> {
    return this.call({ type: 'decompress', container });
  }
  pdaTrace(structure: string, size: number, B: number, limit = LIMITS.MAX_TRACE_STEPS): Promise<PdaTrace> {
    return this.call({ type: 'trace', structure, size, B, limit });
  }
}
