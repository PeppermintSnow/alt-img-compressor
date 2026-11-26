import { CHILD_ORDER } from '../config';
import type { SymbolChar } from '../core/contract';

export interface Region { x: number; y: number; size: number }
export interface Leaf extends Region { sym: 'e' | 'a' | 'd'; symIndex: number; color?: number }
export interface ParsedStructure {
  symbols: SymbolChar[];
  leaves: Leaf[];
  counts: Record<SymbolChar, number>;
  error: string | null;
}

/** Keep only the four structure symbols (drops spaces and the "|" separators of the paper format). */
export const normalizeStructure = (s: string): string => s.replace(/[^Deda]/g, '');

/** Walk the preorder structure like the PDA does and collect the leaf rectangles. */
export function parseStructure(structure: string, size: number, colors?: number[]): ParsedStructure {
  const symbols = normalizeStructure(structure).split('') as SymbolChar[];
  const counts: Record<SymbolChar, number> = { D: 0, e: 0, a: 0, d: 0 };
  const leaves: Leaf[] = [];
  const stack: number[] = [0, 0, size];
  let colorIdx = 0;
  let error: string | null = null;

  for (let i = 0; i < symbols.length; i++) {
    const sym = symbols[i]!;
    counts[sym]++;
    if (stack.length === 0) { error = `Extra symbol at position ${i + 1}.`; break; }
    const s = stack.pop()!, y = stack.pop()!, x = stack.pop()!;
    if (sym === 'D') {
      if (s < 2) { error = `Symbol ${i + 1} divides a 1\u00D71 block.`; break; }
      const half = s >> 1;
      for (let c = 3; c >= 0; c--) {
        const [dx, dy] = CHILD_ORDER[c]!;
        stack.push(x + dx * half, y + dy * half, half);
      }
    } else {
      const leaf: Leaf = { x, y, size: s, sym, symIndex: i };
      if (sym !== 'd') {
        if (colors && colorIdx < colors.length) leaf.color = colors[colorIdx];
        colorIdx++;
      }
      leaves.push(leaf);
    }
  }
  if (!error && stack.length > 0) error = 'The structure ends before every block is resolved.';
  return { symbols, leaves, counts, error };
}

/** "D | D e d d d | ..." : root, then one group per root child, as printed in the paper. */
export function formatStructure(structure: string): string {
  const s = normalizeStructure(structure);
  const spaced = (t: string): string => t.split('').join(' ');
  if (!s) return '';
  const end = (i: number): number => {
    if (i >= s.length) return -1;
    if (s[i] !== 'D') return i + 1;
    let j = i + 1;
    for (let c = 0; c < 4; c++) { j = end(j); if (j < 0) return -1; }
    return j;
  };
  if (s[0] !== 'D') return spaced(s);
  const parts = ['D'];
  let j = 1;
  for (let c = 0; c < 4; c++) {
    const e = end(j);
    if (e < 0) return spaced(s);
    parts.push(spaced(s.slice(j, e)));
    j = e;
  }
  return j === s.length ? parts.join(' | ') : spaced(s);
}

/** pixel -> leaf index lookup for hover tooltips (-1 = none). */
export function buildLeafMap(leaves: Leaf[], n: number): Int32Array {
  const map = new Int32Array(n * n).fill(-1);
  leaves.forEach((l, idx) => {
    for (let j = 0; j < l.size; j++) map.fill(idx, (l.y + j) * n + l.x, (l.y + j) * n + l.x + l.size);
  });
  return map;
}

/** Parse "8@0,4" (size@x,y) as emitted in PdaStep.stack. */
export function parseRegionLabel(s: string): Region | null {
  const m = /^(\d+)@(\d+),(\d+)$/.exec(s);
  return m ? { size: +m[1]!, x: +m[2]!, y: +m[3]! } : null;
}
