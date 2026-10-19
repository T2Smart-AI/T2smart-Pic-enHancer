/* T2Smart-PicHancer — look recipes part 2: film stocks, B&W, duotones, cinematic,
   seasonal, portrait, nature, and 33 pre-baked artistic Style grades.
   Self-contained helpers (mirrors looks.js). Appends to window.T2S_LOOKS. */
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
  const tealSh = (r, g, b, a) => {
    const t = 1 - luma(r, g, b) / 255;
    return [clamp(r - 22 * a * t), clamp(g + 10 * a * t), clamp(b + 18 * a * t)];
  };
  const orHL = (r, g, b, a) => {
    const t = luma(r, g, b) / 255;
    return [clamp(r + 20 * a * t), clamp(g + 6 * a * t), clamp(b - 14 * a * t)];
  };
  const duo = (r, g, b, dk, lt) => {
    const k = smooth(luma(r, g, b) / 255);
    return [lerp(dk[0], lt[0], k), lerp(dk[1], lt[1], k), lerp(dk[2], lt[2], k)];
  };
  const bw = (r, g, b, wr, wg, wb2) => clamp(wr * r + wg * g + wb2 * b);
  const sat = (r, g, b, k) => { const v = luma(r, g, b); return [clamp(v + (r - v) * k), clamp(v + (g - v) * k), clamp(v + (b - v) * k)]; };
  const L = window.T2S_LOOKS || (window.T2S_LOOKS = []);
  const add = (id, name, cat, grade, fx) => { if (!L.find((q) => q.id === id)) L.push({ id, name, cat, grade, fx: fx || null }); };

  // ---------- film stocks ----------
  add("portra400", "Portra 400", "Film", (r, g, b) => {
    let [R, G, B] = warm(r, g, b, 0.35);
    R = lift(R, 0.4); G = lift(G, 0.35); B = lift(B, 0.25);
    const v = luma(R, G, B);
    return [lerp(R, v, 0.08) + 4, lerp(G, v, 0.08), lerp(B, v, 0.1) - 4];
  });
  add("ektar100", "Ektar 100", "Film", (r, g, b) => {
    const v = luma(r, g, b);
    let R = clamp(v + (r - v) * 1.35), G = clamp(v + (g - v) * 1.3), B = clamp(v + (b - v) * 1.25);
    [R, G, B] = warm(R, G, B, 0.25);
    return [sCurve(R, 0.3), sCurve(G, 0.3), sCurve(B, 0.3)];
  });
  add("gold200", "Gold 200", "Film", (r, g, b) => {
    let [R, G, B] = warm(r, g, b, 0.7);
    [R, G, B] = orHL(R, G, B, 0.4);
    return [sCurve(lift(R, 0.3), 0.25), sCurve(lift(G, 0.3), 0.25), sCurve(lift(B, 0.25), 0.2)];
  });
  add("superia800", "Superia 800", "Film", (r, g, b) => {
    let R = clamp(r * 1.02 + 6), G = clamp(g * 1.06), B = clamp(b * 1.04 - 2);
    return [sCurve(R, 0.4), sCurve(G, 0.45), sCurve(B, 0.4)];
  }, { grain: 30 });
  add("cinestill800", "CineStill 800", "Film", (r, g, b) => {
    let [R, G, B] = tealSh(r, g, b, 0.4);
    R = lift(R + 14, 0.3); G = lift(G + 4, 0.3); B = lift(B - 6, 0.3);
    return [R, G, B];
  }, { grain: 25 });
  add("fujipro", "Fuji Pro", "Film", (r, g, b) => {
    let R = clamp(r * 0.98), G = clamp(g * 1.05 + 4), B = clamp(b * 1.02);
    return [sCurve(R, 0.35), sCurve(G, 0.3), sCurve(B, 0.35)];
  });
  add("tri-x", "Tri-X", "B&W", (r, g, b) => {
    const v = bw(r, g, b, 0.32, 0.58, 0.1);
    return [sCurve(v, 0.6), sCurve(v, 0.6), sCurve(v, 0.6)];
  }, { grain: 40 });
  add("hp5", "HP5", "B&W", (r, g, b) => {
    const v = lift(bw(r, g, b, 0.3, 0.6, 0.1), 0.25);
    return [sCurve(v, 0.5), sCurve(v, 0.5), sCurve(v, 0.5)];
  }, { grain: 30 });
  add("delta3200", "Delta 3200", "B&W", (r, g, b) => {
    const v = bw(r, g, b, 0.35, 0.5, 0.15);
    return [sCurve(v, 0.45), sCurve(v, 0.45), sCurve(v, 0.45)];
  }, { grain: 55 });
  add("xp2", "XP2 Mono", "B&W", (r, g, b) => {
    const v = luma(r, g, b);
    return [sCurve(v, 0.35), sCurve(v, 0.35), sCurve(v, 0.35)];
  });
  add("ektachrome", "Ektachrome", "Film", (r, g, b) => {
    let [R, G, B] = cool(r, g, b, 0.3);
    const v = luma(R, G, B);
    R = clamp(v + (R - v) * 1.25); G = clamp(v + (G - v) * 1.25); B = clamp(v + (B - v) * 1.3);
    return [sCurve(R, 0.5), sCurve(G, 0.5), sCurve(B, 0.5)];
  });
  add("velvia", "Velvia", "Film", (r, g, b) => {
    const v = luma(r, g, b);
    let R = clamp(v + (r - v) * 1.55), G = clamp(v + (g - v) * 1.45), B = clamp(v + (b - v) * 1.4);
    return [sCurve(R, 0.45), sCurve(G, 0.4), sCurve(B, 0.45)];
  });
  add("ultramax", "UltraMax", "Film", (r, g, b) => {
    let [R, G, B] = warm(...sat(r, g, b, 1.3), 0.4);
    return [sCurve(lift(R, 0.25), 0.3), sCurve(lift(G, 0.25), 0.3), sCurve(lift(B, 0.2), 0.25)];
  });
  add("lomo100", "Lomo 100", "Film", (r, g, b) => {
    let R = clamp(r * 1.1 + 4), G = clamp(g * 1.02), B = clamp(b * 0.92 + 6);
    return [sCurve(R, 0.5), sCurve(G, 0.45), sCurve(B, 0.4)];
  }, { vignette: 45 });
  add("revolog", "RevoGold", "Film", (r, g, b) => {
    let [R, G, B] = warm(r, g, b, 0.9);
    [R, G, B] = orHL(R, G, B, 0.5);
    return [lift(R, 0.3), lift(G, 0.25), lift(B, 0.2)];
  });

  // ---------- B&W channel mixers & tones ----------
  add("bw-red", "B&W Red Filter", "B&W", (r, g, b) => { const v = bw(r, g, b, 0.7, 0.2, 0.1); return [sCurve(v, 0.5), sCurve(v, 0.5), sCurve(v, 0.5)]; });
  add("bw-orange", "B&W Orange", "B&W", (r, g, b) => { const v = bw(r, g, b, 0.5, 0.35, 0.15); return [sCurve(v, 0.5), sCurve(v, 0.5), sCurve(v, 0.5)]; });
  add("bw-yellow", "B&W Yellow", "B&W", (r, g, b) => { const v = bw(r, g, b, 0.4, 0.45, 0.15); return [sCurve(v, 0.45), sCurve(v, 0.45), sCurve(v, 0.45)]; });
  add("bw-green", "B&W Green", "B&W", (r, g, b) => { const v = bw(r, g, b, 0.25, 0.6, 0.15); return [sCurve(v, 0.45), sCurve(v, 0.45), sCurve(v, 0.45)]; });
  add("selenium", "Selenium", "B&W", (r, g, b) => {
    const v = luma(r, g, b);
    const t = 1 - v / 255;
    return [clamp(v - 8 * t), clamp(v + 4 * t), clamp(v + 12 * t)];
  });
  add("platinum", "Platinum", "B&W", (r, g, b) => {
    const v = lift(luma(r, g, b), 0.35);
    return [clamp(v + 10), clamp(v + 6), clamp(v - 2)];
  });
  add("cyanotype", "Cyanotype", "B&W", (r, g, b) => duo(r, g, b, [8, 30, 70], [200, 225, 240]));
  add("vanDyke", "Van Dyke", "B&W", (r, g, b) => duo(r, g, b, [30, 18, 10], [210, 180, 140]));
  add("lith", "Lith Print", "B&W", (r, g, b) => {
    const v = bw(r, g, b, 0.3, 0.55, 0.15);
    return [sCurve(clamp(v * 1.05 + 6), 0.6), sCurve(clamp(v * 0.95), 0.6), sCurve(clamp(v * 0.85), 0.6)];
  });
  add("pushed2", "Pushed +2", "B&W", (r, g, b) => {
    const v = bw(r, g, b, 0.33, 0.55, 0.12);
    return [sCurve(clamp(v * 1.15), 0.55), sCurve(clamp(v * 1.15), 0.55), sCurve(clamp(v * 1.15), 0.55)];
  }, { grain: 35 });
  add("fadedbw", "Faded Press", "B&W", (r, g, b) => {
    const v = lift(luma(r, g, b), 0.55);
    return [lerp(v, 128, 0.12), lerp(v, 128, 0.12), lerp(v, 128, 0.12)];
  });
  add("softbw", "Soft Portrait B&W", "B&W", (r, g, b) => {
    const v = lift(bw(r, g, b, 0.3, 0.55, 0.15), 0.4);
    return [sCurve(v, 0.25), sCurve(v, 0.25), sCurve(v, 0.25)];
  });

  // ---------- duotones ----------
  add("duo-rose", "Duotone Rose", "Duotone", (r, g, b) => duo(r, g, b, [45, 8, 25], [255, 205, 215]));
  add("duo-teal", "Duotone Teal", "Duotone", (r, g, b) => duo(r, g, b, [5, 40, 50], [190, 240, 235]));
  add("duo-forest", "Duotone Forest", "Duotone", (r, g, b) => duo(r, g, b, [8, 35, 15], [210, 235, 190]));
  add("duo-plum", "Duotone Plum", "Duotone", (r, g, b) => duo(r, g, b, [40, 10, 60], [225, 190, 240]));
  add("duo-copper", "Duotone Copper", "Duotone", (r, g, b) => duo(r, g, b, [60, 25, 8], [250, 200, 150]));
  add("duo-slate", "Duotone Slate", "Duotone", (r, g, b) => duo(r, g, b, [25, 30, 40], [205, 215, 230]));
  add("duo-mint", "Duotone Mint", "Duotone", (r, g, b) => duo(r, g, b, [15, 55, 45], [215, 250, 235]));
  add("duo-crimson", "Duotone Crimson", "Duotone", (r, g, b) => duo(r, g, b, [70, 5, 10], [250, 180, 170]));
  add("duo-gold", "Duotone Gold", "Duotone", (r, g, b) => duo(r, g, b, [55, 35, 5], [250, 225, 170]));
  add("duo-midnight", "Duotone Midnight", "Duotone", (r, g, b) => duo(r, g, b, [5, 8, 35], [170, 190, 250]));
  add("duo-coral", "Duotone Coral", "Duotone", (r, g, b) => duo(r, g, b, [65, 20, 15], [255, 215, 195]));
  add("duo-olive", "Duotone Olive", "Duotone", (r, g, b) => duo(r, g, b, [40, 42, 12], [235, 235, 195]));

  // ---------- matte & fade ----------
  add("matte3", "Matte 3 Cool", "Matte", (r, g, b) => {
    let [R, G, B] = cool(r, g, b, 0.3);
    R = lift(R, 0.6); G = lift(G, 0.55); B = lift(B, 0.5);
    return [R, G, B];
  });
  add("fade2", "Fade 2", "Matte", (r, g, b) => {
    const v = luma(r, g, b);
    return [lerp(lift(r, 0.5), v, 0.25), lerp(lift(g, 0.5), v, 0.25), lerp(lift(b, 0.55), v, 0.25)];
  });
  add("fade3", "Fade 3 Cream", "Matte", (r, g, b) => [lift(r, 0.45) + 6, lift(g, 0.4) + 4, lift(b, 0.35)]);
  add("mattebw", "Matte B&W", "Matte", (r, g, b) => {
    const v = lift(luma(r, g, b), 0.7);
    return [v, v, v];
  });
  add("washed", "Washed Denim", "Matte", (r, g, b) => {
    let [R, G, B] = cool(r, g, b, 0.4);
    const v = luma(R, G, B);
    return [lerp(lift(R, 0.45), v, 0.3), lerp(lift(G, 0.45), v, 0.3), lerp(lift(B, 0.4), v, 0.3)];
  });
  add("paperwhite", "Paperwhite", "Matte", (r, g, b) => [clamp(r * 0.92 + 30), clamp(g * 0.92 + 28), clamp(b * 0.9 + 24)]);

  // ---------- cinematic variants ----------
  add("cine-green", "Cine Green", "Portrait", (r, g, b) => {
    let R = clamp(r - 12), G = clamp(g + 8), B = clamp(b - 4);
    R = lift(R, 0.25); G = lift(G, 0.25); B = lift(B, 0.28);
    return [sCurve(R, 0.5), sCurve(G, 0.45), sCurve(B, 0.45)];
  }, { vignette: 25 });
  add("cine-magenta", "Cine Magenta", "Portrait", (r, g, b) => {
    let [R, G, B] = orHL(...tealSh(r, g, b, 0.5), 0.4);
    R = clamp(R + 10); B = clamp(B + 12);
    R = lift(R, 0.25); G = lift(G, 0.25); B = lift(B, 0.25);
    return [sCurve(R, 0.45), sCurve(G, 0.4), sCurve(B, 0.45)];
  }, { vignette: 25 });
  add("cine-noir", "Cine Noir", "Portrait", (r, g, b) => {
    const v = luma(r, g, b);
    let R = lerp(r, v, 0.55), G = lerp(g, v, 0.55), B = lerp(b, v, 0.5);
    [R, G, B] = tealSh(R, G, B, 0.5);
    return [sCurve(R, 0.55), sCurve(G, 0.55), sCurve(B, 0.55)];
  }, { vignette: 30 });
  add("cine-day", "Cine Day", "Portrait", (r, g, b) => {
    let [R, G, B] = cool(...sat(r, g, b, 0.85), 0.4);
    return [sCurve(lift(R, 0.2), 0.4), sCurve(lift(G, 0.2), 0.4), sCurve(lift(B, 0.2), 0.4)];
  });
  add("cine-night", "Cine Night", "Portrait", (r, g, b) => {
    let [R, G, B] = cool(r, g, b, 0.9);
    [R, G, B] = tealSh(R, G, B, 0.6);
    return [sCurve(clamp(R * 0.92), 0.5), sCurve(clamp(G * 0.92), 0.5), sCurve(clamp(B * 0.95), 0.5)];
  }, { vignette: 40 });
  add("cine-gold", "Cine Gold", "Portrait", (r, g, b) => {
    let [R, G, B] = warm(...orHL(r, g, b, 0.8), 0.7);
    return [sCurve(lift(R, 0.2), 0.45), sCurve(lift(G, 0.2), 0.4), sCurve(lift(B, 0.2), 0.35)];
  }, { vignette: 20 });
  add("cine-steel", "Cine Steel", "Portrait", (r, g, b) => {
    let [R, G, B] = cool(r, g, b, 0.7);
    const v = luma(R, G, B);
    R = lerp(R, v, 0.25); G = lerp(G, v, 0.25); B = lerp(B, v, 0.2);
    return [sCurve(R, 0.55), sCurve(G, 0.5), sCurve(B, 0.5)];
  });
  add("cine-ember", "Cine Ember", "Portrait", (r, g, b) => {
    let [R, G, B] = orHL(...tealSh(r, g, b, 0.8), 0.9);
    return [sCurve(R, 0.5), sCurve(G, 0.45), sCurve(B, 0.4)];
  }, { vignette: 30 });

  // ---------- HDR ----------
  add("hdr3", "HDR Detail", "HDR", (r, g, b) => {
    const v = luma(r, g, b);
    let R = clamp(v + (r - v) * 1.15), G = clamp(v + (g - v) * 1.15), B = clamp(v + (b - v) * 1.15);
    return [sCurve(R, 0.65), sCurve(G, 0.65), sCurve(B, 0.65)];
  });
  add("hdr4", "HDR Sunset", "HDR", (r, g, b) => {
    let [R, G, B] = warm(...orHL(r, g, b, 0.5), 0.4);
    const v = luma(R, G, B);
    R = clamp(v + (R - v) * 1.25); G = clamp(v + (G - v) * 1.25); B = clamp(v + (B - v) * 1.25);
    return [sCurve(R, 0.55), sCurve(G, 0.55), sCurve(B, 0.55)];
  });
  add("hdr5", "HDR Mono", "HDR", (r, g, b) => {
    const v = bw(r, g, b, 0.33, 0.55, 0.12);
    return [sCurve(clamp(v * 1.05), 0.65), sCurve(clamp(v * 1.05), 0.65), sCurve(clamp(v * 1.05), 0.65)];
  });
  add("hdr6", "HDR Pastel", "HDR", (r, g, b) => {
    let R = lift(r, 0.4), G = lift(g, 0.4), B = lift(b, 0.4);
    const v = luma(R, G, B);
    return [clamp(v + (R - v) * 1.2), clamp(v + (G - v) * 1.2), clamp(v + (B - v) * 1.2)];
  });
  add("dramatic", "Dramatic Sky", "HDR", (r, g, b) => {
    let [R, G, B] = cool(r, g, b, 0.5);
    [R, G, B] = tealSh(R, G, B, 0.4);
    return [sCurve(R, 0.65), sCurve(G, 0.6), sCurve(B, 0.6)];
  }, { vignette: 30 });
  add("grunge", "Grunge", "HDR", (r, g, b) => {
    const v = luma(r, g, b);
    let R = clamp(v + (r - v) * 1.2), G = clamp(v + (g - v) * 1.1), B = clamp(v + (b - v) * 1.0);
    [R, G, B] = warm(R, G, B, 0.3);
    return [sCurve(R, 0.7), sCurve(G, 0.65), sCurve(B, 0.6)];
  }, { grain: 20, vignette: 35 });

  // ---------- seasonal ----------
  add("spring", "Spring Bloom", "Nature", (r, g, b) => {
    let R = clamp(r * 1.03 + 8), G = clamp(g * 1.06 + 6), B = clamp(b * 1.0 + 8);
    [R, G, B] = warm(R, G, B, 0.2);
    return [lift(R, 0.3), lift(G, 0.3), lift(B, 0.3)];
  });
  add("winter", "Winter Frost", "Nature", (r, g, b) => {
    let [R, G, B] = cool(r, g, b, 0.6);
    R = lift(R, 0.3); G = lift(G, 0.3); B = lift(B, 0.3);
    const v = luma(R, G, B);
    return [lerp(R, v, 0.1), lerp(G, v, 0.1), lerp(B, v, 0.05)];
  });
  add("monsoon", "Monsoon", "Nature", (r, g, b) => {
    let [R, G, B] = tealSh(...cool(r, g, b, 0.4), 0.5);
    return [sCurve(lift(R, 0.25), 0.4), sCurve(lift(G, 0.25), 0.4), sCurve(lift(B, 0.25), 0.4)];
  });
  add("harvest", "Harvest Gold", "Nature", (r, g, b) => {
    let [R, G, B] = warm(...orHL(r, g, b, 0.7), 0.8);
    return [sCurve(R, 0.35), sCurve(G, 0.3), sCurve(B, 0.25)];
  }, { vignette: 20 });
  add("evergreen", "Evergreen", "Nature", (r, g, b) => {
    let R = clamp(r * 0.92), G = clamp(g * 1.1 + 4), B = clamp(b * 0.95);
    return [sCurve(R, 0.4), sCurve(G, 0.35), sCurve(B, 0.4)];
  });
  add("desert", "Desert Noon", "Nature", (r, g, b) => {
    let [R, G, B] = warm(...sat(r, g, b, 1.15), 0.7);
    return [clamp(R * 1.04 + 6), clamp(G * 1.03 + 4), clamp(B * 1.0)];
  });
  add("tundra", "Tundra", "Nature", (r, g, b) => {
    let [R, G, B] = cool(r, g, b, 0.8);
    const v = luma(R, G, B);
    return [lerp(R, v, 0.2), lerp(G, v, 0.15), lerp(B, v, 0.1)];
  });
  add("rainforest", "Rainforest", "Nature", (r, g, b) => {
    let R = clamp(r * 0.9), G = clamp(g * 1.12 + 6), B = clamp(b * 0.98 + 4);
    [R, G, B] = tealSh(R, G, B, 0.3);
    return [sCurve(R, 0.45), sCurve(G, 0.4), sCurve(B, 0.45)];
  });

  // ---------- portrait ----------
  add("golden-skin", "Golden Hour Skin", "Portrait", (r, g, b) => {
    let [R, G, B] = warm(...orHL(r, g, b, 0.6), 0.6);
    return [sCurve(R, 0.3), sCurve(G, 0.28), sCurve(B, 0.25)];
  });
  add("bronze", "Bronze Glow", "Portrait", (r, g, b) => {
    let [R, G, B] = warm(...sat(r, g, b, 1.15), 0.8);
    return [sCurve(lift(R, 0.2), 0.35), sCurve(lift(G, 0.2), 0.3), sCurve(lift(B, 0.2), 0.25)];
  });
  add("rose", "Rosé", "Portrait", (r, g, b) => {
    let R = clamp(r * 1.04 + 6), G = clamp(g * 0.99 + 2), B = clamp(b * 1.02 + 6);
    return [lift(R, 0.3), lift(G, 0.28), lift(B, 0.3)];
  });
  add("honey", "Honey Light", "Portrait", (r, g, b) => {
    let [R, G, B] = warm(r, g, b, 0.5);
    R = clamp(R * 1.05 + 8); G = clamp(G * 1.03 + 6); B = clamp(B * 1.0 + 2);
    return [R, G, B];
  });
  add("porcelain", "Porcelain", "Portrait", (r, g, b) => {
    let R = lift(clamp(r * 1.02 + 10), 0.35), G = lift(clamp(g * 1.0 + 8), 0.35), B = lift(clamp(b * 1.0 + 6), 0.35);
    const v = luma(R, G, B);
    return [lerp(R, v, 0.15), lerp(G, v, 0.15), lerp(B, v, 0.15)];
  });
  add("sun-kissed", "Sun-Kissed", "Portrait", (r, g, b) => {
    let [R, G, B] = orHL(...warm(...sat(r, g, b, 1.2), 0.5), 0.5);
    return [R, G, B];
  }, { vignette: 15 });
  add("studio", "Studio Clean", "Portrait", (r, g, b) => {
    let R = clamp(r * 1.03 + 6), G = clamp(g * 1.03 + 6), B = clamp(b * 1.02 + 4);
    return [sCurve(R, 0.3), sCurve(G, 0.3), sCurve(B, 0.3)];
  });
  add("moody-port", "Moody Portrait", "Portrait", (r, g, b) => {
    let [R, G, B] = tealSh(r, g, b, 0.5);
    return [sCurve(clamp(R * 0.95), 0.5), sCurve(clamp(G * 0.95), 0.45), sCurve(clamp(B * 0.95), 0.45)];
  }, { vignette: 35 });
  add("fairy", "Fairy Light", "Portrait", (r, g, b) => {
    let R = lift(clamp(r * 1.05 + 12), 0.35), G = lift(clamp(g * 1.03 + 10), 0.35), B = lift(clamp(b * 1.05 + 12), 0.35);
    [R, G, B] = warm(R, G, B, 0.3);
    return [R, G, B];
  });

  // ---------- nature / aerial ----------
  add("aerial", "Aerial Haze Cut", "Nature", (r, g, b) => {
    const v = luma(r, g, b);
    let R = clamp(v + (r - v) * 1.2 + 6), G = clamp(v + (g - v) * 1.2 + 2), B = clamp(v + (b - v) * 1.15 - 6);
    return [sCurve(R, 0.4), sCurve(G, 0.35), sCurve(B, 0.35)];
  });
  add("lagoon", "Lagoon", "Nature", (r, g, b) => {
    let R = clamp(r * 0.9), G = clamp(g * 1.08 + 6), B = clamp(b * 1.12 + 6);
    [R, G, B] = tealSh(R, G, B, 0.3);
    return [sCurve(R, 0.35), sCurve(G, 0.3), sCurve(B, 0.35)];
  });
  add("canyon", "Canyon Red", "Nature", (r, g, b) => {
    let [R, G, B] = warm(...sat(r, g, b, 1.25), 0.6);
    return [sCurve(R, 0.4), sCurve(G, 0.35), sCurve(B, 0.3)];
  });
  add("meadow", "Meadow Fresh", "Nature", (r, g, b) => {
    let R = clamp(r * 0.98), G = clamp(g * 1.08 + 6), B = clamp(b * 0.98 + 2);
    return [lift(R, 0.25), lift(G, 0.25), lift(B, 0.25)];
  });
  add("volcano", "Volcano Ash", "Nature", (r, g, b) => {
    const v = luma(r, g, b);
    let R = lerp(r, v, 0.3) + 8, G = lerp(g, v, 0.3), B = lerp(b, v, 0.35) - 4;
    return [sCurve(R, 0.5), sCurve(G, 0.5), sCurve(B, 0.5)];
  });
  add("glacier", "Glacier Blue", "Nature", (r, g, b) => {
    let R = clamp(r * 0.9), G = clamp(g * 1.0 + 4), B = clamp(b * 1.15 + 6);
    R = lift(R, 0.25); G = lift(G, 0.25); B = lift(B, 0.25);
    return [R, G, B];
  });
  add("badlands", "Badlands", "Nature", (r, g, b) => {
    let [R, G, B] = warm(...orHL(r, g, b, 0.4), 0.5);
    const v = luma(R, G, B);
    R = lerp(R, v, 0.15); G = lerp(G, v, 0.15); B = lerp(B, 0.2 * 255 + 0.8 * B, 0.1);
    return [sCurve(R, 0.4), sCurve(G, 0.35), sCurve(B, 0.35)];
  });
  add("midnight-sun", "Midnight Sun", "Nature", (r, g, b) => {
    let [R, G, B] = warm(...orHL(...cool(r, g, b, 0.3), 0.6), 0.5);
    return [sCurve(R, 0.35), sCurve(G, 0.3), sCurve(B, 0.35)];
  });
  add("storm", "Storm Front", "Nature", (r, g, b) => {
    let [R, G, B] = cool(r, g, b, 0.6);
    [R, G, B] = tealSh(R, G, B, 0.5);
    return [sCurve(clamp(R * 0.95), 0.55), sCurve(clamp(G * 0.95), 0.5), sCurve(clamp(B * 0.95), 0.5)];
  }, { vignette: 25 });

  // ---------- Style: 33 pre-baked artistic grades (style-transfer stand-ins) ----------
  add("style-ukiyoe", "Style · Ukiyo-e", "Style", (r, g, b) => {
    let [R, G, B] = sat(r, g, b, 1.5);
    R = clamp(R * 0.95 + 10); B = clamp(B * 1.05 + 6);
    return [sCurve(R, 0.35), sCurve(G, 0.3), sCurve(B, 0.35)];
  });
  add("style-oilwarm", "Style · Oil Warm", "Style", (r, g, b) => {
    let [R, G, B] = warm(...sat(r, g, b, 1.3), 0.6);
    return [sCurve(R, 0.45), sCurve(G, 0.4), sCurve(B, 0.35)];
  }, { vignette: 25 });
  add("style-oilcool", "Style · Oil Cool", "Style", (r, g, b) => {
    let [R, G, B] = cool(...sat(r, g, b, 1.25), 0.5);
    return [sCurve(R, 0.45), sCurve(G, 0.4), sCurve(B, 0.45)];
  }, { vignette: 25 });
  add("style-water", "Style · Watercolor", "Style", (r, g, b) => {
    const v = luma(r, g, b);
    let R = lerp(lift(r, 0.4), v, 0.2), G = lerp(lift(g, 0.4), v, 0.2), B = lerp(lift(b, 0.4), v, 0.15);
    return [clamp(R + 8), clamp(G + 6), clamp(B + 4)];
  });
  add("style-comic", "Style · Comic Pop", "Style", (r, g, b) => {
    const v = luma(r, g, b);
    let R = clamp(v + (r - v) * 1.7), G = clamp(v + (g - v) * 1.7), B = clamp(v + (b - v) * 1.6);
    return [sCurve(R, 0.55), sCurve(G, 0.55), sCurve(B, 0.55)];
  });
  add("style-neon", "Style · Neon Noir", "Style", (r, g, b) => {
    let [R, G, B] = tealSh(...sat(r, g, b, 1.4), 0.7);
    [R, G, B] = orHL(R, G, B, 0.5);
    return [sCurve(clamp(R * 0.95), 0.5), sCurve(clamp(G * 0.95), 0.45), sCurve(clamp(B * 0.98), 0.5)];
  }, { vignette: 40 });
  add("style-synth", "Style · Synthwave", "Style", (r, g, b) => {
    let R = clamp(r * 1.05 + 4), G = clamp(g * 0.9), B = clamp(b * 1.2 + 8);
    [R, G, B] = orHL(R, G, B, 0.4);
    return [sCurve(R, 0.45), sCurve(G, 0.4), sCurve(B, 0.5)];
  }, { vignette: 30 });
  add("style-aero", "Style · Aerochrome", "Style", (r, g, b) => {
    const t = r; r = clamp(g * 1.1); g = clamp(b * 0.9 + 20); b = clamp(t * 0.85);
    return [sCurve(r, 0.3), sCurve(g, 0.3), sCurve(b, 0.3)];
  });
  add("style-xpro1", "Style · X-Pro I", "Style", (r, g, b) => {
    let R = clamp(r * 1.08 + 2), G = clamp(g * 0.98), B = clamp(b * 1.1 + 4);
    return [sCurve(R, 0.5), sCurve(G, 0.45), sCurve(B, 0.5)];
  }, { vignette: 30 });
  add("style-xpro2", "Style · X-Pro II", "Style", (r, g, b) => {
    let R = clamp(r * 1.05), G = clamp(g * 1.0 + 2), B = clamp(b * 0.9 + 10);
    [R, G, B] = warm(R, G, B, 0.4);
    return [sCurve(R, 0.5), sCurve(G, 0.45), sCurve(B, 0.4)];
  }, { vignette: 35 });
  add("style-bleach1", "Style · Bleach Bypass", "Style", (r, g, b) => {
    const v = luma(r, g, b);
    let R = lerp(r, v, 0.45), G = lerp(g, v, 0.45), B = lerp(b, v, 0.45);
    return [sCurve(clamp(R * 1.03), 0.6), sCurve(clamp(G * 1.03), 0.6), sCurve(clamp(B * 1.03), 0.6)];
  });
  add("style-bleach2", "Style · Bleach Warm", "Style", (r, g, b) => {
    const v = luma(r, g, b);
    let R = lerp(r, v, 0.4), G = lerp(g, v, 0.4), B = lerp(b, v, 0.4);
    [R, G, B] = warm(R, G, B, 0.4);
    return [sCurve(R, 0.55), sCurve(G, 0.5), sCurve(B, 0.45)];
  });
  add("style-lomo1", "Style · Lomo Red", "Style", (r, g, b) => {
    let R = clamp(r * 1.15 + 4), G = clamp(g * 0.95), B = clamp(b * 0.9 + 4);
    return [sCurve(R, 0.5), sCurve(G, 0.45), sCurve(B, 0.4)];
  }, { vignette: 55 });
  add("style-lomo2", "Style · Lomo Blue", "Style", (r, g, b) => {
    let R = clamp(r * 0.9), G = clamp(g * 0.98), B = clamp(b * 1.18 + 4);
    return [sCurve(R, 0.45), sCurve(G, 0.45), sCurve(B, 0.5)];
  }, { vignette: 55 });
  add("style-toy", "Style · Toy Camera", "Style", (r, g, b) => {
    let [R, G, B] = warm(...sat(r, g, b, 1.35), 0.4);
    return [sCurve(R, 0.5), sCurve(G, 0.45), sCurve(B, 0.45)];
  }, { vignette: 65 });
  add("style-pinhole2", "Style · Pinhole II", "Style", (r, g, b) => {
    const v = bw(r, g, b, 0.3, 0.55, 0.15);
    let R = lift(v, 0.4), G = lift(v, 0.38), B = lift(v, 0.35);
    [R, G, B] = warm(R, G, B, 0.3);
    return [R, G, B];
  }, { vignette: 75 });
  add("style-tilt", "Style · Miniature", "Style", (r, g, b) => {
    const v = luma(r, g, b);
    return [clamp(v + (r - v) * 1.5), clamp(v + (g - v) * 1.5), clamp(v + (b - v) * 1.45)];
  });
  add("style-duo-neon", "Style · Neon Duo", "Style", (r, g, b) => duo(r, g, b, [8, 5, 40], [60, 255, 220]));
  add("style-duo-sunset", "Style · Sunset Duo", "Style", (r, g, b) => duo(r, g, b, [50, 10, 40], [255, 160, 60]));
  add("style-poster", "Style · Poster", "Style", (r, g, b) => {
    const q = (v) => Math.floor(v / 64) * 64 + 32;
    return [q(r), q(g), q(b)];
  });
  add("style-solar", "Style · Solarize", "Style", (r, g, b) => {
    const q = (v) => v > 128 ? 255 - (v - 128) : v;
    return [clamp(q(r) + 20), clamp(q(g) + 10), clamp(q(b))];
  });
  add("style-cuprum", "Style · Cuprum", "Style", (r, g, b) => duo(r, g, b, [35, 20, 12], [235, 200, 165]));
  add("style-indigo2", "Style · Indigo Night", "Style", (r, g, b) => {
    let [R, G, B] = cool(r, g, b, 0.8);
    const v = luma(R, G, B);
    R = lerp(R, v, 0.2); B = clamp(B * 1.08);
    return [sCurve(clamp(R * 0.94), 0.5), sCurve(clamp(G * 0.94), 0.45), sCurve(clamp(B * 0.96), 0.5)];
  }, { vignette: 35 });
  add("style-ember2", "Style · Ember Mono", "Style", (r, g, b) => duo(r, g, b, [25, 8, 5], [250, 150, 80]));
  add("style-frost2", "Style · Frost Mono", "Style", (r, g, b) => duo(r, g, b, [20, 30, 45], [200, 230, 250]));
  add("style-sand", "Style · Sandstorm", "Style", (r, g, b) => {
    let [R, G, B] = warm(r, g, b, 0.9);
    const v = luma(R, G, B);
    R = lerp(R, v, 0.2); G = lerp(G, v, 0.2); B = lerp(B, v, 0.25);
    R = lift(R, 0.35); G = lift(G, 0.3); B = lift(B, 0.25);
    return [R, G, B];
  });
  add("style-abyss", "Style · Abyss", "Style", (r, g, b) => {
    let [R, G, B] = tealSh(...cool(r, g, b, 0.9), 0.7);
    return [sCurve(clamp(R * 0.9), 0.55), sCurve(clamp(G * 0.9), 0.5), sCurve(clamp(B * 0.92), 0.55)];
  }, { vignette: 45 });
  add("style-bloom", "Style · Bloom Pop", "Style", (r, g, b) => {
    let R = clamp(r * 1.06 + 12), G = clamp(g * 1.04 + 10), B = clamp(b * 1.02 + 8);
    const v = luma(R, G, B);
    return [clamp(v + (R - v) * 1.3), clamp(v + (G - v) * 1.3), clamp(v + (B - v) * 1.25)];
  });
  add("style-noir2", "Style · Neo Noir", "Style", (r, g, b) => {
    const v = bw(r, g, b, 0.4, 0.45, 0.15);
    let R = clamp(v + 12), G = clamp(v + 4), B = clamp(v + 16);
    return [sCurve(R, 0.6), sCurve(G, 0.6), sCurve(B, 0.6)];
  }, { vignette: 40 });
  add("style-vapor", "Style · Vapor", "Style", (r, g, b) => {
    let R = clamp(r * 1.0 + 10), G = clamp(g * 0.92 + 4), B = clamp(b * 1.12 + 12);
    R = lift(R, 0.3); G = lift(G, 0.28); B = lift(B, 0.3);
    return [R, G, B];
  });
  add("style-giallo", "Style · Giallo", "Style", (r, g, b) => {
    let [R, G, B] = warm(...orHL(r, g, b, 0.7), 0.7);
    R = clamp(R * 1.05); B = clamp(B * 0.9);
    return [sCurve(R, 0.45), sCurve(G, 0.4), sCurve(B, 0.35)];
  }, { vignette: 30 });
  add("style-nordic", "Style · Nordic", "Style", (r, g, b) => {
    let [R, G, B] = cool(r, g, b, 0.5);
    const v = luma(R, G, B);
    R = lerp(lift(R, 0.35), v, 0.25); G = lerp(lift(G, 0.35), v, 0.25); B = lerp(lift(B, 0.3), v, 0.2);
    return [R, G, B];
  });
  add("style-tropic", "Style · Tropicana", "Style", (r, g, b) => {
    let R = clamp(r * 1.02), G = clamp(g * 1.1 + 6), B = clamp(b * 1.05 + 2);
    [R, G, B] = warm(R, G, B, 0.35);
    return [sCurve(R, 0.3), sCurve(G, 0.3), sCurve(B, 0.3)];
  });
})();
