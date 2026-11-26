# UI regression checklist (before the Dec 2 freeze)

Run once on desktop Chrome and once on a phone-width window. Use the **real core** build.

## Input
- [ ] Drop a PNG, a JPEG, a WebP; each is grayscaled and shown
- [ ] A 256×256 PNG loads with no resize banner
- [ ] A non-square or non-2^k image shows the resize banner; changing Size / Crop / Stretch re-runs
- [ ] A transparent PNG becomes white where transparent
- [ ] A `.txt` file shows "is not an image"; a >20 MB image shows the size error
- [ ] Samples (flat / gradient / shapes / noise) work at 64, 128, 256, 512

## Compression
- [ ] B options never exceed the image size; ε slider and number box stay in sync
- [ ] Auto re-compress on/off behaves; the Compress button works when off
- [ ] 512×512 noise with B = 1 finishes in a few seconds and stays responsive
- [ ] Lossless check says exact for flat, gradient, shapes, noise and Lena

## Results
- [ ] Per-stream bits add up to the compressed size; ratio and bits per pixel agree
- [ ] e / a / d / D counts match the structure string length

## Overlay and trace
- [ ] Overlay toggle, tint and "On" selector work; hover tooltip shows block type
- [ ] Trace: next / previous / first / last / play / pause / speed / slider / arrow keys
- [ ] "Show final image" restores the full reconstruction
- [ ] Large trace shows the "limited to the first 5,000 steps" note

## Files and errors
- [ ] Download `.tlac`, reload, Load: same image, no original, lossless check says n/a
- [ ] A random file renamed `.tlac` shows the friendly container error, no crash
- [ ] Killing the network after load changes nothing (everything is local)

## Golden test
- [ ] 8×8 loads; all rows pass with the real core and real pixels (x₀ = 111)

## Layout
- [ ] No horizontal scroll at 390 px; panels stack; light and dark both readable
- [ ] Keyboard: Tab reaches every control; focus ring visible
