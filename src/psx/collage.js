/* T2Smart-PicHancer — M4 collage: multi-photo grid layouts, per-cell photo/zoom/look.
   Photos: 'main' (live editor source) + session extras. Cells render through the
   same GPU pipeline (grade/lens/bokeh/detail/layers/face) with per-cell look. */
(function () {
  "use strict";

  const LAYOUTS = [
    { name: "Duo H", cells: [[0, 0, 0.5, 1], [0.5, 0, 0.5, 1]] },
    { name: "Duo V", cells: [[0, 0, 1, 0.5], [0, 0.5, 1, 0.5]] },
    { name: "Trio V", cells: [[0, 0, 0.333, 1], [0.333, 0, 0.334, 1], [0.667, 0, 0.333, 1]] },
    { name: "Trio H", cells: [[0, 0, 1, 0.333], [0, 0.333, 1, 0.334], [0, 0.667, 1, 0.333]] },
    { name: "Big L", cells: [[0, 0, 0.6, 1], [0.6, 0, 0.4, 0.5], [0.6, 0.5, 0.4, 0.5]] },
    { name: "Big R", cells: [[0, 0, 0.4, 0.5], [0, 0.5, 0.4, 0.5], [0.4, 0, 0.6, 1]] },
    { name: "Big T", cells: [[0, 0, 1, 0.6], [0, 0.6, 0.5, 0.4], [0.5, 0.6, 0.5, 0.4]] },
    { name: "Quad", cells: [[0, 0, 0.5, 0.5], [0.5, 0, 0.5, 0.5], [0, 0.5, 0.5, 0.5], [0.5, 0.5, 0.5, 0.5]] },
    { name: "Row 4", cells: [[0, 0, 0.25, 1], [0.25, 0, 0.25, 1], [0.5, 0, 0.25, 1], [0.75, 0, 0.25, 1]] },
    { name: "Col 4", cells: [[0, 0, 1, 0.25], [0, 0.25, 1, 0.25], [0, 0.5, 1, 0.25], [0, 0.75, 1, 0.25]] },
  ];
  const GAP = 6;

  let api = null;
  const $ = (s) => document.querySelector(s);
  const extras = new Map(); // id -> canvas
  let extraN = 0;
  function S() { return api.getState(); }

  function ensureCells() {
    const C = S().collage;
    const n = LAYOUTS[C.layout].cells.length;
    while (C.cells.length < n) {
      C.cells.push({ photo: C.cells.length === 0 ? "main" : "main", zoom: 1, ox: 0.5, oy: 0.5, look: "inherit" });
    }
    C.cells.length = n;
    if (C.sel >= n) C.sel = 0;
  }

  function photoCanvas(id) {
    if (id === "main") return api.getSource();
    return extras.get(id) || api.getSource();
  }

  function cellBase(photo, rect, cell, W, H) {
    const rx = Math.round(rect[0] * W), ry = Math.round(rect[1] * H);
    const rw = Math.round(rect[2] * W), rh = Math.round(rect[3] * H);
    const c = document.createElement("canvas");
    c.width = Math.max(2, rw); c.height = Math.max(2, rh);
    const x = c.getContext("2d");
    const z = cell.zoom || 1;
    const scale = Math.max(rw / photo.width, rh / photo.height) * z;
    const dw = photo.width * scale, dh = photo.height * scale;
    const slackX = Math.max(0, dw - rw), slackY = Math.max(0, dh - rh);
    const ox = (cell.ox == null ? 0.5 : cell.ox), oy = (cell.oy == null ? 0.5 : cell.oy);
    x.imageSmoothingQuality = "high";
    x.clearRect(0, 0, rw, rh);
    x.drawImage(photo, (rw - dw) / 2 + (0.5 - ox) * slackX, (rh - dh) / 2 + (0.5 - oy) * slackY, dw, dh);
    return c;
  }

  function cellState(cell) {
    const base = S();
    const st = Object.assign({}, base, {
      look: cell.look && cell.look !== "inherit" ? cell.look : base.look,
      heal: [], texts: [], collage: { active: false }
    });
    return st;
  }

  function renderCollage(W, H) {
    const C = S().collage;
    ensureCells();
    const out = document.createElement("canvas");
    out.width = W; out.height = H;
    const x = out.getContext("2d");
    x.fillStyle = "#0c0c11"; x.fillRect(0, 0, W, H);
    const rects = LAYOUTS[C.layout].cells;
    C.cells.forEach((cell, i) => {
      const r = rects[i];
      const px = Math.round(r[0] * W), py = Math.round(r[1] * H);
      const pw = Math.round(r[2] * W), ph = Math.round(r[3] * H);
      try {
        const photo = photoCanvas(cell.photo);
        if (!photo || !photo.width) return;
        const base = cellBase(photo, [0, 0, 1, 1], cell, Math.max(2, pw - GAP), Math.max(2, ph - GAP));
        const st = cellState(cell);
        const look = api.lookById(st.look);
        let img;
        if (window.T2SGPU && window.T2SGPU.ready()) {
          try { img = window.T2SGPU.process(base, st, look); } catch (e) { img = null; }
        }
        if (!img) {
          const t = base.getContext("2d", { willReadFrequently: true });
          img = t.getImageData(0, 0, base.width, base.height);
          if (window.T2S_LENS) window.T2S_LENS.lensPass(img, st.lens);
          if (window.T2S_PORTRAIT) window.T2S_PORTRAIT.bokehPass(img, st.bokeh);
          window.T2SEngine.gradePass(img, st, look);
          window.T2SEngine.detailPass(img, st);
          if (window.T2S_MASKS) window.T2S_MASKS.applyLayers(img, st);
          if (window.T2S_PORTRAIT) window.T2S_PORTRAIT.facePass(img, st.face);
        }
        const tc = document.createElement("canvas");
        tc.width = img.width; tc.height = img.height;
        tc.getContext("2d").putImageData(img, 0, 0);
        x.drawImage(tc, px + GAP / 2, py + GAP / 2, Math.max(1, pw - GAP), Math.max(1, ph - GAP));
      } catch (e) { console.warn("cell", i, e); }
    });
    return out;
  }

  function frameSize(maxSide) {
    const src = api.getSource();
    const asp = src && src.width ? src.width / src.height : 3 / 2;
    const a = Math.min(2.2, Math.max(0.45, asp));
    let W = maxSide, H = Math.round(maxSide / a);
    return [W, H];
  }

  // returns true if collage was drawn to stage (caller should stop)
  function renderToStage() {
    const C = S().collage;
    if (!C || !C.active) return false;
    ensureCells();
    const disp = $("#stageCanvas");
    const [W, H] = frameSize(1400);
    const out = renderCollage(W, H);
    // selection outlines + picture numbers (preview only)
    try {
      const x = out.getContext("2d");
      const rects = LAYOUTS[C.layout].cells;
      const lw = Math.max(3, Math.round(W / 300));
      rects.forEach((r, i) => {
        const px = Math.round(r[0] * W), py = Math.round(r[1] * H);
        const pw = Math.round(r[2] * W), ph = Math.round(r[3] * H);
        if (i === C.sel) {
          x.strokeStyle = "#22d3ee"; x.lineWidth = lw * 2;
          x.strokeRect(px + 2, py + 2, pw - 4, ph - 4);
        }
        const bs = Math.max(20, Math.round(W / 45));
        x.fillStyle = i === C.sel ? "#22d3ee" : "rgba(10,15,30,.75)";
        x.beginPath();
        x.arc(px + GAP + bs * 0.7, py + GAP + bs * 0.7, bs * 0.55, 0, Math.PI * 2);
        x.fill();
        x.fillStyle = i === C.sel ? "#0a0f1e" : "#fff";
        x.font = "bold " + Math.round(bs * 0.6) + "px system-ui,sans-serif";
        x.textAlign = "center"; x.textBaseline = "middle";
        x.fillText(String(i + 1), px + GAP + bs * 0.7, py + GAP + bs * 0.72);
      });
    } catch (e) { /* preview chrome must never break render */ }
    disp.width = W; disp.height = H;
    disp.getContext("2d").drawImage(out, 0, 0);
    const ms = $("#renderMs");
    if (ms) ms.textContent = "collage · " + W + "×" + H;
    return true;
  }

  function canvasPos(e) {
    const cv = $("#stageCanvas");
    const r = cv.getBoundingClientRect();
    return { x: Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)), y: Math.min(1, Math.max(0, (e.clientY - r.top) / r.height)) };
  }

  function wire(a) {
    api = a;
    const layouts = $("#collageLayouts");
    layouts.innerHTML = "";
    LAYOUTS.forEach((L, i) => {
      const b = document.createElement("button");
      b.textContent = L.name; b.style.fontSize = "12px";
      b.onclick = () => { api.pushHistory(); S().collage.layout = i; S().collage.sel = 0; sync(); api.render(false); };
      layouts.appendChild(b);
    });
    buildFxGrid();
    $("#cellZoom").addEventListener("input", (e) => {
      const cell = S().collage.cells[S().collage.sel];
      if (!cell) return;
      cell.zoom = parseFloat(e.target.value);
      $("#cellZoomV").textContent = cell.zoom.toFixed(2).replace(/0$/, "");
      api.render(false);
    });
    $("#cellZoom").addEventListener("change", api.pushHistory);
    $("#collageEnable").onclick = () => {
      api.pushHistory();
      S().collage.active = !S().collage.active;
      ensureCells(); sync(); api.render(true);
    };
    $("#collageExport").onclick = () => {
      api.toast("Rendering collage…");
      setTimeout(() => {
        try {
          const [W, H] = frameSize(2400);
          const out = renderCollage(W, H);
          out.toBlob((blob) => {
            if (!blob) { api.toast("Collage export failed"); return; }
            const link = document.createElement("a");
            link.href = URL.createObjectURL(blob);
            link.download = "t2smart-collage-" + Date.now() + ".jpg";
            link.click();
            setTimeout(() => URL.revokeObjectURL(link.href), 4000);
            api.toast("Collage exported " + W + "×" + H);
          }, "image/jpeg", 0.92);
        } catch (e) { api.toast("Collage export failed: " + e.message); }
      }, 30);
    };
    const cv = $("#stageCanvas");
    cv.addEventListener("pointerdown", (e) => {
      const t = document.querySelector(".tabBtn.on");
      if (!t || t.dataset.tab !== "collage" || !S().collage.active) return;
      const p = canvasPos(e);
      const rects = LAYOUTS[S().collage.layout].cells;
      for (let i = 0; i < rects.length; i++) {
        const r = rects[i];
        if (p.x >= r[0] && p.x < r[0] + r[2] && p.y >= r[1] && p.y < r[1] + r[3]) {
          S().collage.sel = i; sync(); api.render(false);
          break;
        }
      }
    });
    sync();
  }

  function addExtra(canvas, name) {
    const id = "extra" + (++extraN);
    extras.set(id, canvas);
    syncPhotos();
    return id;
  }

  function syncPhotos() {
    const w = $("#collagePhotos");
    if (!w) return;
    w.innerHTML = "";
    const C = S().collage;
    const cell = C.cells[C.sel];
    const mk = (id, label) => {
      const b = document.createElement("button");
      b.textContent = label + (cell && cell.photo === id ? " ✓" : "");
      b.style.fontSize = "12px";
      if (cell && cell.photo === id) b.classList.add("on");
      b.onclick = () => { api.pushHistory(); if (cell) cell.photo = id; sync(); api.render(false); };
      w.appendChild(b);
    };
    mk("main", "Main photo");
    for (const id of extras.keys()) mk(id, id);
    const up = document.createElement("button");
    up.textContent = "+ Upload"; up.style.fontSize = "12px";
    up.onclick = () => {
      const fi = document.createElement("input");
      fi.type = "file"; fi.accept = "image/*";
      fi.onchange = () => {
        const f = fi.files[0];
        if (!f) return;
        const url = URL.createObjectURL(f);
        const img = new Image();
        img.onload = () => {
          const c = document.createElement("canvas");
          const sc = Math.min(1, 2400 / Math.max(img.width, img.height));
          c.width = Math.round(img.width * sc); c.height = Math.round(img.height * sc);
          c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
          URL.revokeObjectURL(url);
          const id = addExtra(c, f.name);
          const cc = S().collage.cells[S().collage.sel];
          if (cc) { api.pushHistory(); cc.photo = id; }
          sync(); api.render(false);
          api.toast("Photo added to collage");
        };
        img.src = url;
      };
      fi.click();
    };
    w.appendChild(up);
  }

  function lookName(id) {
    if (!id || id === "inherit") return "Same as photo";
    const l = (window.T2S_LOOKS || []).find((q) => q.id === id);
    return l ? l.name : id;
  }

  function buildFxGrid() {
    const w = $("#cellFxGrid");
    if (!w) return;
    w.innerHTML = "";
    const mk = (id, label) => {
      const b = document.createElement("button");
      b.textContent = label; b.dataset.look = id;
      b.onclick = () => {
        const C = S().collage, cell = C.cells[C.sel];
        if (!cell) return;
        if (cell.look === id) return;
        api.pushHistory(); cell.look = id; syncFx(); api.render(false);
      };
      w.appendChild(b);
    };
    mk("inherit", "✨ Same as photo");
    for (const l of window.T2S_LOOKS || []) mk(l.id, l.name);
    syncFx();
  }

  function syncFx() {
    const w = $("#cellFxGrid");
    if (!w) return;
    const C = S().collage, cell = C.cells[C.sel];
    const cur = (cell && cell.look) || "inherit";
    [...w.children].forEach((b) => b.classList.toggle("on", b.dataset.look === cur));
    const badge = $("#cellFxSel");
    if (badge) badge.textContent = "Picture " + (C.sel + 1) + " of " + C.cells.length + " · " + lookName(cur);
  }

  function sync() {
    if (!api || !$("#collageEnable")) return;
    const C = S().collage;
    ensureCells();
    $("#collageEnable").textContent = C.active ? "Collage: ON" : "Collage: OFF";
    $("#collageEnable").classList.toggle("on", !!C.active);
    [...$("#collageLayouts").children].forEach((b, i) => b.classList.toggle("on", i === C.layout));
    const cell = C.cells[C.sel];
    if (cell) {
      $("#cellZoom").value = cell.zoom || 1;
      $("#cellZoomV").textContent = (cell.zoom || 1).toFixed(2).replace(/0$/, "");
    }
    syncFx();
    syncPhotos();
  }

  window.T2S_COLLAGE = { wire, sync, renderToStage, renderCollage, LAYOUTS };
})();
