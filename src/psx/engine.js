/* T2Smart-PicHancer — pixel engine: base geometry + single-pass grade + detail passes. */
(function () {
  "use strict";
  const clamp255 = (v) => v < 0 ? 0 : v > 255 ? 255 : v;
  const lerp = (a, b, t) => a + (b - a) * t;
  const sstep = (a, b, x) => {
    const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
    return t * t * (3 - 2 * t);
  };

  function baseDraw(source, st, maxSide) {
    // source: canvas (original). st.crop: {aspect, rotate(0|90|180|270), flipH, flipV, straighten(-15..15)}
    const sw = source.width, sh = source.height;
    const aspect = st.crop.aspect; // 'free' or w/h number
    let cw = sw, ch = sh;
    if (aspect && aspect !== "free") {
      const target = aspect;
      const srcR = sw / sh;
      if (srcR > target) { cw = Math.round(sh * target); ch = sh; }
      else { cw = sw; ch = Math.round(sw / target); }
    }
    const cx = Math.round((sw - cw) / 2), cy = Math.round((sh - ch) / 2);
    const rot = ((st.crop.rotate % 360) + 360) % 360;
    const swap = rot === 90 || rot === 270;
    const bw = swap ? ch : cw, bh = swap ? cw : ch;
    const scale = maxSide ? Math.min(1, maxSide / Math.max(bw, bh)) : 1;
    const out = document.createElement("canvas");
    out.width = Math.max(1, Math.round(bw * scale));
    out.height = Math.max(1, Math.round(bh * scale));
    const ctx = out.getContext("2d", { willReadFrequently: true });
    ctx.imageSmoothingQuality = "high";
    ctx.save();
    ctx.translate(out.width / 2, out.height / 2);
    let sc = scale;
    if (st.crop.straighten) {
      const a = st.crop.straighten * Math.PI / 180;
      const cover = 1 / Math.max(0.4, Math.cos(a));
      sc *= cover;
      ctx.rotate(a);
    }
    if (rot) ctx.rotate(rot * Math.PI / 180);
    ctx.scale((st.crop.flipH ? -1 : 1) * sc, (st.crop.flipV ? -1 : 1) * sc);
    ctx.drawImage(source, cx, cy, cw, ch, -cw / 2, -ch / 2, cw, ch);
    ctx.restore();
    return out;
  }

  function boxBlurInto(src, radius) {
    // separable 5-tap (radius 2) box blur with clamped edges.
    // NOTE: the sliding window must always remove one sample and add one sample
    // (clamped to the edge) — skipping either skews the average (old bug: ~1.4x gain).
    const w = src.width, h = src.height;
    const s = src.data;
    const tmp = new Uint8ClampedArray(s.length);
    const out = new Uint8ClampedArray(s.length);
    const r = Math.max(1, radius | 0);
    const div = 2 * r + 1;
    for (let y = 0; y < h; y++) {
      let ar = 0, ag = 0, ab = 0;
      for (let x = -r; x <= r; x++) {
        const xx = Math.min(w - 1, Math.max(0, x));
        const i = (y * w + xx) * 4;
        ar += s[i]; ag += s[i + 1]; ab += s[i + 2];
      }
      for (let x = 0; x < w; x++) {
        const i = (y * w + x) * 4;
        tmp[i] = ar / div; tmp[i + 1] = ag / div; tmp[i + 2] = ab / div; tmp[i + 3] = 255;
        const xo = x - r < 0 ? 0 : x - r;
        const xi = x + r + 1 >= w ? w - 1 : x + r + 1;
        const o = (y * w + xo) * 4, q = (y * w + xi) * 4;
        ar += s[q] - s[o]; ag += s[q + 1] - s[o + 1]; ab += s[q + 2] - s[o + 2];
      }
    }
    for (let x = 0; x < w; x++) {
      let ar = 0, ag = 0, ab = 0;
      for (let y = -r; y <= r; y++) {
        const yy = Math.min(h - 1, Math.max(0, y));
        const i = (yy * w + x) * 4;
        ar += tmp[i]; ag += tmp[i + 1]; ab += tmp[i + 2];
      }
      for (let y = 0; y < h; y++) {
        const i = (y * w + x) * 4;
        out[i] = ar / div; out[i + 1] = ag / div; out[i + 2] = ab / div; out[i + 3] = 255;
        const yo = y - r < 0 ? 0 : y - r;
        const yi = y + r + 1 >= h ? h - 1 : y + r + 1;
        const o = (yo * w + x) * 4, q = (yi * w + x) * 4;
        ar += tmp[q] - tmp[o]; ag += tmp[q + 1] - tmp[o + 1]; ab += tmp[q + 2] - tmp[o + 2];
      }
    }
    return new ImageData(out, w, h);
  }

  function gradePass(img, st, look, opt) {
    const d = img.data, w = img.width, h = img.height;
    // opt.lookOnly: apply ONLY this look's own contribution (grade + its fx) at
    // opt.amt (0..1), skipping all tone sliders and curves — used for committed
    // stack layers. Full mode (opt unset) is pixel-identical to before.
    opt = opt || {};
    const lookOnly = !!opt.lookOnly;
    const tone = !lookOnly;
    const laAmt = lookOnly
      ? Math.min(1, Math.max(0, opt.amt == null ? 1 : opt.amt))
      : (st.lookAmount == null ? 1 : st.lookAmount / 100);
    const ev = tone ? (st.exposure || 0) : 0;
    const expM = Math.pow(2, ev);
    const con = tone ? (st.contrast || 0) : 0;
    const cF = (259 * (con * 2.55 + 255)) / (255 * (259 - con * 2.55));
    const hl = tone ? (st.highlights || 0) : 0, sh = tone ? (st.shadows || 0) : 0;
    const wh = tone ? (st.whites || 0) : 0, bl = tone ? (st.blacks || 0) : 0;
    const tmp = tone ? (st.temperature || 0) : 0, tnt = tone ? (st.tint || 0) : 0;
    const vib = tone ? (st.vibrance || 0) : 0, sat = tone ? (st.saturation || 0) : 0;
    const lookFade = (look && look.fx && look.fx.fade) ? look.fx.fade * laAmt : 0;
    const lookVig = (look && look.fx && look.fx.vignette) ? look.fx.vignette * laAmt * 0.5 : 0;
    const lookGrn = (look && look.fx && look.fx.grain) ? look.fx.grain * laAmt * 0.5 : 0;
    const fade = (tone ? (st.fade || 0) : 0) + lookFade;
    const deh = tone ? (st.dehaze || 0) : 0;
    const vig = (tone ? (st.vignette || 0) : 0) + lookVig;
    const grn = (tone ? (st.grain || 0) : 0) + lookGrn;
    const lookAmt = look && look.id !== "normal" ? laAmt : 0;
    const satM = 1 + sat / 100;
    const cx = w / 2, cy = h / 2;
    const maxD = Math.sqrt(cx * cx + cy * cy) || 1;
    const vigAmt = Math.min(1, vig / 100) * 0.8;
    const grnAmt = grn / 100;
    const clut = tone && st.curves ? curvesLUT(st.curves) : null;
    // Spectra spatial fx (uniform-driven; the GPU shader mirrors each formula exactly)
    const laS = laAmt;
    const fxL = (look && look.fx) || {};
    const shPx = (fxL.shift || 0) * laS;
    const mirK = ((fxL.mirror || 0) / 100) * laS;
    const pixN = Math.max(0, Math.round(fxL.pixel || 0));
    const pixK = pixN > 1 ? laS : 0;
    const halfK = ((fxL.half || 0) / 100) * laS;
    const scanK = ((fxL.scan || 0) / 100) * laS;
    const edgeK = ((fxL.edge || 0) / 100) * laS;
    const leakK = ((fxL.leak || 0) / 100) * laS;
    const leakV = fxL.leakVar || 1;
    const posterN = Math.max(0, Math.round(fxL.poster || 0));
    const needPre = (shPx !== 0 || mirK > 0 || pixK > 0 || edgeK > 0);
    const src0 = needPre ? d.slice() : d;
    const sampB = (fx, fy) => { // bilinear read on the ungraded copy (matches GPU linear filtering)
      fx = fx < 0 ? 0 : fx > w - 1 ? w - 1 : fx;
      fy = fy < 0 ? 0 : fy > h - 1 ? h - 1 : fy;
      const x0 = Math.floor(fx), y0 = Math.floor(fy);
      const x1 = x0 + 1 > w - 1 ? w - 1 : x0 + 1, y1 = y0 + 1 > h - 1 ? h - 1 : y0 + 1;
      const tx = fx - x0, ty = fy - y0;
      const a00 = (y0 * w + x0) * 4, a10 = (y0 * w + x1) * 4;
      const a01 = (y1 * w + x0) * 4, a11 = (y1 * w + x1) * 4;
      const w00 = (1 - tx) * (1 - ty), w10 = tx * (1 - ty), w01 = (1 - tx) * ty, w11 = tx * ty;
      return [src0[a00] * w00 + src0[a10] * w10 + src0[a01] * w01 + src0[a11] * w11,
        src0[a00 + 1] * w00 + src0[a10 + 1] * w10 + src0[a01 + 1] * w01 + src0[a11 + 1] * w11,
        src0[a00 + 2] * w00 + src0[a10 + 2] * w10 + src0[a01 + 2] * w01 + src0[a11 + 2] * w11];
    };

    for (let y = 0; y < h; y++) {
      const dy = (y - cy) / maxD;
      for (let x = 0; x < w; x++) {
        const i = (y * w + x) * 4;
        let r = d[i], g = d[i + 1], b = d[i + 2];
        let edgeE = 0;
        // pre-grade spatial sampling (reads run on the ungraded copy)
        if (needPre) {
          if (shPx !== 0) {
            const qR = sampB(x + shPx, y), qB = sampB(x - shPx, y);
            r = qR[0]; b = qB[2];
          }
          if (mirK > 0) {
            const q = sampB(w - 1 - x, y);
            r = lerp(r, q[0], mirK); g = lerp(g, q[1], mirK); b = lerp(b, q[2], mirK);
          }
          if (pixK > 0) {
            const bx = Math.floor((x + 0.5) / pixN) * pixN + pixN / 2 - 0.5;
            const by = Math.floor((y + 0.5) / pixN) * pixN + pixN / 2 - 0.5;
            const q = sampB(bx, by);
            r = lerp(r, q[0], pixK); g = lerp(g, q[1], pixK); b = lerp(b, q[2], pixK);
          }
          if (edgeK > 0) {
            const sG = (ox, oy) => {
              const q = sampB(x + ox, y + oy);
              return (q[0] + q[1] + q[2]) / 3;
            };
            const e00 = sG(-1, -1), e10 = sG(0, -1), e20 = sG(1, -1);
            const e01 = sG(-1, 0), e21 = sG(1, 0);
            const e02 = sG(-1, 1), e12 = sG(0, 1), e22 = sG(1, 1);
            const dX = -e00 - 2 * e01 - e02 + e20 + 2 * e21 + e22;
            const dY = -e00 - 2 * e10 - e20 + e02 + 2 * e12 + e22;
            edgeE = (Math.abs(dX) + Math.abs(dY)) / 255;
            if (edgeE > 1) edgeE = 1;
          }
        }

        // look grade first (profile)
        if (lookAmt > 0 && look.grade) {
          const q = look.grade(r, g, b);
          r = lerp(r, q[0], lookAmt); g = lerp(g, q[1], lookAmt); b = lerp(b, q[2], lookAmt);
        }
        // posterize levels (exact post-grade quantize; mirrors uPoster)
        if (posterN > 1 && lookAmt > 0) {
          r = Math.floor(r / 255 * posterN) / posterN * 255;
          g = Math.floor(g / 255 * posterN) / posterN * 255;
          b = Math.floor(b / 255 * posterN) / posterN * 255;
        }
        // exposure
        if (expM !== 1) { r *= expM; g *= expM; b *= expM; }
        // white balance
        if (tmp) { r += tmp * 0.5; b -= tmp * 0.5; }
        if (tnt) { g += tnt * 0.42; r -= tnt * 0.18; b -= tnt * 0.18; }
        // contrast around 128
        if (con) { r = cF * (r - 128) + 128; g = cF * (g - 128) + 128; b = cF * (b - 128) + 128; }

        let lum = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
        lum = lum < 0 ? 0 : lum > 1 ? 1 : lum;
        const hlM = sstep(0.5, 1, lum), shM = 1 - sstep(0, 0.5, lum);
        if (hl) {
          const k = hl / 100 * 62 * hlM;
          if (k >= 0) { r += k * (1 - r / 255); g += k * (1 - g / 255); b += k * (1 - b / 255); }
          else { r += k * (r / 255); g += k * (g / 255); b += k * (b / 255); }
        }
        if (sh) {
          const k = sh / 100 * 62 * shM;
          if (k >= 0) { r += k * (1 - r / 255); g += k * (1 - g / 255); b += k * (1 - b / 255); }
          else { r += k * (r / 255); g += k * (g / 255); b += k * (b / 255); }
        }
        if (wh) {
          const t = (r / 255) * (r / 255), t2 = (g / 255) * (g / 255), t3 = (b / 255) * (b / 255);
          r += wh * 0.42 * t; g += wh * 0.42 * t2; b += wh * 0.42 * t3;
        }
        if (bl) {
          const t = 1 - r / 255, t2 = 1 - g / 255, t3 = 1 - b / 255;
          r += bl * 0.42 * t * t; g += bl * 0.42 * t2 * t2; b += bl * 0.42 * t3 * t3;
        }
        // curves (per-channel then master) — shared LUT builder with GPU path
        if (clut) {
          r = lutLerp(clut.r, r); g = lutLerp(clut.g, g); b = lutLerp(clut.b, b);
          r = lutLerp(clut.m, r); g = lutLerp(clut.m, g); b = lutLerp(clut.m, b);
        }
        // vibrance + saturation around luma
        lum = (0.2126 * r + 0.7152 * g + 0.0722 * b);
        if (vib) {
          const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
          const s0 = mx <= 0 ? 0 : (mx - mn) / (mx + 1);
          const k = 1 + (vib / 100) * (1 - s0) * 1.1;
          r = lum + (r - lum) * k; g = lum + (g - lum) * k; b = lum + (b - lum) * k;
        }
        if (satM !== 1) { r = lum + (r - lum) * satM; g = lum + (g - lum) * satM; b = lum + (b - lum) * satM; }
        // fade
        if (fade) {
          const f = fade / 100;
          r = r + f * 30 * (1 - r / 255) - f * 12 * (r / 255);
          g = g + f * 30 * (1 - g / 255) - f * 12 * (g / 255);
          b = b + f * 30 * (1 - b / 255) - f * 12 * (b / 255);
        }
        // dehaze (mid-tone contrast + sat)
        if (deh) {
          const mid = 1 - Math.abs(lum / 255 - 0.5) * 2;
          const k = deh / 100;
          r += k * ((r - 128) * 0.22 * mid + (r - lum) * 0.25);
          g += k * ((g - 128) * 0.22 * mid + (g - lum) * 0.25);
          b += k * ((b - 128) * 0.22 * mid + (b - lum) * 0.25);
        }
        // vignette
        if (vigAmt > 0) {
          const dx = (x - cx) / maxD;
          const dist = Math.sqrt(dx * dx + dy * dy);
          const m = 1 - vigAmt * Math.pow(sstep(0.42, 1, dist), 1.4);
          r *= m; g *= m; b *= m;
        }
        // light leak (corner washes; u/v match shader vUv incl. half-texel centers)
        if (leakK > 0) {
          const u = (x + 0.5) / w, v = (y + 0.5) / h;
          if (leakV === 2) {
            const mT = leakK * (1 - v) * (1 - v);
            const mB = leakK * v * v;
            r += mT * 150 + mB * 12; g += mT * 95 + mB * 110; b += mT * 30 + mB * 125;
          } else {
            const mL = leakK * (1 - u) * (1 - u);
            let t2 = u + (1 - v); t2 = t2 > 1 ? 1 : t2 < 0 ? 0 : t2;
            const mR = leakK * t2 * t2 * 0.5;
            r += mL * 140 + mR * 150; g += mL * 70 + mR * 30; b += mL * 22 + mR * 95;
          }
        }
        // halftone dot screen (axis dot grid on luma; trig-free for CPU/GPU parity)
        if (halfK > 0) {
          const gx = (x + 0.5) - Math.floor((x + 0.5) / 5) * 5 - 2;
          const gy = (y + 0.5) - Math.floor((y + 0.5) / 5) * 5 - 2;
          let dd = Math.sqrt(gx * gx + gy * gy) / 2.6;
          dd = dd > 1 ? 1 : dd < 0 ? 0 : dd;
          let lh = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
          lh = lh > 1 ? 1 : lh < 0 ? 0 : lh;
          const rr = Math.sqrt(lh);
          const dot = 1 - sstep(rr - 0.16, rr + 0.16, dd);
          const ink = 25 + (238 - 25) * dot;
          r = lerp(r, ink, halfK); g = lerp(g, ink, halfK); b = lerp(b, ink, halfK);
        }
        // scanlines (exact row parity: integer rows match shader floor() rows)
        if (scanK > 0) {
          const m = lerp(1, (y & 1) ? 0.74 : 1.0, scanK);
          r *= m; g *= m; b *= m;
        }
        // neon edge glow (sobel on pre-grade luma; mirrors uEdge exactly)
        if (edgeK > 0) {
          let ek = edgeE * edgeK * 1.35;
          if (ek > 1) ek = 1;
          const dk = 1 - 0.3 * ek;
          r = r * dk + 30 * ek; g = g * dk + 225 * ek; b = b * dk + 255 * ek;
        }
        // grain (mono, deterministic spatial hash — stable across renders)
        if (grnAmt > 0) {
          const n = (hash01(x, y, 7) - 0.5) * grnAmt * 54;
          r += n; g += n; b += n;
        }
        d[i] = clamp255(r); d[i + 1] = clamp255(g); d[i + 2] = clamp255(b);
      }
    }
    return img;
  }

  function detailPass(img, st) {
    const needClarity = (st.clarity || 0) !== 0 || (st.texture || 0) !== 0;
    const needSharp = (st.sharpen || 0) > 0;
    const needLumNR = (st.lumNR || 0) > 0;
    const needColorNR = (st.colorNR || 0) > 0;
    if (!needClarity && !needSharp && !needLumNR && !needColorNR) return img;
    const blur = boxBlurInto(img, 2);
    const d = img.data, b = blur.data;
    const cl = (st.clarity || 0) / 100, tx = (st.texture || 0) / 100;
    const shAmt = (st.sharpen || 0) / 100;
    const lumMix = (st.lumNR || 0) / 100 * 0.85;
    const colMix = (st.colorNR || 0) / 100;
    const detAmt = cl * 0.9 + tx * 0.45 + shAmt * 1.1;
    for (let i = 0; i < d.length; i += 4) {
      let r = d[i], g = d[i + 1], bl2 = d[i + 2];
      const br = b[i], bg = b[i + 1], bb = b[i + 2];
      if (detAmt !== 0) {
        r += (r - br) * detAmt; g += (g - bg) * detAmt; bl2 += (bl2 - bb) * detAmt;
      }
      if (lumMix > 0) {
        r = lerp(r, br, lumMix); g = lerp(g, bg, lumMix); bl2 = lerp(bl2, bb, lumMix);
      }
      if (colMix > 0) {
        const lum = 0.2126 * r + 0.7152 * g + 0.0722 * bl2;
        const lumB = 0.2126 * br + 0.7152 * bg + 0.0722 * bb;
        r = lum + lerp(r - lum, br - lumB, colMix);
        g = lum + lerp(g - lum, bg - lumB, colMix);
        bl2 = lum + lerp(bl2 - lum, bb - lumB, colMix);
      }
      d[i] = clamp255(r); d[i + 1] = clamp255(g); d[i + 2] = clamp255(bl2);
    }
    return img;
  }

  function healPass(img, spots) {
    if (!spots || !spots.length) return img;
    const w = img.width, h = img.height, d = img.data;
    const src = new Uint8ClampedArray(d);
    const pix = (xx, yy, ch) => {
      xx = xx < 0 ? 0 : xx >= w ? w - 1 : xx;
      yy = yy < 0 ? 0 : yy >= h ? h - 1 : yy;
      return src[((yy * w + xx) * 4) + ch];
    };
    for (const s of spots) {
      const cx = Math.round(s.x * w), cy = Math.round(s.y * h);
      const rad = Math.max(2, Math.round(s.r * Math.max(w, h)));
      // donor offset: right-down, fallback left-up
      const donors = [[rad * 2.2, 0], [-rad * 2.2, 0], [0, rad * 2.2], [0, -rad * 2.2]];
      let dx = donors[0][0], dy = donors[0][1];
      for (const [ox, oy] of donors) {
        const nx = cx + Math.round(ox), ny = cy + Math.round(oy);
        if (nx - rad > 0 && ny - rad > 0 && nx + rad < w && ny + rad < h) { dx = ox; dy = oy; break; }
      }
      // Gradient-aware clone: match donor patch mean to the target ring mean
      // (annulus around the spot), so clones blend on gradients instead of
      // stamping a flat mismatched disc. Texture comes from the donor.
      let tR = 0, tG = 0, tB = 0, tN = 0, dR = 0, dG = 0, dB = 0, dN = 0;
      const rO = Math.round(rad * 1.1), rI = Math.round(rad * 2.4);
      for (let y = cy - rI; y <= cy + rI; y += 2) {
        if (y < 0 || y >= h) continue;
        for (let x = cx - rI; x <= cx + rI; x += 2) {
          if (x < 0 || x >= w) continue;
          const dd = Math.hypot(x - cx, y - cy);
          if (dd < rO || dd > rI) continue;
          tR += pix(x, y, 0); tG += pix(x, y, 1); tB += pix(x, y, 2); tN++;
          const sx = x + Math.round(dx), sy = y + Math.round(dy);
          dR += pix(sx, sy, 0); dG += pix(sx, sy, 1); dB += pix(sx, sy, 2); dN++;
        }
      }
      const shR = tN && dN ? (tR / tN - dR / dN) : 0;
      const shG = tN && dN ? (tG / tN - dG / dN) : 0;
      const shB = tN && dN ? (tB / tN - dB / dN) : 0;
      for (let y = cy - rad; y <= cy + rad; y++) {
        if (y < 0 || y >= h) continue;
        for (let x = cx - rad; x <= cx + rad; x++) {
          if (x < 0 || x >= w) continue;
          const dist = Math.sqrt((x - cx) * (x - cx) + (y - cy) * (y - cy)) / rad;
          if (dist > 1) continue;
          const feather = 0.5 + 0.5 * Math.cos(dist * Math.PI); // 1 center -> 0 edge
          const sx = Math.min(w - 1, Math.max(0, Math.round(x + dx)));
          const sy = Math.min(h - 1, Math.max(0, Math.round(y + dy)));
          const i = (y * w + x) * 4, j = (sy * w + sx) * 4;
          d[i] = lerp(src[i], src[j] + shR, feather);
          d[i + 1] = lerp(src[i + 1], src[j + 1] + shG, feather);
          d[i + 2] = lerp(src[i + 2], src[j + 2] + shB, feather);
        }
      }
    }
    return img;
  }

  function histogram(img) {
    const d = img.data;
    const R = new Uint32Array(256), G = new Uint32Array(256), B = new Uint32Array(256);
    const step = Math.max(1, Math.floor(d.length / 4 / 60000));
    let n = 0;
    for (let i = 0; i < d.length; i += 4 * step) {
      R[d[i]]++; G[d[i + 1]]++; B[d[i + 2]]++; n++;
    }
    return { R, G, B, n };
  }

  // Deterministic spatial hash for grain (stable across renders — no shimmer).
  // Must match the GPU hash12 usage qualitatively (both stable; exact values differ, both static).
  function hash01(x, y, seed) {
    let h = (Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(seed, 974634)) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  }

  const _curveCache = { key: "", lut: null };
  function splineLUT(pts) {
    // Fritsch-Carlson monotone cubic through [[x,y]...] (0..255) -> Uint8Array(256)
    let p = pts.map((q) => [Math.min(255, Math.max(0, q[0])), Math.min(255, Math.max(0, q[1]))]);
    p.sort((a, b) => a[0] - b[0]);
    const xs = [], ys = [];
    for (const q of p) {
      if (xs.length && q[0] === xs[xs.length - 1]) ys[ys.length - 1] = q[1];
      else { xs.push(q[0]); ys.push(q[1]); }
    }
    const n = xs.length;
    const out = new Uint8Array(256);
    if (n === 0) { for (let i = 0; i < 256; i++) out[i] = i; return out; }
    if (n === 1) { for (let i = 0; i < 256; i++) out[i] = Math.round(ys[0]); return out; }
    const d = new Array(n - 1), m = new Array(n);
    for (let i = 0; i < n - 1; i++) {
      const dx = (xs[i + 1] - xs[i]) || 1;
      d[i] = (ys[i + 1] - ys[i]) / dx;
    }
    m[0] = d[0]; m[n - 1] = d[n - 2];
    for (let i = 1; i < n - 1; i++) {
      if (d[i - 1] * d[i] <= 0) m[i] = 0;
      else m[i] = (d[i - 1] + d[i]) / 2;
    }
    for (let i = 0; i < n - 1; i++) {
      if (d[i] === 0) { m[i] = 0; m[i + 1] = 0; }
      else {
        const a = m[i] / d[i], b = m[i + 1] / d[i];
        const s = a * a + b * b;
        if (s > 9) {
          const t = 3 / Math.sqrt(s);
          m[i] = t * a * d[i]; m[i + 1] = t * b * d[i];
        }
      }
    }
    let k = 0;
    for (let x = 0; x < 256; x++) {
      if (x <= xs[0]) { out[x] = Math.round(ys[0]); continue; }
      if (x >= xs[n - 1]) { out[x] = Math.round(ys[n - 1]); continue; }
      while (k < n - 2 && x > xs[k + 1]) k++;
      const dx = (xs[k + 1] - xs[k]) || 1;
      const t = (x - xs[k]) / dx;
      const t2 = t * t, t3 = t2 * t;
      const y = (2 * t3 - 3 * t2 + 1) * ys[k] + (t3 - 2 * t2 + t) * dx * m[k] +
        (-2 * t3 + 3 * t2) * ys[k + 1] + (t3 - t2) * dx * m[k + 1];
      out[x] = y < 0 ? 0 : y > 255 ? 255 : Math.round(y);
    }
    return out;
  }

  function isIdentityPts(pts) {
    return pts.length === 2 && pts[0][0] === 0 && pts[0][1] === 0 && pts[1][0] === 255 && pts[1][1] === 255;
  }

  // Shared with the GPU path: builds {r,g,b,m} 256-entry LUTs, or null when identity.
  function curvesLUT(curves) {
    if (!curves) return null;
    const key = JSON.stringify(curves);
    if (_curveCache.key === key) return _curveCache.lut;
    const ch = ["rgb", "r", "g", "b"];
    let ident = true;
    for (const c of ch) {
      const pts = curves[c] || [[0, 0], [255, 255]];
      if (!isIdentityPts(pts)) { ident = false; break; }
    }
    const lut = ident ? null : {
      m: splineLUT(curves.rgb || [[0, 0], [255, 255]]),
      r: splineLUT(curves.r || [[0, 0], [255, 255]]),
      g: splineLUT(curves.g || [[0, 0], [255, 255]]),
      b: splineLUT(curves.b || [[0, 0], [255, 255]])
    };
    _curveCache.key = key; _curveCache.lut = lut;
    return lut;
  }
  function lutLerp(lut, v) {
    v = v < 0 ? 0 : v > 255 ? 255 : v;
    const i = v | 0, f = v - i;
    const i1 = i >= 255 ? 255 : i + 1;
    return lut[i] * (1 - f) + lut[i1] * f;
  }

  // Committed look stack: apply each layer's own contribution in order.
  // stack = [{id, amount}] — unknown ids and Normal/0% layers are skipped.
  function gradeStack(img, st, stack) {
    if (!stack || !stack.length) return;
    const all = window.T2S_LOOKS || [];
    for (const L of stack) {
      if (!L) continue;
      const amt = L.amount == null ? 100 : L.amount;
      if (!(amt > 0)) continue;
      const lk = all.find((q) => q.id === L.id);
      if (!lk || lk.id === "normal" || !lk.grade) continue;
      gradePass(img, st, lk, { lookOnly: true, amt: Math.min(1, amt / 100) });
    }
  }
  window.T2SEngine = { baseDraw, gradePass, gradeStack, detailPass, healPass, histogram, boxBlurInto, curvesLUT, splineLUT };
})();
