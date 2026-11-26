import { GOLDEN, GOLDEN_PIXELS } from '../golden';
import { h } from './dom';
import { formatStructure, normalizeStructure } from './quadtree';

export interface GoldenInput {
  n: number;
  B: number;
  epsilon: number;
  structure: string;
  deferredPixelCount: number | null;
  x0: number;
  losslessOk: boolean | null;
  isMock: boolean;
  usingStandIn: boolean;
}

type Status = 'pass' | 'fail' | 'pending';
interface Check { label: string; expected: string; actual: string; status: Status; note?: string }

const ICON: Record<Status, string> = { pass: '\u2713', fail: '\u2717', pending: '\u25CB' };

export class GoldenPanel {
  private readonly summary = h('summary', {});
  private readonly body = h('div', { class: 'golden-body' });
  readonly standInBtn = h('button', { type: 'button' }, 'Load stand-in 8\u00D78');
  readonly goldenBtn = h('button', { type: 'button', class: 'primary' }, 'Load golden 8\u00D78');

  constructor(root: HTMLElement) {
    root.append(this.summary, this.body);
    this.goldenBtn.hidden = GOLDEN_PIXELS === null;
    this.render(null);
  }

  update(input: GoldenInput | null): void { this.render(input); }

  private applicable(i: GoldenInput): boolean {
    return i.n === GOLDEN.size && i.B === GOLDEN.B && i.epsilon === GOLDEN.epsilon;
  }

  private render(i: GoldenInput | null): void {
    this.body.replaceChildren();
    const intro = h('p', { class: 'muted small' },
      `Acceptance test from the plan: the ${GOLDEN.size}\u00D7${GOLDEN.size} worked example (k=${GOLDEN.k}, \u03B5=${GOLDEN.epsilon}, B=${GOLDEN.B}) must produce this exact output.`);
    this.body.append(intro, h('div', { class: 'row wrap' }, this.standInBtn, this.goldenBtn));
    if (GOLDEN_PIXELS === null) {
      this.body.append(h('p', { class: 'alert warn' },
        'GOLDEN_PIXELS is not set. Paste the 64 pixel values from the paper into src/golden.ts. Until then the stand-in image (invented, not the paper\u2019s) only exercises the structure string and counts.'));
    }
    if (!i || !this.applicable(i)) {
      this.summary.textContent = 'Golden test \u00B7 not loaded';
      this.body.append(h('p', { class: 'muted' }, `Load the ${GOLDEN.size}\u00D7${GOLDEN.size} example with B=${GOLDEN.B}, \u03B5=${GOLDEN.epsilon} to run it.`));
      return;
    }
    const actualFlat = normalizeStructure(i.structure);
    const d = (actualFlat.match(/d/g) ?? []).length;
    const checks: Check[] = [
      { label: 'Structure string', expected: GOLDEN.structure, actual: formatStructure(i.structure), status: actualFlat === normalizeStructure(GOLDEN.structure) ? 'pass' : 'fail' },
      { label: 'Symbol count', expected: String(GOLDEN.symbols), actual: String(actualFlat.length), status: actualFlat.length === GOLDEN.symbols ? 'pass' : 'fail' },
      { label: 'Deferred 2\u00D72 blocks', expected: String(GOLDEN.deferredBlocks), actual: String(d), status: d === GOLDEN.deferredBlocks ? 'pass' : 'fail' },
      { label: 'Deferred pixels', expected: String(GOLDEN.deferredPixels), actual: i.deferredPixelCount === null ? '\u2014' : String(i.deferredPixelCount),
        status: i.deferredPixelCount === null ? 'pending' : i.deferredPixelCount === GOLDEN.deferredPixels ? 'pass' : 'fail' },
      { label: 'Final ANS state x\u2080', expected: String(GOLDEN.x0), actual: i.isMock ? 'mock core' : String(i.x0),
        status: i.isMock ? 'pending' : i.x0 === GOLDEN.x0 ? 'pass' : 'fail', note: i.isMock ? 'needs the real tANS' : undefined },
      { label: 'Exact reconstruction (64 px)', expected: 'identical', actual: i.losslessOk === null ? '\u2014' : i.losslessOk ? 'identical' : 'differs',
        status: i.losslessOk === null ? 'pending' : i.losslessOk ? 'pass' : 'fail' },
      { label: 'Input pixels', expected: 'paper values', actual: i.usingStandIn ? 'stand-in image' : 'loaded image',
        status: i.usingStandIn || GOLDEN_PIXELS === null ? 'pending' : 'pass', note: i.usingStandIn ? 'not the paper\u2019s pixels' : undefined },
    ];
    const pass = checks.filter((c) => c.status === 'pass').length;
    const fail = checks.filter((c) => c.status === 'fail').length;
    const pend = checks.length - pass - fail;
    this.summary.textContent = `Golden test \u00B7 ${pass} pass${fail ? ` \u00B7 ${fail} fail` : ''}${pend ? ` \u00B7 ${pend} pending` : ''}`;
    const table = h('div', { class: 'checks', role: 'table', 'aria-label': 'Golden test checks' });
    for (const c of checks) {
      table.append(h('div', { class: `gcheck ${c.status}`, role: 'row' },
        h('span', { class: 'gcheck-icon', role: 'cell', title: c.status }, ICON[c.status]),
        h('span', { class: 'gcheck-label', role: 'cell' }, c.label, c.note ? h('small', {}, c.note) : null),
        h('code', { role: 'cell' }, `expected ${c.expected}`),
        h('code', { role: 'cell' }, `got ${c.actual}`)));
    }
    this.body.append(table);
  }
}
