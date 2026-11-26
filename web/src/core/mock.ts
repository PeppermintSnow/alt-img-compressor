/**
 * MOCK CORE (web/ only). Behaves like the planned pipeline so the UI can be built and tested,
 * but it is NOT the project's codec:
 *   - Layer 1 is a real, lossless quadtree coder with the symbols D / e / a / d.
 *     ASSUMPTION (confirm with Layer 1 owner):
 *       D = divide into 4 quadrants (NW, NE, SW, SE)
 *       e = exact leaf, every pixel equal            -> 1 color
 *       a = approximate leaf, sigma <= epsilon       -> 1 color + residuals
 *       d = deferred B x B block, sigma > epsilon    -> raw pixels to Layer 2
 *   - Layer 2 uses Huffman as a stand-in for tANS, so x0 is always 0 and the "tANS" numbers are
 *     only roughly indicative.
 *   - Container layout (version 0) is a placeholder for the real "header + 4 streams" format.
 */
import type {
  CompressResult, DecompressResult, Layer1Result, Layer2Result, Params, PdaStep, PdaTrace, StreamBits, SymbolChar,
} from './contract';
import { CoreError } from './contract';

export const IS_MOCK = true;

export const MOCK_CHILD_ORDER = [[0, 0], [1, 0], [0, 1], [1, 1]] as const; // NW, NE, SW, SE
const SYM_BITS: Record<SymbolChar, number> = { D: 0, e: 1, a: 2, d: 3 };
const BITS_SYM: SymbolChar[] = ['D', 'e', 'a', 'd'];
const MAGIC = [0x54, 0x4c, 0x41, 0x43]; // "TLAC"
const VERSION = 0;
const now = (): number => performance.now();
const isPow2 = (n: number): boolean => Number.isInteger(n) && n > 0 && (n & (n - 1)) === 0;

// ---------------------------------------------------------------- byte / bit helpers
class ByteWriter {
  private a: number[] = [];
  u8(v: number): void { this.a.push(v & 0xff); }
  u16(v: number): void { this.u8(v >> 8); this.u8(v); }
  u32(v: number): void { this.u8(v >>> 24); this.u8(v >>> 16); this.u8(v >>> 8); this.u8(v); }
  /** LEB128: small numbers take 1 byte (keeps the mock's table overhead realistic). */
  varint(v: number): void { while (v >= 0x80) { this.u8((v & 0x7f) | 0x80); v = Math.floor(v / 128); } this.u8(v); }
  bytes(b: Uint8Array): void { for (let i = 0; i < b.length; i++) this.a.push(b[i]!); }
  get length(): number { return this.a.length; }
  done(): Uint8Array { return Uint8Array.from(this.a); }
}

class ByteReader {
  pos = 0;
  constructor(private b: Uint8Array) {}
  private need(n: number): void {
    if (this.pos + n > this.b.length) throw new CoreError('TRUNCATED', 'The file ends before all data was read.');
  }
  u8(): number { this.need(1); return this.b[this.pos++]!; }
  u16(): number { return (this.u8() << 8) | this.u8(); }
  u32(): number { return ((this.u8() << 24) | (this.u8() << 16) | (this.u8() << 8) | this.u8()) >>> 0; }
  varint(): number {
    let v = 0, mul = 1;
    for (let i = 0; i < 6; i++) {
      const b = this.u8();
      v += (b & 0x7f) * mul;
      if (b < 0x80) return v;
      mul *= 128;
    }
    throw new CoreError('CORRUPT', 'A number in the file is too long.');
  }
  bytes(n: number): Uint8Array { this.need(n); const out = this.b.subarray(this.pos, this.pos + n); this.pos += n; return out; }
}

