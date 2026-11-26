import { SYMBOLS } from '../config';
import type { PdaAction, PdaStep, PdaTrace, SymbolChar } from '../core/contract';
import { fmt, h } from './dom';
import { normalizeStructure, parseRegionLabel, type Region } from './quadtree';

export interface TraceState {
  active: boolean;
  index: number;
  step: PdaStep | null;
  stackRegions: Region[];
}

const ACTION_TEXT: Record<PdaAction, string> = {
  split: 'Divide: pop the block, push its 4 quadrants',
  'leaf-e': 'Exact leaf: pop the block, emit 1 color',
  'leaf-a': 'Approximate leaf: pop the block, emit color + residuals',
  'leaf-d': 'Deferred block: pop the block, take B\u00D7B pixels from tANS',
};

const SPEEDS = [1, 4, 15, 60, 240];

/** Step-by-step view of the PDA reading the structure string (data comes from core.pdaTrace). */
export class TraceViewer {
  private trace: PdaTrace | null = null;
  private symbols = '';
  private idx = -1;
  private active = false;
  private timer: number | null = null;
  private speed = 4;

  private readonly btnFirst = this.btn('\u23EE', 'Back to start');
  private readonly btnPrev = this.btn('\u25C0', 'Previous step');
  private readonly btnPlay = this.btn('\u25B6', 'Play');
  private readonly btnNext = this.btn('\u25B6\u2503', 'Next step');
  private readonly btnLast = this.btn('\u23ED', 'Jump to the last recorded step');
  private readonly btnExit = h('button', { type: 'button', class: 'ghost' }, 'Show final image');
  private readonly slider = h('input', { type: 'range', min: '0', max: '0', value: '0', 'aria-label': 'Trace position' });
  private readonly speedSel = h('select', { 'aria-label': 'Playback speed' });
  private readonly status = h('span', { class: 'trace-status', 'aria-live': 'polite' });
  private readonly ribbon = h('div', { class: 'ribbon', 'aria-hidden': 'true' });
  private readonly table = h('div', { class: 'trace-table', role: 'table', 'aria-label': 'PDA steps' });
  private readonly note = h('p', { class: 'muted small' });

