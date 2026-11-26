import { DEFAULTS, FILE_EXT, LIMITS, SYMBOLS } from './config';
import type { CompressResult, DecompressResult, Params, PdaTrace, SymbolChar } from './core/contract';
import { GOLDEN, GOLDEN_PIXELS, STAND_IN_PIXELS } from './golden';
import { showError, toast } from './ui/toasts';
import { CoreClient } from './worker/client';
import { $, clamp, h } from './ui/dom';
import { compareImages, type LosslessReport } from './ui/compare';
import { downloadBytes, readContainer } from './ui/fileIO';
import { GoldenPanel } from './ui/goldenPanel';
import { baseName, decodeImage, planFit, renderPlan, resizeWarning, type FitMode } from './ui/imageIO';
import { mountLayout } from './ui/layout';
import { formatStructure, parseStructure } from './ui/quadtree';
import { makeSample, type SampleKind } from './ui/samples';
import { StatsPanel } from './ui/statsPanel';
import { TraceViewer } from './ui/traceViewer';
import { ImageViews } from './ui/views';

interface Source { name: string; n: number; pixels: Uint8Array; standIn?: boolean }

export function startApp(): void {
  mountLayout(document.getElementById('app')!);
  const client = new CoreClient();
  const mockMode = __CORE_MODE__ === 'mock';

  // ---- elements ------------------------------------------------------------------------------------
  const main = $('#main');
  const drop = $('#drop');
  const fileInput = $<HTMLInputElement>('#fileInput');
  const loadInput = $<HTMLInputElement>('#loadInput');
  const selB = $<HTMLSelectElement>('#selB');
  const rngEps = $<HTMLInputElement>('#rngEps');
  const numEps = $<HTMLInputElement>('#numEps');
  const outEps = $<HTMLOutputElement>('#outEps');
  const chkAuto = $<HTMLInputElement>('#chkAuto');
  const btnRun = $<HTMLButtonElement>('#btnRun');
  const btnDownload = $<HTMLButtonElement>('#btnDownload');
  const chkOverlay = $<HTMLInputElement>('#chkOverlay');
  const chkFill = $<HTMLInputElement>('#chkFill');
  const selTarget = $<HTMLSelectElement>('#selTarget');
  const sampleSize = $<HTMLSelectElement>('#sampleSize');
  const fitBox = $<HTMLFieldSetElement>('#fitBox');
  const fitSize = $<HTMLSelectElement>('#fitSize');
  const banner = $('#banner');
  const statusLine = $('#status');
  const structureBox = $('#structureBox');
  const structureText = $('#structureText');
  const badge = $('#coreBadge');

  badge.textContent = mockMode ? 'MOCK CORE' : 'REAL CORE';
  badge.className = `badge ${mockMode ? 'mock' : 'real'}`;
  badge.title = mockMode ? 'Using src/core/mock.ts. Build with CORE=real to use ../core.' : 'Using ../core/src/index.ts';

  const legend = $('.legend');
  (['D', 'e', 'a', 'd'] as SymbolChar[]).forEach((s) =>
    legend.append(h('li', {}, h('span', { class: `chip sym-${s}` }, s), h('span', {}, h('strong', {}, SYMBOLS[s].name), ` \u2013 ${SYMBOLS[s].short}`))));

  const views = new ImageViews($('#views'));
  const stats = new StatsPanel($('#stats'));
  const golden = new GoldenPanel($('#golden'));
  const trace = new TraceViewer($('#trace'), (st) => {
    if (!st.active) { views.setHighlight(null, []); views.previewDecoded(null); return; }
    views.setHighlight(st.step?.region ?? null, st.stackRegions);
    views.previewDecoded(st.step ? st.step.step : -1);
  });

  // ---- state ---------------------------------------------------------------------------------------
  let source: Source | null = null;
  let bitmap: ImageBitmap | null = null;
  let bitmapName = 'image';
  let container: Uint8Array | null = null;
  let containerName = 'image';
  let runSeq = 0;
  let timer: number | undefined;

  // ---- helpers -------------------------------------------------------------------------------------
  const getParams = (): Params => ({ B: Number(selB.value) || DEFAULTS.B, epsilon: clamp(Math.round(Number(numEps.value) || 0), 0, 255) });

  function setEps(v: number): void {
    const e = clamp(Math.round(v), 0, 255);
    numEps.value = String(e);
    rngEps.value = String(Math.min(e, Number(rngEps.max)));
    outEps.textContent = `= ${e}`;
  }

  function refreshBOptions(n: number, prefer?: number): void {
    const keep = prefer ?? (Number(selB.value) || DEFAULTS.B);
    const options = [1, 2, 4, 8, 16, 32, 64].filter((b) => b <= n);
    selB.replaceChildren(...options.map((b) => h('option', { value: String(b) }, String(b))));
    const best = options.includes(keep) ? keep : Math.max(...options.filter((b) => b <= keep), options[0]!);
    selB.value = String(best);
  }

  function setBanner(text: string | null, kind: 'info' | 'warn' = 'warn'): void {
    banner.hidden = !text;
    banner.textContent = text ?? '';
    banner.className = `banner ${kind}`;
  }

  function setBusy(b: boolean): void {
    main.setAttribute('aria-busy', String(b));
    statusLine.textContent = b ? 'Working\u2026' : '';
    btnRun.disabled = b || !source;
  }

  function updateAvailability(): void {
    const has = source !== null;
    for (const el of [selB, rngEps, numEps]) el.disabled = !has;
    btnRun.disabled = !has;
    btnDownload.disabled = container === null;
  }

  function schedule(delay: number): void {
    window.clearTimeout(timer);
    timer = window.setTimeout(() => { void run(); }, delay);
  }

  function loadPixels(src: Source, note: string | null, params?: Params): void {
    source = src;
    refreshBOptions(src.n, params?.B);
    if (params) setEps(params.epsilon);
    setBanner(note);
    updateAvailability();
    schedule(0);
  }

  // ---- input ---------------------------------------------------------------------------------------
  function populateFit(): void {
    const sizes: number[] = [];
    for (let s = LIMITS.MIN_SIZE; s <= LIMITS.MAX_SIZE; s *= 2) sizes.push(s);
    fitSize.replaceChildren(...sizes.map((s) => h('option', { value: String(s) }, `${s}\u00D7${s}`)));
  }

  function applyBitmap(want?: { target?: number; mode?: FitMode }): void {
    if (!bitmap) return;
    try {
      const plan = planFit(bitmap.width, bitmap.height, want);
      const pixels = renderPlan(bitmap, plan);
      fitBox.hidden = plan.native;
      fitSize.value = String(plan.target);
      const radio = document.querySelector<HTMLInputElement>(`input[name="fitMode"][value="${plan.mode}"]`);
      if (radio) radio.checked = true;
      loadPixels({ name: bitmapName, n: plan.target, pixels }, resizeWarning(bitmap.width, bitmap.height, plan));
    } catch (e) { showError(e); }
  }

  async function onImage(file: File): Promise<void> {
    try {
      const bmp = await decodeImage(file);
      bitmap?.close();
      bitmap = bmp;
      bitmapName = baseName(file.name);
      applyBitmap();
    } catch (e) { showError(e); }
  }

  async function onContainer(file: File): Promise<void> {
    setBusy(true);
    try {
      const bytes = await readContainer(file);
      const d = await client.decompress(bytes);
      const tr = await client.pdaTrace(d.structure, d.size, d.params.B);
      bitmap?.close(); bitmap = null;
      source = null; container = bytes; containerName = baseName(file.name);
      fitBox.hidden = true;
      refreshBOptions(d.size, d.params.B);
      setEps(d.params.epsilon);
      render({ n: d.size, params: d.params, structure: d.structure, recon: d.pixels, original: null, d, c: null, tr, lossless: null, timing: `decode ${d.timingMs.toFixed(1)} ms`, usingStandIn: false });
      setBanner(`Loaded ${file.name}. A .tlac file stores no original image, so the lossless check is unavailable. Load an image to compress again.`, 'info');
      updateAvailability();
    } catch (e) { showError(e); }
    finally { setBusy(false); }
  }

  function handleFile(file: File): void {
    if (file.name.toLowerCase().endsWith(`.${FILE_EXT}`)) void onContainer(file); else void onImage(file);
  }

  // ---- pipeline ------------------------------------------------------------------------------------
  interface Rendered {
    n: number; params: Params; structure: string; recon: Uint8Array; original: Uint8Array | null;
    d: DecompressResult; c: CompressResult | null; tr: PdaTrace; lossless: LosslessReport | null; timing: string; usingStandIn: boolean;
  }

  function render(r: Rendered): void {
    const parsed = parseStructure(r.structure, r.n, r.c?.layer1.colors);
    if (parsed.error) toast('The block overlay is incomplete.', 'warn', { hint: 'The structure string could not be fully parsed.', detail: parsed.error });
    views.setImages(r.original, r.recon, r.n);
    views.setLeaves(parsed.leaves);
    views.setLossless(r.lossless);
    trace.setTrace(r.tr, r.structure);
    stats.update({
      n: r.n, B: r.params.B, epsilon: r.params.epsilon, streamBits: r.d.streamBits, counts: parsed.counts,
      deferredPixels: r.c ? r.c.layer1.deferredPixels.length : parsed.counts.d * r.params.B * r.params.B,
      distinctDeferred: r.c ? r.c.layer2.freqTable.length : null,
      x0: r.c ? r.c.layer2.x0 : r.d.x0, lossless: r.lossless, timing: r.timing, isMock: mockMode,
    });
    golden.update({
      n: r.n, B: r.params.B, epsilon: r.params.epsilon, structure: r.structure,
      deferredPixelCount: r.c ? r.c.layer1.deferredPixels.length : null,
      x0: r.c ? r.c.layer2.x0 : r.d.x0, losslessOk: r.lossless ? r.lossless.ok : null, isMock: mockMode, usingStandIn: r.usingStandIn,
    });
    structureText.textContent = formatStructure(r.structure);
    structureBox.hidden = false;
  }

  async function run(): Promise<void> {
    const src = source;
    if (!src) return;
    const id = ++runSeq;
    const params = getParams();
    setBusy(true);
    try {
      const c = await client.compress(src.pixels, src.n, params);
      const d = await client.decompress(c.container); // decode from the bytes, like a real recipient would
      const tr = await client.pdaTrace(c.layer1.structure, src.n, params.B);
      if (id !== runSeq) return; // a newer run replaced this one
      container = c.container;
      containerName = src.name;
      render({
        n: src.n, params, structure: c.layer1.structure, recon: d.pixels, original: src.pixels, d, c, tr,
        lossless: compareImages(src.pixels, d.pixels, src.n),
        timing: `compress ${c.timing.totalMs.toFixed(1)} ms (layer 1 ${c.timing.layer1Ms.toFixed(1)}, layer 2 ${c.timing.layer2Ms.toFixed(1)}) \u00B7 decode ${d.timingMs.toFixed(1)} ms`,
        usingStandIn: !!src.standIn,
      });
      updateAvailability();
    } catch (e) {
      if (id === runSeq) showError(e);
    } finally {
      if (id === runSeq) setBusy(false);
    }
  }

  // ---- wiring --------------------------------------------------------------------------------------
  fileInput.addEventListener('change', () => { const f = fileInput.files?.[0]; if (f) handleFile(f); fileInput.value = ''; });
  loadInput.addEventListener('change', () => { const f = loadInput.files?.[0]; if (f) void onContainer(f); loadInput.value = ''; });

  window.addEventListener('dragover', (e) => { e.preventDefault(); drop.classList.add('dragging'); });
  window.addEventListener('dragleave', (e) => { if (e.relatedTarget === null) drop.classList.remove('dragging'); });
  window.addEventListener('drop', (e) => {
    e.preventDefault();
    drop.classList.remove('dragging');
    const f = e.dataTransfer?.files?.[0];
    if (f) handleFile(f);
  });

  document.querySelectorAll<HTMLButtonElement>('[data-sample]').forEach((b) =>
    b.addEventListener('click', () => {
      const kind = b.dataset.sample as SampleKind;
      const n = Number(sampleSize.value);
      bitmap?.close(); bitmap = null;
      fitBox.hidden = true;
      loadPixels({ name: `sample-${kind}-${n}`, n, pixels: makeSample(kind, n) }, null);
    }));

  const onParams = (): void => { if (source && chkAuto.checked) schedule(150); };
  selB.addEventListener('change', onParams);
  rngEps.addEventListener('input', () => { setEps(Number(rngEps.value)); onParams(); });
  numEps.addEventListener('input', () => { setEps(Number(numEps.value)); onParams(); });
  btnRun.addEventListener('click', () => schedule(0));
  btnDownload.addEventListener('click', () => { if (container) downloadBytes(container, `${containerName}_B${getParams().B}_e${getParams().epsilon}.${FILE_EXT}`); });

  const onFit = (): void => {
    const mode = (document.querySelector<HTMLInputElement>('input[name="fitMode"]:checked')?.value ?? 'crop') as FitMode;
    applyBitmap({ target: Number(fitSize.value), mode });
  };
  fitSize.addEventListener('change', onFit);
  document.querySelectorAll('input[name="fitMode"]').forEach((r) => r.addEventListener('change', onFit));

  const onOverlay = (): void => views.setOverlay({ show: chkOverlay.checked, fill: chkFill.checked, target: selTarget.value as 'both' | 'orig' | 'recon' });
  chkOverlay.addEventListener('change', onOverlay);
  chkFill.addEventListener('change', onOverlay);
  selTarget.addEventListener('change', onOverlay);

  golden.standInBtn.addEventListener('click', () => {
    bitmap?.close(); bitmap = null; fitBox.hidden = true;
    loadPixels({ name: 'golden-standin', n: GOLDEN.size, pixels: STAND_IN_PIXELS.slice(), standIn: true }, null, { B: GOLDEN.B, epsilon: GOLDEN.epsilon });
  });
  golden.goldenBtn.addEventListener('click', () => {
    if (!GOLDEN_PIXELS) return;
    bitmap?.close(); bitmap = null; fitBox.hidden = true;
    loadPixels({ name: 'golden', n: GOLDEN.size, pixels: GOLDEN_PIXELS.slice() }, null, { B: GOLDEN.B, epsilon: GOLDEN.epsilon });
  });

  window.addEventListener('unhandledrejection', (e) => { showError(e.reason); });

  // ---- initial state -------------------------------------------------------------------------------
  populateFit();
  refreshBOptions(LIMITS.MAX_SIZE, DEFAULTS.B);
  setEps(DEFAULTS.epsilon);
  onOverlay();
  updateAvailability();
  // start with something to look at
  loadPixels({ name: 'sample-shapes-128', n: 128, pixels: makeSample('shapes', 128) }, null, DEFAULTS);
}