class BitWriter {
  private out: number[] = [];
  private cur = 0;
  private n = 0;
  bits = 0;
  put(bit: number): void {
    this.cur = (this.cur << 1) | bit;
    this.n++; this.bits++;
    if (this.n === 8) { this.out.push(this.cur); this.cur = 0; this.n = 0; }
  }
  done(): Uint8Array {
    if (this.n > 0) { this.out.push(this.cur << (8 - this.n)); this.cur = 0; this.n = 0; }
    return Uint8Array.from(this.out);
  }
}

class BitReader {
  private pos = 0;
  constructor(private b: Uint8Array, private bitLen: number) {}
  get(): number {
    if (this.pos >= this.bitLen || (this.pos >> 3) >= this.b.length) throw new CoreError('TRUNCATED', 'A bitstream ends too early.');
    const bit = (this.b[this.pos >> 3]! >> (7 - (this.pos & 7))) & 1;
    this.pos++;
    return bit;
  }
}

// ---------------------------------------------------------------- Huffman (stand-in for tANS)
interface HNode { w: number; sym: number; order: number; l?: HNode; r?: HNode }

function buildTree(table: Array<[number, number]>): HNode | null {
  if (table.length === 0) return null;
  let nodes: HNode[] = table.map(([sym, w], i) => ({ w, sym, order: i }));
  let order = table.length;
  while (nodes.length > 1) {
    nodes.sort((p, q) => p.w - q.w || p.order - q.order);
    const l = nodes.shift()!;
    const r = nodes.shift()!;
    nodes.push({ w: l.w + r.w, sym: -1, order: order++, l, r });
  }
  return nodes[0]!;
}

function buildCodes(root: HNode | null): Map<number, number[]> {
  const codes = new Map<number, number[]>();
  if (!root) return codes;
  const walk = (n: HNode, path: number[]): void => {
    if (!n.l || !n.r) { codes.set(n.sym, path); return; }
    walk(n.l, [...path, 0]);
    walk(n.r, [...path, 1]);
  };
  walk(root, []); // a lone symbol gets the empty code (decoder uses the count)
  return codes;
}

function histogram(values: ArrayLike<number>): Array<[number, number]> {
  const m = new Map<number, number>();
  for (let i = 0; i < values.length; i++) m.set(values[i]!, (m.get(values[i]!) ?? 0) + 1);
  return [...m.entries()].sort((p, q) => p[0] - q[0]);
}

function huffmanEncode(values: ArrayLike<number>): { table: Array<[number, number]>; payload: Uint8Array; bitLen: number } {
  const table = histogram(values);
  const codes = buildCodes(buildTree(table));
  const bw = new BitWriter();
  for (let i = 0; i < values.length; i++) for (const bit of codes.get(values[i]!)!) bw.put(bit);
  return { table, payload: bw.done(), bitLen: bw.bits };
}

function huffmanDecode(table: Array<[number, number]>, payload: Uint8Array, bitLen: number, count: number): number[] {
  const out: number[] = [];
  const root = buildTree(table);
  if (!root || count === 0) return out;
  if (!root.l || !root.r) { for (let i = 0; i < count; i++) out.push(root.sym); return out; }
  const br = new BitReader(payload, bitLen);
  for (let i = 0; i < count; i++) {
    let n: HNode = root;
    while (n.l && n.r) n = br.get() === 0 ? n.l : n.r;
    out.push(n.sym);
  }
  return out;
}

/** block = varint count, varint tableSize, (varint symbolDelta, varint freq)*, varint bitLen, payload */
function writeHuffBlock(values: ArrayLike<number>): { block: Uint8Array; payloadOffset: number } {
  const { table, payload, bitLen } = huffmanEncode(values);
  const w = new ByteWriter();
  w.varint(values.length);
  w.varint(table.length);
  let prev = 0;
  for (const [sym, f] of table) { w.varint(sym - prev); w.varint(f); prev = sym; }
  w.varint(bitLen);
  const payloadOffset = w.length;
  w.bytes(payload);
  return { block: w.done(), payloadOffset };
}

