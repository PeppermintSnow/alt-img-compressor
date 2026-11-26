import { LIMITS, STRICT_POW2 } from '../config';
import { AppError } from '../errors';
import { isPow2, toGray } from './gray';

export type FitMode = 'crop' | 'stretch';

export interface FitPlan {
  target: number;
  native: boolean;
  mode: FitMode;
  /** source rectangle that gets drawn into the target x target square */
  sx: number; sy: number; sw: number; sh: number;
}

/** Decide how to turn a w x h picture into a power-of-two square (pure, unit-tested). */
export function planFit(w: number, h: number, want: { target?: number; mode?: FitMode } = {}): FitPlan {
  const native = w === h && isPow2(w) && w >= LIMITS.MIN_SIZE && w <= LIMITS.MAX_SIZE;
  const mode = want.mode ?? 'crop';
  if (native) return { target: w, native, mode, sx: 0, sy: 0, sw: w, sh: h };
  let target = want.target;
  if (!target) {
    target = LIMITS.MIN_SIZE;
    const cap = Math.min(LIMITS.MAX_SIZE, Math.max(w, h));
    while (target * 2 <= cap) target *= 2;
  }
  if (mode === 'stretch') return { target, native, mode, sx: 0, sy: 0, sw: w, sh: h };
  const side = Math.min(w, h);
  return { target, native, mode, sx: Math.floor((w - side) / 2), sy: Math.floor((h - side) / 2), sw: side, sh: side };
}

export async function decodeImage(file: File): Promise<ImageBitmap> {
  if (!file.type.startsWith('image/')) {
    throw new AppError('NOT_IMAGE', `"${file.name}" is not an image.`, { hint: 'Use PNG, JPEG, WebP, GIF or BMP.' });
  }
  if (file.size > LIMITS.MAX_FILE_BYTES) {
    throw new AppError('FILE_TOO_LARGE', 'That image is larger than 20 MB.', { hint: 'Downscale it first; the codec only handles up to 512\u00D7512.' });
  }
  try {
    return await createImageBitmap(file);
  } catch (e) {
    throw new AppError('DECODE_FAILED', 'The browser could not read that image.', { hint: 'The file may be corrupted or in an unsupported format.', detail: String(e) });
  }
}

/** Draw the plan onto a white square canvas and return the 8-bit grayscale pixels. */
export function renderPlan(bitmap: ImageBitmap, plan: FitPlan): Uint8Array {
  if (STRICT_POW2 && !plan.native) {
    throw new AppError('NOT_POW2', `Only power-of-two squares are accepted (got ${bitmap.width}\u00D7${bitmap.height}).`, { hint: 'Resize it to 64, 128, 256 or 512 pixels square.' });
  }
  const n = plan.target;
  const canvas = document.createElement('canvas');
  canvas.width = n; canvas.height = n;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new AppError('DECODE_FAILED', 'Canvas is not available in this browser.');
  ctx.fillStyle = '#fff'; // transparent pixels become white before grayscale
  ctx.fillRect(0, 0, n, n);
  ctx.imageSmoothingEnabled = !plan.native; // 1:1 copy for native sizes
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(bitmap, plan.sx, plan.sy, plan.sw, plan.sh, 0, 0, n, n);
  return toGray(ctx.getImageData(0, 0, n, n).data, n * n);
}

export function resizeWarning(w: number, h: number, plan: FitPlan): string | null {
  if (plan.native) return null;
  const how = plan.mode === 'crop' ? 'center-cropped to a square, then scaled' : 'stretched to a square';
  return `Resized ${w}\u00D7${h} \u2192 ${plan.target}\u00D7${plan.target} (${how}). Resizing is not lossless relative to your original file; the codec is lossless relative to this resized grayscale image.`;
}

export function baseName(name: string): string {
  return name.replace(/\.[^.]+$/, '').replace(/[^\w-]+/g, '_') || 'image';
}
