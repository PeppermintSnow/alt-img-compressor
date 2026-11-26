import { SYMBOL_HEX, SYMBOLS } from '../config';
import { h } from './dom';
import { grayToRgba } from './gray';
import { buildLeafMap, type Leaf, type Region } from './quadtree';
import type { LosslessReport } from './compare';

interface Stage {
  stage: HTMLElement;
  img: HTMLCanvasElement;
  ov: HTMLCanvasElement;
  hl: HTMLCanvasElement;
  empty: HTMLElement;
  tip: HTMLElement;
  badge: HTMLElement;
}

export interface OverlayOptions { show: boolean; fill: boolean; target: 'both' | 'orig' | 'recon' }
interface HighlightState { current: Region; stack: Region[] }

/** Original + reconstruction canvases with quadtree overlay, hover tooltip, PDA highlight and decode preview. */
export class ImageViews {
  private n = 0;
  private leaves: Leaf[] = [];
  private leafMap: Int32Array = new Int32Array(0);
  private opts: OverlayOptions = { show: true, fill: false, target: 'both' };
  private hlState: HighlightState | null = null;
  private reconData: ImageData | null = null;
  private previewing = false;
  private ptr = 0;
  private painted = -1;
  private readonly orig: Stage;
  private readonly recon: Stage;

  constructor(root: HTMLElement) {
    this.orig = this.makeStage('Original', 'grayscale, 8-bit');
    this.recon = this.makeStage('Reconstruction', 'decoded from the container');
    root.append(h('div', { class: 'views-grid' }, this.orig.stage.parentElement!, this.recon.stage.parentElement!));
    const ro = new ResizeObserver(() => this.redraw());
    ro.observe(this.orig.stage);
    ro.observe(this.recon.stage);
  }

  private makeStage(title: string, sub: string): Stage {
    const img = h('canvas', { class: 'img', 'aria-hidden': 'true' });
    const ov = h('canvas', { class: 'ov', 'aria-hidden': 'true' });
    const hl = h('canvas', { class: 'hl', 'aria-label': `${title} image with block outlines` });
    const empty = h('div', { class: 'empty' }, 'Nothing to show yet');
    const tip = h('div', { class: 'tip', hidden: '' });
    const badge = h('span', { class: 'badge-mini', hidden: '' });
    const stage = h('div', { class: 'stage' }, img, ov, hl, empty, tip, badge);
    const fig = h('figure', { class: 'view' },
      h('figcaption', {}, h('strong', {}, title), h('span', { class: 'sub' }, sub)),
      stage);
    void fig;
    const s: Stage = { stage, img, ov, hl, empty, tip, badge };
    hl.addEventListener('pointermove', (e) => this.onHover(s, e));
    hl.addEventListener('pointerleave', () => { tip.hidden = true; });
    return s;
  }

  // ---- data -------------------------------------------------------------------------------------
  setImages(orig: Uint8Array | null, recon: Uint8Array | null, n: number): void {
    this.n = n;
    this.hlState = null;
    this.previewing = false; this.ptr = 0; this.painted = -1;
    const paint = (s: Stage, data: Uint8Array | null): ImageData | null => {
      s.empty.hidden = data !== null;
      s.img.width = n; s.img.height = n;
      const ctx = s.img.getContext('2d')!;
      ctx.clearRect(0, 0, n, n);
      if (!data) return null;
      const id = new ImageData(grayToRgba(data), n, n);
      ctx.putImageData(id, 0, 0);
      return id;
    };
    paint(this.orig, orig);
    this.reconData = paint(this.recon, recon);
    this.orig.empty.textContent = 'No original: this was loaded from a .tlac file';
    this.recon.empty.textContent = 'Nothing to show yet';
    this.redraw();
  }

  clear(): void {
    this.n = 0; this.leaves = []; this.leafMap = new Int32Array(0); this.hlState = null; this.reconData = null;
    for (const s of [this.orig, this.recon]) { s.empty.hidden = false; s.img.getContext('2d')?.clearRect(0, 0, s.img.width, s.img.height); s.badge.hidden = true; }
    this.orig.empty.textContent = 'Nothing to show yet';
    this.redraw();
  }

  setLeaves(leaves: Leaf[]): void {
    this.leaves = leaves;
    this.leafMap = this.n ? buildLeafMap(leaves, this.n) : new Int32Array(0);
    this.redraw();
  }

  setLossless(report: LosslessReport | null): void {
    const b = this.recon.badge;
    if (!report) { b.hidden = true; return; }
    b.hidden = false;
    b.className = `badge-mini ${report.ok ? 'ok' : 'bad'}`;
    b.textContent = report.ok ? '\u2713 identical' : `\u2717 ${report.mismatches} differ`;
  }

  setOverlay(o: OverlayOptions): void { this.opts = o; this.redraw(); }

  setHighlight(current: Region | null, stack: Region[]): void {
    this.hlState = current ? { current, stack } : null;
    this.drawHighlight();
  }