  constructor(private root: HTMLElement, private onChange: (s: TraceState) => void) {
    SPEEDS.forEach((s) => this.speedSel.append(h('option', { value: String(s) }, `${s} step${s > 1 ? 's' : ''}/s`)));
    this.speedSel.value = String(this.speed);
    root.append(
      h('h2', {}, 'PDA trace'),
      h('p', { class: 'muted small' }, 'The decoder is a pushdown automaton: the stack holds image blocks still waiting to be read. Step through it and watch the reconstruction fill in.'),
      h('div', { class: 'trace-controls' }, this.btnFirst, this.btnPrev, this.btnPlay, this.btnNext, this.btnLast, this.speedSel, this.btnExit),
      h('div', { class: 'trace-slider' }, this.slider, this.status),
      this.ribbon, this.table, this.note);
    root.tabIndex = -1;
    this.btnFirst.onclick = () => this.go(-1);
    this.btnPrev.onclick = () => this.go(this.idx - 1);
    this.btnNext.onclick = () => this.go(this.idx + 1);
    this.btnLast.onclick = () => this.go(this.maxIdx());
    this.btnPlay.onclick = () => (this.timer === null ? this.play() : this.pause());
    this.btnExit.onclick = () => this.exit();
    this.slider.oninput = () => this.go(Number(this.slider.value) - 1);
    this.speedSel.onchange = () => { this.speed = Number(this.speedSel.value); if (this.timer !== null) { this.pause(); this.play(); } };
    root.addEventListener('keydown', (e) => {
      if ((e.target as HTMLElement).closest('select, input[type="range"]')) return;
      if (e.key === 'ArrowRight') { e.preventDefault(); this.go(this.idx + 1); }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); this.go(this.idx - 1); }
      else if (e.key === 'Home') { e.preventDefault(); this.go(-1); }
      else if (e.key === 'End') { e.preventDefault(); this.go(this.maxIdx()); }
    });
    this.render();
  }

  private btn(label: string, title: string): HTMLButtonElement {
    return h('button', { type: 'button', class: 'icon', title, 'aria-label': title }, label);
  }

  private maxIdx(): number { return (this.trace?.steps.length ?? 0) - 1; }

  setTrace(trace: PdaTrace | null, structure: string): void {
    this.pause();
    this.trace = trace;
    this.symbols = normalizeStructure(structure);
    this.idx = -1;
    this.active = false;
    this.render();
    this.emit();
  }

  /** Stop playback, leave preview mode. */
  exit(): void {
    this.pause();
    this.active = false;
    this.idx = -1;
    this.render();
    this.emit();
  }

  private go(i: number): void {
    if (!this.trace || this.trace.steps.length === 0) return;
    this.idx = Math.max(-1, Math.min(this.maxIdx(), i));
    this.active = true;
    if (this.idx === this.maxIdx() && this.timer !== null) this.pause();
    this.render();
    this.emit();
  }

  private play(): void {
    if (!this.trace || this.trace.steps.length === 0) return;
    if (this.idx >= this.maxIdx()) this.idx = -1;
    this.active = true;
    const perTick = Math.max(1, Math.round(this.speed / 30));
    const ms = Math.max(33, Math.round(1000 / Math.min(this.speed, 30)));
    this.timer = window.setInterval(() => this.go(this.idx + perTick), ms);
    this.btnPlay.textContent = '\u23F8';
    this.btnPlay.title = this.btnPlay.ariaLabel = 'Pause';
    this.render();
  }

  private pause(): void {
    if (this.timer !== null) { window.clearInterval(this.timer); this.timer = null; }
    this.btnPlay.textContent = '\u25B6';
    this.btnPlay.title = this.btnPlay.ariaLabel = 'Play';
  }

  private emit(): void {
    const step = this.active && this.idx >= 0 ? this.trace?.steps[this.idx] ?? null : null;
    const stackRegions = (step?.stack ?? []).map(parseRegionLabel).filter((r): r is Region => r !== null);
    this.onChange({ active: this.active, index: this.idx, step, stackRegions });
  }

  // ---- rendering -----------------------------------------------------------------------------------
  private render(): void {
    const t = this.trace;
    const has = !!t && t.steps.length > 0;
    for (const b of [this.btnFirst, this.btnPrev, this.btnPlay, this.btnNext, this.btnLast, this.slider, this.speedSel]) (b as HTMLButtonElement).disabled = !has;
    this.btnExit.hidden = !this.active;
    this.slider.max = String(has ? t!.steps.length : 0);
    this.slider.value = String(this.idx + 1);
    this.table.replaceChildren();
    this.ribbon.replaceChildren();
    if (!has) {
      this.status.textContent = 'No trace yet';
      this.note.textContent = '';
      return;
    }
    const total = t!.total;
    this.status.textContent = this.idx < 0 ? `Start \u00B7 ${fmt(total)} symbols to read` : `Step ${fmt(this.idx + 1)} of ${fmt(total)}`;
    this.note.textContent = t!.truncated ? `Trace limited to the first ${fmt(t!.steps.length)} of ${fmt(total)} steps to keep the page responsive.` : '';

    // symbol ribbon around the current step
    const lo = Math.max(0, this.idx - 14), hi = Math.min(this.symbols.length - 1, this.idx + 20);
    if (lo > 0) this.ribbon.append(h('span', { class: 'ellipsis' }, '\u2026'));
    for (let i = lo; i <= hi; i++) {
      const s = this.symbols[i] as SymbolChar;
      this.ribbon.append(h('span', { class: `chip sym-${s}${i === this.idx ? ' current' : ''}${i < this.idx ? ' done' : ''}` }, s));
    }
    if (hi < this.symbols.length - 1) this.ribbon.append(h('span', { class: 'ellipsis' }, '\u2026'));

    // table window
    const head = h('div', { class: 'trace-row head', role: 'row' },
      ...['Step', 'Read', 'Action', 'Block', 'Stack (top first)'].map((c) => h('span', { role: 'columnheader' }, c)));
    this.table.append(head);
    const from = Math.max(0, this.idx - 2);
    const to = Math.min(t!.steps.length - 1, from + 7);
    for (let i = from; i <= to; i++) {
      const s = t!.steps[i]!;
      const stack = h('span', { class: 'stack', role: 'cell' });
      s.stack.slice(0, 5).forEach((r) => stack.append(h('span', { class: 'chip block' }, r)));
      if (s.stack.length > 5) stack.append(h('span', { class: 'muted small' }, `+${s.stack.length - 5}`));
      if (s.stack.length === 0) stack.append(h('span', { class: 'muted small' }, 'empty'));
      this.table.append(h('div', { class: `trace-row${i === this.idx ? ' current' : ''}`, role: 'row', ...(i === this.idx ? { 'aria-current': 'step' } : {}) },
        h('span', { role: 'cell' }, fmt(i + 1)),
        h('span', { role: 'cell' }, h('span', { class: `chip sym-${s.symbol}`, title: SYMBOLS[s.symbol].name }, s.symbol)),
        h('span', { role: 'cell', class: 'action' }, ACTION_TEXT[s.action]),
        h('span', { role: 'cell' }, `${s.region.size}\u00D7${s.region.size} at (${s.region.x}, ${s.region.y})`),
        stack));
    }
  }
}
