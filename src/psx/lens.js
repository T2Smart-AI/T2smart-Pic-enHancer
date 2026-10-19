/* T2Smart-PicHancer — lens correction: minimal JPEG EXIF reader, built-in lens profile
   table (hand-authored; the real fleet DB lives server-side), manual distortion /
   lateral-CA / vignette controls. GPU warp pass in gpu.js; CPU fallback here. */
(function () {
  "use strict";

  // id match (substring, case-insensitive) -> { k1 (barrel+ / pincushion-), ca (edge px), vig (% lift) }
  const PROFILES = [
    { id: "canon 18-55", match: ["canon", "18-55", "ef-s18-55"], k1: 0.045, ca: 1.1, vig: 18 },
    { id: "canon 24-70 f/2.8", match: ["canon", "24-70"], k1: 0.028, ca: 0.8, vig: 12 },
    { id: "canon 50 f/1.8", match: ["canon", "50mm", "nifty"], k1: 0.008, ca: 0.6, vig: 22 },
    { id: "nikon 18-55", match: ["nikon", "18-55", "dx"], k1: 0.042, ca: 1.0, vig: 16 },
    { id: "nikon 24-70", match: ["nikon", "24-70"], k1: 0.026, ca: 0.7, vig: 11 },
    { id: "sony 28-70", match: ["sony", "28-70"], k1: 0.038, ca: 1.0, vig: 15 },
    { id: "sony 50 f/1.8", match: ["sony", "50"], k1: 0.01, ca: 0.7, vig: 20 },
    { id: "fujifilm 18-55", match: ["fujifilm", "fuji", "18-55"], k1: 0.03, ca: 0.8, vig: 13 },
    { id: "iphone wide", match: ["iphone", "wide"], k1: 0.02, ca: 0.4, vig: 8 },
    { id: "pixel wide", match: ["pixel", "google"], k1: 0.018, ca: 0.4, vig: 8 },
    { id: "galaxy wide", match: ["galaxy", "samsung", "sm-"], k1: 0.02, ca: 0.5, vig: 9 },
    { id: "gopro wide", match: ["gopro", "hero"], k1: 0.16, ca: 1.6, vig: 25 },
    { id: "dji drone", match: ["dji", "mavic", "phantom"], k1: 0.05, ca: 0.9, vig: 14 },
    { id: "sigma 18-50", match: ["sigma", "18-50"], k1: 0.035, ca: 0.9, vig: 14 },
    { id: "tamron 28-75", match: ["tamron", "28-75"], k1: 0.03, ca: 0.8, vig: 12 },
    { id: "kit 16-50", match: ["16-50", "e pz"], k1: 0.055, ca: 1.2, vig: 18 },
    { id: "ultrawide phone", match: ["ultra", "0.5", "uw"], k1: 0.07, ca: 1.1, vig: 16 },
  ];

  function matchProfile(exif) {
    const hay = ((exif.make || "") + " " + (exif.model || "") + " " + (exif.lens || "")).toLowerCase();
    if (!hay.trim()) return null;
    let best = null, bestScore = 0;
    for (const p of PROFILES) {
      let sc = 0;
      for (const m of p.match) if (hay.includes(m)) sc++;
      if (sc > bestScore) { bestScore = sc; best = p; }
    }
    return bestScore > 0 ? best : null;
  }

  // Minimal JPEG EXIF reader: Make/Model/LensModel only. Returns {} on failure.
  function readExif(buf) {
    const out = {};
    try {
      const b = new Uint8Array(buf);
      if (b[0] !== 0xFF || b[1] !== 0xD8) return out;
      let off = 2;
      while (off + 4 < b.length) {
        if (b[off] !== 0xFF) break;
        const marker = b[off + 1];
        const len = (b[off + 2] << 8) + b[off + 3];
        if (marker === 0xE1 && len > 10 &&
          b[off + 4] === 0x45 && b[off + 5] === 0x78 && b[off + 6] === 0x69 && b[off + 7] === 0x66) {
          parseTiff(b, off + 10, len - 8, out);
          break;
        }
        if (marker === 0xDA || marker === 0xD9) break;
        off += 2 + len;
      }
    } catch (e) { /* ignore */ }
    return out;
  }
  function parseTiff(b, base, len, out) {
    const le = b[base] === 0x49;
    const u16 = (o) => le ? b[o] | (b[o + 1] << 8) : (b[o] << 8) | b[o + 1];
    const u32 = (o) => le
      ? b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24)
      : (b[o] << 24) | (b[o + 1] << 16) | (b[o + 2] << 8) | b[o + 3];
    if (u16(base + 2) !== 42) return;
    const readStr = (o, n) => {
      let s = "";
      for (let i = 0; i < n && b[o + i]; i++) s += String.fromCharCode(b[o + i]);
      return s.trim().replace(/\0+$/, "");
    };
    const walk = (dirOff, get) => {
      const n = u16(base + dirOff);
      for (let i = 0; i < n; i++) {
        const e = base + dirOff + 2 + i * 12;
        if (e + 12 > base + len) break;
        const tag = u16(e), type = u16(e + 2), cnt = u32(e + 4);
        let vo = u32(e + 8);
        const size = type === 2 ? cnt : 0;
        if (size > 4) vo = base + vo;
        else vo = e + 8;
        get(tag, readStr(vo, Math.min(cnt, 128)));
      }
    };
    let exifOff = -1;
    walk(u32(base + 4), (tag, v) => {
      if (tag === 0x010F) out.make = v;
      else if (tag === 0x0110) out.model = v;
    });
    // resolve EXIF IFD properly: re-scan IFD0 for 0x8769 value
    const n0 = u16(base + u32(base + 4));
    for (let i = 0; i < n0; i++) {
      const e = base + u32(base + 4) + 2 + i * 12;
      if (u16(e) === 0x8769) { exifOff = u32(e + 8); break; }
    }
    if (exifOff >= 0) walk(exifOff, (tag, v) => { if (tag === 0xA434) out.lens = v; });
  }

  // CPU fallback warp: same mapping as the GPU lens program (bilinear).
  function lensPass(img, L) {
    if (!L || !L.enabled) return img;
    const k1 = L.k1 || 0, ca = L.ca || 0, vig = L.vig || 0;
    if (!k1 && !ca && !vig) return img;
    const w = img.width, h = img.height, d = img.data;
    const src = new Uint8ClampedArray(d);
    const asp = w / h;
    const sample = (u, v, ch) => {
      let x = u * w - 0.5, y = v * h - 0.5;
      x = x < 0 ? 0 : x > w - 1.001 ? w - 1.001 : x;
      y = y < 0 ? 0 : y > h - 1.001 ? h - 1.001 : y;
      const x0 = x | 0, y0 = y | 0, fx = x - x0, fy = y - y0;
      const i00 = (y0 * w + x0) * 4 + ch, i10 = i00 + 4, i01 = i00 + w * 4, i11 = i01 + 4;
      return src[i00] * (1 - fx) * (1 - fy) + src[i10] * fx * (1 - fy) + src[i01] * (1 - fx) * fy + src[i11] * fx * fy;
    };
    for (let y = 0; y < h; y++) {
      const v = (y + 0.5) / h;
      for (let x = 0; x < w; x++) {
        const u = (x + 0.5) / w;
        let px = (u - 0.5) * asp, py = v - 0.5;
        const r2 = px * px + py * py;
        const f = 1 - k1 * r2; // k1>0 straightens barrel distortion
        const su = 0.5 + px * f / asp, sv = 0.5 + py * f;
        const i = (y * w + x) * 4;
        if (!ca) {
          d[i] = sample(su, sv, 0); d[i + 1] = sample(su, sv, 1); d[i + 2] = sample(su, sv, 2);
        } else {
          const cf = 1 + (ca / Math.max(w, h)) * r2 * 24;
          const ru = 0.5 + (su - 0.5) * cf, rv = 0.5 + (sv - 0.5) * cf;
          const bu = 0.5 + (su - 0.5) / cf, bv = 0.5 + (sv - 0.5) / cf;
          d[i] = sample(ru, rv, 0); d[i + 1] = sample(su, sv, 1); d[i + 2] = sample(bu, bv, 2);
        }
        if (vig) {
          const dist = Math.sqrt(r2 / (0.25 * asp * asp + 0.25));
          let t = (dist - 0.4) / 0.6; t = t < 0 ? 0 : t > 1 ? 1 : t;
          const g = Math.min(2, 1 + vig / 100 * (t * t * (3 - 2 * t)) * 1.2);
          d[i] *= g; d[i + 1] *= g; d[i + 2] *= g;
        }
      }
    }
    return img;
  }

  // ---- export EXIF preservation (no dependency, pure byte surgery) ----
  // Extract the first APP1/EXIF JPEG segment (incl. marker+length), capped.
  function extractApp1(buf, cap) {
    try {
      const b = new Uint8Array(buf);
      if (b[0] !== 0xFF || b[1] !== 0xD8) return null;
      let off = 2;
      const max = Math.min(b.length, (cap || 524288) + 16);
      while (off + 4 < b.length && off < max) {
        if (b[off] !== 0xFF) break;
        const marker = b[off + 1];
        const len = (b[off + 2] << 8) + b[off + 3];
        if (len < 2) break;
        if (marker === 0xE1 && len > 10 &&
          b[off + 4] === 0x45 && b[off + 5] === 0x78 && b[off + 6] === 0x69 && b[off + 7] === 0x66 &&
          2 + len <= (cap || 524288)) {
          return b.slice(off, off + 2 + len);
        }
        if (marker === 0xDA || marker === 0xD9) break;
        off += 2 + len;
      }
    } catch (e) { /* ignore */ }
    return null;
  }
  // Patch a sliced APP1 segment for export: Orientation=1 (pixels are already
  // upright — browsers apply EXIF orientation on decode), update dimensions,
  // drop the thumbnail IFD (stale sizes). Returns a new Uint8Array or null.
  function patchExifForExport(seg, w, h) {
    try {
      const b = seg.slice();
      if (b[0] !== 0xFF || b[1] !== 0xE1) return null;
      const tiff = 4 + 6; // skip marker+len+"Exif\0\0"
      const le = b[tiff] === 0x49;
      const u16 = (o) => le ? b[o] | (b[o + 1] << 8) : (b[o] << 8) | b[o + 1];
      const u32 = (o) => le
        ? (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24)) >>> 0
        : ((b[o] << 24) | (b[o + 1] << 16) | (b[o + 2] << 8) | b[o + 3]) >>> 0;
      const w16 = (o, v) => { if (le) { b[o] = v & 255; b[o + 1] = (v >> 8) & 255; } else { b[o] = (v >> 8) & 255; b[o + 1] = v & 255; } };
      const w32 = (o, v) => {
        if (le) { b[o] = v & 255; b[o + 1] = (v >> 8) & 255; b[o + 2] = (v >> 16) & 255; b[o + 3] = (v >> 24) & 255; }
        else { b[o] = (v >> 24) & 255; b[o + 1] = (v >> 16) & 255; b[o + 2] = (v >> 8) & 255; b[o + 3] = v & 255; }
      };
      if (u16(tiff + 2) !== 42) return null;
      const setNum = (e, v) => {
        const type = u16(e + 2), cnt = u32(e + 4);
        if (cnt !== 1) return;
        if (type === 3) w16(e + 8, v);
        else if (type === 4) w32(e + 8, v);
      };
      const ifd0 = tiff + u32(tiff + 4);
      const n0 = u16(ifd0);
      let exifIfd = -1;
      for (let i = 0; i < n0; i++) {
        const e = ifd0 + 2 + i * 12;
        const tag = u16(e);
        if (tag === 0x0112) setNum(e, 1);
        else if (tag === 0x0100) setNum(e, w);
        else if (tag === 0x0101) setNum(e, h);
        else if (tag === 0x8769) {
          const t = u16(e + 2);
          exifIfd = t === 3 ? tiff + u16(e + 8) : tiff + u32(e + 8);
        }
      }
      w32(ifd0 + 2 + n0 * 12, 0); // drop thumbnail IFD
      if (exifIfd > 0) {
        const n1 = u16(exifIfd);
        for (let i = 0; i < n1; i++) {
          const e = exifIfd + 2 + i * 12;
          const tag = u16(e);
          if (tag === 0xA002) setNum(e, w);
          else if (tag === 0xA003) setNum(e, h);
        }
      }
      return b;
    } catch (e) { return null; }
  }

  window.T2S_LENS = { PROFILES, matchProfile, readExif, extractApp1, patchExifForExport, lensPass };
})();