  /** Progressive decode on the reconstruction: paint leaves whose symbol index <= upTo (-1 = none, null = full image). */
  previewDecoded(upTo: number | null): void {
    const s = this.recon;
    const ctx = s.img.getContext('2d')!;
    const data = this.reconData;
    if (!data) return;
    if (upTo === null) {
      if (this.previewing) ctx.putImageData(data, 0, 0);
      this.previewing = false; this.ptr = 0; this.painted = -1;
      return;
    }
    if (!this.previewing || upTo < this.painted) {
      ctx.clearRect(0, 0, s.img.width, s.img.height);
      this.ptr = 0; this.painted = -1;
    }
    this.previewing = true;
    while (this.ptr < this.leaves.length && this.leaves[this.ptr]!.symIndex <= upTo) {
      const l = this.leaves[this.ptr++]!;
      ctx.putImageData(data, 0, 0, l.x, l.y, l.size, l.size);
    }
    this.painted = upTo;
  }

  // ---- drawing ----------------------------------------------------------------------------------
  private stages(): Array<[Stage, boolean]> {
    const t = this.opts.target;
    return [[this.orig, t !== 'recon'], [this.recon, t !== 'orig']];
  }

  private redraw(): void {
    for (const [s, on] of this.stages()) this.drawOverlay(s, on && this.opts.show);
    this.drawHighlight();
  }

  private sizeLayer(s: Stage): number {
    const dpr = window.devicePixelRatio || 1;
    const w = Math.max(1, Math.round(s.stage.clientWidth * dpr));
    for (const c of [s.ov, s.hl]) if (c.width !== w || c.height !== w) { c.width = w; c.height = w; }
    return w;
  }

  private drawOverlay(s: Stage, enabled: boolean): void {
    const w = this.sizeLayer(s);
    const ctx = s.ov.getContext('2d')!;
    ctx.clearRect(0, 0, w, w);
    if (!enabled || !this.n || this.leaves.length === 0) return;
    const dpr = window.devicePixelRatio || 1;
    const k = w / this.n;
    ctx.lineWidth = Math.max(1, dpr);
    for (const l of this.leaves) {
      const ps = l.size * k;
      const col = SYMBOL_HEX[l.sym];
      if (this.opts.fill) { ctx.globalAlpha = 0.3; ctx.fillStyle = col; ctx.fillRect(l.x * k, l.y * k, ps, ps); }
      if (ps >= 5) {
        ctx.globalAlpha = 0.95; ctx.strokeStyle = col;
        ctx.strokeRect(l.x * k + 0.5, l.y * k + 0.5, ps - 1, ps - 1);
      } else if (!this.opts.fill) {
        ctx.globalAlpha = 0.35; ctx.fillStyle = col; ctx.fillRect(l.x * k, l.y * k, ps, ps); // too small to outline: tint
      }
    }
    ctx.globalAlpha = 1;
  }

  private drawHighlight(): void {
    for (const [s] of this.stages()) {
      const w = this.sizeLayer(s);
      const ctx = s.hl.getContext('2d')!;
      ctx.clearRect(0, 0, w, w);
      const st = this.hlState;
      if (!st || !this.n) continue;
      const dpr = window.devicePixelRatio || 1;
      const k = w / this.n;
      ctx.setLineDash([4 * dpr, 3 * dpr]);
      ctx.lineWidth = 1.5 * dpr; ctx.strokeStyle = '#f59e0b';
      for (const r of st.stack) ctx.strokeRect(r.x * k + dpr, r.y * k + dpr, r.size * k - 2 * dpr, r.size * k - 2 * dpr);
      ctx.setLineDash([]);
      const c = st.current;
      ctx.lineWidth = 4 * dpr; ctx.strokeStyle = 'rgba(0,0,0,.8)';
      ctx.strokeRect(c.x * k + 2 * dpr, c.y * k + 2 * dpr, c.size * k - 4 * dpr, c.size * k - 4 * dpr);
      ctx.lineWidth = 2 * dpr; ctx.strokeStyle = '#fff';
      ctx.strokeRect(c.x * k + 2 * dpr, c.y * k + 2 * dpr, c.size * k - 4 * dpr, c.size * k - 4 * dpr);
    }
  }

  private onHover(s: Stage, e: PointerEvent): void {
    if (!this.n || this.leaves.length === 0) { s.tip.hidden = true; return; }
    const r = s.stage.getBoundingClientRect();
    const px = Math.min(this.n - 1, Math.max(0, Math.floor(((e.clientX - r.left) / r.width) * this.n)));
    const py = Math.min(this.n - 1, Math.max(0, Math.floor(((e.clientY - r.top) / r.height) * this.n)));
    const idx = this.leafMap[py * this.n + px] ?? -1;
    const l = idx >= 0 ? this.leaves[idx] : undefined;
    if (!l) { s.tip.hidden = true; return; }
    const detail = l.color !== undefined ? ` \u00B7 color ${l.color}` : '';
    s.tip.textContent = `${l.sym} \u00B7 ${SYMBOLS[l.sym].name} \u00B7 ${l.size}\u00D7${l.size} at (${l.x}, ${l.y})${detail}`;
    s.tip.hidden = false;
    s.tip.style.left = `${Math.min(e.clientX - r.left + 12, r.width - 8)}px`;
    s.tip.style.top = `${Math.min(e.clientY - r.top + 12, r.height - 8)}px`;
  }
}
