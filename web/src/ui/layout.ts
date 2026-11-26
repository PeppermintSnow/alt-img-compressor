/** Static page skeleton. Dynamic content is built with DOM calls (see the other ui/ modules). */
export function mountLayout(root: HTMLElement): void {
  root.innerHTML = `
<a class="skip" href="#main">Skip to content</a>
<header class="top">
  <div class="brand">
    <svg class="logo" viewBox="0 0 32 32" aria-hidden="true">
      <rect x="2" y="2" width="28" height="28" rx="5" fill="none" stroke="currentColor" stroke-width="2"/>
      <path d="M16 2v28M2 16h28" stroke="currentColor" stroke-width="2"/>
      <path d="M16 16h14M23 16v14" stroke="var(--c-d)" stroke-width="2"/>
      <rect x="4" y="4" width="10" height="10" rx="1.5" fill="var(--c-e)" opacity=".85"/>
    </svg>
    <div>
      <h1>Two-Layer Automaton Image Compression</h1>
      <p class="sub">PDA quadtree structure + tANS for the deferred pixels. Everything runs in your browser.</p>
    </div>
  </div>
  <span class="badge" id="coreBadge"></span>
</header>

<div id="banner" class="banner" role="status" hidden></div>

<main id="main" class="grid" aria-busy="false">
  <section class="panel controls" aria-labelledby="h-input">
    <h2 id="h-input">Input</h2>
    <input id="fileInput" class="sr-only" type="file" accept="image/*" />
    <label class="drop" id="drop" for="fileInput">
      <strong>Drop an image here</strong>
      <span>or click to browse (PNG, JPEG, WebP, GIF, BMP)</span>
      <small>Converted to 8-bit grayscale, power-of-two square, max 512\u00D7512</small>
    </label>

    <div class="field">
      <span class="lbl">Samples</span>
      <div class="row wrap">
        <button type="button" data-sample="flat">Flat</button>
        <button type="button" data-sample="gradient">Gradient</button>
        <button type="button" data-sample="shapes">Shapes</button>
        <button type="button" data-sample="noise">Noise</button>
      </div>
      <div class="row"><label for="sampleSize" class="inline">Size</label>
        <select id="sampleSize"><option>64</option><option selected>128</option><option>256</option><option>512</option></select></div>
    </div>

    <fieldset class="field" id="fitBox" hidden>
      <legend>Fit to a square</legend>
      <div class="row"><label for="fitSize" class="inline">Size</label><select id="fitSize"></select></div>
      <div class="row wrap">
        <label class="inline"><input type="radio" name="fitMode" value="crop" checked /> Crop center</label>
        <label class="inline"><input type="radio" name="fitMode" value="stretch" /> Stretch</label>
      </div>
    </fieldset>

    <h2 id="h-params">Parameters</h2>
    <div class="field">
      <label for="selB">Block size B</label>
      <select id="selB"></select>
      <small>Smallest quadtree block. Deferred blocks are B\u00D7B.</small>
    </div>
    <div class="field">
      <label for="rngEps">Tolerance \u03B5 <output id="outEps" for="rngEps"></output></label>
      <div class="row"><input id="rngEps" type="range" min="0" max="64" step="1" /><input id="numEps" type="number" min="0" max="255" step="1" aria-label="Epsilon value" /></div>
      <small>Integer \u03C3 test: a block is a leaf when its spread is at most \u03B5.</small>
    </div>
    <label class="inline check"><input type="checkbox" id="chkAuto" checked /> Re-compress automatically</label>
    <button type="button" id="btnRun" class="primary" disabled>Compress</button>

    <h2>File</h2>
    <div class="row wrap">
      <button type="button" id="btnDownload" disabled>Download .tlac</button>
      <input id="loadInput" class="sr-only" type="file" accept=".tlac" />
      <label class="btn" for="loadInput">Load .tlac</label>
    </div>

    <h2>Overlay</h2>
    <label class="inline check"><input type="checkbox" id="chkOverlay" checked /> Show quadtree blocks</label>
    <label class="inline check"><input type="checkbox" id="chkFill" /> Tint by block type</label>
    <div class="row"><label for="selTarget" class="inline">On</label>
      <select id="selTarget"><option value="both">Both images</option><option value="orig">Original</option><option value="recon">Reconstruction</option></select></div>
    <ul class="legend" aria-label="Block types"></ul>
  </section>

  <section class="panel views" aria-labelledby="h-views">
    <h2 id="h-views">Images</h2>
    <div id="views"></div>
    <div id="structureBox" class="structure" hidden>
      <h3>Structure string</h3>
      <code id="structureText" tabindex="0"></code>
    </div>
    <p id="status" class="muted small" aria-live="polite"></p>
  </section>

  <section class="panel stats" id="stats" aria-label="Results"></section>
  <section class="panel trace" id="trace" aria-label="PDA trace"></section>
  <details class="panel golden" id="golden"></details>
</main>

<footer class="foot">Defaults, symbol meanings and the child order are provisional until the Day-1 interface decisions are locked (see README).</footer>
<div id="toasts" class="toasts" aria-live="polite"></div>`;
}
