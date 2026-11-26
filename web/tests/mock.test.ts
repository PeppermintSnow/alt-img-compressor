import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compress, decompress, pdaTrace, MOCK_CHILD_ORDER } from '../src/core/mock';
import { CoreError } from '../src/core/contract';
import { CHILD_ORDER } from '../src/config';
import { STAND_IN_PIXELS, GOLDEN } from '../src/golden';
import { makeSample } from '../src/ui/samples';
import { normalizeStructure } from '../src/ui/quadtree';

test('UI and mock core agree on the child order', () => {
  assert.deepEqual(CHILD_ORDER, MOCK_CHILD_ORDER);
});

test('golden stand-in reproduces the golden structure, counts and round-trips', () => {
  const r = compress(STAND_IN_PIXELS, 8, { B: 2, epsilon: 10 });
  assert.equal(r.layer1.structure, normalizeStructure(GOLDEN.structure));
  assert.equal(r.layer1.structure.length, GOLDEN.symbols);
  assert.equal([...r.layer1.structure].filter((c) => c === 'd').length, GOLDEN.deferredBlocks);
  assert.equal(r.layer1.deferredPixels.length, GOLDEN.deferredPixels);
  const d = decompress(r.container);
  assert.deepEqual([...d.pixels], [...STAND_IN_PIXELS]);
});

test('lossless round trip across sizes, B and epsilon', () => {
  for (const kind of ['flat', 'gradient', 'shapes', 'noise'] as const) {
    for (const n of [4, 16, 64, 128]) {
      for (const B of [1, 2, 4, 8]) {
        if (B > n) continue;
        for (const epsilon of [0, 3, 10, 40, 255]) {
          const px = makeSample(kind, n);
          const r = compress(px, n, { B, epsilon });
          const d = decompress(r.container);
          assert.deepEqual(d.pixels, px, `${kind} n=${n} B=${B} eps=${epsilon}`);
          assert.equal(d.structure, r.layer1.structure);
          assert.deepEqual(d.params, { B, epsilon });
        }
      }
    }
  }
});

test('512x512 noise round-trips quickly', () => {
  const px = makeSample('noise', 512);
  const t = performance.now();
  const r = compress(px, 512, { B: 1, epsilon: 10 });
  const d = decompress(r.container);
  assert.deepEqual(d.pixels, px);
  assert.ok(performance.now() - t < 5000, 'should take well under 5 s');
});

test('stream bits add up to the container size', () => {
  const r = compress(makeSample('shapes', 64), 64, { B: 2, epsilon: 10 });
  const s = r.streamBits;
  assert.equal(s.header + s.structure + s.colors + s.residuals + s.deferred, r.container.length * 8);
});

test('flat image: one e symbol, single-symbol edge case works', () => {
  const r = compress(makeSample('flat', 64), 64, { B: 2, epsilon: 10 });
  assert.equal(r.layer1.structure, 'e');
  assert.equal(r.layer1.deferredPixels.length, 0);
});

test('K = 1 deferred symbol edge case', () => {
  const px = new Uint8Array(16).fill(0);
  px[0] = 255; px[1] = 0; px[4] = 0; px[5] = 255; // one 2x2 block with large spread, rest flat
  const r = compress(px, 4, { B: 2, epsilon: 5 });
  assert.deepEqual(decompress(r.container).pixels, px);
});

test('bad containers throw CoreError with useful codes', () => {
  const good = compress(makeSample('shapes', 16), 16, { B: 2, epsilon: 10 }).container;
  const code = (bytes: Uint8Array): string => {
    try { decompress(bytes); return 'no error'; } catch (e) { return e instanceof CoreError ? e.code : 'other'; }
  };
  assert.equal(code(Uint8Array.from([1, 2, 3, 4, 5, 6, 7, 8])), 'BAD_MAGIC');
  assert.equal(code(good.subarray(0, 10)), 'TRUNCATED');
  assert.equal(code(good.subarray(0, good.length - 3)), 'TRUNCATED');
  const bad = Uint8Array.from(good); bad[4] = 9;
  assert.equal(code(bad), 'UNSUPPORTED_VERSION');
  assert.equal(code(new Uint8Array(0)), 'TRUNCATED');
});

test('bad arguments are rejected', () => {
  assert.throws(() => compress(new Uint8Array(9), 3, { B: 1, epsilon: 1 }), CoreError);
  assert.throws(() => compress(new Uint8Array(16), 4, { B: 3, epsilon: 1 }), CoreError);
  assert.throws(() => compress(new Uint8Array(16), 4, { B: 2, epsilon: 300 }), CoreError);
});

test('PDA trace: one step per symbol, stack ends empty, golden regions', () => {
  const r = compress(STAND_IN_PIXELS, 8, { B: 2, epsilon: 10 });
  const t = pdaTrace(r.layer1.structure, 8, 2);
  assert.equal(t.total, 21);
  assert.equal(t.steps.length, 21);
  assert.equal(t.truncated, false);
  assert.deepEqual(t.steps[0]!.region, { x: 0, y: 0, size: 8 });
  assert.equal(t.steps[0]!.action, 'split');
  assert.equal(t.steps[0]!.stack.length, 4);
  assert.deepEqual(t.steps[20]!.stack, []);
  const capped = pdaTrace(r.layer1.structure, 8, 2, 5);
  assert.equal(capped.steps.length, 5);
  assert.equal(capped.truncated, true);
  assert.throws(() => pdaTrace('Dee', 8, 2), CoreError);
});