function readHuffBlock(block: Uint8Array): number[] {
  const r = new ByteReader(block);
  const count = r.varint();
  const tableSize = r.varint();
  const table: Array<[number, number]> = [];
  let prev = 0;
  for (let i = 0; i < tableSize; i++) { prev += r.varint(); table.push([prev, r.varint()]); }
  const bitLen = r.varint();
  const payload = r.bytes(Math.ceil(bitLen / 8));
  return huffmanDecode(table, payload, bitLen, count);
}

const zigzag = (r: number): number => (r >= 0 ? r * 2 : -r * 2 - 1);
const unzigzag = (z: number): number => (z & 1 ? -((z + 1) >> 1) : z >> 1);

// ---------------------------------------------------------------- Layer 1 (quadtree)
function encodeLayer1(px: Uint8Array, n: number, B: number, eps: number): Layer1Result {
  const out: string[] = [];
  const colors: number[] = [];
  const residuals: number[] = [];
  const deferred: number[] = [];
  const eps2 = eps * eps;

  const rec = (x: number, y: number, s: number): void => {
    let sum = 0, sumSq = 0, min = 255, max = 0;
    for (let j = 0; j < s; j++) {
      const row = (y + j) * n + x;
      for (let i = 0; i < s; i++) {
        const v = px[row + i]!;
        sum += v; sumSq += v * v;
        if (v < min) min = v;
        if (v > max) max = v;
      }
    }
    const cnt = s * s;
    if (min === max) { out.push('e'); colors.push(min); return; }
    // integer sigma test: sigma <= eps  <=>  cnt*sumSq - sum^2 <= eps^2 * cnt^2   (< 2^53 for 512x512)
    if (cnt * sumSq - sum * sum <= eps2 * cnt * cnt) {
      const c = Math.floor((sum + (cnt >> 1)) / cnt);
      out.push('a'); colors.push(c);
      for (let j = 0; j < s; j++) for (let i = 0; i < s; i++) residuals.push(px[(y + j) * n + x + i]! - c);
      return;
    }
    if (s === B) {
      out.push('d');
      for (let j = 0; j < s; j++) for (let i = 0; i < s; i++) deferred.push(px[(y + j) * n + x + i]!);
      return;
    }
    out.push('D');
    const half = s >> 1;
    for (const [dx, dy] of MOCK_CHILD_ORDER) rec(x + dx * half, y + dy * half, half);
  };
  rec(0, 0, n);
  return { structure: out.join(''), colors, residuals, deferredPixels: deferred };
}

function packSymbols(structure: string): Uint8Array {
  const bw = new BitWriter();
  for (const ch of structure) { const v = SYM_BITS[ch as SymbolChar]; bw.put(v >> 1); bw.put(v & 1); }
  return bw.done();
}

function unpackSymbols(bytes: Uint8Array, count: number): SymbolChar[] {
  if (bytes.length !== Math.ceil((count * 2) / 8)) throw new CoreError('CORRUPT', 'Structure stream has the wrong length.');
  const out: SymbolChar[] = [];
  for (let i = 0; i < count; i++) {
    const bit = i * 2;
    const hi = (bytes[bit >> 3]! >> (7 - (bit & 7))) & 1;
    const lo = (bytes[(bit + 1) >> 3]! >> (7 - ((bit + 1) & 7))) & 1;
    out.push(BITS_SYM[(hi << 1) | lo]!);
  }
  return out;
}

// ---------------------------------------------------------------- public API
function checkArgs(len: number, size: number, p: Params): void {
  if (!isPow2(size) || size < 2 || size > 512) throw new CoreError('BAD_ARGS', `Image size must be a power of two between 2 and 512 (got ${size}).`);
  if (len !== size * size) throw new CoreError('BAD_ARGS', `Expected ${size * size} pixels, got ${len}.`);
  if (!isPow2(p.B) || p.B > size) throw new CoreError('BAD_ARGS', `B must be a power of two between 1 and ${size} (got ${p.B}).`);
  if (!Number.isInteger(p.epsilon) || p.epsilon < 0 || p.epsilon > 255) throw new CoreError('BAD_ARGS', `epsilon must be an integer from 0 to 255 (got ${p.epsilon}).`);
}

