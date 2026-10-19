/* T2Smart-PicHancer — look recipes part 3: Spectra showpieces + new B&W/Duotone.
   Sources of inspiration (researched in scratch/fx-research/): CSSGram's
   Instagram filters (hue-rotate/contrast/saturate stacks + darken gradient
   overlays) and glfx.js's dotScreen/colorHalftone sine screens (adapted here as
   a trig-free dot grid so CPU/GPU stay pixel-identical).
   Self-contained helpers (mirrors looks.js/looks2.js). Appends to T2S_LOOKS.
   Spatial keys in fx (engine + shader implement them): shift(px), mirror(0-100),
   pixel(block px), half(0-100), scan(0-100), leak(0-100), leakVar(1|2). */
(function () {
  "use strict";
  const clamp = (v) => v < 0 ? 0 : v > 255 ? 255 : v;
  const lerp = (a, b, t) => a + (b - a) * t;
  const luma = (r, g, b) => 0.2126 * r + 0.7152 * g + 0.0722 * b;
  const smooth = (x) => x * x * (3 - 2 * x);
  const sCurve = (v, amt) => clamp((v / 255 + amt * (smooth(v / 255) - v / 255) * 1.6) * 255);
  const lift = (v, amt) => clamp(v + amt * 28 * (1 - v / 255));
  const warm = (r, g, b, a) => [clamp(r + 22 * a), clamp(g + 6 * a), clamp(b - 18 * a)];
  const cool = (r, g, b, a) => [clamp(r - 18 * a), clamp(g - 2 * a), clamp(b + 24 * a)];
  const duo = (r, g, b, dk, lt) => {
    const k = smooth(luma(r, g, b) / 255);
    return [lerp(dk[0], lt[0], k), lerp(dk[1], lt[1], k), lerp(dk[2], lt[2], k)];
  };
  const tri = (r, g, b, dk, md, lt) => {
    const t = luma(r, g, b) / 255;
    if (t < 0.5) { const k = smooth(t * 2); return [lerp(dk[0], md[0], k), lerp(dk[1], md[1], k), lerp(dk[2], md[2], k)]; }
    const k = smooth((t - 0.5) * 2); return [lerp(md[0], lt[0], k), lerp(md[1], lt[1], k), lerp(md[2], lt[2], k)];
  };
  const bw = (r, g, b, wr, wg, wb2) => clamp(wr * r + wg * g + wb2 * b);
  const sat = (r, g, b, k) => { const v = luma(r, g, b); return [clamp(v + (r - v) * k), clamp(v + (g - v) * k), clamp(v + (b - v) * k)]; };
  const poster = (v, n) => Math.floor(v / 255 * n) / n * 255;
  const solar = (v) => v < 128 ? v : 255 - v;
  function rgbToHsl(r, g, b) {
    r /= 255; g /= 255; b /= 255;
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
    let h = 0, s = 0; const l = (mx + mn) / 2;
    if (mx !== mn) {
      const d = mx - mn;
      s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
      if (mx === r) h = ((g - b) / d + (g < b ? 6 : 0));
      else if (mx === g) h = (b - r) / d + 2;
      else h = (r - g) / d + 4;
      h *= 60;
    }
    return [h, s, l];
  }
  function hslToRgb(h, s, l) {
    h = (((h % 360) + 360) % 360) / 360;
    let r, g, b;
    if (s === 0) { r = g = b = l; }
    else {
      const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
      const p = 2 * l - q;
      const f = (t) => {
        if (t < 0) t += 1; if (t > 1) t -= 1;
        if (t < 1 / 6) return p + (q - p) * 6 * t;
        if (t < 1 / 2) return q;
        if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
        return p;
      };
      r = f(h + 1 / 3); g = f(h); b = f(h - 1 / 3);
    }
    return [r * 255, g * 255, b * 255];
  }
  const hueRot = (r, g, b, deg) => {
    const [h, s, l] = rgbToHsl(r, g, b);
    const [R, G, B] = hslToRgb(h + deg, s, l);
    return [clamp(R), clamp(G), clamp(B)];
  };
  const ramp = (t, stops) => { // t 0..1, stops [[r,g,b],...] evenly spaced
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    const seg = (stops.length - 1) * t;
    const i = Math.min(stops.length - 2, Math.floor(seg));
    const k = smooth(seg - i);
    const a = stops[i], b2 = stops[i + 1];
    return [lerp(a[0], b2[0], k), lerp(a[1], b2[1], k), lerp(a[2], b2[2], k)];
  };
  const L = window.T2S_LOOKS || (window.T2S_LOOKS = []);
  const add = (id, name, cat, grade, fx) => { if (!L.find((q) => q.id === id)) L.push({ id, name, cat, grade, fx: fx || null }); };

  // ---------- Spectra: print & analog machinery ----------
  add("newsprint", "Newsprint", "Spectra", (r, g, b) => {
    const v = bw(r, g, b, 0.35, 0.5, 0.15);
    const c = sCurve(v, 0.45);
    return [c, c, c];
  }, { half: 75, grain: 20 });
  add("riso-pop", "Riso Pop", "Spectra", (r, g, b) => {
    const [R, G, B] = sat(r, g, b, 1.35);
    return [sCurve(R, 0.3), sCurve(G, 0.3), sCurve(B, 0.3)];
  }, { half: 35 });
  add("xerox", "Xerox", "Spectra", (r, g, b) => {
    const v = bw(r, g, b, 0.4, 0.4, 0.2);
    const c = sCurve(v, 0.5);
    return [c, c, c];
  }, { poster: 4, grain: 30 });
  add("sabattier", "Sabattier", "Spectra", (r, g, b) => {
    const v = luma(r, g, b);
    const edge = Math.abs(v - 128) / 128; // glow along mid-tones
    return [clamp(solar(r) + edge * 30), clamp(solar(g) + edge * 30), clamp(solar(b) + edge * 30)];
  }, { vignette: 35 });

  // ---------- Spectra: broadcast damage ----------
  add("vhs", "VHS Tracking", "Spectra", (r, g, b) => {
    const [R, G, B] = warm(r, g, b, 0.5);
    return sat(R, G, B, 1.3);
  }, { scan: 60, shift: 3 });
  add("arcade", "Arcade 83", "Spectra", (r, g, b) => {
    const [R, G, B] = sat(r, g, b, 1.5);
    return [sCurve(R, 0.35), sCurve(G, 0.35), sCurve(B, 0.35)];
  }, { scan: 35 });
  add("nightops", "Night Ops", "Spectra", (r, g, b) => {
    const v = luma(r, g, b) / 255;
    return [clamp(v * 90), clamp(v * 275), clamp(v * 95)];
  }, { scan: 45, grain: 25 });
  add("glitchave", "Glitch Avenue", "Spectra", (r, g, b) => {
    const [R, G, B] = sat(r, g, b, 1.3);
    return [sCurve(R, 0.5), sCurve(G, 0.45), sCurve(B, 0.5)];
  }, { shift: 8, scan: 25 });
  add("anaglyph", "Anaglyph Ghost", "Spectra", (r, g, b) => {
    const v = luma(r, g, b);
    const R = lerp(r, v, 0.55), G = lerp(g, v, 0.55), B = lerp(b, v, 0.55);
    return [sCurve(R, 0.4), sCurve(G, 0.4), sCurve(B, 0.4)];
  }, { shift: 6 });

  // ---------- Spectra: mirrors & mosaics ----------
  add("rorschach", "Rorschach", "Spectra", (r, g, b) => {
    const v = bw(r, g, b, 0.4, 0.4, 0.2);
    const c = sCurve(v, 0.7);
    return [c, c, c];
  }, { mirror: 100 });
  add("mirrorpond", "Mirrorpond", "Spectra", (r, g, b) => {
    let [R, G, B] = cool(r, g, b, 0.6);
    return [sCurve(R, 0.3), sCurve(G, 0.3), sCurve(B, 0.35)];
  }, { mirror: 55 });
  add("mosaic", "Mosaic Dreams", "Spectra", (r, g, b) => {
    let R = lift(r, 0.3), G = lift(g, 0.3), B = lift(b, 0.3);
    [R, G, B] = warm(R, G, B, 0.3);
    return sat(R, G, B, 1.15);
  }, { pixel: 10 });
  add("eightbit", "8-Bit Hero", "Spectra", (r, g, b) => {
    const [R, G, B] = sat(r, g, b, 1.6);
    return [sCurve(R, 0.4), sCurve(G, 0.4), sCurve(B, 0.4)];
  }, { pixel: 8 });

  // ---------- Spectra: light & heat maps (invented) ----------
  add("sunbleed", "Sunbleed", "Spectra", (r, g, b) => {
    let [R, G, B] = warm(r, g, b, 0.7);
    R = lift(R, 0.4); G = lift(G, 0.35); B = lift(B, 0.25);
    return sat(R, G, B, 1.2);
  }, { leak: 70, leakVar: 1, vignette: 30 });
  add("filmleak", "Leak 79", "Spectra", (r, g, b) => {
    const t = 1 - luma(r, g, b) / 255;
    let R = clamp(r - 20 * t), G = clamp(g + 8 * t), B = clamp(b + 16 * t);
    [R, G, B] = warm(R, G, B, 0.3);
    return [R, G, B];
  }, { leak: 55, leakVar: 2 });
  add("thermal", "Thermal Scope", "Spectra", (r, g, b) => {
    const t = luma(r, g, b) / 255;
    return ramp(t, [[13, 20, 80], [20, 110, 200], [40, 200, 160], [120, 220, 80], [250, 200, 40], [250, 60, 30]]);
  });
  add("magma", "Magma Chamber", "Spectra", (r, g, b) => {
    const t = luma(r, g, b) / 255;
    return ramp(t, [[5, 2, 8], [110, 12, 8], [235, 90, 15], [255, 200, 110], [255, 250, 235]]);
  });
  add("deepsea", "Deepsea Sonar", "Spectra", (r, g, b) => {
    const t = luma(r, g, b) / 255;
    return ramp(t, [[2, 8, 25], [8, 60, 120], [20, 150, 170], [150, 235, 220]]);
  });
  add("ultraviolet", "Ultraviolet", "Spectra", (r, g, b) => {
    const t = luma(r, g, b) / 255;
    return ramp(t, [[8, 4, 30], [70, 20, 140], [150, 80, 230], [225, 200, 255]]);
  });
  add("xray", "X-Ray Plate", "Spectra", (r, g, b) => {
    const v = 255 - luma(r, g, b);
    return [clamp(v * 0.75 + 20), clamp(v * 0.9 + 30), clamp(v + 40)];
  });
  add("blueprint", "Blueprint", "Spectra", (r, g, b) => {
    const t = 1 - luma(r, g, b) / 255;
    const k = smooth(t);
    return [lerp(15, 220, k), lerp(40, 235, k), lerp(110, 255, k)];
  });

  // ---------- Spectra: chromatic experiments (invented) ----------
  add("acid", "Acid House", "Spectra", (r, g, b) => sat(...hueRot(r, g, b, 120), 1.4));
  add("dayglo", "Dayglo", "Spectra", (r, g, b) => {
    const [R, G, B] = hueRot(r, g, b, -70);
    const [R2, G2, B2] = sat(R, G, B, 1.5);
    return [clamp(R2 + 12), clamp(G2 + 12), clamp(B2 + 10)];
  });
  add("chroma-rg", "Chromatica RG", "Spectra", (r, g, b) => sat(g, r, b, 1.2));
  add("chroma-rb", "Aero Inverse", "Spectra", (r, g, b) => sat(b, g, r, 1.2));
  add("cotton", "Cotton Candy", "Spectra", (r, g, b) => {
    const t = luma(r, g, b) / 255;
    const R = clamp(r + 34 * t - 12 * (1 - t));
    const G = clamp(g + 6 * t - 4 * (1 - t));
    const B = clamp(b + 26 * (1 - t) - 8 * t);
    return [lift(R, 0.35), lift(G, 0.35), lift(B, 0.35)];
  });
  add("matcha", "Matcha", "Spectra", (r, g, b) => {
    let R = clamp(r * 0.94), G = clamp(g * 1.05 + 8), B = clamp(b * 0.9);
    R = lift(R, 0.25); G = lift(G, 0.25); B = lift(B, 0.25);
    return [R, G, B];
  });

  // ---------- Spectra: social-era translations (after CSSGram's recipes) ----------
  add("aden-day", "Aden Day", "Spectra", (r, g, b) => {
    // hue-rotate(-20) contrast(.9) saturate(.85) brightness(1.2) + darken red wash
    let [R, G, B] = hueRot(r, g, b, -20);
    R = clamp(128 + (R - 128) * 0.9); G = clamp(128 + (G - 128) * 0.9); B = clamp(128 + (B - 128) * 0.9);
    [R, G, B] = sat(R, G, B, 0.85);
    R = clamp(R * 1.2); G = clamp(G * 1.2); B = clamp(B * 1.2);
    const t = 1 - luma(R, G, B) / 255;
    return [clamp(R - 26 * t), G, B]; // darken-mode red gradient from the left
  });
  add("ludwig-w", "Ludwig Warm", "Spectra", (r, g, b) => {
    let [R, G, B] = warm(r, g, b, 0.55);
    R = clamp(R * 1.06 + 6);
    return [sCurve(R, 0.45), sCurve(G, 0.4), sCurve(B, 0.35)];
  });
  add("reyes", "Reyes Dust", "Spectra", (r, g, b) => {
    let [R, G, B] = warm(r, g, b, 0.65);
    R = lift(R, 0.55); G = lift(G, 0.5); B = lift(B, 0.45);
    return sat(R, G, B, 0.8);
  }, { vignette: 20 });
  add("moonlite", "Moonlite", "Spectra", (r, g, b) => {
    const v = sCurve(bw(r, g, b, 0.35, 0.45, 0.2), 0.45);
    return [clamp(v * 0.94), clamp(v * 0.97), clamp(v * 1.05)];
  });

  // ---------- B&W: alternative processes ----------
  add("ambrotype", "Ambrotype", "B&W", (r, g, b) => {
    const v = bw(r, g, b, 0.4, 0.42, 0.18);
    const c = clamp(v * 0.82 + 12);
    return [clamp(c * 1.05), clamp(c * 0.98), clamp(c * 0.88)];
  }, { vignette: 45, grain: 25, fade: 20 });
  add("tintype", "Tintype Cold", "B&W", (r, g, b) => {
    const v = bw(r, g, b, 0.38, 0.42, 0.2);
    const c = clamp(v * 0.85 + 10);
    return [clamp(c * 0.92), clamp(c * 0.97), clamp(c * 1.06)];
  }, { vignette: 45, grain: 25 });
  add("inkwash", "Ink Wash", "B&W", (r, g, b) => {
    const v = bw(r, g, b, 0.42, 0.4, 0.18);
    const c = sCurve(v, 0.55);
    return [lift(clamp(c * 1.03), 0.3), lift(clamp(c * 0.99), 0.3), lift(clamp(c * 0.93), 0.3)];
  });
  add("silver", "Silver Gelatin", "B&W", (r, g, b) => {
    const v = bw(r, g, b, 0.36, 0.46, 0.18);
    return [clamp(v * 1.01 + 2), clamp(v + 1), clamp(v * 0.99)];
  }, { grain: 15 });

  // ---------- Duotone: new inks ----------
  add("duo-copperplate", "Duotone Copperplate", "Duotone", (r, g, b) => duo(r, g, b, [70, 30, 10], [250, 195, 140]));
  add("tri-rose", "Tritone Rose", "Duotone", (r, g, b) => tri(r, g, b, [40, 8, 25], [200, 120, 140], [255, 230, 220]));
  add("duo-uv", "Duotone Ultraviolet", "Duotone", (r, g, b) => duo(r, g, b, [25, 8, 60], [200, 170, 255]));
  // ---------- Mined from Picsart/Lumii teardowns: exact ported math ----------
  add("crosslight", "Cross Light", "Film", (r, g, b) => {
    const q = (x, k2, k1, k0) => clamp(k2 * x * x + k1 * x + k0);
    return [q(r, -0.0049211006, 2.7067721, -111.83952),
      q(g, -0.0019713987, 1.408589, 0),
      q(b, -0.00044460205, 0.65847158, 66)];
  });
  add("lomopop", "Lomo Pop", "Film", (r, g, b) => {
    const corr = (v, mode, amt) => {
      if (mode === 2) { const s = 1 / (1 + 2 * amt);
        return v < 128 ? 128 * Math.pow(v / 128, s) : 256 - 128 * Math.pow(2 - v / 128, s); }
      const s = 1 + 2 * amt;
      return v < 128 ? 128 * Math.pow(v / 128, s) : 256 - 128 * Math.pow(2 - v / 128, s);
    };
    const st = (v) => clamp((v - 32) / (223 - 32) * 255);
    return [clamp(corr(st(r), 2, 0.5)), clamp(corr(st(g), 5, 0.5)), clamp(corr(st(b), 2, 0.5))];
  }, { vignette: 50 });
  add("gradmap", "Gradient Violet", "Style", (r, g, b) => {
    const t = luma(r, g, b) / 255;
    const c0 = [111, 21, 108], c1 = [0, 96, 27], c2 = [253, 124, 0];
    const mx = (a, b2, k) => [lerp(a[0], b2[0], k), lerp(a[1], b2[1], k), lerp(a[2], b2[2], k)];
    return t < 0.5 ? mx(c0, c1, t * 2) : mx(c1, c2, (t - 0.5) * 2);
  });
  add("split3", "Split Tone", "Film", (r, g, b) => {
    const l = luma(r, g, b) / 255;
    const sh = (1 - l) * (1 - l), mid = 1 - Math.abs(l - 0.5) * 2, hi = l * l;
    return [clamp(r - 20 * mid + 18 * hi),
      clamp(g + 36 * sh + 40 * mid - 17 * hi),
      clamp(b - 24 * hi)];
  });
  add("morandi", "Morandi", "Film", (r, g, b) => {
    const v = luma(r, g, b);
    return [clamp(lift(lerp(r, v, 0.45) + 8, 0.25)),
      clamp(lift(lerp(g, v, 0.45) + 6, 0.25)),
      clamp(lift(lerp(b, v, 0.45) + 2, 0.25))];
  });
  add("ccd", "CCD Flash", "Film", (r, g, b) => {
    return [clamp(sCurve(r, 0.35) - 6), clamp(sCurve(g, 0.35)), clamp(sCurve(b, 0.35) + 10)];
  });
  add("nineties", "90s Flash", "Film", (r, g, b) => {
    const R = lift(r, 0.5) + 14, G = lift(g, 0.5) + 8, B = lift(b, 0.5) - 6;
    const v = luma(R, G, B);
    return [clamp(lerp(R, v, 0.15)), clamp(lerp(G, v, 0.15)), clamp(lerp(B, v, 0.15))];
  }, { grain: 35 });
  add("misty", "Misty", "Film", (r, g, b) => {
    const R = lift(r, 0.7) - 10, G = lift(g, 0.7) - 2, B = lift(b, 0.7) + 12;
    const v = luma(R, G, B);
    return [clamp(lerp(R, v, 0.2)), clamp(lerp(G, v, 0.2)), clamp(lerp(B, v, 0.2))];
  });
  add("amber", "Amber Hour", "Warm", (r, g, b) => {
    const w = warm(r, g, b, 0.7);
    const t = luma(r, g, b) / 255;
    return [clamp(w[0] + 18 * t), clamp(w[1] + 8 * t), clamp(w[2] - 4 * t)];
  });
  add("eurofade", "Euro Fade", "Film", (r, g, b) => {
    const R = lift(r, 0.45) - 12, G = lift(g, 0.45), B = lift(b, 0.45) + 14;
    const v = luma(R, G, B);
    return [clamp(lerp(R, v, 0.25)), clamp(lerp(G, v, 0.25)), clamp(lerp(B, v, 0.25))];
  });
  add("yummy", "Yummy", "Warm", (r, g, b) => {
    const v = luma(r, g, b);
    return [clamp(sCurve(v + (r - v) * 1.3 + 12, 0.25)),
      clamp(sCurve(v + (g - v) * 1.2 + 4, 0.25)),
      clamp(sCurve(v + (b - v) * 1.1 - 8, 0.25))];
  });
  add("neonedge", "Neon Edge", "Spectra", (r, g, b) => {
    return [clamp(sCurve(r, 0.3) - 8), clamp(sCurve(g, 0.3) - 8), clamp(sCurve(b, 0.3))];
  }, { edge: 100 });
  add("noir", "Noir", "B&W", (r, g, b) => {
    const v = 0.3 * r + 0.55 * g + 0.15 * b;
    const c = sCurve(v, 0.4);
    return [clamp(c), clamp(c), clamp(c)];
  }, { grain: 25 });
})();
