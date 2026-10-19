/* T2Smart-PicHancer — app wiring: import, state/history, render, panels, export. */
(function () {
  "use strict";
  const $ = (s) => document.querySelector(s);
  const $$ = (s) => Array.from(document.querySelectorAll(s));
  const MAX_PREVIEW = 1400;

  const DEFAULTS = {
    exposure: 0, contrast: 0, highlights: 0, shadows: 0, whites: 0, blacks: 0,
    temperature: 0, tint: 0, vibrance: 0, saturation: 0,
    clarity: 0, dehaze: 0, texture: 0, sharpen: 0, lumNR: 0, colorNR: 0,
    grain: 0, fade: 0, vignette: 0,
    look: "normal", lookAmount: 100, lookStack: [],
    curves: null, layers: [],
    lens: { enabled: false, k1: 0, ca: 0, vig: 0, profile: "Manual" }, exif: null,
    bokeh: { enabled: false, amount: 45, fx: 0.5, fy: 0.5, size: 0.22, feather: 0.4, highlights: 30, mode: "point", angle: 0 },
    face: { enabled: false, lighten: 25, smooth: 40, warmth: 10, faces: [] },
    collage: { active: false, layout: 0, sel: 0, cells: [] },
    genfill: { strokes: [], rev: 0, prompt: "", result: null, bbox: null },
    crop: { aspect: "free", rotate: 0, flipH: false, flipV: false, straighten: 0 },
    heal: [], texts: [], healSize: 0.035
  };
  const SLIDERS = [
    { group: "light", key: "exposure", label: "Exposure", min: -2, max: 2, step: 0.05 },
    { group: "light", key: "contrast", label: "Contrast", min: -100, max: 100, step: 1 },
    { group: "light", key: "highlights", label: "Highlights", min: -100, max: 100, step: 1 },
    { group: "light", key: "shadows", label: "Shadows", min: -100, max: 100, step: 1 },
    { group: "light", key: "whites", label: "Whites", min: -100, max: 100, step: 1 },
    { group: "light", key: "blacks", label: "Blacks", min: -100, max: 100, step: 1 },
    { group: "color", key: "temperature", label: "Temperature", min: -100, max: 100, step: 1 },
    { group: "color", key: "tint", label: "Tint", min: -100, max: 100, step: 1 },
    { group: "color", key: "vibrance", label: "Vibrance", min: -100, max: 100, step: 1 },
    { group: "color", key: "saturation", label: "Saturation", min: -100, max: 100, step: 1 },
    { group: "fx", key: "clarity", label: "Clarity", min: -100, max: 100, step: 1 },
    { group: "fx", key: "dehaze", label: "Dehaze", min: -100, max: 100, step: 1 },
    { group: "fx", key: "texture", label: "Texture", min: -100, max: 100, step: 1 },
    { group: "fx", key: "grain", label: "Grain", min: 0, max: 100, step: 1 },
    { group: "fx", key: "fade", label: "Fade", min: 0, max: 100, step: 1 },
    { group: "fx", key: "vignette", label: "Vignette", min: 0, max: 100, step: 1 },
    { group: "detail", key: "sharpen", label: "Sharpen", min: 0, max: 100, step: 1 },
    { group: "detail", key: "lumNR", label: "Luminance NR", min: 0, max: 100, step: 1 },
    { group: "detail", key: "colorNR", label: "Color NR", min: 0, max: 100, step: 1 },
  ];

  let S = JSON.parse(JSON.stringify(DEFAULTS));
  let pendingExif = null;
  function autoLens(ex) {
    const p = window.T2S_LENS && window.T2S_LENS.matchProfile(ex);
    if (p) {
      S.lens = { enabled: true, k1: p.k1, ca: p.ca, vig: p.vig, profile: p.id };
      syncAllControls(); queueRender(false);
      toast("Auto lens profile: " + p.id);
    } else syncAllControls();
  }
  let undoStack = [], redoStack = [];
  let sourceCanvas = null, sourceName = "demo";
  let srcExifSeg = null, pendingExifSeg = null; // JPEG APP1 for export preservation
  let baseCache = null, baseKey = "";
  let renderQueued = false, thumbsQueued = false;
  let tool = "looks", healDrag = false, dragText = null, compareHeld = false;
  let lookFilter = "All";

  function snap() { return JSON.stringify(S); }
  function pushHistory() {
    undoStack.push(snap());
    if (undoStack.length > 60) undoStack.shift();
    redoStack.length = 0;
    saveDirty = true;
    updateHistoryBtns();
  }
  function restore(json) {
    S = JSON.parse(json);
    if (window.T2S_MASKS) window.T2S_MASKS.clearCache();
    syncAllControls();
    queueRender(true);
  }
  function updateHistoryBtns() {
    $("#undoBtn").disabled = !undoStack.length;
    $("#redoBtn").disabled = !redoStack.length;
  }

  function lookById(id) {
    const arr = window.T2S_LOOKS || [];
    return arr.find((l) => l.id === id) || arr[0];
  }

  function stateKey(maxSide) {
    return [sourceName, sourceCanvas ? sourceCanvas.width + "x" + sourceCanvas.height : "?",
      S.crop.aspect, S.crop.rotate, S.crop.flipH, S.crop.flipV, S.crop.straighten, maxSide].join("|");
  }
  function getBase(maxSide) {
    const k = stateKey(maxSide);
    if (baseCache && baseKey === k) return baseCache;
    baseCache = window.T2SEngine.baseDraw(sourceCanvas, S, maxSide);
    baseKey = k;
    return baseCache;
  }

  function renderPreview() {
    renderQueued = false;
    if (!sourceCanvas) return;
    const t0 = performance.now();
    try {
      const base = getBase(MAX_PREVIEW);
      const disp = $("#stageCanvas");
      const look = lookById(S.look);
      if (compareHeld) {
        disp.width = base.width; disp.height = base.height;
        const c = disp.getContext("2d");
        c.drawImage(base, 0, 0);
        drawTexts(c, disp.width, disp.height, true);
        drawHistogram(base);
        return;
      }
      if (tool === "video" && window.T2S_VIDEO && window.T2S_VIDEO._v.el && window.T2S_VIDEO._v.el.videoWidth) {
        try { window.T2S_VIDEO.drawFrame(); } catch (e) { console.warn(e); }
        fitStage();
        return;
      }
      if (S.collage && S.collage.active && window.T2S_COLLAGE) {
        try {
          if (window.T2S_COLLAGE.renderToStage()) { fitStage(); return; }
        } catch (e) { console.warn("collage", e); }
      }
      const off = document.createElement("canvas");
      off.width = base.width; off.height = base.height;
      const octx = off.getContext("2d", { willReadFrequently: true });
      // M1: GPU grade+detail, CPU fallback. Heal/text/histogram stay 2D.
      let img = null, engineTag = "CPU";
      if (window.T2SGPU && window.T2SGPU.ready()) {
        try {
          img = window.T2SGPU.process(base, S, look, S.lookStack);
          engineTag = "GPU";
        } catch (e) { console.warn("[psx] gpu preview fallback:", e); img = null; }
      }
      if (!img) {
        octx.drawImage(base, 0, 0);
        img = octx.getImageData(0, 0, off.width, off.height);
        if (window.T2S_LENS) window.T2S_LENS.lensPass(img, S.lens);
        if (window.T2S_PORTRAIT) window.T2S_PORTRAIT.bokehPass(img, S.bokeh);
        window.T2SEngine.gradeStack(img, S, S.lookStack);
        window.T2SEngine.gradePass(img, S, look);
        window.T2SEngine.detailPass(img, S);
        if (window.T2S_MASKS) window.T2S_MASKS.applyLayers(img, S);
        if (window.T2S_PORTRAIT) window.T2S_PORTRAIT.facePass(img, S.face);
      }
      window.T2SEngine.healPass(img, S.heal);
      if (window.T2S_GENFILL) window.T2S_GENFILL.apply(img, S);
      octx.putImageData(img, 0, 0);
      disp.width = off.width; disp.height = off.height;
      const dctx = disp.getContext("2d");
      dctx.drawImage(off, 0, 0);
      drawTexts(dctx, disp.width, disp.height, false);
      if (tool === "genfill" && window.T2S_GENFILL && window.T2S_MASKS && S.genfill && S.genfill.strokes.length && !S.genfill.result) {
        try {
          const mc = window.T2S_MASKS.rasterize({ id: "genprev" + S.genfill.rev, kind: "brush", brush: { strokes: S.genfill.strokes, rev: S.genfill.rev } }, Math.max(2, disp.width >> 1), Math.max(2, disp.height >> 1));
          const ov = document.createElement("canvas");
          ov.width = disp.width; ov.height = disp.height;
          const ox = ov.getContext("2d");
          ox.fillStyle = "rgba(255,60,120,1)"; ox.fillRect(0, 0, ov.width, ov.height);
          ox.globalCompositeOperation = "destination-in";
          ox.drawImage(mc, 0, 0, ov.width, ov.height);
          dctx.save(); dctx.globalAlpha = 0.4; dctx.drawImage(ov, 0, 0); dctx.restore();
        } catch (e) { /* ignore */ }
      }
      fitStage();
      drawHistogram(off);
      const ms = Math.round(performance.now() - t0);
      $("#renderMs").textContent = ms + " ms · " + disp.width + "×" + disp.height;
      const gb = $("#gpuBadge");
      if (gb) { gb.textContent = engineTag; gb.style.opacity = engineTag === "GPU" ? 1 : 0.35; }
    } catch (e) {
      console.error(e);
      toast("Render failed: " + e.message);
    }
  }
  function queueRender(clearBase) {
    if (clearBase) { baseKey = ""; }
    if (renderQueued) return;
    renderQueued = true;
    requestAnimationFrame(renderPreview);
  }

  function drawTexts(ctx, W, H, skip) {
    if (skip || !S.texts.length) return;
    ctx.save();
    for (const t of S.texts) {
      const px = t.x * W, py = t.y * H;
      const size = Math.max(8, t.size * H);
      ctx.globalAlpha = t.opacity == null ? 1 : t.opacity;
      ctx.font = (t.bold ? "700 " : "400 ") + size + "px " + t.font;
      ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.lineWidth = Math.max(1, size / 12);
      ctx.strokeStyle = "rgba(0,0,0,0.65)";
      ctx.fillStyle = t.color || "#ffffff";
      const lines = String(t.text || "").split("\n");
      lines.forEach((ln, i) => {
        const yy = py + (i - (lines.length - 1) / 2) * size * 1.15;
        ctx.strokeText(ln, px, yy);
        ctx.fillText(ln, px, yy);
      });
    }
    ctx.restore();
  }

  function drawHistogram(canvas) {
    try {
      const c = $("#histCanvas");
      const ctx = c.getContext("2d");
      const W = c.width = 180, H = c.height = 54;
      ctx.clearRect(0, 0, W, H);
      const t = canvas.getContext("2d", { willReadFrequently: true });
      const img = t.getImageData(0, 0, canvas.width, canvas.height);
      const hh = window.T2SEngine.histogram(img);
      const cols = [["#f44", hh.R], ["#4d4", hh.G], ["#48f", hh.B]];
      let mx = 1;
      for (const [, a] of cols) for (let i = 0; i < 256; i++) if (a[i] > mx) mx = a[i];
      ctx.globalAlpha = 0.85;
      for (const [col, a] of cols) {
        ctx.strokeStyle = col; ctx.beginPath();
        for (let x = 0; x < W; x++) {
          const v = a[Math.floor(x / W * 255)] / mx;
          const y = H - 2 - v * (H - 6);
          if (x === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        }
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    } catch (e) { /* ignore */ }
  }

  function fitStage() {
    const wrap = $("#stageWrap"), cv = $("#stageCanvas");
    if (!cv.width) return;
    const r = cv.width / cv.height;
    const W = wrap.clientWidth - 24, H = wrap.clientHeight - 24;
    let w = W, h = w / r;
    if (h > H) { h = H; w = h * r; }
    cv.style.width = Math.max(80, w) + "px";
    cv.style.height = Math.max(80, h) + "px";
  }

  // ---------- import ----------
  function makeDemoPhoto() {
    const c = document.createElement("canvas");
    c.width = 1200; c.height = 800;
    const x = c.getContext("2d");
    const sky = x.createLinearGradient(0, 0, 0, 560);
    sky.addColorStop(0, "#1b2a6b"); sky.addColorStop(0.45, "#b34a7d");
    sky.addColorStop(0.7, "#f7a54b"); sky.addColorStop(1, "#ffe29a");
    x.fillStyle = sky; x.fillRect(0, 0, 1200, 560);
    // sun
    const sun = x.createRadialGradient(760, 430, 8, 760, 430, 190);
    sun.addColorStop(0, "rgba(255,250,220,1)"); sun.addColorStop(0.25, "rgba(255,230,160,0.9)");
    sun.addColorStop(1, "rgba(255,200,120,0)");
    x.fillStyle = sun; x.beginPath(); x.arc(760, 430, 190, 0, 7); x.fill();
    x.fillStyle = "#fff3c4"; x.beginPath(); x.arc(760, 430, 52, 0, 7); x.fill();
    // far mountains
    x.fillStyle = "#5a4a72";
    x.beginPath(); x.moveTo(0, 520);
    [[120, 380], [260, 470], [420, 350], [600, 480], [780, 390], [980, 490], [1200, 400], [1200, 560], [0, 560]]
      .forEach((p) => x.lineTo(p[0], p[1]));
    x.closePath(); x.fill();
    // near hills
    x.fillStyle = "#2e3b2f";
    x.beginPath(); x.moveTo(0, 560);
    [[180, 480], [360, 545], [560, 470], [800, 550], [1020, 490], [1200, 545], [1200, 640], [0, 640]]
      .forEach((p) => x.lineTo(p[0], p[1]));
    x.closePath(); x.fill();
    // lake
    const lake = x.createLinearGradient(0, 600, 0, 800);
    lake.addColorStop(0, "#f2a65a"); lake.addColorStop(0.4, "#7d5a8c"); lake.addColorStop(1, "#1d2b53");
    x.fillStyle = lake; x.fillRect(0, 600, 1200, 200);
    // sun glitter path (tapered)
    const glit = x.createLinearGradient(0, 600, 0, 800);
    glit.addColorStop(0, "rgba(255,240,200,0.7)"); glit.addColorStop(1, "rgba(255,240,200,0.08)");
    x.fillStyle = glit;
    x.beginPath(); x.moveTo(712, 605); x.lineTo(808, 605); x.lineTo(840, 790); x.lineTo(680, 790);
    x.closePath(); x.fill();
    // birds + pines
    x.strokeStyle = "rgba(30,20,40,0.9)"; x.lineWidth = 3;
    [[300, 220], [340, 235], [850, 180], [900, 200]].forEach(([bx, by]) => {
      x.beginPath(); x.moveTo(bx - 14, by); x.quadraticCurveTo(bx - 4, by - 8, bx, by);
      x.quadraticCurveTo(bx + 4, by - 8, bx + 14, by); x.stroke();
    });
    x.fillStyle = "#141f16";
    for (let i = 0; i < 26; i++) {
      const px = 20 + i * 46 + (i % 3) * 10, py = 600 - (i % 4) * 12;
      const s = 22 + (i % 5) * 6;
      x.beginPath(); x.moveTo(px, py - s); x.lineTo(px - s * 0.4, py); x.lineTo(px + s * 0.4, py);
      x.closePath(); x.fill();
      x.fillRect(px - 2, py, 4, 10);
    }
    return c;
  }

  function setSource(canvas, name) {
    sourceCanvas = canvas;
    sourceName = name || "photo";
    srcExifSeg = pendingExifSeg || null; pendingExifSeg = null;
    baseCache = null; baseKey = "";
    if (window.T2S_MASKS) window.T2S_MASKS.clearCache();
    undoStack.length = 0; redoStack.length = 0;
    const keepTexts = S.texts, keepHeal = S.heal;
    S = JSON.parse(JSON.stringify(DEFAULTS));
    S.texts = []; S.heal = [];
    updateHistoryBtns();
    $("#importView").hidden = true;
    $("#editorView").hidden = false;
    syncAllControls();
    buildLookThumbs(true);
    queueRender(true);
    setTimeout(fitStage, 50);
    if (pendingExif) {
      const ex = pendingExif; pendingExif = null;
      S.exif = ex;
      autoLens(ex);
    }
  }

  function loadFile(file) {
    if (!file || !file.type.startsWith("image/")) { toast("Pick an image file"); return; }
    pendingExif = null;
    if (window.T2S_LENS && file.arrayBuffer) {
      file.arrayBuffer().then((buf) => {
        try {
          const seg = window.T2S_LENS.extractApp1 ? window.T2S_LENS.extractApp1(buf) : null;
          pendingExifSeg = seg; // setSource consumes; export also falls back to pending
        } catch (e) { /* ignore */ }
        try {
          const ex = window.T2S_LENS.readExif(buf);
          if (ex && (ex.make || ex.model || ex.lens)) {
            if (sourceCanvas) {
              // image already loaded: apply now
              S.exif = ex;
              autoLens(ex);
            } else pendingExif = ex; // applied in setSource below
          }
        } catch (e) { /* ignore */ }
      });
    }
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const c = document.createElement("canvas");
      const mx = 4000;
      const sc = Math.min(1, mx / Math.max(img.width, img.height));
      c.width = Math.round(img.width * sc); c.height = Math.round(img.height * sc);
      c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      setSource(c, file.name || "upload");
      toast("Photo loaded — all T2Smart looks unlocked");
    };
    img.onerror = () => toast("Could not read that file");
    img.src = url;
  }

  function loadURL(url, name) {
    toast("Loading sample…");
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      const c = document.createElement("canvas");
      c.width = img.width; c.height = img.height;
      c.getContext("2d").drawImage(img, 0, 0);
      setSource(c, name);
    };
    img.onerror = () => toast("Sample failed (offline?) — try upload or Demo photo");
    img.src = url;
  }

  // ---------- controls ----------
  function buildSliders() {
    const groups = { light: "#slLight", color: "#slColor", fx: "#slFx", detail: "#slDetail" };
    for (const k in groups) $(groups[k]).innerHTML = "";
    for (const s of SLIDERS) {
      const row = document.createElement("div");
      row.className = "slRow";
      row.innerHTML = `<div class="slTop"><span>${s.label}</span><b id="v_${s.key}">0</b></div>`;
      const inp = document.createElement("input");
      inp.type = "range"; inp.min = s.min; inp.max = s.max; inp.step = s.step;
      inp.value = S[s.key]; inp.id = "sl_" + s.key;
      inp.addEventListener("input", () => {
        S[s.key] = parseFloat(inp.value);
        $("#v_" + s.key).textContent = inp.value;
        queueRender(false);
      });
      inp.addEventListener("change", pushHistory);
      inp.addEventListener("dblclick", () => {
        pushHistory(); S[s.key] = DEFAULTS[s.key]; syncAllControls(); queueRender(false);
      });
      row.appendChild(inp);
      $(groups[s.group]).appendChild(row);
    }
    // look amount
    const la = $("#lookAmount");
    la.addEventListener("input", () => {
      S.lookAmount = parseFloat(la.value);
      $("#lookAmountV").textContent = la.value + "%";
      queueRender(false);
    });
    la.addEventListener("change", pushHistory);
  }

  function syncAllControls() {
    for (const s of SLIDERS) {
      const el = $("#sl_" + s.key);
      if (el) el.value = S[s.key];
      const v = $("#v_" + s.key);
      if (v) v.textContent = S[s.key];
    }
    $("#lookAmount").value = S.lookAmount;
    $("#lookAmountV").textContent = S.lookAmount + "%";
    $$("#aspectRow button").forEach((b) => b.classList.toggle("on", b.dataset.a === String(S.crop.aspect)));
    $("#straighten").value = S.crop.straighten || 0;
    $("#straightenV").textContent = (S.crop.straighten || 0) + "°";
    $("#healSize").value = Math.round((S.healSize || 0.035) * 1000);
    renderTextList();
    markActiveLook();
    drawCurve();
    syncLens();
    if (window.T2S_COLLAGE) window.T2S_COLLAGE.sync();
    if (window.T2S_PORTRAIT) window.T2S_PORTRAIT.sync();
    if (window.T2S_LAYERS_UI) window.T2S_LAYERS_UI.sync();
  }

  // ---------- looks grid ----------
  function cats() {
    const set = ["All"];
    for (const l of window.T2S_LOOKS || []) if (!set.includes(l.cat)) set.push(l.cat);
    return set;
  }
  function buildCatChips() {
    const w = $("#lookCats"); w.innerHTML = "";
    for (const c of cats()) {
      const b = document.createElement("button");
      b.textContent = c;
      b.classList.toggle("on", c === lookFilter);
      b.onclick = () => { lookFilter = c; buildCatChips(); buildLookThumbs(false); };
      w.appendChild(b);
    }
  }
  function buildLookThumbs(reset) {
    buildCatChips();
    const grid = $("#lookGrid");
    grid.innerHTML = "";
    const looks = (window.T2S_LOOKS || []).filter((l) => lookFilter === "All" || l.cat === lookFilter);
    for (const l of looks) {
      const d = document.createElement("div");
      d.className = "look" + (S.look === l.id ? " on" : "");
      d.dataset.look = l.id;
      d.innerHTML = `<canvas width="192" height="128"></canvas><span>${l.name}</span>`;
      d.onclick = () => {
        if (S.look !== l.id) { pushHistory(); S.look = l.id; markActiveLook(); queueRender(false); }
      };
      grid.appendChild(d);
    }
    markActiveLook();
    queueThumbRender();
  }
  function markActiveLook() {
    $$("#lookGrid .look").forEach((el) => el.classList.toggle("on", el.dataset.look === S.look));
    const l = lookById(S.look);
    if (l) $("#lookName").textContent = l.name + " · " + l.cat;
    renderLookStack();
  }
  // ---------- committed look stack (layered effects) ----------
  const MAX_STACK = 6;
  function renderLookStack() {
    const w = $("#lookStack");
    if (!w) return;
    w.innerHTML = "";
    const st = S.lookStack || [];
    st.forEach((L, i) => {
      const row = document.createElement("div");
      row.className = "stkRow";
      const nm = document.createElement("span");
      const lk = lookById(L.id);
      nm.textContent = (i + 1) + " · " + (lk ? lk.name : L.id) + " · " + L.amount + "%";
      row.appendChild(nm);
      const x = document.createElement("button");
      x.textContent = "✕";
      x.title = "remove this layer";
      x.onclick = () => {
        pushHistory();
        S.lookStack.splice(i, 1);
        syncAllControls(); queueRender(false); queueThumbRender();
      };
      row.appendChild(x);
      w.appendChild(row);
    });
  }
  function wireLookStack() {
    const b = $("#applyLookBtn");
    if (!b || b._wired) return;
    b._wired = true;
    b.onclick = () => {
      if (!sourceCanvas) { toast("Load a photo first"); return; }
      if (!S.lookStack) S.lookStack = [];
      if (S.look === "normal" || !(S.lookAmount > 0)) { toast("Pick an effect first"); return; }
      if (S.lookStack.length >= MAX_STACK) { toast("Stack is full (" + MAX_STACK + ") — remove one first"); return; }
      pushHistory();
      S.lookStack.push({ id: S.look, amount: Math.max(1, Math.min(100, Math.round(S.lookAmount))) });
      S.look = "normal"; S.lookAmount = 100;
      syncAllControls(); queueRender(false); queueThumbRender();
      toast("Effect applied (" + S.lookStack.length + "/" + MAX_STACK + ") — pick the next one");
    };
  }
  function queueThumbRender() {
    if (thumbsQueued) return;
    thumbsQueued = true;
    requestAnimationFrame(renderThumbs);
  }
  function renderThumbs() {
    thumbsQueued = false;
    if (!sourceCanvas) return;
    try {
      const tiny = window.T2SEngine.baseDraw(sourceCanvas, S, 160);
      const tctx = tiny.getContext("2d", { willReadFrequently: true });
      const base = tctx.getImageData(0, 0, tiny.width, tiny.height);
      // crop tiny to 3:2 for uniform thumbs
      const items = $$("#lookGrid .look");
      let i = 0;
      function next() {
        const end = Math.min(items.length, i + 8);
        for (; i < end; i++) {
          const el = items[i];
          const l = lookById(el.dataset.look);
          const c = el.querySelector("canvas");
          const cw = 192, chh = 128;
          c.width = cw; c.height = chh;
          const cx = c.getContext("2d");
          // cover-draw tiny
          const r = Math.max(cw / tiny.width, chh / tiny.height);
          const dw = tiny.width * r, dh = tiny.height * r;
          const tmp = document.createElement("canvas");
          tmp.width = cw; tmp.height = chh;
          tmp.getContext("2d").drawImage(tiny, (cw - dw) / 2, (chh - dh) / 2, dw, dh);
          const t2 = tmp.getContext("2d", { willReadFrequently: true });
          let im = t2.getImageData(0, 0, cw, chh);
          const keep = JSON.parse(JSON.stringify(S));
          const mini = Object.assign({}, keep, {
            exposure: 0, contrast: 0, highlights: 0, shadows: 0, whites: 0, blacks: 0,
            temperature: 0, tint: 0, vibrance: 0, saturation: 0, fade: 0, dehaze: 0,
            vignette: 0, grain: 0, clarity: 0, texture: 0, sharpen: 0, lumNR: 0, colorNR: 0,
            look: l.id, lookAmount: 100, heal: []
          });
          window.T2SEngine.gradeStack(im, mini, S.lookStack);
          window.T2SEngine.gradePass(im, mini, l);
          t2.putImageData(im, 0, 0);
          cx.drawImage(tmp, 0, 0);
        }
        if (i < items.length) requestAnimationFrame(next);
      }
      next();
    } catch (e) { console.warn("thumbs", e); }
  }

  // ---------- crop ----------
  function wireCrop() {
    $$("#aspectRow button").forEach((b) => b.onclick = () => {
      pushHistory();
      const a = b.dataset.a;
      S.crop.aspect = a === "free" ? "free" : parseFloat(a);
      syncAllControls(); queueRender(true); queueThumbRender();
    });
    $("#rotBtn").onclick = () => { pushHistory(); S.crop.rotate = (S.crop.rotate + 90) % 360; syncAllControls(); queueRender(true); };
    $("#flipHBtn").onclick = () => { pushHistory(); S.crop.flipH = !S.crop.flipH; queueRender(true); };
    $("#flipVBtn").onclick = () => { pushHistory(); S.crop.flipV = !S.crop.flipV; queueRender(true); };
    $("#straighten").addEventListener("input", (e) => {
      S.crop.straighten = parseFloat(e.target.value);
      $("#straightenV").textContent = S.crop.straighten + "°";
      queueRender(true);
    });
    $("#straighten").addEventListener("change", pushHistory);
    $("#cropResetBtn").onclick = () => {
      pushHistory();
      S.crop = JSON.parse(JSON.stringify(DEFAULTS.crop));
      syncAllControls(); queueRender(true);
    };
  }

  // ---------- heal ----------
  function canvasPos(e) {
    const cv = $("#stageCanvas");
    const r = cv.getBoundingClientRect();
    const cx = (e.touches && e.touches[0] ? e.touches[0].clientX : e.clientX);
    const cy = (e.touches && e.touches[0] ? e.touches[0].clientY : e.clientY);
    const fx = (cx - r.left) / r.width, fy = (cy - r.top) / r.height;
    return { x: Math.min(1, Math.max(0, fx)), y: Math.min(1, Math.max(0, fy)) };
  }
  function wireHeal() {
    const cv = $("#stageCanvas");
    const down = (e) => {
      if (tool !== "heal" || !sourceCanvas) return;
      e.preventDefault();
      healDrag = true;
      pushHistoryOnce();
      dab(e);
    };
    const move = (e) => { if (healDrag && tool === "heal") { e.preventDefault(); dab(e); } };
    const up = () => {
      if (healDrag) { healDrag = false; commitHealHistory(); queueRender(false); }
    };
    cv.addEventListener("pointerdown", down);
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    $("#healSize").addEventListener("input", (e) => { S.healSize = parseInt(e.target.value, 10) / 1000; });
    $("#healSize").addEventListener("change", pushHistory);
    $("#healUndoBtn").onclick = () => {
      if (!S.heal.length) return;
      pushHistory(); S.heal.pop(); queueRender(false);
    };
    $("#healClearBtn").onclick = () => {
      if (!S.heal.length) return;
      pushHistory(); S.heal = []; queueRender(false);
    };
    let preDrag = null;
    function pushHistoryOnce() {
      if (!preDrag) { preDrag = snap(); undoStack.push(preDrag); if (undoStack.length > 60) undoStack.shift(); redoStack.length = 0; updateHistoryBtns(); }
    }
    function commitHealHistory() { preDrag = null; updateHistoryBtns(); }
    function dab(e) {
      const p = canvasPos(e);
      const last = S.heal[S.heal.length - 1];
      if (!last || Math.hypot(last.x - p.x, last.y - p.y) > S.healSize * 0.4) {
        S.heal.push({ x: p.x, y: p.y, r: S.healSize });
        queueRender(false);
      }
    }
  }

  // ---------- text ----------
  function wireText() {
    $("#addTextBtn").onclick = () => {
      pushHistory();
      S.texts.push({ text: "Your title", x: 0.5, y: 0.32, size: 0.09, color: "#ffffff", font: "Georgia, serif", opacity: 1, bold: true });
      syncAllControls(); queueRender(false);
    };
    // drag texts on canvas
    const cv = $("#stageCanvas");
    cv.addEventListener("pointerdown", (e) => {
      if (tool !== "text" || !S.texts.length) return;
      const p = canvasPos(e);
      const ctx = cv.getContext("2d");
      const W = cv.width, H = cv.height;
      // pick topmost text whose measured bbox contains the point
      for (let i = S.texts.length - 1; i >= 0; i--) {
        const t = S.texts[i];
        const size = Math.max(8, t.size * H);
        ctx.font = (t.bold ? "700 " : "400 ") + size + "px " + t.font;
        const lines = String(t.text || "").split("\n");
        let wMax = 0;
        for (const ln of lines) wMax = Math.max(wMax, ctx.measureText(ln || " ").width);
        const wN = wMax / W / 2 + 0.015, hN = (lines.length * size * 1.15) / H / 2 + 0.015;
        if (Math.abs(p.x - t.x) <= wN && Math.abs(p.y - t.y) <= hN) {
          dragText = { idx: i, dx: t.x - p.x, dy: t.y - p.y, moved: false, pre: snap() };
          cv.setPointerCapture && e.pointerId != null && cv.setPointerCapture(e.pointerId);
          break;
        }
      }
    });
    cv.addEventListener("pointermove", (e) => {
      if (!dragText) return;
      const p = canvasPos(e);
      const t = S.texts[dragText.idx];
      t.x = Math.min(0.98, Math.max(0.02, p.x + dragText.dx));
      t.y = Math.min(0.98, Math.max(0.02, p.y + dragText.dy));
      dragText.moved = true;
      queueRender(false);
    });
    cv.addEventListener("pointerup", () => {
      if (dragText && dragText.moved) {
        undoStack.push(dragText.pre); if (undoStack.length > 60) undoStack.shift();
        redoStack.length = 0; updateHistoryBtns();
      }
      dragText = null;
    });
  }
  function renderTextList() {
    const w = $("#textList"); if (!w) return;
    w.innerHTML = "";
    S.texts.forEach((t, i) => {
      const d = document.createElement("div");
      d.className = "txtItem";
      d.innerHTML = `<input data-k="text" value="${String(t.text).replace(/"/g, "&quot;")}" />
        <input type="color" data-k="color" value="${t.color}" title="color" />
        <select data-k="font">
          <option>Georgia, serif</option><option>Arial, sans-serif</option>
          <option>Impact, sans-serif</option><option>Courier New, monospace</option>
          <option>Comic Sans MS, cursive</option>
        </select>
        <input type="range" data-k="size" min="0.03" max="0.22" step="0.005" value="${t.size}" title="size" />
        <button data-act="del">✕</button>`;
      d.querySelector("select").value = t.font;
      d.querySelectorAll("input,select").forEach((el) => {
        el.addEventListener("input", () => {
          const k = el.dataset.k;
          if (k === "size") t[k] = parseFloat(el.value);
          else t[k] = el.value;
          queueRender(false);
        });
        el.addEventListener("change", pushHistory);
      });
      d.querySelector("[data-act=del]").onclick = () => { pushHistory(); S.texts.splice(i, 1); syncAllControls(); queueRender(false); };
      w.appendChild(d);
    });
  }

  // ---------- curves ----------
  let curveChan = "rgb", curveDrag = null;
  function ensureCurves() {
    if (!S.curves) {
      S.curves = {
        rgb: [[0, 0], [255, 255]], r: [[0, 0], [255, 255]],
        g: [[0, 0], [255, 255]], b: [[0, 0], [255, 255]]
      };
    }
    return S.curves;
  }
  function curveXY(e) {
    const cv = $("#curveCanvas");
    const r = cv.getBoundingClientRect();
    const fx = (e.clientX - r.left) / r.width, fy = (e.clientY - r.top) / r.height;
    return [Math.round(Math.min(1, Math.max(0, fx)) * 255),
            Math.round((1 - Math.min(1, Math.max(0, fy))) * 255)];
  }
  function drawCurve() {
    const cv = $("#curveCanvas");
    if (!cv) return;
    const ctx = cv.getContext("2d");
    const W = cv.width, H = cv.height;
    ctx.clearRect(0, 0, W, H);
    ctx.strokeStyle = "rgba(255,255,255,0.12)";
    ctx.lineWidth = 1;
    for (let i = 1; i < 4; i++) {
      ctx.beginPath(); ctx.moveTo(W * i / 4, 0); ctx.lineTo(W * i / 4, H); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, H * i / 4); ctx.lineTo(W, H * i / 4); ctx.stroke();
    }
    const curves = S.curves;
    const lut = window.T2SEngine.curvesLUT(curves);
    const col = curveChan === "r" ? "#f66" : curveChan === "g" ? "#6d6" : curveChan === "b" ? "#6af" : "#fff";
    ctx.strokeStyle = col; ctx.lineWidth = 2; ctx.beginPath();
    for (let x = 0; x < 256; x++) {
      const v = lut ? lut[curveChan === "rgb" ? "m" : curveChan][x] : x;
      const px = x / 255 * W, py = H - v / 255 * H;
      if (x === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    ctx.stroke();
    const pts = (curves && curves[curveChan]) || [[0, 0], [255, 255]];
    ctx.fillStyle = col;
    for (const q of pts) {
      const px = q[0] / 255 * W, py = H - q[1] / 255 * H;
      ctx.beginPath(); ctx.arc(px, py, 5, 0, 7); ctx.fill();
      ctx.strokeStyle = "#000"; ctx.lineWidth = 1.5; ctx.stroke();
    }
  }
  function wireCurves() {
    $$("#curveChans button[data-c]").forEach((b) => b.onclick = () => {
      curveChan = b.dataset.c;
      $$("#curveChans button[data-c]").forEach((x) => x.classList.toggle("on", x === b));
      drawCurve();
    });
    $("#curveResetBtn").onclick = () => {
      if (!S.curves) return;
      pushHistory();
      S.curves = null;
      drawCurve(); queueRender(false);
    };
    const cv = $("#curveCanvas");
    if (!cv) return;
    const nearIdx = (q) => {
      const pts = ensureCurves()[curveChan];
      const W = cv.width, H = cv.height;
      let best = -1, bd = 1e9;
      pts.forEach((p, i) => {
        const dx = p[0] / 255 * W - q[0] / 255 * W, dy = p[1] / 255 * H - q[1] / 255 * H;
        const d = dx * dx + dy * dy;
        if (d < bd) { bd = d; best = i; }
      });
      return bd < 18 * 18 ? best : -1;
    };
    cv.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      cv.setPointerCapture && cv.setPointerCapture(e.pointerId);
      const q = curveXY(e);
      const pts = ensureCurves()[curveChan];
      const i = nearIdx(q);
      if (i >= 0) {
        curveDrag = { idx: i, moved: false, pre: snap() };
        undoStack.push(curveDrag.pre);
        if (undoStack.length > 60) undoStack.shift();
        redoStack.length = 0; updateHistoryBtns();
      } else {
        pushHistory();
        pts.push(q);
        pts.sort((a, b) => a[0] - b[0]);
        curveDrag = { idx: pts.indexOf(q), moved: true, pre: null };
        drawCurve(); queueRender(false);
      }
    });
    cv.addEventListener("pointermove", (e) => {
      if (!curveDrag) return;
      const q = curveXY(e);
      const pts = ensureCurves()[curveChan];
      const p = pts[curveDrag.idx];
      if (!p) return;
      p[0] = q[0]; p[1] = q[1];
      curveDrag.moved = true;
      drawCurve(); queueRender(false);
    });
    const up = () => {
      if (curveDrag && curveDrag.moved && curveDrag.pre === null) { /* added-point history already pushed */ }
      curveDrag = null;
      updateHistoryBtns();
    };
    cv.addEventListener("pointerup", up);
    cv.addEventListener("pointercancel", () => { curveDrag = null; });
    cv.addEventListener("dblclick", (e) => {
      const q = curveXY(e);
      const pts = ensureCurves()[curveChan];
      const i = nearIdx(q);
      if (i >= 0 && pts.length > 2) {
        pushHistory();
        pts.splice(i, 1);
        drawCurve(); queueRender(false);
      }
    });
  }

  // ---------- lens ----------
  function wireLens() {
    const en = $("#lensEnable");
    if (!en) return;
    const prof = $("#lensProfile");
    prof.innerHTML = `<option>Manual</option>` +
      window.T2S_LENS.PROFILES.map((p) => `<option>${p.id}</option>`).join("");
    en.onclick = () => {
      pushHistory();
      S.lens.enabled = !S.lens.enabled;
      syncLens(); queueRender(false);
    };
    $("#lensAutoBtn").onclick = () => {
      if (S.exif && (S.exif.make || S.exif.model || S.exif.lens)) {
        pushHistory(); autoLens(S.exif);
      } else toast("No camera EXIF on this photo — pick a profile manually");
    };
    prof.onchange = () => {
      pushHistory();
      const p = window.T2S_LENS.PROFILES.find((q) => q.id === prof.value);
      if (p) S.lens = { enabled: true, k1: p.k1, ca: p.ca, vig: p.vig, profile: p.id };
      else S.lens.profile = "Manual";
      syncLens(); queueRender(false);
    };
    const defs = [["lensK1", "k1", -0.2, 0.2, 0.001], ["lensCA", "ca", 0, 3, 0.05], ["lensVig", "vig", 0, 50, 0.5]];
    for (const [id, k, mn, mx, st] of defs) {
      const el = $("#" + id);
      el.addEventListener("input", () => {
        S.lens[k] = parseFloat(el.value);
        S.lens.profile = "Manual";
        $("#" + id + "V").textContent = el.value;
        queueRender(false);
      });
      el.addEventListener("change", pushHistory);
    }
    syncLens();
  }
  function syncLens() {
    if (!$("#lensEnable")) return;
    const L = S.lens || {};
    $("#lensEnable").textContent = L.enabled ? "Correction: ON" : "Correction: OFF";
    $("#lensEnable").classList.toggle("on", !!L.enabled);
    $("#lensProfile").value = L.profile || "Manual";
    $("#lensK1").value = L.k1 || 0; $("#lensK1V").textContent = L.k1 || 0;
    $("#lensCA").value = L.ca || 0; $("#lensCAV").textContent = L.ca || 0;
    $("#lensVig").value = L.vig || 0; $("#lensVigV").textContent = L.vig || 0;
    const ex = S.exif;
    $("#lensExif").textContent = ex && (ex.make || ex.model || ex.lens)
      ? [ex.make, ex.model, ex.lens].filter(Boolean).join(" · ") : "No EXIF data";
  }

  // ---------- AI enhance ----------
  let enhMode = "2x", enhResult = null, enhRunning = false;
  function runEnhAnalysis() {
    const box = $("#enhAnalysis");
    if (!box) return;
    if (!sourceCanvas) { box.textContent = "Load a photo first."; $("#enhMp").textContent = "–"; return; }
    try {
      const a = window.T2S_ENHANCE.analyze(sourceCanvas);
      $("#enhMp").textContent = a.mp + " MP · " + a.w + "×" + a.h;
      box.textContent = a.findings.join("; ") + ".";
      $("#enhRec").textContent = "try " + a.recommended;
      enhMode = a.recommended;
      $$("#enhModes button").forEach((b) => b.classList.toggle("on", b.dataset.m === enhMode));
    } catch (e) { box.textContent = "Analysis failed: " + e.message; }
  }
  function drawEnhPreview(which) {
    const pv = $("#enhPreview");
    if (!pv || !enhResult) return;
    const src = which === "base" ? enhResult.baseCanvas : enhResult.canvas;
    pv.width = src.width; pv.height = src.height;
    pv.getContext("2d").drawImage(src, 0, 0);
    $("#enhSize").textContent = src.width + "×" + src.height + (which === "base" ? " · upscale only" : " · AI " + enhResult.mode);
  }
  function wireEnhance() {
    if (!window.T2S_ENHANCE) return;
    window.T2S_ENHANCE.wire({
      getSource: () => sourceCanvas, setSource,
      sourceName: () => sourceName, toast
    });
    $$("#enhModes button").forEach((b) => b.onclick = () => {
      enhMode = b.dataset.m;
      $$("#enhModes button").forEach((x) => x.classList.toggle("on", x === b));
    });
    $("#enhStrength").addEventListener("input", (e) => {
      $("#enhStrengthV").textContent = e.target.value + "%";
    });
    const pv = $("#enhPreview");
    pv.addEventListener("pointerdown", (e) => { e.preventDefault(); drawEnhPreview("base"); });
    pv.addEventListener("pointerup", () => drawEnhPreview("ai"));
    pv.addEventListener("pointerleave", () => drawEnhPreview("ai"));
    $("#enhCancel").onclick = () => { window.T2S_ENHANCE.cancel(); };
    $("#enhGo").onclick = async () => {
      if (enhRunning || !sourceCanvas) return;
      enhRunning = true;
      $("#enhGo").disabled = true; $("#enhCancel").disabled = false; $("#enhApply").disabled = true;
      const prog = $("#enhProg"), status = $("#enhStatus");
      try {
        const strength = parseFloat($("#enhStrength").value);
        const r = await window.T2S_ENHANCE.enhance({
          mode: enhMode, strength,
          onStatus: (m) => { status.textContent = m; },
          onProgress: (f, label) => { prog.value = f; status.textContent = label; }
        });
        enhResult = r;
        prog.value = 1; status.textContent = "done in " + r.outW + "×" + r.outH;
        drawEnhPreview("ai");
        $("#enhApply").disabled = false;
        toast("Enhanced " + r.mode + " ready — preview above (hold to compare)");
      } catch (e) {
        status.textContent = String(e && e.message || e).slice(0, 80);
        if (!/cancelled/i.test(status.textContent)) toast("Enhance failed: " + status.textContent);
      }
      enhRunning = false;
      $("#enhGo").disabled = false; $("#enhCancel").disabled = true;
    };
    $("#enhApply").onclick = () => {
      if (!enhResult) return;
      window.T2S_ENHANCE.applyAsSource(enhResult.canvas, "AI " + enhResult.mode);
      $("#enhRevert").disabled = false;
      $("#enhApply").disabled = true;
      toast("Enhanced photo is now the source ✓");
    };
    $("#enhRevert").onclick = () => {
      if (window.T2S_ENHANCE.revertSource()) {
        $("#enhRevert").disabled = true;
        enhResult = null;
        runEnhAnalysis();
      }
    };
  }

  // ---------- tabs / header ----------
  function wireTabs() {
    $$(".tabBtn").forEach((b) => b.onclick = () => {
      tool = b.dataset.tab;
      $$(".tabBtn").forEach((x) => x.classList.toggle("on", x === b));
      $$(".panel").forEach((p) => p.hidden = p.id !== "panel_" + tool);
      const dock = $("#lookDock");
      if (dock) dock.hidden = tool !== "looks";
      const main = $("#main");
      if (main) main.classList.toggle("looksMode", tool === "looks");
      $("#stageCanvas").style.cursor = tool === "heal" ? "crosshair" : tool === "text" ? "move" : "default";
      if (tool === "looks") queueThumbRender();
      if (tool === "curves") drawCurve();
      if (tool === "enhance") runEnhAnalysis();
    });
  }
  function wireHeader() {
    $("#undoBtn").onclick = () => {
      if (!undoStack.length) return;
      redoStack.push(snap()); restore(undoStack.pop()); updateHistoryBtns();
    };
    $("#redoBtn").onclick = () => {
      if (!redoStack.length) return;
      undoStack.push(snap()); restore(redoStack.pop()); updateHistoryBtns();
    };
    $("#resetBtn").onclick = () => {
      pushHistory();
      const t = S.texts, hl = S.heal;
      S = JSON.parse(JSON.stringify(DEFAULTS));
      S.texts = t; // keep text/heal? Photoshop reset keeps layers? reset all but keep crop? do full photo reset:
      S.texts = []; S.heal = [];
      syncAllControls(); queueRender(true); queueThumbRender();
      toast("Reset adjustments");
    };
    $("#newBtn").onclick = () => {
      $("#importView").hidden = false;
      $("#editorView").hidden = true;
      if (window.T2S_GALLERY) window.T2S_GALLERY.refresh();
    };
    const cmp = $("#compareBtn");
    const on = (e) => { e.preventDefault(); compareHeld = true; queueRender(false); };
    const off = () => { compareHeld = false; queueRender(false); };
    cmp.addEventListener("pointerdown", on);
    window.addEventListener("pointerup", off);
    $("#exportBtn").onclick = openExport;
    $("#shareBtn").onclick = async () => {
      if (!window.T2S_SHARE) return;
      const code = window.T2S_SHARE.encode(S);
      if (!code) { toast("Preset too large to share (thin out brush strokes)"); return; }
      const link = window.T2S_SHARE.linkFor(code);
      try { await navigator.clipboard.writeText(link); toast("Share link copied ✓"); }
      catch (e) { prompt("Copy share link:", link); }
    };
    const langSel = $("#langSel");
    if (langSel && window.T2S_I18N) {
      langSel.innerHTML = window.T2S_I18N.langList().map((c) => `<option value="${c}">${c.toUpperCase()}</option>`).join("");
      langSel.value = window.T2S_I18N.getLang();
      langSel.onchange = () => {
        window.T2S_I18N.setLang(langSel.value);
        toast("Language: " + langSel.value.toUpperCase());
      };
    }
  }

  // ---------- export ----------
  function openExport() {
    if (!sourceCanvas) return;
    $("#exportModal").hidden = false;
  }
  function closeExport() { $("#exportModal").hidden = true; }
  function renderFullCanvas(maxSide) {
    const base = window.T2SEngine.baseDraw(sourceCanvas, S, maxSide);
    const off = document.createElement("canvas");
    off.width = base.width; off.height = base.height;
    const octx = off.getContext("2d", { willReadFrequently: true });
    const look = lookById(S.look);
    let img = null;
    if (window.T2SGPU && window.T2SGPU.ready()) {
      try { img = window.T2SGPU.process(base, S, look, S.lookStack); } catch (e) { console.warn("[t2s-gpu] export fallback:", e); img = null; }
    }
    if (!img) {
      octx.drawImage(base, 0, 0);
      img = octx.getImageData(0, 0, off.width, off.height);
      if (window.T2S_LENS) window.T2S_LENS.lensPass(img, S.lens);
      if (window.T2S_PORTRAIT) window.T2S_PORTRAIT.bokehPass(img, S.bokeh);
      window.T2SEngine.gradeStack(img, S, S.lookStack);
      window.T2SEngine.gradePass(img, S, look);
      window.T2SEngine.detailPass(img, S);
      if (window.T2S_MASKS) window.T2S_MASKS.applyLayers(img, S);
      if (window.T2S_PORTRAIT) window.T2S_PORTRAIT.facePass(img, S.face);
    }
    window.T2SEngine.healPass(img, S.heal);
    if (window.T2S_GENFILL) window.T2S_GENFILL.apply(img, S);
    octx.putImageData(img, 0, 0);
    drawTexts(octx, off.width, off.height, false);
    return off;
  }
  function doExport() {
    const fmt = $("#expFmt").value;
    const q = parseFloat($("#expQ").value);
    const size = $("#expSize").value;
    toast("Rendering full-res export…");
    setTimeout(() => {
      try {
        const maxSide = size === "orig" ? 6000 : size === "m" ? 2048 : 1280;
        const off = renderFullCanvas(maxSide);
        off.toBlob(async (blob) => {
          if (!blob) { toast("Export failed"); return; }
          let exifNote = "";
          const exifSeg = srcExifSeg || pendingExifSeg; // pending covers late buffer reads
          if (blob && fmt === "jpeg" && exifSeg && window.T2S_LENS && window.T2S_LENS.patchExifForExport) {
            try {
              const fixed = window.T2S_LENS.patchExifForExport(exifSeg, off.width, off.height);
              const raw = new Uint8Array(await blob.arrayBuffer());
              if (fixed && raw[0] === 0xFF && raw[1] === 0xD8) {
                const out = new Uint8Array(2 + fixed.length + raw.length - 2);
                out.set(raw.subarray(0, 2), 0); out.set(fixed, 2); out.set(raw.subarray(2), 2 + fixed.length);
                blob = new Blob([out], { type: "image/jpeg" });
                exifNote = " · camera EXIF kept";
              }
            } catch (e) { console.warn("exif-export", e); }
          }
          const a = document.createElement("a");
          a.href = URL.createObjectURL(blob);
          a.download = "t2smart-pichancer-" + Date.now() + (fmt === "png" ? ".png" : ".jpg");
          a.click();
          setTimeout(() => URL.revokeObjectURL(a.href), 4000);
          closeExport();
          toast("Exported " + off.width + "×" + off.height + exifNote + " — watermark free");
        }, fmt === "png" ? "image/png" : "image/jpeg", q);
      } catch (e) {
        console.error(e);
        toast("Export failed: " + e.message);
      }
    }, 30);
  }

  function toast(msg) {
    const t = $("#toast");
    t.textContent = msg;
    t.hidden = false;
    clearTimeout(t._h);
    t._h = setTimeout(() => t.hidden = true, 2600);
  }

  function wireImport() {
    const dz = $("#dropZone"), fi = $("#fileInput");
    $("#uploadBtn").onclick = () => fi.click();
    fi.onchange = () => loadFile(fi.files[0]);
    ["dragover", "dragenter"].forEach((ev) => dz.addEventListener(ev, (e) => { e.preventDefault(); dz.classList.add("drag"); }));
    ["dragleave", "drop"].forEach((ev) => dz.addEventListener(ev, (e) => { e.preventDefault(); dz.classList.remove("drag"); }));
    dz.addEventListener("drop", (e) => loadFile(e.dataTransfer.files[0]));
    dz.addEventListener("click", () => fi.click());
    $("#demoBtn").onclick = () => setSource(makeDemoPhoto(), "demo-sunset");
    $$("#sampleRow button").forEach((b) => b.onclick = () => loadURL(b.dataset.u, b.dataset.n));
    window.addEventListener("resize", fitStage);
  }

  function boot() {
    buildSliders();
    wireTabs(); wireHeader(); wireCrop(); wireHeal(); wireText(); wireCurves(); wireLens(); wireImport(); wireLookStack(); wireEnhance();
    if (window.T2S_LAYERS_UI) window.T2S_LAYERS_UI.wire({
      getState: () => S, pushHistory, render: (c) => queueRender(c),
      syncAll: syncAllControls, toast, snapshot: snap,
      pushRaw: (j) => { undoStack.push(j); if (undoStack.length > 60) undoStack.shift(); redoStack.length = 0; updateHistoryBtns(); }
    });
    if (window.T2S_PORTRAIT) window.T2S_PORTRAIT.wire({
      getState: () => S, pushHistory, render: (c) => queueRender(c), toast,
      getBase: () => getBase(MAX_PREVIEW)
    });
    window.T2S_APP = { getState: () => S, setSource, loadURL, queueRender, doExport, renderFull: renderFullCanvas, getSource: () => sourceCanvas, lookById };
    if (window.T2S_COLLAGE) window.T2S_COLLAGE.wire({
      getState: () => S, pushHistory, render: (c) => queueRender(c), toast,
      getSource: () => sourceCanvas, lookById
    });
    if (window.T2S_VIDEO) window.T2S_VIDEO.wire({ getState: () => S, toast, lookById });
    if (window.T2S_STUDIO) window.T2S_STUDIO.wire({
      getState: () => S, pushHistory, render: (c) => queueRender(c), toast,
      getSource: () => sourceCanvas, lookById, setSource
    });
    if (window.T2S_GALLERY) window.T2S_GALLERY.wire({
      getState: () => S, getSource: () => sourceCanvas, getSourceName: () => sourceName,
      loadURL, setSource, renderFull: renderFullCanvas, toast
    });
    if (window.T2S_GENFILL) window.T2S_GENFILL.wire({
      getState: () => S, pushHistory, render: (c) => queueRender(c), toast
    });
    if (window.T2S_I18N) window.T2S_I18N.applyStatic();
    $("#expCancel").onclick = closeExport;
    $("#expGo").onclick = doExport;
    $("#expQ").addEventListener("input", (e) => $("#expQV").textContent = e.target.value);
    updateHistoryBtns();
    setSource(makeDemoPhoto(), "demo-sunset");
    afterBoot();
  }

  // share-hash presets, kv resume, autosave
  let saveDirty = false;
  function afterBoot() {
    try {
      if (window.T2S_SHARE) {
        const hs = window.T2S_SHARE.readHash();
        if (hs) {
          S = Object.assign(JSON.parse(JSON.stringify(DEFAULTS)), hs);
          if (window.T2S_MASKS) window.T2S_MASKS.clearCache();
          if (window.T2S_GENFILL && S.genfill && S.genfill.result) window.T2S_GENFILL.prime(S.genfill.result);
          syncAllControls(); queueRender(true);
          toast("Shared preset applied to this photo ✓");
          return;
        }
      }
    } catch (e) { console.warn("hash", e); }
    (async () => {
      try {
        if (root.kv && root.kv.psx) {
          const proj = await root.kv.psx.get("project");
          if (proj && proj.S && proj.photo) {
            $("#resumeRow").hidden = false;
            $("#resumeBtn").onclick = () => {
              const img = new Image();
              img.onload = () => {
                const c = document.createElement("canvas");
                c.width = img.width; c.height = img.height;
                c.getContext("2d").drawImage(img, 0, 0);
                setSource(c, proj.name || "resumed");
                S = Object.assign(JSON.parse(JSON.stringify(DEFAULTS)), proj.S);
                if (window.T2S_MASKS) window.T2S_MASKS.clearCache();
                if (window.T2S_GENFILL && S.genfill && S.genfill.result) window.T2S_GENFILL.prime(S.genfill.result);
                syncAllControls(); queueRender(true);
                $("#resumeRow").hidden = true;
                toast("Project resumed ✓");
              };
              img.src = proj.photo;
            };
            $("#resumeNo").onclick = () => { $("#resumeRow").hidden = true; };
          }
        }
      } catch (e) { /* kv unavailable */ }
    })();
    setInterval(async () => {
      if (!saveDirty || !sourceCanvas) return;
      saveDirty = false;
      try {
        if (root.kv && root.kv.psx) {
          const sc = Math.min(1, 1600 / Math.max(sourceCanvas.width, sourceCanvas.height));
          const pc = document.createElement("canvas");
          pc.width = Math.max(2, Math.round(sourceCanvas.width * sc));
          pc.height = Math.max(2, Math.round(sourceCanvas.height * sc));
          pc.getContext("2d").drawImage(sourceCanvas, 0, 0, pc.width, pc.height);
          await root.kv.psx.set("project", {
            v: 1, savedAt: Date.now(), name: sourceName, S,
            photo: pc.toDataURL("image/jpeg", 0.82)
          });
        }
      } catch (e) { /* ignore */ }
    }, 5000);
  }

  if (document.readyState !== "loading") boot();
  else document.addEventListener("DOMContentLoaded", boot);
})();
