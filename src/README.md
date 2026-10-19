# T2Smart-PicHancer — AI Photo Studio

This generator is **T2Smart-PicHancer**, a complete **web photo studio**

## The Perchance app (this page)

`index.html` + `src/psx/` is a full photo editor (all on-device unless noted):

- Import: upload (EXIF auto lens-profile), drag-drop, procedural demo photo,
  3 Picsum samples + 4-photo AI example gallery; kv-plugin project autosave + resume; share-link presets (#s=)
- 212 Looks (curated: 15 near-duplicates removed after pairwise photo-pixel comparison; mined  grades § below), live thumbnails, unlocked: Free 12, Portrait 23, Nature 20, B&W 27,
  HDR 8, Warm 3, Matte 8, Light 2, Duotone 17, Splash 3, White Balance 3, Film 19,
  Seasonal, Aerial, Style 34 (pre-baked artistic grades)
- Light / Color / FX / Detail sliders; Curves (RGB+R+G+B, monotone spline)
- Layers: brush/radial/linear selective masks + per-layer adjustments
- Lens: EXIF reader + 17-profile table + auto-apply; manual distortion/CA/vignette
- Portrait beta: depth bokeh (point/linear, poisson gather + bloom) + local face
  detection (skin-tone + components, no network) + AI Detect (MediaPipe
  BlazeFace, lazy) + lighten/smooth/warmth refine
- Collage: 10 layouts, per-cell photo/zoom/effect (tap a picture to select —
  cyan outline + numbered badges; 213-chip effect grid), 2400px export
- Collage Studio (new window): freeform board + 67 borderless auto-fit templates (28 Classic grids; 22 fantasy: oblique/curvy/strange; 17 mined Picsart polygons: hex/tri/shard/mandala; SVG thumbnails, category chips, gap
  slider) — photo tray (main photo, gallery examples, uploads, file drop,
  drag onto board), new photos snap into empty cells (click a dashed cell to
  target it), drag-to-move, drop-to-swap (slots travel, pixel-exact re-snap),
  drag into empty cells, drag/resize out for freeform, per-picture
  effect/zoom/order, canvas presets + bg; Done sends 2400px composite to main
  app (popup closes) for full effects afterwards
- Video looks: per-frame GPU grade of uploaded clips, WebM export
- Gen Fill beta: paint mask + prompt → generateImage tile, tone-matched blend
- Crop (ratios/rotate/flip/straighten), gradient-aware Heal, Text (measured hit-test)
- Gallery: 4 built-in AI examples (portrait/lake/city/macro) + kv-backed user
  saves (1280px JPEG, cap 24, oldest evicted); "Save to gallery" in editor header;
  export pipeline extracted to renderFullCanvas() shared by export + gallery
- RGB histogram (single-pass), render-time + GPU/CPU badge, undo 60 / redo,
  hold-for-before, JPEG/PNG export (JPEG keeps camera EXIF: orientation/dims
  patched, thumbnail IFD dropped); 12-locale i18n chrome; responsive to 390px

## Engine + pipeline order

`engine.js` (CPU) / `gpu.js` (WebGL2, ~16x faster, parity mean ≤0.5/max ≤5):
base geometry → lens warp → bokeh → grade (look LUT + tone + curves) →
detail (fixed clamped box blur) → layers → face → readback → heal → genfill → text.

- Color: consistent sRGB end-to-end (canvas defaults, UNPACK_CONVERSION_NONE,
  values never double-gamma'd). No wide-gamut I/O yet.
- Fixed along the way: CPU blur 1.4x-gain bug, double histogram, grain shimmer,
  per-pixel LUT rebuild, 41 look-array/scalar bugs (incl. pinhole/hcbw = black),
  sparse-bokeh dither (per-pixel kernel rotation).
- Deferred: liquify warp, true masked inpainting (needs model support), P3 output.
- Look curation: 227 → 212 after pairwise comparison (512-color LUT grid + 38k
  landscape/portrait photo pixels) removed 15 looks indistinguishable from a kept
  twin (photo mean <3/255, max <9/255): Warm 1 (= Cloudy), Daylight (≈ Normal),
  Autumn (= Golden Hour Skin), Summer (= Canyon Red), Austell (= Matte 3 Cool),
  Alpine + Murphy (= Classic), Corona (= RevoGold), Carson (= HDR Detail),
  Blossom (= Rosé), Prospect (= CCD Flash), Matte 5 (= Studio Clean),
  Beauty + Matte 4 (= Light 2 / Matte 2 chain), Savanna (= Amber Hour).
  Kept the better recipe/name of each pair (mined Picsart/Lumii recipes and
  functional WB names preferred); Warm 2 renamed Warm Glow (id `warm2` unchanged,
  saved projects unaffected). Looks with different fx keys (grain/vignette/
  scanlines/halftone) were never candidates — the fx alone makes them distinct.

The 37k-file tree stays in private `scratch/` (NOT `src/`: 10k-file cap, public, quota).
APK assembly (`apktool b` → `zipalign` → `apksigner`) runs locally per `REBUILD.md`.

## Spectra engine (new spatial fx, CPU/GPU parity-verified)
- New look-fx keys, uniform-driven (zero shader recompiles): shift (RGB split),
  mirror (center blend), pixel (mosaic), half (dot screen), scan (scanlines),
  leak + leakVar (corner washes), poster (post-grade levels).
- CPU gradePass: pre-grade neighbor reads run on an ungraded copy via a
  bilinear sampler (matches GPU linear filtering); grain hash now bit-identical
  to the CPU integer hash (fixed a latent mismatch in ALL grain looks).
- Parity on synthetic test (see scratch/shots/spectra-sheet.jpg): 37 new looks
  max ≤4; xerox max 64/mean 0.17 — isolated poster-step edge pixels (same class
  as pre-existing style-poster 42 / style-solar 67, invisible in practice).
- Neon edge key (Picsart neon.fs Sobel, simplified to cyan glow): CPU engine.js
  + GPU shader + uniform, parity max 2/mean 0.2 on synthetic edge test.

## Teardown mining ( private scratch/)
-  `assets/collage_resources/all_collages.json`: 115 layouts, 38 fully
  non-rect polygons — 17 curated into the Studio (hex/tri/shard/mandala set).
  Paths are normalized `x,y` polygons = our `{p}` cell format verbatim.
-  `assets/effects_json/` (170) + `assets/shaders/` (22 .fs): graph
  skeletons over native kernels; ported exact math: light_cross.fs channel
  quadratics (Cross Light), lomo.fs per-channel pow + contrast stretch (Lomo
  Pop), GradientMap violet/green/orange stops, ColorBalance 3-way offsets
  (Split Tone). Vignette/Orton/HDR/Lomo param defaults informed ranges.
- `res/raw/local_filter_packs.json`: 47 packs / 219 filters — LUT webps
  are remote (not bundled), so no LUT-file support was built; the pack
  vocabulary (kodak/fuji/ricoh/ccd/nineties/morandi/noir/misty/amber/grain)
  guided 8 new parametric film looks instead.
-  `assets/1000-hashed-binary.filter` (780 B, high entropy — encrypted
  recipe blob) + server-side presets: not reverse-engineered (low payoff).
-  `bend_presets.json` (arc/sinusoidal/wave text bends): deferred —
  needs text-on-path; our Text tool is stamp-only.

## AI enhancement layer (on-device restoration)
- Enhance tab: heuristic photo analysis (Laplacian sharpness, noise residual,
  8px-block JPEG score, MP count) with a 2x/4x recommendation, then real
  Real-ESRGAN general-x4v3 super-resolution (BSD-3-Clause, xinntao) via
  onnxruntime-web 1.20 WASM in `src/psx/enhance.js` — tiled 128px + 16px
  feathered overlap, progress + cancel, AI-strength blend vs bicubic baseline,
  hold-to-compare result preview, "Use as new source" + one-step Revert.
  Modes: 2x Detail (half-size AI input, ≈4× faster), 4x Max (≤512px AI input).
  Verified: 1200×800 → 2400×1600; real-photo AI 2x visibly crisper than
  bicubic (tablet-edge test); WebGPU EP fails on old adapters (ORT Clip-kernel
  bug, filed away by design) so WASM is the pinned path — deterministic
  everywhere, ~0.55 s per 128px tile.
- Portrait "AI Detect": MediaPipe BlazeFace short-range (Apache-2.0 runtime +
  model, lazy CDN load, GPU delegate) places face boxes; falls back to the
  local skin-tone scan on miss/failure. Verified on portraits (14–70 ms warm).
- Export: camera EXIF APP1 carried from upload to JPEG export (`lens.js`
  extract/patch: Orientation → 1 since pixels decode upright, dimensions
  updated, stale thumbnail IFD dropped; PNG deliberately skipped).
- Provenance & licenses: Real-ESRGAN weights BSD-3-Clause (HF mirror
  Heliosoph/realesrgan-onnx; permanent hosted copy
  `15ac147c…bin`); onnxruntime-web Apache-2.0 (jsdelivr pin);
  MediaPipe tasks-vision + BlazeFace model Apache-2.0 (jsdelivr/GCS pins).
  Mined look recipes are parametric re-implementations, Lumii LUTs/VSCO blobs
  were never bundled, and the decompile kit stays in private `scratch/` and
  never ships — but per the external review, audit all of this with counsel
  before any commercial release.
- Deferred: face-restoration models (GFPGAN/CodeFormer too big to host),
  mask-conditioned inpainting (OpenCV.js Telea is the leading candidate),
  TIFF/P3 output.

## Brand / UI (T2Smart-PicHancer)
- Name: T2Smart-PicHancer everywhere ($meta, header, brand bar, toasts, kv lang key `t2sLang`).
- Assets (AI-generated, hosted): logo `e6e9528b…jpg`, app bg texture `8c154bfe…jpg`,
  banner `bafd0777…jpg` (see `index.html`); glossy-button image was design reference (CSS gradients).
- Looks grid: full-width filmstrip dock below the stage (6 columns on desktop,
  same 192×128 thumbs, own scrollbar, sticky category chips); in Looks mode the
  side panel collapses to a narrow tab rail so the stage goes full-width too
  (on phones the rail moves above the stage). Other tabs restore the full side
  panel and hide the dock.
- Layered effects: "Apply effect" commits the current look + amount as a stack
  layer (max 6, listed with per-layer ✕ remove); committed layers run first
  through a look-only pass (`gradePass` lookOnly mode / GPU `process` stack
  arg), then the live look + tone sliders as before. Empty stack is
  pixel-identical to the old single-look path (verified parity mean ≤0.5).
  Undo/redo are snapshot-based so each Apply/remove peels exactly one layer;
  thumbnails render over the current stack (WYSIWYG); export/video/collage-
  Done all include the stack (collage cells keep their own single effect).
