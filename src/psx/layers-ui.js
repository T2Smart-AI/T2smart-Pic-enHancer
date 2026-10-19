/* T2Smart-PicHancer — M2 layers panel UI + stage painting.
   Self-contained; wired from app boot via window.T2S_LAYERS_UI.wire(api). */
(function () {
  "use strict";

  const LAYER_ADJ = [
    { key: "exposure", label: "Exposure", min: -2, max: 2, step: 0.05 },
    { key: "contrast", label: "Contrast", min: -100, max: 100, step: 1 },
    { key: "highlights", label: "Highlights", min: -100, max: 100, step: 1 },
    { key: "shadows", label: "Shadows", min: -100, max: 100, step: 1 },
    { key: "whites", label: "Whites", min: -100, max: 100, step: 1 },
    { key: "blacks", label: "Blacks", min: -100, max: 100, step: 1 },
    { key: "temperature", label: "Temperature", min: -100, max: 100, step: 1 },
    { key: "tint", label: "Tint", min: -100, max: 100, step: 1 },
    { key: "vibrance", label: "Vibrance", min: -100, max: 100, step: 1 },
    { key: "saturation", label: "Saturation", min: -100, max: 100, step: 1 },
  ];

  let api = null, selId = null, painting = false, curStroke = null, dragGeo = null;

  const $ = (s) => document.querySelector(s);
  const uid = () => "L" + Date.now().toString(36) + Math.floor(Math.random() * 1e4).toString(36);
  function S() { return api.getState(); }
  function sel() {
    const arr = S().layers || [];
    return arr.find((l) => l.id === selId) || null;
  }

  function blankAdj() {
    return { exposure: 0, contrast: 0, highlights: 0, shadows: 0, whites: 0, blacks: 0, temperature: 0, tint: 0, vibrance: 0, saturation: 0 };
  }
  function addLayer(kind) {
    api.pushHistory();
    const L = {
      id: uid(), name: kind === "brush" ? "Brush" : kind === "radial" ? "Radial" : "Linear",
      kind, visible: true, opacity: 100, adj: blankAdj(),
      brush: { size: 0.08, soft: 0.6, rev: 0, strokes: [] },
      radial: { cx: 0.5, cy: 0.45, rx: 0.28, ry: 0.22, rot: 0, feather: 0.5, invert: false },
      linear: { angle: 0, pos: 0.5, width: 0.35, feather: 0.5, invert: false }
    };
    L.name += " " + (S().layers.length + 1);
    S().layers.push(L);
    selId = L.id;
    api.syncAll(); api.render(false);
    api.toast(L.name + " added — paint on the photo");
  }

  function canvasPos(e) {
    const cv = $("#stageCanvas");
    const r = cv.getBoundingClientRect();
    const cx = (e.touches && e.touches[0] ? e.touches[0].clientX : e.clientX);
    const cy = (e.touches && e.touches[0] ? e.touches[0].clientY : e.clientY);
    return { x: Math.min(1, Math.max(0, (cx - r.left) / r.width)), y: Math.min(1, Math.max(0, (cy - r.top) / r.height)) };
  }

  function renderPanel() {
    const w = $("#layerList");
    if (!w) return;
    w.innerHTML = "";
    const arr = S().layers || [];
    if (!arr.length) w.innerHTML = `<p class="hint">No selective layers yet. Add a brush, radial or linear mask above.</p>`;
    arr.forEach((L) => {
      const d = document.createElement("div");
      d.className = "slRow" + (L.id === selId ? " on" : "");
      d.style.borderColor = L.id === selId ? "var(--acc)" : "";
      d.innerHTML = `<div class="slTop"><span>${L.visible === false ? "🚫" : "👁"} ${L.name} <i style="color:var(--dim)">${L.kind}</i></span></div>`;
      const row = document.createElement("div");
      row.className = "row";
      const mk = (t, fn, on) => {
        const b = document.createElement("button");
        b.textContent = t; b.style.fontSize = "12px"; if (on) b.classList.add("on");
        b.onclick = (e) => { e.stopPropagation(); fn(); };
        row.appendChild(b); return b;
      };
      mk(L.visible === false ? "Show" : "Hide", () => { api.pushHistory(); L.visible = L.visible === false ? true : false; api.syncAll(); api.render(false); });
      const op = document.createElement("input");
      op.type = "range"; op.min = 0; op.max = 100; op.step = 1; op.value = L.opacity;
      op.title = "opacity"; op.style.flex = "1";
      op.addEventListener("input", () => { L.opacity = parseFloat(op.value); api.render(false); });
      op.addEventListener("change", api.pushHistory);
      op.addEventListener("click", (e) => e.stopPropagation());
      row.appendChild(op);
      mk("✕", () => { api.pushHistory(); S().layers = S().layers.filter((q) => q.id !== L.id); if (selId === L.id) selId = null; api.syncAll(); api.render(false); });
      d.appendChild(row);
      d.onclick = () => { selId = L.id; api.syncAll(); };
      w.appendChild(d);
    });
    renderAdj(); renderMaskTools(); drawMaskThumb();
  }

  function renderAdj() {
    const w = $("#layerAdj");
    if (!w) return;
    w.innerHTML = "";
    const L = sel();
    if (!L) return;
    const h = document.createElement("div");
    h.innerHTML = `<b>${L.name}</b> <span class="hint">adjustments apply inside the mask</span>`;
    w.appendChild(h);
    for (const s of LAYER_ADJ) {
      const row = document.createElement("div");
      row.className = "slRow";
      row.innerHTML = `<div class="slTop"><span>${s.label}</span><b>${L.adj[s.key]}</b></div>`;
      const inp = document.createElement("input");
      inp.type = "range"; inp.min = s.min; inp.max = s.max; inp.step = s.step; inp.value = L.adj[s.key];
      inp.addEventListener("input", () => {
        L.adj[s.key] = parseFloat(inp.value);
        row.querySelector("b").textContent = inp.value;
        api.render(false);
      });
      inp.addEventListener("change", api.pushHistory);
      inp.addEventListener("dblclick", () => { api.pushHistory(); L.adj[s.key] = 0; api.syncAll(); api.render(false); });
      row.appendChild(inp);
      w.appendChild(row);
    }
  }

  function renderMaskTools() {
    const w = $("#layerMask");
    if (!w) return;
    w.innerHTML = "";
    const L = sel();
    if (!L) return;
    if (L.kind === "brush") {
      w.innerHTML = `<div class="slRow"><div class="slTop"><span>Brush size</span><b>${Math.round(L.brush.size * 1000)}</b></div></div>
        <div class="slRow"><div class="slTop"><span>Feather</span><b>${Math.round(L.brush.soft * 100)}%</b></div></div>
        <div class="row"></div>`;
      const [r1, r2, br] = w.querySelectorAll(".slRow,.row");
      const s1 = document.createElement("input");
      s1.type = "range"; s1.min = 8; s1.max = 300; s1.step = 1; s1.value = Math.round(L.brush.size * 1000);
      s1.addEventListener("input", () => { L.brush.size = parseInt(s1.value, 10) / 1000; r1.querySelector("b").textContent = s1.value; });
      r1.appendChild(s1);
      const s2 = document.createElement("input");
      s2.type = "range"; s2.min = 10; s2.max = 90; s2.step = 1; s2.value = Math.round(L.brush.soft * 100);
      s2.addEventListener("input", () => { L.brush.soft = parseInt(s2.value, 10) / 100; r2.querySelector("b").textContent = s2.value + "%"; });
      r2.appendChild(s2);
      const undo = document.createElement("button"); undo.textContent = "Undo stroke"; undo.style.fontSize = "12px";
      undo.onclick = () => {
        if (!L.brush.strokes.length) return;
        api.pushHistory(); L.brush.strokes.pop(); L.brush.rev++; api.render(false); drawMaskThumb();
      };
      const clr = document.createElement("button"); clr.textContent = "Clear mask"; clr.style.fontSize = "12px";
      clr.onclick = () => {
        if (!L.brush.strokes.length) return;
        api.pushHistory(); L.brush.strokes = []; L.brush.rev++; api.render(false); drawMaskThumb();
      };
      br.appendChild(undo); br.appendChild(clr);
      const hint = document.createElement("p"); hint.className = "hint";
      hint.textContent = "Paint on the photo to reveal this layer's adjustments there.";
      w.appendChild(hint);
    } else if (L.kind === "radial") {
      const r = L.radial;
      const defs = [["Size X", "rx", 0.05, 0.6], ["Size Y", "ry", 0.05, 0.6], ["Rotation", "rot", -90, 90], ["Feather", "feather", 0, 0.95]];
      for (const [label, k, mn, mx] of defs) {
        const row = document.createElement("div");
        row.className = "slRow";
        row.innerHTML = `<div class="slTop"><span>${label}</span><b>${(+r[k]).toFixed(2)}</b></div>`;
        const inp = document.createElement("input");
        inp.type = "range"; inp.min = mn; inp.max = mx; inp.step = k === "feather" ? 0.01 : 0.005; inp.value = r[k];
        inp.addEventListener("input", () => { r[k] = parseFloat(inp.value); row.querySelector("b").textContent = (+r[k]).toFixed(2); api.render(false); drawMaskThumb(); });
        inp.addEventListener("change", api.pushHistory);
        row.appendChild(inp); w.appendChild(row);
      }
      invRow(w, r);
      const hint = document.createElement("p"); hint.className = "hint";
      hint.textContent = "Drag on the photo to move the ellipse.";
      w.appendChild(hint);
    } else {
      const l = L.linear;
      const defs = [["Angle", "angle", -90, 90], ["Position", "pos", 0, 1], ["Width", "width", 0.05, 1], ["Feather", "feather", 0, 0.95]];
      for (const [label, k, mn, mx] of defs) {
        const row = document.createElement("div");
        row.className = "slRow";
        row.innerHTML = `<div class="slTop"><span>${label}</span><b>${(+l[k]).toFixed(2)}</b></div>`;
        const inp = document.createElement("input");
        inp.type = "range"; inp.min = mn; inp.max = mx; inp.step = k === "feather" ? 0.01 : 0.005; inp.value = l[k];
        inp.addEventListener("input", () => { l[k] = parseFloat(inp.value); row.querySelector("b").textContent = (+l[k]).toFixed(2); api.render(false); drawMaskThumb(); });
        inp.addEventListener("change", api.pushHistory);
        row.appendChild(inp); w.appendChild(row);
      }
      invRow(w, l);
      const hint = document.createElement("p"); hint.className = "hint";
      hint.textContent = "Drag on the photo to move the band.";
      w.appendChild(hint);
    }
  }
  function invRow(w, geo) {
    const row = document.createElement("div"); row.className = "row";
    const b = document.createElement("button");
    b.textContent = geo.invert ? "Invert: ON" : "Invert: OFF";
    b.style.fontSize = "12px"; if (geo.invert) b.classList.add("on");
    b.onclick = () => { api.pushHistory(); geo.invert = !geo.invert; api.syncAll(); api.render(false); };
    row.appendChild(b); w.appendChild(row);
  }

  function drawMaskThumb() {
    const cv = $("#maskThumb");
    if (!cv) return;
    const L = sel();
    const ctx = cv.getContext("2d");
    if (!L || !window.T2S_MASKS) { ctx.clearRect(0, 0, cv.width, cv.height); return; }
    try {
      const mc = window.T2S_MASKS.rasterize(L, 120, 80);
      ctx.clearRect(0, 0, cv.width, cv.height);
      ctx.drawImage(mc, 0, 0, cv.width, cv.height);
    } catch (e) { /* ignore */ }
  }

  function isLayersTool() {
    const t = document.querySelector(".tabBtn.on");
    return t && t.dataset.tab === "layers";
  }

  function wireStage() {
    const cv = $("#stageCanvas");
    cv.addEventListener("pointerdown", (e) => {
      if (!isLayersTool()) return;
      const L = sel();
      if (!L) { api.toast("Add a layer first"); return; }
      e.preventDefault();
      const p = canvasPos(e);
      if (L.kind === "brush") {
        painting = true;
        api.pushHistory();
        curStroke = { pts: [[p.x, p.y]], r: L.brush.size, soft: L.brush.soft };
        L.brush.strokes.push(curStroke);
        L.brush.rev++;
        try { cv.setPointerCapture(e.pointerId); } catch (err) {}
        api.render(false);
      } else {
        dragGeo = { pre: api.snapshot(), moved: false };
        undoPushPending(dragGeo);
        dragGeo.L = L; dragGeo.start = p;
        dragGeo.orig = L.kind === "radial" ? { cx: L.radial.cx, cy: L.radial.cy } : { pos: L.linear.pos, angle: L.linear.angle };
      }
    });
    cv.addEventListener("pointermove", (e) => {
      if (!isLayersTool()) return;
      const L = sel();
      if (!L) return;
      const p = canvasPos(e);
      if (painting && curStroke && L.kind === "brush") {
        e.preventDefault();
        const last = curStroke.pts[curStroke.pts.length - 1];
        if (Math.hypot(last[0] - p.x, last[1] - p.y) > L.brush.size * 0.12) {
          curStroke.pts.push([p.x, p.y]);
          L.brush.rev++;
          api.render(false);
        }
      } else if (dragGeo && dragGeo.L === L) {
        e.preventDefault();
        const dx = p.x - dragGeo.start.x, dy = p.y - dragGeo.start.y;
        if (L.kind === "radial") {
          L.radial.cx = Math.min(1, Math.max(0, dragGeo.orig.cx + dx));
          L.radial.cy = Math.min(1, Math.max(0, dragGeo.orig.cy + dy));
        } else {
          const a = (L.linear.angle || 0) * Math.PI / 180;
          L.linear.pos = Math.min(1, Math.max(0, dragGeo.orig.pos + dx * Math.cos(a) + dy * Math.sin(a)));
        }
        dragGeo.moved = true;
        api.render(false);
      }
    });
    const up = () => {
      if (painting) { painting = false; curStroke = null; drawMaskThumb(); }
      if (dragGeo) {
        if (!dragGeo.moved) { /* pushed history unnecessarily — acceptable, keeps code simple */ }
        dragGeo = null; drawMaskThumb(); renderPanel();
      }
    };
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", () => { painting = false; curStroke = null; dragGeo = null; });
  }
  function undoPushPending(dg) {
    // push the pre-drag snapshot as one history entry
    api.pushRaw(dg.pre);
  }

  function wire(a) {
    api = a;
    $("#addBrushBtn").onclick = () => addLayer("brush");
    $("#addRadialBtn").onclick = () => addLayer("radial");
    $("#addLinearBtn").onclick = () => addLayer("linear");
    wireStage();
    renderPanel();
  }

  function sync() { renderPanel(); }

  window.T2S_LAYERS_UI = { wire, sync, renderPanel };
})();
