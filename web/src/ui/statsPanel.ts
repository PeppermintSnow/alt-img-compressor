import { SYMBOLS } from '../config';
import type { StreamBits, SymbolChar } from '../core/contract';
import { fmt, fmtBytes, h } from './dom';
import type { LosslessReport } from './compare';

export interface StatsInput {
  n: number;
  B: number;
  epsilon: number;
  streamBits: StreamBits;
  counts: Record<SymbolChar, number>;
  deferredPixels: number;
  distinctDeferred: number | null;
  x0: number;
  lossless: LosslessReport | null;
  timing: string;
  isMock: boolean;
}

const STREAMS: Array<[keyof StreamBits, string, string]> = [
  ['header', 'Header', '#94a3b8'],
  ['structure', 'Structure (PDA symbols)', '#8b5cf6'],
  ['colors', 'Colors (e, a leaves)', '#22a06b'],
  ['residuals', 'Residuals (a leaves)', '#3b82f6'],
  ['deferred', 'Deferred pixels (tANS)', '#f59e0b'],
];

export class StatsPanel {
  private body = h('div', { class: 'stats-body' });
  constructor(root: HTMLElement) {
    root.append(h('h2', {}, 'Results'), this.body);
    this.update(null);
  }

  update(d: StatsInput | null): void {
    this.body.replaceChildren();
    if (!d) {
      this.body.append(h('p', { class: 'muted' }, 'Load an image or a sample to see compression results.'));
      return;
    }
    const total = Object.values(d.streamBits).reduce((a, b) => a + b, 0);
    const original = d.n * d.n * 8;
    const ratio = total > 0 ? original / total : 0;
    const bpp = total / (d.n * d.n);

    const card = (label: string, value: string, sub: string, cls = ''): HTMLElement =>
      h('div', { class: `stat ${cls}` }, h('span', { class: 'stat-label' }, label), h('strong', { class: 'stat-value' }, value), h('span', { class: 'stat-sub' }, sub));

    const L = d.lossless;
    const lossCard = L === null
      ? card('Lossless check', 'n/a', 'no original in a loaded file', 'neutral')
      : L.ok
        ? card('Lossless check', '\u2713 exact', `all ${fmt(d.n * d.n)} pixels match`, 'good')
        : card('Lossless check', '\u2717 differs', `${fmt(L.mismatches)} pixels, max diff ${L.maxDiff}`, 'bad');

    this.body.append(h('div', { class: 'stat-grid' },
      card('Compression ratio', `${ratio.toFixed(2)}\u00D7`, 'vs 8-bit grayscale'),
      card('Compressed size', fmtBytes(total), `${fmt(total)} bits`),
      card('Bits per pixel', bpp.toFixed(3), `raw: 8 (${d.n}\u00D7${d.n})`),
      lossCard));

    if (L && !L.ok && L.first) {
      this.body.append(h('p', { class: 'alert bad' },
        `First mismatch at (${L.first.x}, ${L.first.y}): expected ${L.first.expected}, got ${L.first.actual}.`));
    }

    // per-stream bits
    const rows = h('div', { class: 'streams', role: 'table', 'aria-label': 'Bits per stream' });
    for (const [key, label, color] of STREAMS) {
      const bits = d.streamBits[key];
      const pct = total > 0 ? (bits / total) * 100 : 0;
      rows.append(h('div', { class: 'stream-row', role: 'row' },
        h('span', { class: 'stream-name', role: 'cell' }, h('i', { class: 'dot', style: `background:${color}` }), label),
        h('span', { class: 'stream-bits', role: 'cell' }, `${fmt(bits)} b`),
        h('span', { class: 'stream-pct', role: 'cell' }, `${pct.toFixed(1)}%`),
        h('span', { class: 'bar', 'aria-hidden': 'true' }, h('i', { style: `width:${pct.toFixed(2)}%;background:${color}` }))));
    }
    this.body.append(h('h3', {}, 'Bits per stream'), rows);

    // symbol counts
    const sym = h('div', { class: 'symbols' });
    (['D', 'e', 'a', 'd'] as SymbolChar[]).forEach((s) =>
      sym.append(h('div', { class: 'symbol', title: `${SYMBOLS[s].name}: ${SYMBOLS[s].short}` },
        h('span', { class: `chip sym-${s}` }, s),
        h('span', { class: 'symbol-text' }, h('strong', {}, fmt(d.counts[s])), h('span', { class: 'muted small' }, SYMBOLS[s].name)))));
    const nSym = d.counts.D + d.counts.e + d.counts.a + d.counts.d;
    this.body.append(h('h3', {}, 'Symbols'), sym,
      h('p', { class: 'muted small' }, `${fmt(nSym)} symbols \u00B7 ${fmt(d.counts.e + d.counts.a + d.counts.d)} leaves \u00B7 ${fmt(d.counts.d)} deferred blocks = ${fmt(d.deferredPixels)} pixels (B=${d.B}, \u03B5=${d.epsilon})`));

    // layer 2
    const k2 = h('dl', { class: 'kv' },
      h('dt', {}, 'Deferred pixels'), h('dd', {}, fmt(d.deferredPixels)),
      h('dt', {}, 'Distinct values (K)'), h('dd', {}, d.distinctDeferred === null ? '\u2014' : fmt(d.distinctDeferred)),
      h('dt', {}, 'Final ANS state x\u2080'), h('dd', {}, d.isMock ? '\u2014 (mock core)' : fmt(d.x0)));
    this.body.append(h('h3', {}, 'Layer 2 (tANS)'), k2);
    if (d.isMock) this.body.append(h('p', { class: 'alert warn' }, 'Mock core: Layer 2 is a Huffman stand-in, so tANS numbers are placeholders.'));
    this.body.append(h('p', { class: 'muted small' }, d.timing));
  }
}
