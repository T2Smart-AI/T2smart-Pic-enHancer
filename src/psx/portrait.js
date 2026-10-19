/* T2Smart-PicHancer — M3 portrait beta: depth bokeh (point/linear focus) + local face
   detection (skin-tone + connected components, no network) + face refine
   (lighten/warmth/smooth inside detected ellipses). GPU programs in gpu.js. */
(function () {
  "use strict";

  function cocAt(B, x, y, w, h) {
    const asp = w / h;
    let d;
    if ((B.mode || "point") === "linear") {
      const a = (B.angle || 0) * Math.PI / 180;
      d = Math.abs((x - (B.fx == null ? 0.5 : B.fx)) * Math.cos(a) + (y - (B.fy == null ? 0.5 : B.fy)) * Math.sin(a));
      d *= Math.max(asp, 1);
    } else {
      const dx = (x - (B.fx == null ? 0.5 : B.fx)) * asp;
      const dy = y - (B.fy == null ? 0.5 : B.fy);
      d = Math.sqrt(dx * dx + dy * dy) / Math.sqrt(0.25 * asp * asp + 0.25);
    }
    const size = B.size == null ? 0.22 : B.size;
    const fe = Math.max(0.05, B.feather == null ? 0.4 : B.feather);
    let c = (d - size) / fe;
    return c < 0 ? 0 : c > 1 ? 1 : c;
  }

  // CPU fallback: 3-level blur pyramid (CoC picks level + mix), mirroring the GPU's
  // CoC-scaled gather. Single-blur cross-fades look wrong in transition zones.
  function bokehPass(img, B) {
    if (!B || !B.enabled || (B.amount || 0) <= 0) return img;
    const { boxBlurInto } = window.T2SEngine;
    const w = img.width, h = img.height;
    const maxR = (B.amount || 0) / 100 * Math.min(w, h) * 0.045;
    const r1 = Math.max(1, Math.round(maxR * 0.33));
    const r2 = Math.max(1, Math.round(maxR * 0.66));
    const r3 = Math.max(1, Math.round(maxR));
    const b1 = boxBlurInto(img, r1), b2 = boxBlurInto(img, r2), b3 = boxBlurInto(img, r3);
    const d = img.data, B1 = b1.data, B2 = b2.data, B3 = b3.data;
    const hi = (B.highlights || 0) / 100;
    for (let y = 0; y < h; y++) {
      const yn = (y + 0.5) / h;
      for (let x = 0; x < w; x++) {
        const c = cocAt(B, (x + 0.5) / w, yn, w, h);
        if (c <= 0.003) continue;
        const i = (y * w + x) * 4;
        // pyramid-interpolated blur color at this CoC
        const t = c * 3, k = Math.min(2, t | 0), f = t - k;
        let br, bg, bb;
        if (k === 0) {
          br = d[i] + (B1[i] - d[i]) * f; bg = d[i + 1] + (B1[i + 1] - d[i + 1]) * f; bb = d[i + 2] + (B1[i + 2] - d[i + 2]) * f;
        } else if (k === 1) {
          br = B1[i] + (B2[i] - B1[i]) * f; bg = B1[i + 1] + (B2[i + 1] - B1[i + 1]) * f; bb = B1[i + 2] + (B2[i + 2] - B1[i + 2]) * f;
        } else {
          br = B2[i] + (B3[i] - B2[i]) * f; bg = B2[i + 1] + (B3[i + 1] - B2[i + 1]) * f; bb = B2[i + 2] + (B3[i + 2] - B2[i + 2]) * f;
        }
        let r = d[i] + (br - d[i]) * c;
        let g = d[i + 1] + (bg - d[i + 1]) * c;
        let bl = d[i + 2] + (bb - d[i + 2]) * c;
        if (hi > 0) {
          const lum = 0.2126 * r + 0.7152 * g + 0.0722 * bl;
          const bloom = Math.max(0, lum - 200) / 55 * hi * c * 25;
          r += bloom; g += bloom * 0.98; bl += bloom * 0.94;
        }
        d[i] = r > 255 ? 255 : r; d[i + 1] = g > 255 ? 255 : g; d[i + 2] = bl > 255 ? 255 : bl;
      }
    }
    return img;
  }

  function isSkin(r, g, b) {
    const y = 0.299 * r + 0.587 * g + 0.114 * b;
    if (y < 40) return 0;
    const cb = 128 - 0.169 * r - 0.331 * g + 0.5 * b;
    const cr = 128 + 0.5 * r - 0.419 * g - 0.081 * b;
    return (cb > 77 && cb < 127 && cr > 133 && cr < 173) ? 1 : 0;
  }

  // Local face candidate detection. Returns [{cx,cy,rx,ry}] normalized, ≤6.
  function detectFaces(srcCanvas) {
    const TW = 96;
    const sc = Math.min(1, TW / srcCanvas.width);
    const w = Math.max(16, Math.round(srcCanvas.width * sc));
    const h = Math.max(16, Math.round(srcCanvas.height * sc));
    const c = document.createElement("canvas");
    c.width = w; c.height = h;
    const x = c.getContext("2d", { willReadFrequently: true });
    x.drawImage(srcCanvas, 0, 0, w, h);
    const img = x.getImageData(0, 0, w, h);
    const d = img.data;
    const mask = new Uint8Array(w * h);
    for (let i = 0; i < w * h; i++) {
      mask[i] = isSkin(d[i * 4], d[i * 4 + 1], d[i * 4 + 2]);
    }
    // cleanup: 3x3 majority (single pass, separable-ish)
    const m2 = new Uint8Array(w * h);
    for (let y = 0; y < h; y++) {
      for (let xx = 0; xx < w; xx++) {
        let s = 0;
        for (let dy = -1; dy <= 1; dy++) {
          const yy = y + dy;
          if (yy < 0 || yy >= h) continue;
          for (let dx = -1; dx <= 1; dx++) {
            const xxx = xx + dx;
            if (xxx < 0 || xxx >= w) continue;
            s += mask[yy * w + xxx];
          }
        }
        m2[y * w + xx] = s >= 5 ? 1 : 0;
      }
    }
    // connected components (BFS)
    const seen = new Uint8Array(w * h);
    const comps = [];
    const stack = [];
    for (let i = 0; i < w * h; i++) {
      if (!m2[i] || seen[i]) continue;
      let x0 = w, x1 = -1, y0 = h, y1 = -1, n = 0;
      stack.push(i); seen[i] = 1;
      while (stack.length) {
        const p = stack.pop();
        const px = p % w, py = (p / w) | 0;
        n++;
        if (px < x0) x0 = px; if (px > x1) x1 = px;
        if (py < y0) y0 = py; if (py > y1) y1 = py;
        const nb = [p - 1, p + 1, p - w, p + w];
        for (const q of nb) {
          if (q < 0 || q >= w * h || seen[q] || !m2[q]) continue;
          const qx = q % w;
          if (Math.abs(qx - px) > 1) continue; // no wrap
          seen[q] = 1; stack.push(q);
        }
      }
      comps.push({ x0, x1, y0, y1, n });
    }
    const total = w * h;
    const faces = [];
    for (const cp of comps) {
      const bw2 = cp.x1 - cp.x0 + 1, bh2 = cp.y1 - cp.y0 + 1;
      const area = cp.n / total;
      if (area < 0.003 || area > 0.35) continue;
      const aspect = bw2 / bh2;
      if (aspect < 0.45 || aspect > 2.1) continue;
      const fill = cp.n / (bw2 * bh2);
      if (fill < 0.3) continue;
      faces.push({
        cx: (cp.x0 + cp.x1 + 1) / 2 / w, cy: (cp.y0 + cp.y1 + 1) / 2 / h,
        rx: bw2 / 2 / w * 1.15, ry: bh2 / 2 / h * 1.25, on: true
      });
      if (faces.length >= 6) break;
    }
    faces.sort((a, b) => (b.rx * b.ry) - (a.rx * a.ry));
    return faces;
  }

  // CPU face refine mirror of the GPU face program.
  function facePass(img, F) {
    if (!F || !F.enabled || !F.faces || !F.faces.length) return img;
    const on = F.faces.filter((f) => f.on !== false);
    if (!on.length) return img;
    const li = (F.lighten || 0), sm = (F.smooth || 0), wa = (F.warmth || 0);
    if (!li && !sm && !wa) return img;
    let blur = null;
    if (sm) blur = window.T2SEngine.boxBlurInto(img, 2);
    const w = img.width, h = img.height, d = img.data;
    const bd = blur ? blur.data : null;
    for (let y = 0; y < h; y++) {
      const yn = (y + 0.5) / h;
      for (let x = 0; x < w; x++) {
        const xn = (x + 0.5) / w;
        let m = 0;
        for (const f of on) {
          const dx = (xn - f.cx) / Math.max(1e-4, f.rx);
          const dy = (yn - f.cy) / Math.max(1e-4, f.ry);
          const e = dx * dx + dy * dy;
          if (e >= 1) continue;
          const fall = 1 - e * e;
          if (fall > m) m = fall;
        }
        if (m <= 0.01) continue;
        const i = (y * w + x) * 4;
        let r = d[i], g = d[i + 1], b = d[i + 2];
        const skin = isSkin(r, g, b);
        m *= 0.35 + 0.65 * skin;
        if (sm && bd) {
          const k = sm / 100 * m;
          r += (bd[i] - r) * k; g += (bd[i + 1] - g) * k; b += (bd[i + 2] - b) * k;
        }
        if (li) {
          const k = li * 0.6 * m;
          if (k >= 0) { const f = 1 - r / 255; r += k * f; const f2 = 1 - g / 255; g += k * f2; const f3 = 1 - b / 255; b += k * f3; }
          else { r += k * (r / 255); g += k * (g / 255); b += k * (b / 255); }
        }
        if (wa) { r += wa * 0.3 * m; b -= wa * 0.3 * m; }
        d[i] = r < 0 ? 0 : r > 255 ? 255 : r;
        d[i + 1] = g < 0 ? 0 : g > 255 ? 255 : g;
        d[i + 2] = b < 0 ? 0 : b > 255 ? 255 : b;
      }
    }
    return img;
  }

  // ---------- UI ----------
  let api = null;
  const $ = (s) => document.querySelector(s);
  // AI face detection (MediaPipe BlazeFace short-range, Apache-2.0 runtime+model,
  // loaded lazily from CDN). Returns same [{cx,cy,rx,ry}] normalized format.
  const MP_VER = "0.10.14";
  const MP_BASE = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@" + MP_VER;
  const MP_MODEL = "https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/1/blaze_face_short_range.tflite";
  let mpDet = null, mpLoading = null;
  async function mpDetector() {
    if (mpDet) return mpDet;
    if (mpLoading) return mpLoading;
    mpLoading = (async () => {
      const vis = await import(MP_BASE + "/vision_bundle.mjs");
      const fileset = await vis.FilesetResolver.forVisionTasks(MP_BASE + "/wasm");
      mpDet = await vis.FaceDetector.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: MP_MODEL, delegate: "GPU" },
        runningMode: "IMAGE", minDetectionConfidence: 0.4
      });
      return mpDet;
    })();
    try { return await mpLoading; }
    catch (e) { mpLoading = null; throw e; }
  }
  async function aiDetectFaces(srcCanvas) {
    const det = await mpDetector();
    // cap input for speed; map boxes back to full size
    const sc = Math.min(1, 800 / Math.max(srcCanvas.width, srcCanvas.height));
    let img = srcCanvas;
    if (sc < 1) {
      img = document.createElement("canvas");
      img.width = Math.max(2, Math.round(srcCanvas.width * sc));
      img.height = Math.max(2, Math.round(srcCanvas.height * sc));
      img.getContext("2d").drawImage(srcCanvas, 0, 0, img.width, img.height);
    }
    const r = det.detect(img);
    const faces = (r.detections || []).slice(0, 6).map((d) => {
      const b = d.boundingBox;
      const cx = (b.originX + b.width / 2) / img.width, cy = (b.originY + b.height / 2) / img.height;
      return { cx, cy, rx: (b.width / 2) / img.width * 1.15, ry: (b.height / 2) / img.height * 1.25, on: true };
    });
    faces.sort((a, b) => (b.rx * b.ry) - (a.rx * a.ry));
    return faces;
  }

  function S() { return api.getState(); }

  function wire(a) {
    api = a;
    const bdefs = [
      ["bkAmount", "amount", 0, 100, 1], ["bkSize", "size", 0.02, 0.8, 0.01],
      ["bkFeather", "feather", 0.05, 1, 0.01], ["bkHi", "highlights", 0, 100, 1]
    ];
    for (const [id, k, mn, mx, st] of bdefs) {
      const el = $("#" + id);
      el.addEventListener("input", () => {
        S().bokeh[k] = parseFloat(el.value);
        $("#" + id + "V").textContent = el.value;
        api.render(false);
      });
      el.addEventListener("change", api.pushHistory);
    }
    $("#bkEnable").onclick = () => { api.pushHistory(); S().bokeh.enabled = !S().bokeh.enabled; sync(); api.render(false); };
    $$mode();
    $("#fcEnable").onclick = () => { api.pushHistory(); S().face.enabled = !S().face.enabled; sync(); api.render(false); };
    $("#fcDetect").onclick = () => {
      api.toast("Scanning for faces…");
      setTimeout(() => {
        try {
          const base = api.getBase();
          const faces = detectFaces(base);
          api.pushHistory();
          S().face.faces = faces;
          S().face.enabled = faces.length > 0 ? true : S().face.enabled;
          sync(); api.render(false);
          api.toast(faces.length ? faces.length + " face" + (faces.length > 1 ? "s" : "") + " found" : "No faces found — pose rectangles manually with + Face");
        } catch (e) { api.toast("Detect failed: " + e.message); }
      }, 30);
    };
    const fcAI = $("#fcDetectAI");
    if (fcAI && !fcAI._wired) {
      fcAI._wired = true;
      fcAI.onclick = async () => {
        api.toast("AI face scan (first run downloads the model)…");
        try {
          const base = api.getBase();
          const faces = await aiDetectFaces(base);
          if (!faces.length) {
            api.toast("AI found no faces — trying local scan…");
            const fb = detectFaces(base);
            api.pushHistory();
            S().face.faces = fb;
            S().face.enabled = fb.length > 0 ? true : S().face.enabled;
            sync(); api.render(false);
            api.toast(fb.length ? fb.length + " face" + (fb.length > 1 ? "s" : "") + " found (local scan)" : "No faces found — pose rectangles manually with + Face");
            return;
          }
          api.pushHistory();
          S().face.faces = faces;
          S().face.enabled = true;
          sync(); api.render(false);
          api.toast(faces.length + " AI face" + (faces.length > 1 ? "s" : "") + " found ✓");
        } catch (e) { api.toast("AI detect failed (offline?) — use Detect faces. " + String(e && e.message || e).slice(0, 60)); }
      };
    }
    $("#fcAdd").onclick = () => {
      api.pushHistory();
      S().face.faces.push({ cx: 0.5, cy: 0.4, rx: 0.16, ry: 0.22, on: true });
      sync(); api.render(false);
    };
    const fdefs = [["fcLight", "lighten", -100, 100, 1], ["fcSmooth", "smooth", 0, 100, 1], ["fcWarm", "warmth", -100, 100, 1]];
    for (const [id, k, mn, mx, st] of fdefs) {
      const el = $("#" + id);
      el.addEventListener("input", () => {
        S().face[k] = parseFloat(el.value);
        $("#" + id + "V").textContent = el.value;
        api.render(false);
      });
      el.addEventListener("change", api.pushHistory);
    }
    sync();
  }
  function $$mode() {
    const m = $("#bkMode");
    m.innerHTML = `<option value="point">Point focus</option><option value="linear">Linear (tilt)</option>`;
    m.value = "point";
    m.onchange = () => { api.pushHistory(); S().bokeh.mode = m.value; api.render(false); };
  }
  function sync() {
    if (!api || !$("#bkEnable")) return;
    const B = S().bokeh || {}, F = S().face || {};
    $("#bkEnable").textContent = B.enabled ? "Lens blur: ON" : "Lens blur: OFF";
    $("#bkEnable").classList.toggle("on", !!B.enabled);
    for (const [id, k] of [["bkAmount", "amount"], ["bkSize", "size"], ["bkFeather", "feather"], ["bkHi", "highlights"]]) {
      $("#" + id).value = B[k] == null ? $("#" + id).defaultValue : B[k];
      $("#" + id + "V").textContent = $("#" + id).value;
    }
    if ($("#bkMode")) $("#bkMode").value = B.mode || "point";
    $("#fcEnable").textContent = F.enabled ? "Face refine: ON" : "Face refine: OFF";
    $("#fcEnable").classList.toggle("on", !!F.enabled);
    for (const [id, k] of [["fcLight", "lighten"], ["fcSmooth", "smooth"], ["fcWarm", "warmth"]]) {
      $("#" + id).value = F[k] || 0;
      $("#" + id + "V").textContent = $("#" + id).value;
    }
    const fl = $("#faceList");
    fl.innerHTML = "";
    (F.faces || []).forEach((f, i) => {
      const d = document.createElement("div");
      d.className = "row";
      d.innerHTML = `<span class="hint">Face ${i + 1}</span>`;
      const t = document.createElement("button");
      t.textContent = f.on === false ? "Off" : "On"; t.style.fontSize = "12px";
      if (f.on !== false) t.classList.add("on");
      t.onclick = () => { api.pushHistory(); f.on = f.on === false ? true : false; sync(); api.render(false); };
      const del = document.createElement("button");
      del.textContent = "✕"; del.style.fontSize = "12px";
      del.onclick = () => { api.pushHistory(); F.faces.splice(i, 1); sync(); api.render(false); };
      d.appendChild(t); d.appendChild(del);
      fl.appendChild(d);
    });
    const hint = document.createElement("p");
    hint.className = "hint";
    hint.textContent = "Tap the photo (Lens blur tool) to move the focus point. Drag faces: coming via + Face defaults — reposition by Detect.";
    fl.appendChild(hint);
  }

  // stage tap -> move bokeh focus
  function stageHook() {
    const cv = $("#stageCanvas");
    const pos = (e) => {
      const r = cv.getBoundingClientRect();
      return { x: Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)), y: Math.min(1, Math.max(0, (e.clientY - r.top) / r.height)) };
    };
    cv.addEventListener("pointerdown", (e) => {
      const t = document.querySelector(".tabBtn.on");
      if (!t || t.dataset.tab !== "portrait" || !api) return;
      const B = S().bokeh;
      if (!B || !B.enabled) return;
      const p = pos(e);
      api.pushHistory();
      B.fx = p.x; B.fy = p.y;
      api.render(false);
    });
  }
  if (document.readyState !== "loading") stageHook();
  else document.addEventListener("DOMContentLoaded", stageHook);

  window.T2S_PORTRAIT = { wire, sync, cocAt, bokehPass, facePass, detectFaces, isSkin };
})();
