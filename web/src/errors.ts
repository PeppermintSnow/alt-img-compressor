export type ErrorCode =
  | 'NOT_IMAGE' | 'FILE_TOO_LARGE' | 'DECODE_FAILED' | 'NOT_POW2' | 'BAD_PARAMS'
  | 'BAD_CONTAINER' | 'CORE_ERROR' | 'WORKER_CRASH' | 'TIMEOUT' | 'UNKNOWN';

export class AppError extends Error {
  readonly code: ErrorCode;
  readonly hint?: string;
  readonly detail?: string;
  constructor(code: ErrorCode, message: string, opts: { hint?: string; detail?: string } = {}) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.hint = opts.hint;
    this.detail = opts.detail;
  }
}

/** Turn anything thrown (including errors that crossed the worker boundary) into a friendly AppError. */
export function toAppError(e: unknown): AppError {
  if (e instanceof AppError) return e;
  const x = e as { message?: string; code?: string; stack?: string } | null;
  const msg = x?.message ?? String(e);
  switch (x?.code) {
    case 'BAD_MAGIC':
      return new AppError('BAD_CONTAINER', 'That file is not a .tlac container.', { hint: 'Pick a file produced by the Download button.', detail: msg });
    case 'UNSUPPORTED_VERSION':
      return new AppError('BAD_CONTAINER', 'This container was written by a different version of the format.', { hint: 'Re-create it with the current build.', detail: msg });
    case 'TRUNCATED':
      return new AppError('BAD_CONTAINER', 'The file looks cut off.', { hint: 'The download may have been interrupted. Try downloading it again.', detail: msg });
    case 'CORRUPT':
      return new AppError('BAD_CONTAINER', 'The file is damaged and cannot be decoded.', { detail: msg });
    case 'BAD_ARGS':
      return new AppError('BAD_PARAMS', msg, { hint: 'Check the size, B and \u03B5 settings.' });
  }
  return new AppError('CORE_ERROR', 'The compression core reported an error.', { hint: 'Try different settings or another image.', detail: x?.stack ?? msg });
}
