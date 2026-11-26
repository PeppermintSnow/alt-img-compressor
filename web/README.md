# web/ — UI for the Two-Layer Automaton Image Compression app

Browser-only (pure TypeScript, Vite). The codec runs in a Web Worker; the UI never imports `core/` directly,
only through `src/core/adapter.ts`. Until the real core is ready it runs against a **mock core**
(`src/core/mock.ts`), so UI work and core work are independent, as in the plan.

```bash
npm install
npm run dev          # mock core, http://localhost:5173
npm test             # 18 tests: mock codec round trips, golden structure, UI parsing logic
npm run build        # type-check + production build into dist/
npm run dev:real     # same UI on top of ../core/src/index.ts (CORE=real)
npm run build:real
```

## What is built (maps to the plan)

| Plan item | Where |
|---|---|
| Upload, grayscale conversion | `ui/imageIO.ts`, `ui/gray.ts` (luma = `(77R + 150G + 29B + 128) >> 8`, transparency flattened onto white) |
| Non-2^k images: restrict or warn on resize | `planFit()` in `ui/imageIO.ts`; `STRICT_POW2` in `config.ts` switches between *warn + resize* (default) and *reject* |
| B and ε controls | left panel; defaults in `config.ts` (`DEFAULTS`) |
| Worker wiring | `worker/core.worker.ts`, `worker/client.ts` (promise API, 30 s watchdog, auto-restart) |
| Download / load file | `ui/fileIO.ts`; extension `.tlac`; loading shows the reconstruction (no original is stored in the file) |
| Stats: per-stream bits, ratio, e/a/d/D counts | `ui/statsPanel.ts` |
| Quadtree overlay | `ui/views.ts` (outline/tint by block type, hover tooltip) |
| PDA trace viewer | `ui/traceViewer.ts` (step, play, keyboard; progressively paints the reconstruction) |
| Golden test | `ui/goldenPanel.ts` + `golden.ts` |
| Error states, responsive layout | `errors.ts`, `ui/toasts.ts`, `styles.css` (phone / tablet / desktop, light + dark) |
| Deployment | `vercel.json`, `deploy/github-pages.yml` |

## The core contract (propose this on Day 1)

`src/core/contract.ts` is the single source of truth. The plan only fixes the two layer outputs; the rest is the UI's request.

```ts
compress(pixels: Uint8Array, size: number, params: { B: number; epsilon: number }): CompressResult
decompress(container: Uint8Array): DecompressResult
pdaTrace(structure: string, size: number, B: number, limit?: number): PdaTrace
```

- `CompressResult.layer1` = `{ structure, colors, residuals, deferredPixels }` and `.layer2` = `{ freqTable, bitstream, x0 }` (from the plan).
- `streamBits` = size in bits of header / structure / colors / residuals / deferred, so the stats panel can show **per-stream bits**.
- `container` = the full file (header + 4 streams). Download and Load use exactly these bytes.
- `pdaTrace` returns one step per structure symbol: `{ step, symbol, action, region, stack }`. Stack entries look like `"4@0,4"` (size@x,y) so the overlay can draw pending blocks. If the real PDA uses another stack alphabet, keep `region` correct and `stack` as any strings; the overlay just skips entries it can't parse.
- `structure` may be `"DDedd…"` or the paper format `"D | D e d d d | …"`; the UI strips everything except `D e a d`.
- Errors: throw anything with a `code` of `BAD_ARGS | BAD_MAGIC | UNSUPPORTED_VERSION | TRUNCATED | CORRUPT` for friendly messages, otherwise the UI shows a generic core error with details.

**Swapping in the real core:** make `../core/src/index.ts` export `compress`, `decompress`, `pdaTrace`, then `npm run dev:real`. If the names differ, change only `src/core/adapter.ts`. The badge in the header shows MOCK CORE / REAL CORE.

## Assumptions to confirm with the core pair (all provisional)

1. **Symbol meanings.** The plan lists e/a/d/D but not their definitions. Assumed: `D` divide into 4 quadrants, `e` exact leaf (all pixels equal, one color), `a` approximate leaf (σ ≤ ε, one color + residuals), `d` deferred B×B block (σ > ε, raw pixels to tANS). Labels live in `config.ts` (`SYMBOLS`).
2. **Child order.** NW, NE, SW, SE (`CHILD_ORDER` in `config.ts`). The UI draws the overlay from the structure string using this order, so it must match the core. A test checks it against the mock.
3. **Defaults for B and ε** (Day-1 decision 3): currently B = 2, ε = 10 (the golden values).
4. **Non-power-of-two policy** (Day-1 decision 2): warn + resize by default, with the warning banner "Resizing is not lossless relative to your original file".
5. **Image limits**: 4×4 up to 512×512; B from 1 to 64 (never larger than the image); ε integer 0–255.

## Golden test

The plan's acceptance test is the 8×8 example (k=3, ε=10, B=2). The golden panel checks structure string, 21 symbols, 10 deferred blocks, 40 deferred pixels, x₀ = 111 and exact reconstruction.

**TODO:** the 64 pixel values are not in the plan text. Paste them (row-major) into `GOLDEN_PIXELS` in `src/golden.ts`; the "Load golden 8×8" button appears automatically. Until then the panel uses a **stand-in image** I invented to produce the same structure under the mock rules. It exercises the structure and counts only; x₀ stays "pending" on the mock.

## Mock caveats

- Layer 1 is a real lossless quadtree coder under the assumptions above. Layer 2 is a **Huffman stand-in for tANS** (`x0` is always 0); do not quote its numbers in the paper.
- With the assumed lossless `a` leaf, a larger ε does not always compress better (bigger blocks have wider residuals). That is a property of the mock, not a UI bug.
- The mock container (version 0) is a placeholder for the real header + 4 streams layout.

## Deploy

- **Vercel:** import the repo, set *Root Directory* to `web`. `vercel.json` handles build + output. For the real core add the build command `npm run build:real`.
- **GitHub Pages:** copy `deploy/github-pages.yml` to `.github/workflows/` at the repo root, enable Pages → Source: GitHub Actions. The build uses relative asset paths, so project sites (`user.github.io/repo/`) work.

## Docs

- `docs/DEMO_SCRIPT.md` — 3-minute demo flow.
- `docs/UI_REGRESSION_CHECKLIST.md` — run before the Dec 2 freeze.
- `docs/screenshots/` — captures made against the mock core (replace after the real core is wired in).
