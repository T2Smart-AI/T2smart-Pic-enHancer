/* T2Smart-PicHancer — M2 selective layer stack: masks (brush/radial/linear) + per-layer
   pixel adjustments. Shared by the GPU path (mask texture + layer program in gpu.js)
   and the CPU fallback (applyLayers here). UI panel + stage painting in T2S_LAYERS. */
(function () {
  "use strict";

  const _maskCache = new Map(); // key -> canvas

  function maskKey(L, w, h) {
    if (L.kind === "brush") return L.id + "|b|" + w + "x" + h + "|" + L.brush.rev;
    if (L.kind === "radial") { const r = L.radial; return L.id + "|r|" + w + "x" + h + "|" + [r.cx, r.cy, r.rx, r.ry, r.rot, r.feather, r.invert].join(","); }
    const l = L.linear; return L.id + "|l|" + w + "x" + h + "|" + [l.angle, l.pos, l.width, l.feather, l.invert].join(",");
  }

  function blankMask(w, h) {
    const c = document.createElement("canvas");
    c.width = Math.max(1, w); c.height = Math.max(1, h);
    return c;
  }

  // Brush masks rasterize at half res (soft anyway) and upscale on upload/use.
  function rasterize(L, w, h) {
    const key = maskKey(L, w, h);
    let hit = _maskCache.get(key);
    if (hit && hit.width) return hit;
    let c;
    if (L.kind === "brush") {
      const sw = Math.max(1, Math.round(w / 2)), sh = Math.max(1, Math.round(h / 2));
      c = blankMask(sw, sh);
      const x = c.getContext("2d");
      x.fillStyle = "#000"; x.fillRect(0, 0, sw, sh);
      x.globalCompositeOperation = "lighter";
      const R = Math.min(sw, sh);
      for (const st of (L.brush.strokes || [])) {
        const rad = Math.max(1, st.r * R);
        const step = Math.max(1, rad * 0.25);
        const pts = st.pts;
        if (!pts.length) continue;
        dab(x, pts[0][0] * sw, pts[0][1] * sh, rad, st.soft);
        for (let i = 1; i < pts.length; i++) {
          const ax = pts[i - 1][0] * sw, ay = pts[i - 1][1] * sh;
          const bx = pts[i][0] * sw, by = pts[i][1] * sh;
          const dist = Math.hypot(bx - ax, by - ay);
          const nDab = Math.max(1, Math.floor(dist / step));
          for (let k = 1; k <= nDab; k++) {
            const t = k / nDab;
            dab(x, ax + (bx - ax) * t, ay + (by - ay) * t, rad, st.soft);
          }
        }
      }
    } else if (L.kind === "radial") {
      c = blankMask(w, h);
      const x = c.getContext("2d");
      const r = L.radial;
      x.fillStyle = "#000"; x.fillRect(0, 0, w, h);
      x.save();
      x.translate(r.cx * w, r.cy * h);
      x.rotate((r.rot || 0) * Math.PI / 180);
      x.scale(Math.max(1, r.rx * w), Math.max(1, r.ry * h));
      const f = Math.min(0.95, Math.max(0, r.feather == null ? 0.4 : r.feather));
      const g = x.createRadialGradient(0, 0, 0, 0, 0, 0, 1);
      const inner = Math.max(0, 1 - f);
      if (!r.invert) {
        g.addColorStop(0, "#fff"); g.addColorStop(inner, "#fff"); g.addColorStop(1, "#000");
      } else {
        g.addColorStop(0, "#000"); g.addColorStop(inner, "#000"); g.addColorStop(1, "#fff");
      }
      x.fillStyle = g;
      x.beginPath(); x.arc(0, 0, 1, 0, 7); x.fill();
      x.restore();
    } else { // linear
      c = blankMask(w, h);
      const x = c.getContext("2d");
      const l = L.linear;
      x.fillStyle = r_invertBase(l); x.fillRect(0, 0, w, h);
      x.save();
      x.translate(w / 2, h / 2);
      x.rotate((l.angle || 0) * Math.PI / 180);
      const diag = Math.hypot(w, h);
      const cx = (l.pos - 0.5) * diag, hw = Math.max(1, l.width * diag / 2);
      const f = Math.min(0.95, Math.max(0, l.feather == null ? 0.4 : l.feather));
      const featherPx = hw * f;
      const g = x.createLinearGradient(cx - hw - featherPx, 0, cx + hw + featherPx, 0);
      const t0 = 0, t1 = featherPx / (2 * (hw + featherPx)), t2 = 1 - t1, t3 = 1;
      const A = l.invert ? "#000" : "#fff", B = l.invert ? "#fff" : "#000";
      g.addColorStop(t0, B); g.addColorStop(Math.min(0.999, t1), A);
      g.addColorStop(Math.max(0.001, t2), A); g.addColorStop(t3, B);
      x.fillStyle = g;
      x.fillRect(-diag / 2, -diag / 2, diag, diag);
      x.restore();
    }
    if (_maskCache.size > 10) { const k = _maskCache.keys().next().value; _maskCache.delete(k); }
    _maskCache.set(key, c);
    return c;
  }
  function r_invertBase(l) { return l.invert ? "#fff" : "#000"; }

  function dab(x, px, py, rad, soft) {
    const inner = rad * (1 - Math.min(0.9, Math.max(0.1, soft == null ? 0.6 : soft)));
    const g = x.createRadialGradient(px, py, 0, px, py, rad);
    g.addColorStop(0, "rgba(255,255,255,0.9)");
    g.addColorStop(Math.max(0.01, inner / rad), "rgba(255,255,255,0.9)");
    g.addColorStop(1, "rgba(255,255,255,0)");
    x.fillStyle = g;
    x.beginPath(); x.arc(px, py, rad, 0, 7); x.fill();
  }

  function maskAlpha(mc) {
    const x = mc.getContext("2d", { willReadFrequently: true });
    return x.getImageData(0, 0, mc.width, mc.height);
  }

  const clamp255 = (v) => v < 0 ? 0 : v > 255 ? 255 : v;
  const sstep = (a, b, x) => {
    const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
    return t * t * (3 - 2 * t);
  };

  // CPU fallback: per-layer pixel adjustments (subset mirror of the GPU layer program).
  function applyLayers(img, S) {
    if (!S.layers || !S.layers.length) return img;
    const w = img.width, h = img.height, d = img.data;
    for (const L of S.layers) {
      if (L.visible === false || (L.opacity || 0) <= 0) continue;
      const a = L.adj || {};
      const expM = Math.pow(2, a.exposure || 0);
      const con = a.contrast || 0;
      const cF = (259 * (con * 2.55 + 255)) / (255 * (259 - con * 2.55));
      const hl = a.highlights || 0, sh = a.shadows || 0;
      const wh = a.whites || 0, bl = a.blacks || 0;
      const tmp = a.temperature || 0, tnt = a.tint || 0;
      const vib = a.vibrance || 0, satM = 1 + (a.saturation || 0) / 100;
      const op = (L.opacity == null ? 100 : L.opacity) / 100;
      const mc = rasterize(L, w, h);
      const mw = mc.width, mh = mc.height;
      const mimg = maskAlpha(mc);
      const md = mimg.data;
      const sx = mw / w, sy = mh / h;
      for (let y = 0; y < h; y++) {
        const my = Math.min(mh - 1, (y * sy) | 0);
        for (let x = 0; x < w; x++) {
          const mx = Math.min(mw - 1, (x * sx) | 0);
          // mask canvas: opaque black base + white paint, so R channel == coverage.
          const mi = (my * mw + mx) * 4;
          const m = md[mi] / 255 * op;
          if (m <= 0.003) continue;
          const i = (y * w + x) * 4;
          let r = d[i], g = d[i + 1], b = d[i + 2];
          let R = r * expM, G = g * expM, B = b * expM;
          R += tmp * 0.5; B -= tmp * 0.5;
          G += tnt * 0.42; R -= tnt * 0.18; B -= tnt * 0.18;
          R = cF * (R - 128) + 128; G = cF * (G - 128) + 128; B = cF * (B - 128) + 128;
          let lum = (0.2126 * R + 0.7152 * G + 0.0722 * B) / 255;
          lum = lum < 0 ? 0 : lum > 1 ? 1 : lum;
          const hlM = sstep(0.5, 1, lum), shM = 1 - sstep(0, 0.5, lum);
          if (hl) { const k = hl / 100 * 62 * hlM; const f = k >= 0 ? 1 - R / 255 : R / 255; R += k * f; const f2 = k >= 0 ? 1 - G / 255 : G / 255; G += k * f2; const f3 = k >= 0 ? 1 - B / 255 : B / 255; B += k * f3; }
          if (sh) { const k = sh / 100 * 62 * shM; const f = k >= 0 ? 1 - R / 255 : R / 255; R += k * f; const f2 = k >= 0 ? 1 - G / 255 : G / 255; G += k * f2; const f3 = k >= 0 ? 1 - B / 255 : B / 255; B += k * f3; }
          if (wh) { R += wh * 0.42 * (R / 255) * (R / 255); G += wh * 0.42 * (G / 255) * (G / 255); B += wh * 0.42 * (B / 255) * (B / 255); }
          if (bl) { const t = 1 - R / 255; R += bl * 0.42 * t * t; const t2 = 1 - G / 255; G += bl * 0.42 * t2 * t2; const t3 = 1 - B / 255; B += bl * 0.42 * t3 * t3; }
          lum = 0.2126 * R + 0.7152 * G + 0.0722 * B;
          if (vib) {
            const mx2 = Math.max(R, G, B), mn = Math.min(R, G, B);
            const s0 = mx2 <= 0 ? 0 : (mx2 - mn) / (mx2 + 1);
            const k = 1 + (vib / 100) * (1 - s0) * 1.1;
            R = lum + (R - lum) * k; G = lum + (G - lum) * k; B = lum + (B - lum) * k;
          }
          if (satM !== 1) { R = lum + (R - lum) * satM; G = lum + (G - lum) * satM; B = lum + (B - lum) * satM; }
          d[i] = clamp255(r + (clamp255(R) - r) * m);
          d[i + 1] = clamp255(g + (clamp255(G) - g) * m);
          d[i + 2] = clamp255(b + (clamp255(B) - b) * m);
        }
      }
    }
    return img;
  }

  function clearCache() { _maskCache.clear(); }

  window.T2S_MASKS = { rasterize, applyLayers, clearCache };
})();
