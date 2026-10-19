/* T2Smart-PicHancer — M4 generative fill beta: paint a mask, describe, generate a tile
   with generateImage, tone-match (mean-shift like heal) and feather-composite.
   Text-to-image has no mask conditioning, so this is generate-then-blend. */
(function () {
  "use strict";
  let api = null;
  const $ = (s) => document.querySelector(s);
  function S() { return api.getState(); }

  function bboxOf(strokes, w, h) {
    let x0 = 1, y0 = 1, x1 = 0, y1 = 0, n = 0;
    for (const st of strokes) {
      for (const p of st.pts) {
        const r = st.r * 1.6;
        if (p[0] - r < x0) x0 = p[0] - r; if (p[0] + r > x1) x1 = p[0] + r;
        if (p[1] - r < y0) y0 = p[1] - r; if (p[1] + r > y1) y1 = p[1] + r;
        n++;
      }
    }
    if (!n) return null;
    const pad = 0.06;
    x0 = Math.max(0, x0 - pad); y0 = Math.max(0, y0 - pad);
    x1 = Math.min(1, x1 + pad); y1 = Math.min(1, y1 + pad);
    return { x: x0, y: y0, w: Math.max(0.05, x1 - x0), h: Math.max(0.05, y1 - y0) };
  }

  function maskFor(strokes, rev, w, h) {
    if (!window.T2S_MASKS) return null;
    return window.T2S_MASKS.rasterize({ id: "genfill" + rev, kind: "brush", brush: { strokes, rev } }, w, h);
  }

  // composite cached tile into img (both full-res of the render). Gain-matched.
  let tileCache = { url: null, img: null };
  function apply(img, st) {
    const G = st.genfill;
    if (!G || !G.result || !G.bbox || !G.strokes || !G.strokes.length) return img;
    const tile = tileCache.img;
    if (!tile || tileCache.url !== G.result) return img;
    const w = img.width, h = img.height, d = img.data;
    const bx = Math.round(G.bbox.x * w), by = Math.round(G.bbox.y * h);
    const bw = Math.round(G.bbox.w * w), bh = Math.round(G.bbox.h * h);
    if (bw < 4 || bh < 4) return img;
    const mc = maskFor(G.strokes, G.rev || 0, w, h);
    if (!mc) return img;
    const md = mc.getContext("2d", { willReadFrequently: true }).getImageData(0, 0, mc.width, mc.height).data;
    const mw = mc.width, mh = mc.height;
    // tile pixels at render res
    const tc = document.createElement("canvas");
    tc.width = bw; tc.height = bh;
    tc.getContext("2d").drawImage(tile, 0, 0, bw, bh);
    const td = tc.getContext("2d", { willReadFrequently: true }).getImageData(0, 0, bw, bh).data;
    // gain-match tile mean to target ring mean (heal-style)
    let tR = 0, tG = 0, tB = 0, tN = 0, gR = 0, gG = 0, gB = 0, gN = 0;
    for (let y = 0; y < bh; y += 3) {
      for (let x = 0; x < bw; x += 3) {
        const gx = bx + x, gy = by + y;
        if (gx < 0 || gy < 0 || gx >= w || gy >= h) continue;
        const mi = (Math.min(mh - 1, (gy / h * mh) | 0) * mw + Math.min(mw - 1, (gx / w * mw) | 0)) * 4;
        const m = md[mi] / 255;
        const ti = (y * bw + x) * 4, gi = (gy * w + gx) * 4;
        if (m > 0.7) { gR += td[ti]; gG += td[ti + 1]; gB += td[ti + 2]; gN++; }
        else if (m < 0.25) { tR += d[gi]; tG += d[gi + 1]; tB += d[gi + 2]; tN++; }
      }
    }
    const shR = tN && gN ? tR / tN - gR / gN : 0;
    const shG = tN && gN ? tG / tN - gG / gN : 0;
    const shB = tN && gN ? tB / tN - gB / gN : 0;
    for (let y = 0; y < bh; y++) {
      const gy = by + y;
      if (gy < 0 || gy >= h) continue;
      for (let x = 0; x < bw; x++) {
        const gx = bx + x;
        if (gx < 0 || gx >= w) continue;
        const mi = (Math.min(mh - 1, (gy / h * mh) | 0) * mw + Math.min(mw - 1, (gx / w * mw) | 0)) * 4;
        const m = md[mi] / 255;
        if (m <= 0.003) continue;
        const ti = (y * bw + x) * 4, gi = (gy * w + gx) * 4;
        d[gi] = d[gi] + ((td[ti] + shR) - d[gi]) * m;
        d[gi + 1] = d[gi + 1] + ((td[ti + 1] + shG) - d[gi + 1]) * m;
        d[gi + 2] = d[gi + 2] + ((td[ti + 2] + shB) - d[gi + 2]) * m;
      }
    }
    return img;
  }

  function ensureTile(url, done) {
    if (tileCache.url === url && tileCache.img) { done(tileCache.img); return; }
    const im = new Image();
    im.onload = () => { tileCache = { url, img: im }; done(im); };
    im.onerror = () => done(null);
    im.src = url;
  }
  function prime(url) {
    if (url) ensureTile(url, () => {});
  }

  function canvasPos(e) {
    const cv = $("#stageCanvas");
    const r = cv.getBoundingClientRect();
    return { x: Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)), y: Math.min(1, Math.max(0, (e.clientY - r.top) / r.height)) };
  }

  function wire(a) {
    api = a;
    prime(S().genfill && S().genfill.result);
    $("#genPrompt").value = (S().genfill && S().genfill.prompt) || "";
    $("#genPrompt").addEventListener("input", (e) => { S().genfill.prompt = e.target.value; });
    let painting = false, cur = null;
    const cv = $("#stageCanvas");
    cv.addEventListener("pointerdown", (e) => {
      const t = document.querySelector(".tabBtn.on");
      if (!t || t.dataset.tab !== "genfill") return;
      e.preventDefault();
      painting = true;
      api.pushHistory();
      const p = canvasPos(e);
      cur = { pts: [[p.x, p.y]], r: 0.055 };
      S().genfill.strokes.push(cur);
      S().genfill.rev = (S().genfill.rev || 0) + 1;
      try { cv.setPointerCapture(e.pointerId); } catch (err) {}
      api.render(false);
      setStatus("mask: " + S().genfill.strokes.length + " stroke(s) — describe + Generate");
    });
    cv.addEventListener("pointermove", (e) => {
      if (!painting || !cur) return;
      const t = document.querySelector(".tabBtn.on");
      if (!t || t.dataset.tab !== "genfill") return;
      e.preventDefault();
      const p = canvasPos(e);
      const last = cur.pts[cur.pts.length - 1];
      if (Math.hypot(last[0] - p.x, last[1] - p.y) > 0.008) {
        cur.pts.push([p.x, p.y]);
        S().genfill.rev++;
        api.render(false);
      }
    });
    const up = () => { painting = false; cur = null; };
    window.addEventListener("pointerup", up);
    $("#genClear").onclick = () => {
      if (!S().genfill.strokes.length && !S().genfill.result) return;
      api.pushHistory();
      S().genfill.strokes = []; S().genfill.result = null; S().genfill.bbox = null;
      S().genfill.rev++;
      api.render(false);
      setStatus("paint a mask on the photo");
    };
    $("#genGo").onclick = async () => {
      const G = S().genfill;
      if (!G.strokes.length) { api.toast("Paint a mask first"); return; }
      const prompt = (G.prompt || "").trim();
      if (!prompt) { api.toast("Describe what to generate"); return; }
      const bb = bboxOf(G.strokes, 1, 1);
      if (!bb) return;
      api.pushHistory();
      G.bbox = bb;
      setStatus("generating… (10–60s)");
      api.toast("Generating fill… keep the tab open");
      try {
        const res = 768;
        const full = prompt + ", photorealistic detail, seamless texture, no watermark";
        const out = await root.generateImage({ prompt: full, resolution: res + "x" + res, negativePrompt: "blurry, watermark, text, frame" });
        const url = out && out.dataUrl ? out.dataUrl : String(out);
        const ready = await new Promise((resolve) => {
          const im = new Image();
          im.onload = () => resolve(im);
          im.onerror = () => resolve(null);
          im.src = url;
        });
        if (!ready) throw new Error("could not load result");
        // downscale tile to ≤512 for state economy
        const tc = document.createElement("canvas");
        const sc = Math.min(1, 512 / Math.max(ready.width, ready.height));
        tc.width = Math.max(2, Math.round(ready.width * sc));
        tc.height = Math.max(2, Math.round(ready.height * sc));
        tc.getContext("2d").drawImage(ready, 0, 0, tc.width, tc.height);
        const dataUrl = tc.toDataURL("image/jpeg", 0.85);
        tileCache = { url: dataUrl, img: ready };
        G.result = dataUrl;
        G.rev++;
        api.render(false);
        setStatus("fill applied ✓ — repaint + Generate to retry");
        api.toast("Fill applied");
      } catch (e) {
        console.warn("genfill", e);
        setStatus("failed: " + e.message);
        api.toast("Generate failed: " + e.message);
      }
    };
  }
  function setStatus(s) {
    const el = $("#genStatus");
    if (el) el.textContent = s;
  }

  window.T2S_GENFILL = { wire, apply, prime, bboxOf };
})();
