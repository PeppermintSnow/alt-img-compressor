# Demo script (about 3 minutes)

Build against the **real core** (`npm run build:real`) before presenting. Check the header badge says REAL CORE.

1. **The idea (20 s).** "A pushdown automaton codes the quadtree structure. Pixels that are too busy for a flat block are deferred to a second layer, a tANS entropy coder."
2. **Load a picture (20 s).** Drop Lena (or any photo). Point out the banner: grayscale, resized to a power of two.
3. **The overlay (30 s).** Show the quadtree outlines. Green = exact, blue = approximate, amber = deferred, grey lines = divisions. Hover a block for its type and size.
4. **Parameters (30 s).** Drag ε up: fewer, bigger blocks. Change B: smaller or larger deferred blocks. Show the ratio updating.
5. **Stats (20 s).** Per-stream bits: where the bytes actually go. Lossless check says exact.
6. **PDA trace (40 s).** Scroll to the trace. Step through the first symbols: pop a block, push four quadrants, emit leaves. Press play and watch the reconstruction fill in.
7. **Golden test (20 s).** Open the golden panel, load the 8×8 example: structure string, 21 symbols, 10 deferred blocks, x₀ = 111, exact.
8. **Round trip (20 s).** Download the `.tlac`, reload the page, load the file: the decoder rebuilds the image from bytes alone.

Backup if the live demo fails: screenshots in `docs/screenshots/`.
