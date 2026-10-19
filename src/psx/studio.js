/* T2Smart-PicHancer — Collage Studio: freeform collage in its own window.
   Opens a real popup (same-origin about:blank; falls back to a fullscreen
   overlay if popups are blocked) with a photo tray (main photo, gallery
  examples, uploads, file drop), 28 auto-fit templates (new photos snap into
  empty cells, drag between cells to swap/snap, gap control) and a modular
  board: pictures are dragged to move, dropped onto each other to swap,
  resized via handle (dragging out of a cell goes freeform). Done composites
   at up to 2400px, transfers into the main app via setSource (popup closes),
   and every normal effect then applies to the finished collage.
   All logic runs in the MAIN window context (engine stays single-source);
   the popup/overlay is purely a view (same-origin DOM access). */
(function () {
  "use strict";
  const PRESETS = {
    "1:1": [1000, 1000], "4:3": [1000, 750], "3:2": [1050, 700],
    "16:9": [1120, 630], "9:16": [700, 1120], "3:4": [840, 1120]
  };
  const BGS = ["#101736", "#000000", "#ffffff", "#1d2b53", "#7e2553", "#008751", "#ab5236", "#5f574f"];
  // ---- Collage templates: fractional cells tiling the board (auto-fit w/ gutter) ----
  const TPL = (id, name, cells, gap, cat) => ({ id, name, cells, gap, cat: cat || "grid" });
  // fantasy-shape generators: fractional point lists
  function revPts(a) { return a.slice().reverse(); }
  function edgeSine(x0, x1, y, amp, waves, n) {
    const pts = [];
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      pts.push([x0 + (x1 - x0) * t,
        y + amp * Math.sin(t * waves * 2 * Math.PI)]);
    }
    return pts;
  }
  function edgeArch(x0, x1, yBase, yPeak, n) {
    const pts = [];
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      pts.push([x0 + (x1 - x0) * t,
        yBase - (yBase - yPeak) * Math.sin(Math.PI * t)]);
    }
    return pts;
  }
  function edgeArc(cx, cy, r, a0, a1, n, sy) {
    const pts = [], k = sy || 1;
    for (let i = 0; i <= n; i++) {
      const a = a0 + (a1 - a0) * (i / n);
      pts.push([cx + r * Math.cos(a), cy + r * k * Math.sin(a)]);
    }
    return pts;
  }
  function ellPts(cx, cy, rx, ry, n) {
    const pts = [];
    for (let i = 0; i < n; i++) {
      const a = (i / n) * 2 * Math.PI;
      pts.push([cx + rx * Math.cos(a), cy + ry * Math.sin(a)]);
    }
    return pts;
  }
  function fanCells(cx, cy, rim) {
    const cells = [];
    for (let i = 0; i < rim.length; i++)
      cells.push({ p: [[cx, cy], rim[i], rim[(i + 1) % rim.length]] });
    return cells;
  }
  const TEMPLATES = [
    TPL("full", "1 · Full bleed", [[0, 0, 1, 1]]),
    TPL("frame", "1 · Framed", [[0.08, 0.08, 0.84, 0.84]], false),
    TPL("duo-side", "2 · Side by side", [[0, 0, 0.5, 1], [0.5, 0, 0.5, 1]]),
    TPL("duo-stack", "2 · Stacked", [[0, 0, 1, 0.5], [0, 0.5, 1, 0.5]]),
    TPL("duo-left", "2 · Feature left", [[0, 0, 0.65, 1], [0.65, 0, 0.35, 1]]),
    TPL("duo-top", "2 · Feature top", [[0, 0, 1, 0.65], [0, 0.65, 1, 0.35]]),
    TPL("duo-band", "2 · Wide + band", [[0, 0, 1, 0.78], [0, 0.78, 1, 0.22]]),
    TPL("trio-row", "3 · Row", [[0, 0, 1/3, 1], [1/3, 0, 1/3, 1], [2/3, 0, 1/3, 1]]),
    TPL("trio-col", "3 · Column", [[0, 0, 1, 1/3], [0, 1/3, 1, 1/3], [0, 2/3, 1, 1/3]]),
    TPL("trio-left", "3 · Feature left", [[0, 0, 0.6, 1], [0.6, 0, 0.4, 0.5], [0.6, 0.5, 0.4, 0.5]]),
    TPL("trio-top", "3 · Feature top", [[0, 0, 1, 0.6], [0, 0.6, 0.5, 0.4], [0.5, 0.6, 0.5, 0.4]]),
    TPL("trio-bottom", "3 · Feature bottom", [[0, 0, 0.5, 0.4], [0.5, 0, 0.5, 0.4], [0, 0.4, 1, 0.6]]),
    TPL("quad", "4 · Grid", [[0, 0, 0.5, 0.5], [0.5, 0, 0.5, 0.5], [0, 0.5, 0.5, 0.5], [0.5, 0.5, 0.5, 0.5]]),
    TPL("quad-row", "4 · Row", [[0, 0, 0.25, 1], [0.25, 0, 0.25, 1], [0.5, 0, 0.25, 1], [0.75, 0, 0.25, 1]]),
    TPL("quad-col", "4 · Column", [[0, 0, 1, 0.25], [0, 0.25, 1, 0.25], [0, 0.5, 1, 0.25], [0, 0.75, 1, 0.25]]),
    TPL("quad-left", "4 · Feature left", [[0, 0, 0.62, 1], [0.62, 0, 0.38, 1/3], [0.62, 1/3, 0.38, 1/3], [0.62, 2/3, 0.38, 1/3]]),
    TPL("quad-top", "4 · Feature top", [[0, 0, 1, 0.6], [0, 0.6, 1/3, 0.4], [1/3, 0.6, 1/3, 0.4], [2/3, 0.6, 1/3, 0.4]]),
    TPL("quad-right", "4 · Feature right", [[0, 0, 0.38, 0.5], [0, 0.5, 0.38, 0.5], [0.38, 0, 0.62, 1]]),
    TPL("five-32", "5 · 3 + 2", [[0, 0, 1/3, 0.55], [1/3, 0, 1/3, 0.55], [2/3, 0, 1/3, 0.55], [0, 0.55, 0.5, 0.45], [0.5, 0.55, 0.5, 0.45]]),
    TPL("five-feat", "5 · Feature + 4", [[0, 0, 0.58, 1], [0.58, 0, 0.21, 0.5], [0.79, 0, 0.21, 0.5], [0.58, 0.5, 0.21, 0.5], [0.79, 0.5, 0.21, 0.5]]),
    TPL("five-row", "5 · Row", [[0, 0, 0.2, 1], [0.2, 0, 0.2, 1], [0.4, 0, 0.2, 1], [0.6, 0, 0.2, 1], [0.8, 0, 0.2, 1]]),
    TPL("five-top", "5 · Top + 4", [[0, 0, 1, 0.55], [0, 0.55, 0.25, 0.45], [0.25, 0.55, 0.25, 0.45], [0.5, 0.55, 0.25, 0.45], [0.75, 0.55, 0.25, 0.45]]),
    TPL("six-grid", "6 · Grid 3x2", [[0, 0, 1/3, 0.5], [1/3, 0, 1/3, 0.5], [2/3, 0, 1/3, 0.5], [0, 0.5, 1/3, 0.5], [1/3, 0.5, 1/3, 0.5], [2/3, 0.5, 1/3, 0.5]]),
    TPL("six-col", "6 · Grid 2x3", [[0, 0, 0.5, 1/3], [0.5, 0, 0.5, 1/3], [0, 1/3, 0.5, 1/3], [0.5, 1/3, 0.5, 1/3], [0, 2/3, 0.5, 1/3], [0.5, 2/3, 0.5, 1/3]]),
    TPL("six-feat", "6 · Feature + 5", [[0, 0, 0.66, 0.66], [0.66, 0, 0.34, 0.33], [0.66, 0.33, 0.34, 0.33], [0, 0.66, 1/3, 0.34], [1/3, 0.66, 1/3, 0.34], [2/3, 0.66, 1/3, 0.34]]),
    TPL("seven-feat", "7 · Feature + 6", [[0, 0, 0.55, 1], [0.55, 0, 0.225, 1/3], [0.775, 0, 0.225, 1/3], [0.55, 1/3, 0.225, 1/3], [0.775, 1/3, 0.225, 1/3], [0.55, 2/3, 0.225, 1/3], [0.775, 2/3, 0.225, 1/3]]),
    TPL("eight-grid", "8 · Grid 4x2", [[0, 0, 0.25, 0.5], [0.25, 0, 0.25, 0.5], [0.5, 0, 0.25, 0.5], [0.75, 0, 0.25, 0.5], [0, 0.5, 0.25, 0.5], [0.25, 0.5, 0.25, 0.5], [0.5, 0.5, 0.25, 0.5], [0.75, 0.5, 0.25, 0.5]]),
    TPL("nine-grid", "9 · Grid 3x3", [[0, 0, 1/3, 1/3], [1/3, 0, 1/3, 1/3], [2/3, 0, 1/3, 1/3], [0, 1/3, 1/3, 1/3], [1/3, 1/3, 1/3, 1/3], [2/3, 1/3, 1/3, 1/3], [0, 2/3, 1/3, 1/3], [1/3, 2/3, 1/3, 1/3], [2/3, 2/3, 1/3, 1/3]]),
    TPL("f-slash-r", "Oblique duo", [
      { p: [[0, 0], [0.62, 0], [0.38, 1], [0, 1]] },
      { p: [[0.62, 0], [1, 0], [1, 1], [0.38, 1]] }], false, "oblique"),
    TPL("f-slash-l", "Oblique duo flip", [
      { p: [[0, 0], [0.38, 0], [0.62, 1], [0, 1]] },
      { p: [[0.38, 0], [1, 0], [1, 1], [0.62, 1]] }], false, "oblique"),
    TPL("f-slant-3", "Slant trio", [
      { p: [[0, 0], [0.45, 0], [0.33, 1], [0, 1]] },
      { p: [[0.45, 0], [0.78, 0], [0.66, 1], [0.33, 1]] },
      { p: [[0.78, 0], [1, 0], [1, 1], [0.66, 1]] }], false, "oblique"),
    TPL("f-pinwheel", "Pinwheel", [
      { p: [[0, 0], [1, 0], [0.5, 0.5]] },
      { p: [[1, 0], [1, 1], [0.5, 0.5]] },
      { p: [[1, 1], [0, 1], [0.5, 0.5]] },
      { p: [[0, 1], [0, 0], [0.5, 0.5]] }], false, "oblique"),
    TPL("f-burst-6", "Burst 6", fanCells(0.5, 0.5, [
      [0.3, 0], [0.75, 0], [1, 0.4], [0.65, 1], [0.25, 1], [0, 0.45]
    ]), false, "oblique"),
    TPL("f-burst-8", "Burst 8", fanCells(0.5, 0.5, [
      [0.15, 0], [0.5, 0], [0.85, 0], [1, 0.35],
      [0.8, 1], [0.45, 1], [0.1, 1], [0, 0.55]
    ]), false, "oblique"),
    TPL("f-fault", "Fault lines", [
      { p: [[0, 0], [0.7, 0], [0.55, 0.5], [0, 0.5]] },
      { p: [[0.7, 0], [1, 0], [1, 0.5], [0.55, 0.5]] },
      { p: [[0, 0.5], [0.55, 0.5], [0.4, 1], [0, 1]] },
      { p: [[0.55, 0.5], [1, 0.5], [1, 1], [0.4, 1]] }], false, "oblique"),
    TPL("f-chevron", "Chevron duo", [
      { p: [[0, 0], [1, 0], [1, 0.42], [0.5, 0.72], [0, 0.42]] },
      { p: [[0, 0.42], [0.5, 0.72], [1, 0.42], [1, 1], [0, 1]] }]
      , false, "oblique"),
    TPL("f-zigzag", "Zigzag trio", [
      { p: [[0, 0], [1, 0], [1, 0.36], [0.75, 0.3],
        [0.5, 0.36], [0.25, 0.3], [0, 0.36]] },
      { p: [[0, 0.36], [0.25, 0.3], [0.5, 0.36], [0.75, 0.3], [1, 0.36],
        [1, 0.68], [0.75, 0.62], [0.5, 0.68], [0.25, 0.62], [0, 0.68]] },
      { p: [[0, 0.68], [0.25, 0.62], [0.5, 0.68], [0.75, 0.62],
        [1, 0.68], [1, 1], [0, 1]] }], false, "oblique"),
    TPL("f-tilt-3", "Tilt bands", [
      { p: [[0, 0], [1, 0], [1, 0.28], [0, 0.34]] },
      { p: [[0, 0.34], [1, 0.28], [1, 0.66], [0, 0.6]] },
      { p: [[0, 0.6], [1, 0.66], [1, 1], [0, 1]] }], false, "oblique"),
    TPL("f-wave-2", "Wave duo", (function () {
      const e = edgeSine(0, 1, 0.5, 0.07, 2, 24);
      return [
        { p: [[0, 0], [1, 0]].concat(revPts(e)) },
        { p: e.concat([[1, 1], [0, 1]]) }];
    })(), false, "curvy"),
    TPL("f-wave-3", "Wave trio", (function () {
      const a = edgeSine(0, 1, 0.36, 0.05, 2, 24);
      const b = edgeSine(0, 1, 0.68, 0.05, 3, 24);
      return [
        { p: [[0, 0], [1, 0]].concat(revPts(a)) },
        { p: a.concat([[1, b[b.length - 1][1]]]).concat(revPts(b)) },
        { p: b.concat([[1, 1], [0, 1]]) }];
    })(), false, "curvy"),
    TPL("f-dome", "Dome duo", (function () {
      const e = edgeArch(0, 1, 0.62, 0.3, 20);
      return [
        { p: [[0, 0], [1, 0], [1, 0.62]].concat(revPts(e)) },
        { p: e.concat([[1, 1], [0, 1]]) }];
    })(), false, "curvy"),
    TPL("f-arches", "Twin arches", [
      { p: [[0.04, 1], [0.04, 0.5], [0.093, 0.354], [0.145, 0.231],
        [0.198, 0.149], [0.25, 0.12], [0.303, 0.149], [0.355, 0.231],
        [0.408, 0.354], [0.46, 0.5], [0.46, 1]] },
      { p: [[0.54, 1], [0.54, 0.5], [0.593, 0.354], [0.645, 0.231],
        [0.698, 0.149], [0.75, 0.12], [0.803, 0.149], [0.855, 0.231],
        [0.908, 0.354], [0.96, 0.5], [0.96, 1]] }], false, "curvy"),
    TPL("f-orbs", "Orbs trio", [
      { p: ellPts(0.3, 0.4, 0.26, 0.3, 28) },
      { p: ellPts(0.7, 0.38, 0.28, 0.32, 28) },
      { p: ellPts(0.5, 0.74, 0.27, 0.28, 28) }], false, "curvy"),
    TPL("f-eclipse", "Eclipse", (function () {
      const cx = 0.5, cy = 0.5, r = 0.3, sy = 0.34 / 0.3, PI = Math.PI;
      return [
        { p: ellPts(cx, cy, r, r * sy, 36) },
        { p: [[0, 0], [0.5, 0]]
          .concat(edgeArc(cx, cy, r, PI / 2, PI, 12, sy))
          .concat([[0, 0.5]]) },
        { p: [[0.5, 0], [1, 0], [1, 0.5]]
          .concat(edgeArc(cx, cy, r, 0, -PI / 2, 12, sy)) },
        { p: [[0, 0.5]]
          .concat(edgeArc(cx, cy, r, PI, PI * 1.5, 12, sy))
          .concat([[0.5, 1], [0, 1]]) },
        { p: [[1, 0.5], [1, 1], [0.5, 1]]
          .concat(edgeArc(cx, cy, r, PI * 1.5, PI * 2, 12, sy)) }];
    })(), false, "curvy"),
    TPL("f-petals", "Petals", [
      { p: ellPts(0.5, 0.3, 0.17, 0.28, 24) },
      { p: ellPts(0.5, 0.7, 0.17, 0.28, 24) },
      { p: ellPts(0.3, 0.5, 0.28, 0.17, 24) },
      { p: ellPts(0.7, 0.5, 0.28, 0.17, 24) },
      { p: ellPts(0.5, 0.5, 0.2, 0.2, 24) }], false, "curvy"),
    TPL("f-lens", "Lens frame", [
      [0, 0, 1, 1],
      { p: ellPts(0.5, 0.5, 0.32, 0.36, 36) }], false, "curvy"),
    TPL("f-peaks", "Peaks trio", [
      { p: [[0.02, 0.9], [0.22, 0.25], [0.42, 0.9]] },
      { p: [[0.33, 0.9], [0.58, 0.15], [0.83, 0.9]] },
      { p: [[0.64, 0.9], [0.88, 0.35], [1.0, 0.9]] }], false, "strange"),
    TPL("f-cards", "Falling cards", [
      { p: [[0.02, 0.1], [0.52, 0.1], [0.42, 0.9], [0.02, 0.9]] },
      { p: [[0.3, 0.05], [0.8, 0.05], [0.7, 0.95], [0.2, 0.95]] },
      { p: [[0.58, 0.1], [1, 0.1], [0.95, 0.9], [0.5, 0.9]] }]
      , false, "strange"),
    TPL("f-shards", "Shard scatter", [
      { p: [[0.05, 0.05], [0.35, 0.08], [0.2, 0.35]] },
      { p: [[0.55, 0.02], [0.95, 0.05], [0.8, 0.3], [0.6, 0.25]] },
      { p: [[0.1, 0.5], [0.4, 0.45], [0.35, 0.8], [0.08, 0.85]] },
      { p: [[0.55, 0.45], [0.9, 0.4], [0.95, 0.9], [0.5, 0.85]] },
      { p: [[0.42, 0.3], [0.6, 0.45], [0.5, 0.65], [0.35, 0.5]] }]
      , false, "strange"),
    TPL("f-cross", "Crossroads", [
      { p: [[0.35, 0], [0.65, 0], [0.65, 1], [0.35, 1]] },
      { p: [[0, 0.35], [1, 0.35], [1, 0.65], [0, 0.65]] }], false, "strange"),
TPL("p-custom-collage59", "Slash tri", [
  { p: [[0, 0], [0, 1], [1, 0]] },
  { p: [[1, 0], [0, 1], [1, 1]] },
], false, "oblique"),
TPL("p-custom-collage47", "Hex trio", [
  { p: [[0.285, 0.066], [0.07, 0.19], [0.07, 0.438], [0.285, 0.562], [0.5, 0.438], [0.5, 0.19]] },
  { p: [[0.715, 0.066], [0.5, 0.19], [0.5, 0.438], [0.715, 0.562], [0.93, 0.438], [0.93, 0.19]] },
  { p: [[0.5, 0.438], [0.285, 0.562], [0.285, 0.81], [0.5, 0.934], [0.715, 0.81], [0.715, 0.562]] },
], false, "oblique"),
TPL("p-custom-collage66", "Triad", [
  { p: [[0, 0], [0, 1], [0.5, 0.5]] },
  { p: [[0, 0], [0.5, 0.5], [1, 0]] },
  { p: [[0, 1], [1, 1], [1, 0]] },
], false, "oblique"),
TPL("p-custom-collage77", "Shard trio", [
  { p: [[0, 0], [0, 0.5], [0.5, 0.5], [0.775, 0]] },
  { p: [[0.775, 0], [0.5, 0.5], [0.775, 1], [1, 1], [1, 0]] },
  { p: [[0, 0.5], [0, 1], [0.775, 1], [0.5, 0.5]] },
], false, "oblique"),
TPL("p-custom-collage36", "Slant duo", [
  { p: [[0, 0], [0, 1], [0.3, 1], [0.6, 0]] },
  { p: [[0.6, 0], [0.3, 1], [1, 1], [1, 0]] },
], false, "oblique"),
TPL("p-custom-collage8", "Blade quartet", [
  { p: [[0, 0], [0, 1], [0.279, 1], [0.232, 0]] },
  { p: [[0.232, 0], [0.279, 1], [0.477, 1], [0.515, 0]] },
  { p: [[0.515, 0], [0.477, 1], [0.779, 1], [0.732, 0]] },
  { p: [[0.732, 0], [0.779, 1], [1, 1], [1, 0]] },
], false, "strange"),
TPL("p-custom-collage29", "Notch quad", [
  { p: [[0, 0], [0, 0.644], [0.356, 0.644], [0.644, 0.356], [0.644, 0]] },
  { p: [[0.644, 0], [0.644, 0.356], [1, 0.356], [1, 0]] },
  { p: [[0, 0.644], [0, 1], [0.356, 1], [0.356, 0.644]] },
  { p: [[0.356, 0.644], [0.356, 1], [1, 1], [1, 0.356], [0.644, 0.356]] },
], false, "strange"),
TPL("p-custom-collage51", "Kite quad", [
  { p: [[0, 0], [0, 1], [0.5, 1]] },
  { p: [[0, 0], [0.5, 1], [0.5, 0]] },
  { p: [[0.5, 0], [0.5, 1], [1, 0]] },
  { p: [[1, 0], [0.5, 1], [1, 1]] },
], false, "strange"),
TPL("p-custom-collage63", "Shard quad", [
  { p: [[0, 0.5], [0, 1], [0.5, 1]] },
  { p: [[0, 0], [0, 0.5], [0.5, 1], [1, 1]] },
  { p: [[0, 0], [1, 1], [1, 0.5], [0.5, 0]] },
  { p: [[0.5, 0], [1, 0.5], [1, 0]] },
], false, "strange"),
TPL("p-custom-collage83", "Gem five", [
  { p: [[0, 0], [0, 0.5], [0.219, 0.5], [0.5, 0.219], [0.5, 0]] },
  { p: [[0.5, 0], [0.5, 0.219], [0.782, 0.5], [1, 0.5], [1, 0]] },
  { p: [[0.219, 0.5], [0.5, 0.782], [0.782, 0.5], [0.5, 0.219]] },
  { p: [[0, 0.5], [0, 1], [0.5, 1], [0.5, 0.782], [0.219, 0.5]] },
  { p: [[0.5, 0.782], [0.5, 1], [1, 1], [1, 0.5], [0.782, 0.5]] },
], false, "strange"),
TPL("p-custom-collage94", "Arrow five", [
  { p: [[0, 0], [0, 0.285], [0.5, 0.448], [0.5, 0]] },
  { p: [[0.5, 0], [0.5, 0.448], [1, 0.281], [1, 0]] },
  { p: [[0, 0.285], [0, 1], [0.1, 1], [0.5, 0.448]] },
  { p: [[0.5, 0.448], [0.1, 1], [0.9, 1]] },
  { p: [[0.5, 0.448], [0.9, 1], [1, 1], [1, 0.281]] },
], false, "strange"),
TPL("p-custom-collage21", "Prism six", [
  { p: [[0, 0], [0.336, 0.45], [0.5, 0.182], [0.5, 0]] },
  { p: [[0.5, 0], [0.5, 0.182], [0.664, 0.45], [1, 0]] },
  { p: [[0, 0], [0, 1], [0.336, 0.45]] },
  { p: [[0.5, 0.182], [0.198, 0.677], [0.803, 0.677]] },
  { p: [[0.664, 0.45], [1, 1], [1, 0]] },
  { p: [[0.198, 0.677], [0, 1], [1, 1], [0.803, 0.677]] },
], false, "strange"),
TPL("p-custom-collage68", "Crown six", [
  { p: [[0, 0], [0, 0.25], [0.5, 0.5], [0.5, 0]] },
  { p: [[0.5, 0], [0.5, 0.5], [1, 0.25], [1, 0]] },
  { p: [[0.5, 0.5], [1, 0.75], [1, 0.25]] },
  { p: [[0.5, 0.5], [0.5, 1], [1, 1], [1, 0.75]] },
  { p: [[0.5, 0.5], [0, 0.75], [0, 1], [0.5, 1]] },
  { p: [[0, 0.25], [0, 0.75], [0.5, 0.5]] },
], false, "strange"),
TPL("p-custom-collage33", "Honey seven", [
  { p: [[0, 0], [0, 0.493], [0.256, 0.64], [0.256, 0]] },
  { p: [[0.256, 0], [0.256, 0.359], [0.878, 0]] },
  { p: [[0.878, 0], [0.5, 0.219], [1, 0.507], [1, 0]] },
  { p: [[0.5, 0.219], [0.256, 0.359], [0.256, 0.641], [0.5, 0.781], [0.744, 0.641], [0.744, 0.359]] },
  { p: [[0, 0.493], [0, 1], [0.123, 1], [0.5, 0.781]] },
  { p: [[0.123, 1], [0.744, 1], [0.744, 0.641]] },
  { p: [[0.744, 0.359], [0.744, 1], [1, 1], [1, 0.507]] },
], false, "strange"),
TPL("p-custom-collage27", "Mosaic eight", [
  { p: [[0, 0], [0, 0.248], [0.297, 0.248], [0.398, 0]] },
  { p: [[0.398, 0], [0.297, 0.248], [0.396, 0.496], [0.602, 0.496], [0.701, 0.248], [0.6, 0]] },
  { p: [[0.6, 0], [0.701, 0.248], [1, 0.248], [1, 0]] },
  { p: [[0, 0.248], [0, 0.753], [0.294, 0.754], [0.396, 0.496], [0.297, 0.248]] },
  { p: [[0.701, 0.248], [0.602, 0.496], [0.705, 0.754], [1, 0.754], [1, 0.248]] },
  { p: [[0, 0.754], [0, 1], [0.398, 1], [0.294, 0.754]] },
  { p: [[0.396, 0.496], [0.294, 0.754], [0.398, 1], [0.6, 1], [0.705, 0.754], [0.602, 0.496]] },
  { p: [[0.704, 0.754], [0.6, 1], [1, 1], [1, 0.754]] },
], false, "strange"),
TPL("p-custom-collage48", "Star eight", [
  { p: [[0, 0], [0.5, 0.5], [0.5, 0]] },
  { p: [[0.5, 0], [0.5, 0.5], [1, 0]] },
  { p: [[0.5, 0.5], [1, 0.5], [1, 0]] },
  { p: [[0.5, 0.5], [1, 1], [1, 0.5]] },
  { p: [[0.5, 0.5], [0.5, 1], [1, 1]] },
  { p: [[0.5, 0.5], [0, 1], [0.5, 1]] },
  { p: [[0, 0.5], [0, 1], [0.5, 0.5]] },
  { p: [[0, 0], [0, 0.5], [0.5, 0.5]] },
], false, "strange"),
TPL("p-custom-collage58", "Mandala nine", [
  { p: [[0, 0], [0, 0.294], [0.248, 0.396], [0.396, 0.248], [0.293, 0]] },
  { p: [[0.293, 0], [0.396, 0.248], [0.604, 0.248], [0.708, 0]] },
  { p: [[0.708, 0], [0.604, 0.248], [0.752, 0.396], [1, 0.294], [1, 0]] },
  { p: [[0, 0.294], [0, 0.706], [0.248, 0.604], [0.248, 0.396]] },
  { p: [[0.396, 0.248], [0.248, 0.396], [0.248, 0.604], [0.396, 0.752], [0.604, 0.752], [0.752, 0.604], [0.752, 0.396], [0.604, 0.248]] },
  { p: [[0.752, 0.396], [0.752, 0.604], [1, 0.706], [1, 0.294]] },
  { p: [[0, 0.706], [0, 1], [0.293, 1], [0.396, 0.752], [0.248, 0.604]] },
  { p: [[0.396, 0.752], [0.293, 1], [0.708, 1], [0.604, 0.752]] },
  { p: [[0.604, 0.752], [0.708, 1], [1, 1], [1, 0.706], [0.752, 0.604]] },
], false, "strange"),
  ];
  function tplById(id) { return TEMPLATES.find((t) => t.id === id) || null; }
  function tplThumb(tpl) {
    const parts = tpl.cells.map(function (c) {
      if (c && c.p) {
        const pts = c.p.map(function (q) { return (q[0] * 100).toFixed(1) + "," + (q[1] * 100).toFixed(1); }).join(" ");
        return '<polygon points="' + pts + '" fill="rgba(34,211,238,.4)" stroke="#22d3ee" stroke-width="1.5"/>';
      }
      const x = (c[0] * 100).toFixed(1), y = (c[1] * 100).toFixed(1);
      const w = Math.max(2, c[2] * 100 - 1.5).toFixed(1), h = Math.max(2, c[3] * 100 - 1.5).toFixed(1);
      return '<rect x="' + x + '" y="' + y + '" width="' + w + '" height="' + h + '" rx="3" fill="rgba(34,211,238,.4)" stroke="#22d3ee" stroke-width="1.5"/>';
    });
    return '<svg viewBox="0 0 100 100" preserveAspectRatio="none">' + parts.join("") + "</svg>";
  }
  let api = null, win = null, S = null;

  const CSS = `
  .st-root{font-family:"Segoe UI",system-ui,sans-serif;background:#0a0f1e;color:#f4f6ff;height:100%;display:flex;flex-direction:column;overflow:hidden}
  .st-bar{display:flex;align-items:center;gap:8px;padding:10px 12px;background:rgba(19,26,48,.95);border-bottom:1px solid rgba(148,163,255,.2);flex-wrap:wrap}
  .st-bar b{font-size:15px;background:linear-gradient(92deg,#fff,#a5f3fc 45%,#fbbf24);-webkit-background-clip:text;background-clip:text;color:transparent}
  .st-body{flex:1;display:flex;min-height:0}
  .st-side{width:228px;min-width:228px;background:rgba(19,26,48,.9);border-right:1px solid rgba(148,163,255,.2);display:flex;flex-direction:column;min-height:0}
  .st-tabs{display:flex;gap:6px;padding:8px}
  .st-main{flex:1;overflow:auto;display:flex;align-items:flex-start;justify-content:center;padding:18px;min-width:0}
  .st-board{position:relative;box-shadow:0 18px 60px rgba(0,0,0,.55);border:1px solid rgba(255,255,255,.12);flex:none}
  .st-item{position:absolute;cursor:grab;touch-action:none}
  .st-item.sel{outline:3px solid #22d3ee;outline-offset:-1px;z-index:50!important}
  .st-item canvas{width:100%;height:100%;display:block;pointer-events:none}
  .st-handle{position:absolute;right:-9px;bottom:-9px;width:18px;height:18px;border-radius:50%;background:linear-gradient(135deg,#22d3ee,#a855f7);border:2px solid #fff;cursor:nwse-resize;display:none}
  .st-item.sel .st-handle{display:block}
  .st-x{position:absolute;top:-11px;right:-11px;width:22px;height:22px;border-radius:50%;background:#ff5470;border:2px solid #fff;color:#fff;font-size:12px;line-height:1;cursor:pointer;display:none;padding:0}
  .st-item.sel .st-x{display:block}
  .st-pane{flex:1;overflow-y:auto;padding:8px;display:flex;flex-direction:column;gap:8px;min-height:0}
  .st-tray{display:grid;grid-template-columns:1fr 1fr;gap:8px;align-content:start}
  .st-asset{border:2px solid rgba(148,163,255,.2);border-radius:10px;overflow:hidden;background:#000;cursor:grab;font-size:11px;text-align:center}
  .st-asset canvas{width:100%;height:64px;object-fit:cover;display:block;pointer-events:none}
  .st-asset span{display:block;padding:4px;background:rgba(30,40,72,.9);pointer-events:none}
  .st-tpl{display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;align-content:start}
  .st-tpl button{padding:6px;font-size:10.5px;line-height:1.25}
  .st-tpl svg{width:100%;height:46px;display:block;background:rgba(0,0,0,.4);border-radius:6px;margin-bottom:4px}
  .st-empty{position:absolute;border:2px dashed rgba(34,211,238,.55);border-radius:8px;display:flex;align-items:center;justify-content:center;color:rgba(154,163,192,.9);font-size:24px;cursor:pointer;background:rgba(34,211,238,.05)}
  .st-empty:hover{background:rgba(34,211,238,.14);color:#fff}
  .st-row{display:flex;gap:6px;flex-wrap:wrap;align-items:center}
  .st-hint{font-size:11.5px;color:#9aa3c0}
  .st-sel{width:100%;background:#0d1328;color:#fff;border:1px solid rgba(148,163,255,.25);border-radius:8px;padding:6px}
  .st-lab{font-size:12px;color:#9aa3c0}
  button{font:inherit;color:#f4f6ff;background:linear-gradient(180deg,rgba(48,60,105,.95),rgba(26,34,64,.95));border:1px solid rgba(148,163,255,.25);border-radius:10px;padding:7px 11px;cursor:pointer;font-size:12.5px}
  button:hover{border-color:#22d3ee}
  button.on{background:linear-gradient(100deg,#22d3ee,#a855f7,#fb923c);color:#0a0f1e;font-weight:800;border-color:transparent}
  input[type=range]{width:100%;accent-color:#22d3ee}
  input[type=color]{width:100%;height:32px;background:none;border:1px solid rgba(148,163,255,.25);border-radius:8px;padding:2px}`;

  function el(doc, tag, cls, html) {
    const e = doc.createElement(tag);
    if (cls) e.className = cls;
    if (html != null) e.innerHTML = html;
    return e;
  }
  function mainCanvas(w, h) {
    const c = document.createElement("canvas");
    c.width = Math.max(2, Math.round(w)); c.height = Math.max(2, Math.round(h));
    return c;
  }
  function coverDraw(dst, src, zoom) {
    const x = dst.getContext("2d");
    const rw = dst.width, rh = dst.height;
    const z = zoom || 1;
    const sc = Math.max(rw / src.width, rh / src.height) * z;
    const dw = src.width * sc, dh = src.height * sc;
    x.imageSmoothingQuality = "high";
    x.clearRect(0, 0, rw, rh);
    x.drawImage(src, (rw - dw) / 2, (rh - dh) / 2, dw, dh);
  }
  function lookOf(id) {
    if (!id || id === "inherit") return null;
    return api.lookById(id);
  }
  // full-quality item render into a MAIN-document canvas (used for preview + export)
  function renderItem(item, W, H) {
    const c = mainCanvas(W, H);
    coverDraw(c, item.asset.canvas, item.zoom);
    const look = lookOf(item.look);
    if (look && look.id !== "normal") {
      const cx = c.getContext("2d", { willReadFrequently: true });
      const im = cx.getImageData(0, 0, c.width, c.height);
      window.T2SEngine.gradePass(im, { look: look.id, lookAmount: 100 }, look);
      cx.putImageData(im, 0, 0);
    }
    return c;
  }
  function loadImage(src, cross) {
    return new Promise((res, rej) => {
      const img = new Image();
      if (cross) img.crossOrigin = "anonymous";
      img.onload = () => {
        const sc = Math.min(1, 2000 / Math.max(img.width, img.height));
        const c = mainCanvas(img.width * sc, img.height * sc);
        c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
        res(c);
      };
      img.onerror = rej;
      img.src = src;
    });
  }

  async function collectAssets() {
    const out = [];
    const main = api.getSource();
    if (main && main.width) out.push({ id: "main", name: "Main photo", canvas: main });
    if (window.T2S_GALLERY) {
      for (const b of window.T2S_GALLERY.BUILTINS) {
        try { out.push({ id: b.id, name: b.name, canvas: await loadImage(b.url, true) }); }
        catch (e) { /* offline: skip */ }
      }
    }
    return out;
  }

  function freshState() {
    return { items: [], seq: 0, sel: -1, bg: "#101736", preset: "4:3", W: 1000, H: 750, tab: "photos", tpl: null, tplCat: "all", gap: 0, pendingSlot: -1 };
  }

  function openStudio() {
    try { if (win && !win.closed) { win.focus(); return; } } catch (e) { win = null; }
    if (S && !document.querySelector(".st-root")) S = null; // stale session, start fresh
    if (S && document.querySelector(".st-root")) return; // overlay already open
    S = freshState();
    let doc = null, host = null, mode = "popup";
    try { win = window.open("about:blank", "t2s-collage-studio", "width=1160,height=780"); } catch (e) { win = null; }
    if (!win) {
      mode = "overlay";
      doc = document;
      host = el(doc, "div");
      host.style.cssText = "position:fixed;inset:0;z-index:100;background:#0a0f1e";
      doc.body.appendChild(host);
    } else {
      doc = win.document;
      doc.title = "T2Smart-PicHancer — Collage Studio";
      host = null;
    }
    buildInto(doc, host, win, mode);
  }

  function buildInto(doc, host, wobj, mode) {
    const style = el(doc, "style"); style.textContent = CSS;
    doc.head.appendChild(style);
    const root = el(doc, "div", "st-root");
    if (mode === "overlay") { root.style.position = "absolute"; root.style.inset = "0"; host.appendChild(root); }
    else {
      doc.body.style.margin = "0"; doc.body.style.height = "100vh";
      doc.body.appendChild(root);
    }
    // header
    const bar = el(doc, "div", "st-bar");
    bar.appendChild(el(doc, "b", null, "T2Smart-PicHancer · Collage Studio"));
    const doneBtn = el(doc, "button", null, "✓ Done — send to main app");
    doneBtn.classList.add("on");
    const jpgBtn = el(doc, "button", null, "Export JPG");
    const closeBtn = el(doc, "button", null, mode === "popup" ? "Close window" : "Close");
    const noter = el(doc, "span", "st-hint", "");
    bar.appendChild(doneBtn); bar.appendChild(jpgBtn); bar.appendChild(closeBtn); bar.appendChild(noter);
    root.appendChild(bar);
    // body
    const body = el(doc, "div", "st-body");
    const side = el(doc, "div", "st-side");
    const tabs = el(doc, "div", "st-tabs");
    const tabPhotos = el(doc, "button", "on", "Photos");
    const tabTpl = el(doc, "button", null, "Templates");
    const tabDesign = el(doc, "button", null, "Design");
    tabs.appendChild(tabPhotos); tabs.appendChild(tabTpl); tabs.appendChild(tabDesign);
    side.appendChild(tabs);
    const pane = el(doc, "div", "st-pane");
    side.appendChild(pane);
    const main = el(doc, "div", "st-main");
    const board = el(doc, "div", "st-board");
    main.appendChild(board);
    body.appendChild(side); body.appendChild(main);
    root.appendChild(body);

    const say = (m) => { noter.textContent = m; clearTimeout(say._h); say._h = setTimeout(() => noter.textContent = "", 2600); };
    const assets = [];

    function boardRect() { return { W: S.W, H: S.H }; }
    function tplActive() { return S.tpl ? tplById(S.tpl) : null; }
    function cellRects() {
      const tpl = tplActive();
      if (!tpl) return [];
      const g = Math.max(0, S.gap || 0);
      return tpl.cells.map(function (cell) {
        if (cell && cell.p) {
          let bx0 = 1, by0 = 1, bx1 = 0, by1 = 0;
          for (const q of cell.p) {
            if (q[0] < bx0) bx0 = q[0];
            if (q[1] < by0) by0 = q[1];
            if (q[0] > bx1) bx1 = q[0];
            if (q[1] > by1) by1 = q[1];
          }
          const bw = Math.max(0.01, bx1 - bx0), bh = Math.max(0.01, by1 - by0);
          const pn = cell.p.map((q) => [(q[0] - bx0) / bw, (q[1] - by0) / bh]);
          return { x: Math.round(bx0 * S.W), y: Math.round(by0 * S.H), w: Math.max(20, Math.round(bw * S.W)), h: Math.max(20, Math.round(bh * S.H)), polyN: pn };
        }
        const fx = cell[0], fy = cell[1], fw = cell[2], fh = cell[3];
        let px = fx * S.W, py = fy * S.H, pw = fw * S.W, ph = fh * S.H;
        if (tpl.gap !== false && g > 0) {
          const lx = fx > 0.001 ? g / 2 : 0, rx = (fx + fw) < 0.999 ? g / 2 : 0;
          const ty = fy > 0.001 ? g / 2 : 0, by = (fy + fh) < 0.999 ? g / 2 : 0;
          px += lx; py += ty; pw -= lx + rx; ph -= ty + by;
        }
        return { x: Math.round(px), y: Math.round(py), w: Math.max(20, Math.round(pw)), h: Math.max(20, Math.round(ph)) };
      });
    }
    function slotTaken(ci) { return S.items.some((o) => o.slot === ci); }
    function firstFreeSlot() {
      const rs = cellRects();
      for (let i = 0; i < rs.length; i++) if (!slotTaken(i)) return i;
      return -1;
    }
    function snapSlotted() {
      const rs = cellRects();
      for (const it of S.items) {
        if (it.slot >= 0 && rs[it.slot]) { Object.assign(it, rs[it.slot]); it.polyN = rs[it.slot].polyN || null; }
      }
    }
    function applyTemplate(id) {
      S.tpl = id;
      const rs = cellRects();
      S.items.forEach((it, i) => {
        if (i < rs.length) { it.slot = i; Object.assign(it, rs[i]); it.polyN = rs[i].polyN || null; }
        else { it.slot = -1; it.polyN = null; }
      });
      if (S.sel >= S.items.length) S.sel = S.items.length - 1;
      refreshItems(); renderTemplates(); renderDesign();
      say(id ? "Template on: photos auto-fit into its cells" : "Freeform board");
    }
    function paintBoard() {
      board.style.width = S.W + "px"; board.style.height = S.H + "px";
      board.style.background = S.bg;
    }
    function refreshItems() {
      [...board.querySelectorAll(".st-item,.st-empty")].forEach((n) => n.remove());
      S.items.forEach((item, idx) => board.appendChild(itemNode(item, idx)));
      // empty template cells: dashed slots that auto-fill on click/drop
      const rs = cellRects();
      rs.forEach((r, ci) => {
        if (slotTaken(ci)) return;
        const d = el(doc, "div", "st-empty", "+");
        d.dataset.slot = String(ci);
        d.title = "Empty cell: click for photos, or drop a photo here";
        d.style.left = r.x + "px"; d.style.top = r.y + "px";
        d.style.width = r.w + "px"; d.style.height = r.h + "px";
        if (r.polyN) d.style.clipPath = "polygon(" + r.polyN.map((q) => (q[0] * 100).toFixed(1) + "% " + (q[1] * 100).toFixed(1) + "%").join(", ") + ")";
        d.addEventListener("click", () => {
          S.pendingSlot = ci;
          S.tab = "photos"; syncTabs(); renderPhotos();
          say("Now click a photo: it fills cell " + (ci + 1));
        });
        board.appendChild(d);
      });
      paintBoard();
    }
    function drawItem(item, node) {
      const pv = Math.min(1, 560 / Math.max(item.w, item.h));
      const W = Math.max(8, Math.round(item.w * pv)), H = Math.max(8, Math.round(item.h * pv));
      const src = renderItem(item, W, H);
      let cv = node.querySelector("canvas");
      if (!cv) { cv = doc.createElement("canvas"); node.insertBefore(cv, node.firstChild); }
      cv.width = W; cv.height = H;
      const gg = cv.getContext("2d");
      gg.clearRect(0, 0, W, H);
      if (item.polyN) {
        gg.save(); gg.beginPath();
        item.polyN.forEach((q, i) => { if (i) gg.lineTo(q[0] * W, q[1] * H); else gg.moveTo(q[0] * W, q[1] * H); });
        gg.closePath(); gg.clip(); gg.drawImage(src, 0, 0); gg.restore();
      } else gg.drawImage(src, 0, 0);
      node.style.left = item.x + "px"; node.style.top = item.y + "px";
      node.style.width = item.w + "px"; node.style.height = item.h + "px";
      node.style.zIndex = String(10 + idxOf(item));
      node.classList.toggle("sel", idxOf(item) === S.sel);
    }
    function idxOf(item) { return S.items.indexOf(item); }
    function itemNode(item, idx) {
      const n = el(doc, "div", "st-item");
      const hd = el(doc, "div", "st-handle");
      const xx = el(doc, "button", "st-x", "✕");
      xx.title = "Remove picture";
      xx.onclick = (e) => { e.stopPropagation(); removeItem(item); };
      n.appendChild(hd); n.appendChild(xx);
      drawItem(item, n);
      // move / click-select / drop-swap
      n.addEventListener("pointerdown", (e) => {
        if (e.target === hd || e.target === xx) return;
        e.preventDefault();
        selectItem(item);
        const sx = e.clientX, sy = e.clientY;
        const ox = item.x, oy = item.y;
        let moved = false;
        try { n.setPointerCapture(e.pointerId); } catch (e2) {}
        const mv = (ev) => {
          const dx = ev.clientX - sx, dy = ev.clientY - sy;
          if (!moved && Math.hypot(dx, dy) < 4) return;
          moved = true;
          item.x = Math.round(ox + dx); item.y = Math.round(oy + dy);
          n.style.left = item.x + "px"; n.style.top = item.y + "px";
        };
        const up = (ev) => {
          n.removeEventListener("pointermove", mv);
          n.removeEventListener("pointerup", up);
          n.removeEventListener("pointercancel", up);
          if (!moved) return;
          // drop onto another picture => swap places (slots travel along)
          const cxp = item.x + item.w / 2, cyp = item.y + item.h / 2;
          const others = S.items.filter((o) => o !== item);
          let snapped = false;
          for (let i = others.length - 1; i >= 0; i--) {
            const o = others[i];
            if (cxp >= o.x && cxp < o.x + o.w && cyp >= o.y && cyp < o.y + o.h) {
              const t = { x: o.x, y: o.y, w: o.w, h: o.h, slot: o.slot, polyN: o.polyN };
              o.x = item.x; o.y = item.y; o.w = item.w; o.h = item.h; o.slot = item.slot; o.polyN = item.polyN;
              item.x = t.x; item.y = t.y; item.w = t.w; item.h = t.h; item.slot = t.slot; item.polyN = t.polyN;
              const rs2 = cellRects();
              if (o.slot >= 0 && rs2[o.slot]) { Object.assign(o, rs2[o.slot]); o.polyN = rs2[o.slot].polyN || null; }
              if (item.slot >= 0 && rs2[item.slot]) { Object.assign(item, rs2[item.slot]); item.polyN = rs2[item.slot].polyN || null; }
              say("Swapped “" + item.asset.name + "” ⇄ “" + o.asset.name + "”");
              snapped = true;
              break;
            }
          }
          if (!snapped) {
            // dropped onto an empty template cell => snap into it
            const rs = cellRects();
            for (let ci = 0; ci < rs.length; ci++) {
              const r = rs[ci];
              if ((!slotTaken(ci) || item.slot === ci) && cxp >= r.x && cxp < r.x + r.w && cyp >= r.y && cyp < r.y + r.h) {
                item.slot = ci;
                Object.assign(item, r);
                say("Snapped into cell " + (ci + 1));
                snapped = true;
                break;
              }
            }
          }
          if (!snapped && item.slot >= 0) {
            item.slot = -1; // dragged out of its cell => freeform
            say("Freeform: reapply the template to snap back");
          }
          refreshItems(); renderTemplates(); renderDesign();
        };
        n.addEventListener("pointermove", mv);
        n.addEventListener("pointerup", up);
        n.addEventListener("pointercancel", up);
      });
      // resize handle
      hd.addEventListener("pointerdown", (e) => {
        e.preventDefault(); e.stopPropagation();
        selectItem(item);
        const sx = e.clientX, sy = e.clientY, ow = item.w, oh = item.h;
        const lock = e.shiftKey;
        try { hd.setPointerCapture(e.pointerId); } catch (e3) {}
        const mv = (ev) => {
          let nw = Math.max(40, Math.round(ow + (ev.clientX - sx)));
          let nh = lock ? Math.max(40, Math.round(nw * oh / ow)) : Math.max(40, Math.round(oh + (ev.clientY - sy)));
          item.w = nw; item.h = nh;
          drawItem(item, n);
        };
        const up = () => {
          hd.removeEventListener("pointermove", mv);
          hd.removeEventListener("pointerup", up);
          hd.removeEventListener("pointercancel", up);
          if (item.slot >= 0) { item.slot = -1; say("Freeform: reapply the template to snap back"); }
          refreshItems(); renderTemplates(); renderDesign();
        };
        hd.addEventListener("pointermove", mv);
        hd.addEventListener("pointerup", up);
        hd.addEventListener("pointercancel", up);
      });
      return n;
    }
    function selectItem(item) {
      S.sel = idxOf(item);
      [...board.querySelectorAll(".st-item")].forEach((n, i) => n.classList.toggle("sel", i === S.sel));
      renderDesign();
    }
    function removeItem(item) {
      S.items = S.items.filter((o) => o !== item);
      if (S.sel >= S.items.length) S.sel = S.items.length - 1;
      refreshItems(); renderTemplates(); renderDesign();
    }
    function addAsset(asset, cxp, cyp, wantSlot) {
      const a = asset.canvas;
      let slot = wantSlot != null ? wantSlot : S.pendingSlot;
      S.pendingSlot = -1;
      if (slot == null || slot < 0) slot = tplActive() ? firstFreeSlot() : -1;
      const rs = cellRects();
      const item = { id: "it" + (++S.seq), asset, look: "inherit", zoom: 1, slot: -1, polyN: null, x: 0, y: 0, w: 60, h: 60 };
      if (slot >= 0 && rs[slot]) {
        item.slot = slot;
        Object.assign(item, rs[slot]);
        item.polyN = rs[slot].polyN || null;
      } else {
        const sc = Math.min(1, (S.W * 0.52) / a.width, (S.H * 0.52) / a.height);
        item.w = Math.max(60, Math.round(a.width * sc));
        item.h = Math.max(60, Math.round(a.height * sc));
        item.x = Math.round((cxp == null ? S.W / 2 : cxp) - item.w / 2);
        item.y = Math.round((cyp == null ? S.H / 2 : cyp) - item.h / 2);
      }
      S.items.push(item);
      S.sel = S.items.length - 1;
      refreshItems(); renderTemplates(); renderDesign();
      say(item.slot >= 0 ? "Added " + asset.name + ": auto-fit cell " + (item.slot + 1) : "Added " + asset.name + ": drag to move, drop on another to swap");
    }

    // ---- Photos pane ----
    function renderPhotos() {
      pane.innerHTML = "";
      const row = el(doc, "div", "st-row");
      const upBtn = el(doc, "button", null, "+ Upload photo");
      const mainBtn = el(doc, "button", null, "⟳ Main photo");
      row.appendChild(upBtn); row.appendChild(mainBtn);
      pane.appendChild(row);
      const dz = el(doc, "div", null, "<span class='st-hint'>Drop image files here, or drag a photo below onto the board. Click a photo to add it.</span>");
      dz.style.cssText = "border:2px dashed rgba(34,211,238,.5);border-radius:12px;padding:14px;text-align:center";
      pane.appendChild(dz);
      const tray = el(doc, "div", "st-tray");
      pane.appendChild(tray);
      const fi = doc.createElement("input");
      fi.type = "file"; fi.accept = "image/*"; fi.multiple = true; fi.hidden = true;
      pane.appendChild(fi);
      upBtn.onclick = () => fi.click();
      mainBtn.onclick = async () => {
        const m = api.getSource();
        if (!m || !m.width) { say("No main photo open"); return; }
        const i = assets.findIndex((a) => a.id === "main");
        const rec = { id: "main", name: "Main photo", canvas: m };
        if (i >= 0) assets[i] = rec; else assets.unshift(rec);
        renderPhotos();
      };
      fi.onchange = () => { for (const f of fi.files) addFile(f); fi.value = ""; };
      dz.addEventListener("dragover", (e) => e.preventDefault());
      dz.addEventListener("drop", (e) => {
        e.preventDefault();
        if (e.dataTransfer.files && e.dataTransfer.files.length) {
          for (const f of e.dataTransfer.files) addFile(f);
        }
      });
      board.addEventListener("dragover", (e) => e.preventDefault());
      board.addEventListener("drop", (e) => {
        e.preventDefault();
        const r = board.getBoundingClientRect();
        const px = e.clientX - r.left, py = e.clientY - r.top;
        const es = e.target && e.target.closest ? e.target.closest(".st-empty") : null;
        const eslot = es ? parseInt(es.dataset.slot, 10) : -1;
        if (e.dataTransfer.files && e.dataTransfer.files.length) {
          for (const f of e.dataTransfer.files) addFile(f, px, py, eslot);
          return;
        }
        const aid = e.dataTransfer.getData("text/asset-id");
        const a = assets.find((q) => q.id === aid);
        if (a) addAsset(a, px, py, eslot);
      });
      for (const a of assets) {
        const card = el(doc, "div", "st-asset");
        card.draggable = true;
        const th = doc.createElement("canvas");
        th.width = 112; th.height = 64;
        coverDraw(th, a.canvas, 1);
        card.appendChild(th);
        const nm = el(doc, "span", null, "");
        nm.textContent = a.name;
        card.appendChild(nm);
        card.addEventListener("dragstart", (e) => e.dataTransfer.setData("text/asset-id", a.id));
        card.addEventListener("click", () => addAsset(a));
        tray.appendChild(card);
      }
      function addFile(f, px, py, slot) {
        if (!f || !/^image\//.test(f.type || "")) { say("Not an image file"); return; }
        const rd = new FileReader();
        rd.onload = () => {
          loadImage(rd.result, false).then((c) => {
            const rec = { id: "up" + Date.now() + Math.floor(Math.random() * 999), name: f.name || "upload", canvas: c };
            assets.push(rec);
            addAsset(rec, px, py, slot);
            renderPhotos();
          }).catch(() => say("Could not read that file"));
        };
        rd.readAsDataURL(f);
      }
    }

    // ---- Design pane ----
    function renderDesign() {
      if (S.tab !== "design") return;
      pane.innerHTML = "";
      pane.appendChild(el(doc, "div", "st-lab", "Canvas size"));
      const pr = el(doc, "div", "st-row");
      for (const k of Object.keys(PRESETS)) {
        const b = el(doc, "button", S.preset === k ? "on" : null, k);
        b.style.fontSize = "11.5px";
        b.onclick = () => {
          S.preset = k; S.W = PRESETS[k][0]; S.H = PRESETS[k][1];
          snapSlotted();
          for (const it of S.items) {
            if (it.slot < 0) { it.x = Math.min(it.x, S.W - 40); it.y = Math.min(it.y, S.H - 40); }
          }
          [...pr.children].forEach((c, i) => c.classList.toggle("on", Object.keys(PRESETS)[i] === k));
          refreshItems(); renderTemplates();
        };
        pr.appendChild(b);
      }
      pane.appendChild(pr);
      const tnow = tplActive();
      pane.appendChild(el(doc, "div", "st-hint", tnow ? "Template: " + tnow.name + " (change in Templates tab)" : "Freeform board (pick a grid in the Templates tab)"));
      pane.appendChild(el(doc, "div", "st-lab", "Background"));
      const sw = el(doc, "div", "st-row");
      for (const c of BGS) {
        const b = el(doc, "button", null, "");
        b.style.cssText = "background:" + c + ";width:30px;height:26px;padding:0";
        if (S.bg === c) b.classList.add("on");
        b.onclick = () => { S.bg = c; paintBoard(); renderDesign(); };
        sw.appendChild(b);
      }
      const cp = doc.createElement("input");
      cp.type = "color"; cp.value = /^#[0-9a-f]{6}$/i.test(S.bg) ? S.bg : "#101736";
      cp.oninput = () => { S.bg = cp.value; paintBoard(); };
      pane.appendChild(sw); pane.appendChild(cp);
      const item = S.items[S.sel];
      pane.appendChild(el(doc, "div", "st-lab", item ? "Selected: “" + item.asset.name + "”" : "Select a picture on the board"));
      if (item) {
        const se = doc.createElement("select");
        se.className = "st-sel";
        const opts = ["inherit"].concat((window.T2S_LOOKS || []).map((l) => l.id));
        se.innerHTML = opts.map((id) => `<option value="${id}">${id === "inherit" ? "✨ Original (no effect)" : id}</option>`).join("");
        se.value = item.look || "inherit";
        se.onchange = () => {
          item.look = se.value;
          const node = board.querySelectorAll(".st-item")[idxOf(item)];
          if (node) drawItem(item, node);
          renderDesign();
        };
        pane.appendChild(se);
        const zl = el(doc, "div", "st-lab", "Fill zoom");
        const zr = doc.createElement("input");
        zr.type = "range"; zr.min = "1"; zr.max = "3"; zr.step = "0.01"; zr.value = item.zoom || 1;
        zr.oninput = () => {
          item.zoom = parseFloat(zr.value);
          const node = board.querySelectorAll(".st-item")[idxOf(item)];
          if (node) drawItem(item, node);
        };
        pane.appendChild(zl); pane.appendChild(zr);
        const fr = el(doc, "div", "st-row");
        const front = el(doc, "button", null, "Bring to front");
        const back = el(doc, "button", null, "Send to back");
        const del = el(doc, "button", null, "Remove");
        front.onclick = () => { S.items.push(...S.items.splice(idxOf(item), 1)); S.sel = S.items.length - 1; refreshItems(); renderDesign(); };
        back.onclick = () => { S.items.unshift(...S.items.splice(idxOf(item), 1)); S.sel = 0; refreshItems(); renderDesign(); };
        del.onclick = () => removeItem(item);
        fr.appendChild(front); fr.appendChild(back); fr.appendChild(del);
        pane.appendChild(fr);
      }
      pane.appendChild(el(doc, "div", "st-hint", "Drag pictures to move · drop one onto another to swap · drag the glowing handle to resize (⇧ locks shape) · click to select."));
    }

    function syncTabs() {
      tabPhotos.classList.toggle("on", S.tab === "photos");
      tabTpl.classList.toggle("on", S.tab === "tpl");
      tabDesign.classList.toggle("on", S.tab === "design");
    }
    tabPhotos.onclick = () => { S.tab = "photos"; syncTabs(); renderPhotos(); };
    tabTpl.onclick = () => { S.tab = "tpl"; syncTabs(); renderTemplates(); };
    tabDesign.onclick = () => { S.tab = "design"; syncTabs(); renderDesign(); };

    // ---- Templates pane ----
    function renderTemplates() {
      if (S.tab !== "tpl") return;
      pane.innerHTML = "";
      const tpl = tplActive();
      const rs = cellRects();
      const filled = S.items.filter((o) => o.slot >= 0).length;
      pane.appendChild(el(doc, "div", "st-lab", "Templates (" + TEMPLATES.length + ")"));
      pane.appendChild(el(doc, "div", "st-hint", tpl ? tpl.name + " - " + rs.length + " cells, " + filled + " filled - new photos auto-fit" : "Pick a grid - photos auto-fit into its cells"));
      const cats = [["all", "All"], ["grid", "Classic"], ["oblique", "Oblique"], ["curvy", "Curvy"], ["strange", "Strange"]];
      const chipr = el(doc, "div", "st-row");
      for (const pair of cats) {
        const cb = el(doc, "button", (S.tplCat || "all") === pair[0] ? "on" : null, pair[1]);
        cb.style.fontSize = "11px";
        cb.onclick = ((id) => () => { S.tplCat = id; renderTemplates(); })(pair[0]);
        chipr.appendChild(cb);
      }
      pane.appendChild(chipr);
      const grid = el(doc, "div", "st-tpl");
      const free = el(doc, "button", S.tpl ? null : "on", "Freeform");
      free.title = "No template - drag pictures anywhere";
      free.onclick = () => applyTemplate(null);
      grid.appendChild(free);
      for (const t of TEMPLATES.filter((t) => (S.tplCat || "all") === "all" || t.cat === S.tplCat)) {
        const b = el(doc, "button", S.tpl === t.id ? "on" : null, tplThumb(t) + "<span>" + t.name + "</span>");
        b.title = t.name + " (" + t.cells.length + " cells)";
        b.onclick = ((id) => () => applyTemplate(id))(t.id);
        grid.appendChild(b);
      }
      pane.appendChild(grid);
      if (tpl) {
        pane.appendChild(el(doc, "div", "st-lab", "Gap between photos"));
        const gr = doc.createElement("input");
        gr.type = "range"; gr.min = "0"; gr.max = "40"; gr.step = "1"; gr.value = String(S.gap || 0);
        gr.oninput = () => { S.gap = parseFloat(gr.value); snapSlotted(); refreshItems(); };
        pane.appendChild(gr);
        const row = el(doc, "div", "st-row");
        const re = el(doc, "button", null, "Snap all into grid");
        re.onclick = () => applyTemplate(S.tpl);
        row.appendChild(re);
        pane.appendChild(row);
      }
    }

    function composite(scale) {
      const W = Math.round(S.W * scale), H = Math.round(S.H * scale);
      const out = mainCanvas(W, H);
      const x = out.getContext("2d");
      x.fillStyle = S.bg; x.fillRect(0, 0, W, H);
      for (const item of S.items) {
        const iw = Math.max(2, Math.round(item.w * scale)), ih = Math.max(2, Math.round(item.h * scale));
        const rc = renderItem(item, iw, ih);
        const dx = Math.round(item.x * scale), dy = Math.round(item.y * scale);
        if (item.polyN) {
          x.save(); x.beginPath();
          item.polyN.forEach((q, i) => {
            const qx = (item.x + q[0] * item.w) * scale, qy = (item.y + q[1] * item.h) * scale;
            if (i) x.lineTo(qx, qy); else x.moveTo(qx, qy);
          });
          x.closePath(); x.clip(); x.drawImage(rc, dx, dy, iw, ih); x.restore();
        } else x.drawImage(rc, dx, dy, iw, ih);
      }
      return out;
    }
    function closeStudio() {
      if (mode === "popup") { try { wobj.close(); } catch (e) {} win = null; }
      else if (host) host.remove();
      S = null;
    }
    jpgBtn.onclick = () => {
      if (!S.items.length) { say("Board is empty — add a photo first"); return; }
      say("Rendering JPG…");
      setTimeout(() => {
        try {
          const out = composite(Math.min(2.4, 2400 / Math.max(S.W, S.H)));
          out.toBlob((blob) => {
            if (!blob) { say("Export failed"); return; }
            const a = doc.createElement("a");
            a.href = URL.createObjectURL(blob);
            a.download = "t2smart-studio-" + Date.now() + ".jpg";
            a.click();
            setTimeout(() => URL.revokeObjectURL(a.href), 4000);
            say("Exported " + out.width + "×" + out.height);
          }, "image/jpeg", 0.92);
        } catch (e) { say("Export failed: " + e.message); }
      }, 30);
    };
    doneBtn.onclick = () => {
      if (!S.items.length) { say("Board is empty — add a photo first"); return; }
      say("Sending to main app…");
      setTimeout(() => {
        try {
          const out = composite(Math.min(2.4, 2400 / Math.max(S.W, S.H)));
          // copy into a main-document canvas (cross-window safety)
          const mc = mainCanvas(out.width, out.height);
          mc.getContext("2d").drawImage(out, 0, 0);
          api.pushHistory();
          api.setSource(mc, "studio-collage");
          api.toast("Collage is now your photo — apply any effect ✓");
          closeStudio();
        } catch (e) { say("Transfer failed: " + e.message); }
      }, 30);
    };
    closeBtn.onclick = closeStudio;

    // boot: paint, load assets, seed board with main photo
    paintBoard();
    renderPhotos();
    (async () => {
      const got = await collectAssets();
      assets.push(...got);
      if (S && doc.body.contains(root)) {
        renderPhotos();
        if (!S.items.length && assets.length) addAsset(assets[0]);
      }
    })();
  }

  function wire(a) {
    api = a;
    const b = document.querySelector("#studioOpen");
    if (b) b.onclick = () => openStudio();
  }

  function _closeAll() {
    try { if (win && !win.closed) win.close(); } catch (e) {}
    win = null;
    document.querySelectorAll(".st-root").forEach((n) => {
      if (n.parentElement && n.parentElement !== document.body) n.parentElement.remove();
      else n.remove();
    });
    S = null;
  }

  function _debug() {
    const roots = document.querySelectorAll(".st-root").length;
    return {
      live: !!S,
      popup: !!(win && !win.closed),
      overlayRoots: roots,
      items: S ? S.items.length : -1,
      sel: S ? S.sel : -1,
      tpl: S ? S.tpl : null,
      slots: S ? S.items.map((o) => o.slot) : null
    };
  }

  window.T2S_STUDIO = { wire, openStudio, _debug, _closeAll };
})();
