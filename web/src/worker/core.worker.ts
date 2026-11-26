// Runs the core off the main thread. Everything the UI needs from core/ goes through here.
import { core, isMock } from '../core/adapter';
import type { Request, Response, WireError } from './protocol';

const ctx = self as unknown as {
  postMessage(msg: Response): void;
  onmessage: ((e: MessageEvent<Request>) => void) | null;
};

function wire(e: unknown): WireError {
  const x = e as { name?: string; message?: string; code?: string; stack?: string };
  return { name: x?.name ?? 'Error', message: x?.message ?? String(e), code: x?.code, stack: x?.stack };
}

ctx.onmessage = (e) => {
  const req = e.data;
  try {
    let result;
    switch (req.type) {
      case 'compress': result = core.compress(req.pixels, req.size, req.params); break;
      case 'decompress': result = core.decompress(req.container); break;
      case 'trace': result = core.pdaTrace(req.structure, req.size, req.B, req.limit); break;
    }
    ctx.postMessage({ id: req.id, ok: true, result, mock: isMock });
  } catch (err) {
    ctx.postMessage({ id: req.id, ok: false, error: wire(err) });
  }
};