export function compress(pixels: Uint8Array, size: number, params: Params): CompressResult {
  checkArgs(pixels.length, size, params);
  const t0 = now();
  const layer1 = encodeLayer1(pixels, size, params.B, params.epsilon);
  const t1 = now();

  const def = histogram(layer1.deferredPixels);
  const defBlock = writeHuffBlock(layer1.deferredPixels);
  const layer2: Layer2Result = {
    freqTable: def,
    bitstream: defBlock.block.subarray(defBlock.payloadOffset), // payload only (after count, table, bitLen)
    x0: 0, // mock: no ANS state
  };
  const t2 = now();

  const k = Math.log2(size);
  const s1 = packSymbols(layer1.structure);
  const s2 = Uint8Array.from(layer1.colors);
  const s3 = writeHuffBlock(layer1.residuals.map(zigzag)).block;
  const s4 = defBlock.block;

  const w = new ByteWriter();
  for (const m of MAGIC) w.u8(m);
  w.u8(VERSION); w.u8(1 /* flags: bit0 = mock */); w.u8(k);
  w.u16(params.B); w.u16(params.epsilon);
  w.u32(layer1.structure.length); w.u32(layer1.colors.length);
  w.u32(layer1.residuals.length); w.u32(layer1.deferredPixels.length);
  w.u32(layer2.x0);
  for (const s of [s1, s2, s3, s4]) w.u32(s.length);
  const headerBytes = w.length;
  for (const s of [s1, s2, s3, s4]) w.bytes(s);

  const streamBits: StreamBits = {
    header: headerBytes * 8, structure: s1.length * 8, colors: s2.length * 8, residuals: s3.length * 8, deferred: s4.length * 8,
  };
  return {
    size, k, params, layer1, layer2, streamBits, container: w.done(),
    timing: { layer1Ms: t1 - t0, layer2Ms: t2 - t1, totalMs: now() - t0 },
  };
}

