import { AppError } from '../errors';

export function downloadBytes(bytes: Uint8Array, filename: string): void {
  const blob = new Blob([bytes as BlobPart], { type: 'application/octet-stream' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.append(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

export async function readContainer(file: File): Promise<Uint8Array> {
  if (file.size === 0) throw new AppError('BAD_CONTAINER', 'That file is empty.');
  if (file.size > 50 * 1024 * 1024) throw new AppError('FILE_TOO_LARGE', 'That file is too large to be a .tlac container.');
  return new Uint8Array(await file.arrayBuffer());
}
