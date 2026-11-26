import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatStructure, normalizeStructure, parseStructure, buildLeafMap, parseRegionLabel } from '../src/ui/quadtree';
import { planFit } from '../src/ui/imageIO';
import { toGray, isPow2, grayToRgba } from '../src/ui/gray';
import { compareImages } from '../src/ui/compare';
import { GOLDEN, STAND_IN_PIXELS } from '../src/golden';
import { compress } from '../src/core/mock';

test('normalize + format reproduce the paper format', () => {
  const flat = normalizeStructure(GOLDEN.structure);
  assert.equal(flat, 'DDedddDdeedDdeeaDdddd');
  assert.equal(flat.length, 21);
  assert.equal(formatStructure(flat), GOLDEN.structure);
  assert.equal(formatStructure('e'), 'e');
  assert.equal(formatStructure('Dee'), 'D e e'); // malformed -> spaced fallback, no crash
  assert.equal(formatStructure(''), '');
});

test('parseStructure: golden counts and leaves', () => {
  const p = parseStructure(GOLDEN.structure, 8);
  assert.equal(p.error, null);
  assert.deepEqual(p.counts, { D: 5, e: 5, a: 1, d: 10 });
  assert.equal(p.leaves.length, 16);
  assert.ok(p.leaves.every((l) => l.size === 2));
  assert.deepEqual({ x: p.leaves[0]!.x, y: p.leaves[0]!.y }, { x: 0, y: 0 });
  assert.deepEqual({ x: p.leaves[1]!.x, y: p.leaves[1]!.y }, { x: 2, y: 0 }); // NE block of the NW quadrant
  assert.deepEqual({ x: p.leaves[4]!.x, y: p.leaves[4]!.y }, { x: 4, y: 0 }); // first block of the NE quadrant
  const area = p.leaves.reduce((s, l) => s + l.size * l.size, 0);
  assert.equal(area, 64);
});

test('parseStructure reports malformed input instead of throwing', () => {
  assert.notEqual(parseStructure('DD', 8).error, null);
  assert.notEqual(parseStructure('ee', 8).error, null);
  assert.notEqual(parseStructure('Dedde', 1).error, null);
});

test('leaves of a real compression tile the image exactly and e-leaves match their color', () => {
  const px = STAND_IN_PIXELS;
  const r = compress(px, 8, { B: 2, epsilon: 10 });
  const p = parseStructure(r.layer1.structure, 8, r.layer1.colors);
  const map = buildLeafMap(p.leaves, 8);
  assert.ok(map.every((v) => v >= 0));
  for (const l of p.leaves) {
    if (l.sym !== 'e') continue;
    for (let j = 0; j < l.size; j++) for (let i = 0; i < l.size; i++) assert.equal(px[(l.y + j) * 8 + l.x + i], l.color);
  }
});

test('planFit', () => {
  assert.deepEqual(planFit(256, 256), { target: 256, native: true, mode: 'crop', sx: 0, sy: 0, sw: 256, sh: 256 });
  const wide = planFit(1000, 700);
  assert.equal(wide.native, false);
  assert.equal(wide.target, 512);
  assert.deepEqual([wide.sx, wide.sy, wide.sw, wide.sh], [150, 0, 700, 700]);
  assert.equal(planFit(300, 300).target, 256);
  assert.equal(planFit(100, 100, { target: 64 }).target, 64);
  assert.equal(planFit(1024, 1024).native, false); // too big -> resize to 512
  assert.equal(planFit(1024, 1024).target, 512);
  assert.equal(planFit(2, 2).target, 4);
  const st = planFit(400, 200, { mode: 'stretch' });
  assert.deepEqual([st.sx, st.sy, st.sw, st.sh], [0, 0, 400, 200]);
});

test('grayscale weights sum to 256 so white stays 255 and black stays 0', () => {
  const rgba = Uint8Array.from([255, 255, 255, 255, 0, 0, 0, 255, 255, 0, 0, 255]);
  assert.deepEqual([...toGray(rgba, 3)], [255, 0, 77 + 0]);
  assert.equal(isPow2(64), true);
  assert.equal(isPow2(96), false);
  assert.equal(grayToRgba(Uint8Array.from([7])).join(','), '7,7,7,255');
});

test('compareImages', () => {
  const a = Uint8Array.from([1, 2, 3, 4]);
  assert.equal(compareImages(a, Uint8Array.from(a), 2).ok, true);
  const r = compareImages(a, Uint8Array.from([1, 2, 9, 4]), 2);
  assert.deepEqual([r.ok, r.mismatches, r.maxDiff], [false, 1, 6]);
  assert.deepEqual(r.first, { x: 0, y: 1, expected: 3, actual: 9 });
});

test('parseRegionLabel', () => {
  assert.deepEqual(parseRegionLabel('4@0,4'), { size: 4, x: 0, y: 4 });
  assert.equal(parseRegionLabel('weird'), null);
});