export function decompress(container: Uint8Array): DecompressResult {
  const t0 = now();
  const r = new ByteReader(container);
  for (const m of MAGIC) if (r.u8() !== m) throw new CoreError('BAD_MAGIC', 'This is not a .tlac file (wrong signature).');
  const version = r.u8();
  if (version !== VERSION) throw new CoreError('UNSUPPORTED_VERSION', `Unsupported container version ${version}.`);
  r.u8(); // flags
  const k = r.u8();
  const B = r.u16();
  const epsilon = r.u16();
  const nSym = r.u32(), nCol = r.u32(), nRes = r.u32(), nDef = r.u32();
  const x0 = r.u32();
  if (k < 1 || k > 9) throw new CoreError('CORRUPT', `Invalid image size exponent k=${k}.`);
  const size = 1 << k;
  if (!isPow2(B) || B > size) throw new CoreError('CORRUPT', `Invalid block size B=${B}.`);
  const lens = [r.u32(), r.u32(), r.u32(), r.u32()];
  const headerBytes = r.pos;
  const [s1, s2, s3, s4] = lens.map((l) => r.bytes(l)) as [Uint8Array, Uint8Array, Uint8Array, Uint8Array];

  const symbols = unpackSymbols(s1, nSym);
  if (s2.length !== nCol) throw new CoreError('CORRUPT', 'Color stream has the wrong length.');
  const residuals = readHuffBlock(s3).map(unzigzag);
  const deferred = readHuffBlock(s4);
  if (residuals.length !== nRes || deferred.length !== nDef) throw new CoreError('CORRUPT', 'Residual or deferred stream has the wrong length.');

  const pixels = new Uint8Array(size * size);
  const stack: number[] = [0, 0, size];
  let ci = 0, ri = 0, di = 0;
  for (const sym of symbols) {
    if (stack.length === 0) throw new CoreError('CORRUPT', 'Structure has extra symbols.');
    const s = stack.pop()!, y = stack.pop()!, x = stack.pop()!;
    if (sym === 'D') {
      if (s <= B) throw new CoreError('CORRUPT', 'Structure divides a block that is already B x B.');
      const half = s >> 1;
      for (let c = 3; c >= 0; c--) { const [dx, dy] = MOCK_CHILD_ORDER[c]!; stack.push(x + dx * half, y + dy * half, half); }
      continue;
    }
    if (ci >= nCol && sym !== 'd') throw new CoreError('CORRUPT', 'Structure needs more colors than stored.');
    if (sym === 'd') {
      if (s !== B) throw new CoreError('CORRUPT', 'A deferred block must be exactly B x B.');
      if (di + s * s > nDef) throw new CoreError('CORRUPT', 'Structure needs more deferred pixels than stored.');
      for (let j = 0; j < s; j++) for (let i = 0; i < s; i++) pixels[(y + j) * size + x + i] = deferred[di++]!;
    } else {
      const c = s2[ci++]!;
      for (let j = 0; j < s; j++) for (let i = 0; i < s; i++) {
        let v = c;
        if (sym === 'a') {
          if (ri >= nRes) throw new CoreError('CORRUPT', 'Structure needs more residuals than stored.');
          v = c + residuals[ri++]!;
          if (v < 0 || v > 255) throw new CoreError('CORRUPT', 'A residual pushes a pixel out of range.');
        }
        pixels[(y + j) * size + x + i] = v;
      }
    }
  }
  if (stack.length !== 0) throw new CoreError('CORRUPT', 'Structure ends before every block is resolved.');
  if (ci !== nCol || ri !== nRes || di !== nDef) throw new CoreError('CORRUPT', 'Some stored values were never used.');

  return {
    size, k, params: { B, epsilon }, pixels, structure: symbols.join(''), x0,
    streamBits: { header: headerBytes * 8, structure: s1.length * 8, colors: s2.length * 8, residuals: s3.length * 8, deferred: s4.length * 8 },
    timingMs: now() - t0,
  };
}

export function pdaTrace(structure: string, size: number, B: number, limit = 5000): PdaTrace {
  const symbols = structure.replace(/[^Deda]/g, '').split('') as SymbolChar[];
  const steps: PdaStep[] = [];
  const stack: number[] = [0, 0, size];
  const label = (): string[] => {
    const out: string[] = [];
    for (let i = stack.length - 3; i >= 0; i -= 3) out.push(`${stack[i + 2]}@${stack[i]},${stack[i + 1]}`);
    return out;
  };
  for (let i = 0; i < symbols.length; i++) {
    const sym = symbols[i]!;
    if (stack.length === 0) throw new CoreError('CORRUPT', `Extra symbol at position ${i}.`);
    const s = stack.pop()!, y = stack.pop()!, x = stack.pop()!;
    if (sym === 'D') {
      if (s <= B) throw new CoreError('CORRUPT', `Cannot divide a ${s}x${s} block when B=${B}.`);
      const half = s >> 1;
      for (let c = 3; c >= 0; c--) { const [dx, dy] = MOCK_CHILD_ORDER[c]!; stack.push(x + dx * half, y + dy * half, half); }
    }
    if (i < limit) {
      steps.push({ step: i, symbol: sym, action: sym === 'D' ? 'split' : (`leaf-${sym}` as PdaStep['action']), region: { x, y, size: s }, stack: label() });
    }
  }
  if (stack.length !== 0) throw new CoreError('CORRUPT', 'Structure ends before every block is resolved.');
  return { steps, total: symbols.length, truncated: symbols.length > limit };
}
