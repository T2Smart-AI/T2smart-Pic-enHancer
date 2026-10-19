/* T2Smart-PicHancer — look recipes (ported from decompiled looks.json names; grades re-authored for Canvas).
   Each look: { id, name, cat, grade(r,g,b) -> [r,g,b] (0..255), fx: {vignette,grain,fade} optional }
   Engine blends grade by lookAmount and adds fx on top. All premium unlocked. */
(function () {
  "use strict";
  const clamp = (v) => v < 0 ? 0 : v > 255 ? 255 : v;
  const lerp = (a, b, t) => a + (b - a) * t;

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
    h = ((h % 360) + 360) % 360 / 360;
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
  const luma = (r, g, b) => 0.2126 * r + 0.7152 * g + 0.0722 * b;

  // generic filmic helpers
  const sCurve = (v, amt) => { // v 0..255, amt 0..1
    const t = v / 255;
    const s = t + amt * (smooth(t) - t) * 1.6;
    return clamp(s * 255);
    function smooth(x) { return x * x * (3 - 2 * x); }
  };
  const lift = (v, amt) => clamp(v + amt * 28 * (1 - v / 255)); // fade blacks
  const warm = (r, g, b, amt) => [clamp(r + 22 * amt), clamp(g + 6 * amt), clamp(b - 18 * amt)];
  const cool = (r, g, b, amt) => [clamp(r - 18 * amt), clamp(g - 2 * amt), clamp(b + 24 * amt)];
  const tealShadow = (r, g, b, amt) => {
    const t = 1 - luma(r, g, b) / 255; // stronger in shadows
    return [clamp(r - 22 * amt * t), clamp(g + 10 * amt * t), clamp(b + 18 * amt * t)];
  };
  const orangeHL = (r, g, b, amt) => {
    const t = luma(r, g, b) / 255;
    return [clamp(r + 20 * amt * t), clamp(g + 6 * amt * t), clamp(b - 14 * amt * t)];
  };
  const duo = (r, g, b, dark, light) => {
    const t = luma(r, g, b) / 255;
    // smooth duotone curve
    const k = t * t * (3 - 2 * t);
    return [lerp(dark[0], light[0], k), lerp(dark[1], light[1], k), lerp(dark[2], light[2], k)];
  };
  const bwMix = (r, g, b, wr, wg, wb2) => clamp(wr * r + wg * g + wb2 * b);
  const popKeep = (r, g, b, hueCenter, hueWidth) => {
    const [h, s, l] = rgbToHsl(r, g, b);
    let d = Math.abs(h - hueCenter); if (d > 180) d = 360 - d;
    if (d > hueWidth || s < 0.12) { const v = luma(r, g, b); return [v, v, v]; }
    const boost = 1 + 0.35 * (1 - d / hueWidth);
    const [nr, ng, nb] = hslToRgb(h, Math.min(1, s * boost), l);
    return [nr, ng, nb];
  };

  const L = [];
  const add = (id, name, cat, grade, fx) => L.push({ id, name, cat, grade, fx: fx || null });

  add("normal", "Normal", "Normal", (r, g, b) => [r, g, b]);
  add("venice", "Venice", "Free", (r, g, b) => {
    let [R, G, B] = warm(r, g, b, 0.5);
    R = lift(R, 0.5); G = lift(G, 0.5); B = lift(B, 0.5);
    [R, G, B] = tealShadow(R, G, B, 0.5);
    return [sCurve(R, 0.25), sCurve(G, 0.25), sCurve(B, 0.25)];
  });
  add("porter", "Porter", "Free", (r, g, b) => {
    const v = luma(r, g, b);
    let R = lerp(r, v, 0.25), G = lerp(g, v, 0.25), B = lerp(b, v, 0.25);
    [R, G, B] = warm(R, G, B, 0.5);
    R = lift(R, 0.35); G = lift(G, 0.35); B = lift(B, 0.3);
    return [R, G, B];
  });
  add("vibrant", "Vibrant", "Free", (r, g, b) => {
    const v = luma(r, g, b);
    return [clamp(v + (r - v) * 1.45), clamp(v + (g - v) * 1.45), clamp(v + (b - v) * 1.35)];
  });
  add("bueno", "Bueno", "Free", (r, g, b) => {
    let [R, G, B] = warm(r, g, b, 0.6);
    return [sCurve(R, 0.35), sCurve(G, 0.3), sCurve(B, 0.25)];
  });
  add("savin", "Savin", "Free", (r, g, b) => {
    const v = luma(r, g, b);
    let R = lerp(r, v, 0.45), G = lerp(g, v, 0.45), B = lerp(b, v, 0.45);
    return [lift(R, 0.4), lift(G, 0.4), lift(B, 0.4)];
  });
  add("atlantic", "Atlantic", "Free", (r, g, b) => {
    let [R, G, B] = cool(r, g, b, 0.7);
    [R, G, B] = tealShadow(R, G, B, 0.6);
    return [sCurve(R, 0.45), sCurve(G, 0.4), sCurve(B, 0.4)];
  });
  add("negative", "Negative", "Free", (r, g, b) => [255 - r, 255 - g, 255 - b]);
  add("moreland", "Moreland", "Free", (r, g, b) => {
    let [R, G, B] = warm(r, g, b, 0.35);
    R = lift(R, 0.55); G = lift(G, 0.5); B = lift(B, 0.4);
    const v = luma(R, G, B);
    return [lerp(R, v, 0.15), lerp(G, v, 0.15), lerp(B, v, 0.2)];
  });
  add("spillman", "Spillman", "Free", (r, g, b) => {
    let R = sCurve(r, 0.3), G = sCurve(g, 0.3), B = sCurve(b, 0.3);
    [R, G, B] = cool(R, G, B, 0.3);
    return [lift(R, 0.3), lift(G, 0.3), lift(B, 0.3)];
  });
  add("willowbrook", "Willowbrook", "Free", (r, g, b) => {
    const v = luma(r, g, b);
    let R = lerp(r, v, 0.3), G = clamp(lerp(g, v, 0.2) + 8), B = lerp(b, v, 0.3);
    return [lift(R, 0.35), lift(G, 0.35), lift(B, 0.35)];
  });
  add("mason", "Mason", "Free", (r, g, b) => {
    const v = luma(r, g, b);
    return [sCurve(clamp(v + (r - v) * 1.1), 0.4), sCurve(clamp(v + (g - v) * 1.05), 0.4), sCurve(clamp(v + (b - v) * 0.95), 0.35)];
  });
  add("shelby", "Shelby", "Free", (r, g, b) => {
    let [R, G, B] = warm(r, g, b, 0.55);
    [R, G, B] = orangeHL(R, G, B, 0.4);
    return [sCurve(R, 0.3), sCurve(G, 0.3), sCurve(B, 0.3)];
  }, { vignette: 25 });
  add("hdr1", "HDR Punch", "HDR", (r, g, b) => {
    const v = luma(r, g, b);
    let R = clamp(v + (r - v) * 1.3), G = clamp(v + (g - v) * 1.3), B = clamp(v + (b - v) * 1.3);
    return [sCurve(R, 0.6), sCurve(G, 0.6), sCurve(B, 0.6)];
  });
  add("hdr2", "HDR Glow", "HDR", (r, g, b) => {
    let R = lift(r, 0.35), G = lift(g, 0.35), B = lift(b, 0.35);
    return [sCurve(R, 0.55), sCurve(G, 0.55), sCurve(B, 0.55)];
  });
  add("cinematic", "Cinematic", "Portrait", (r, g, b) => {
    let [R, G, B] = tealShadow(r, g, b, 0.7);
    [R, G, B] = orangeHL(R, G, B, 0.7);
    R = lift(R, 0.25); G = lift(G, 0.25); B = lift(B, 0.28);
    return [sCurve(R, 0.5), sCurve(G, 0.45), sCurve(B, 0.4)];
  }, { vignette: 20 });
  add("classic", "Classic", "Nature", (r, g, b) => {
    let [R, G, B] = warm(r, g, b, 0.3);
    return [sCurve(R, 0.4), sCurve(G, 0.4), sCurve(B, 0.4)];
  });
  add("colorful", "Colorful", "Nature", (r, g, b) => {
    const v = luma(r, g, b);
    return [clamp(v + (r - v) * 1.6), clamp(v + (g - v) * 1.6), clamp(v + (b - v) * 1.55)];
  });
  add("bright", "Bright", "Nature", (r, g, b) => {
    let R = clamp(r * 1.12 + 8), G = clamp(g * 1.1 + 8), B = clamp(b * 1.08 + 6);
    return [lift(R, 0.25), lift(G, 0.25), lift(B, 0.25)];
  });
  add("orton", "Orton", "Portrait", (r, g, b) => {
    let R = clamp(r * 1.08 + 14), G = clamp(g * 1.06 + 12), B = clamp(b * 1.03 + 10);
    [R, G, B] = warm(R, G, B, 0.4);
    return [R, G, B];
  });
  add("sepia", "Sepia", "B&W", (r, g, b) => {
    const v = luma(r, g, b);
    return [clamp(v * 1.05 + 18), clamp(v * 0.9 + 10), clamp(v * 0.7)];
  });
  add("sepia1", "Sepia Soft", "B&W", (r, g, b) => {
    const v = luma(r, g, b);
    return [clamp(v + 24), clamp(v * 0.94 + 8), clamp(v * 0.8 + 2)];
  });
  add("pinhole", "Pinhole", "B&W", (r, g, b) => {
    const v = bwMix(r, g, b, 0.3, 0.6, 0.1);
    return [sCurve(v, 0.5), sCurve(v, 0.5), sCurve(v, 0.5)];
  }, { vignette: 70 });
  add("hcbw", "High Contrast B&W", "B&W", (r, g, b) => {
    const v = bwMix(r, g, b, 0.35, 0.55, 0.1);
    return [sCurve(v, 0.75), sCurve(v, 0.75), sCurve(v, 0.75)];
  });
  add("infrared", "Infrared", "B&W", (r, g, b) => {
    const v = clamp(0.6 * r + 0.25 * g + 0.15 * b);
    const sky = clamp(255 - b);
    const out = clamp((v + sky) / 2 * 1.15);
    return [clamp(out + 20), clamp(out + 14), clamp(out + 6)];
  });
  add("twilight", "Twilight", "Portrait", (r, g, b) => {
    let [R, G, B] = cool(r, g, b, 0.8);
    [R, G, B] = tealShadow(R, G, B, 0.5);
    R = lift(R, 0.2); G = lift(G, 0.2); B = lift(B, 0.25);
    return [sCurve(R, 0.45), sCurve(G, 0.4), sCurve(B, 0.45)];
  }, { vignette: 30 });
  add("blues", "The Blues", "Portrait", (r, g, b) => {
    let R = clamp(r * 0.85), G = clamp(g * 0.95), B = clamp(b * 1.2);
    return [sCurve(R, 0.4), sCurve(G, 0.4), sCurve(B, 0.4)];
  });
  add("vintage2", "Vintage II", "Portrait", (r, g, b) => {
    let [R, G, B] = warm(r, g, b, 0.6);
    R = lift(R, 0.5); G = lift(G, 0.42); B = lift(B, 0.3);
    const v = luma(R, G, B);
    R = lerp(R, v, 0.2); G = lerp(G, v, 0.18); B = lerp(B, v, 0.22);
    return [R, G, B];
  }, { vignette: 35, grain: 20 });
  add("warmvintage", "Warm Vintage", "Portrait", (r, g, b) => {
    let [R, G, B] = warm(r, g, b, 0.9);
    R = lift(R, 0.5); G = lift(G, 0.4); B = lift(B, 0.28);
    return [sCurve(R, 0.3), sCurve(G, 0.3), sCurve(B, 0.3)];
  }, { grain: 15 });
  add("whitemist", "White Mist", "B&W", (r, g, b) => {
    const v = luma(r, g, b);
    const m = clamp(v * 0.85 + 38);
    return [m, m, m];
  });
  add("matte1", "Matte 1", "Matte", (r, g, b) => {
    let R = lift(r, 0.6), G = lift(g, 0.6), B = lift(b, 0.6);
    const v = luma(R, G, B);
    return [lerp(R, v, 0.2), lerp(G, v, 0.2), lerp(B, v, 0.2)];
  });
  add("matte2", "Matte 2", "Matte", (r, g, b) => {
    let [R, G, B] = warm(r, g, b, 0.35);
    R = lift(R, 0.65); G = lift(G, 0.6); B = lift(B, 0.55);
    return [R, G, B];
  });
  add("light1", "Light 1", "Light", (r, g, b) => [clamp(r * 1.08 + 10), clamp(g * 1.08 + 10), clamp(b * 1.06 + 8)]);
  add("light2", "Light 2", "Light", (r, g, b) => {
    let R = lift(r, 0.4), G = lift(g, 0.4), B = lift(b, 0.4);
    [R, G, B] = warm(R, G, B, 0.4);
    return [R, G, B];
  });
  add("warm2", "Warm Glow", "Warm", (r, g, b) => {
    let [R, G, B] = warm(r, g, b, 1.0);
    return [sCurve(R, 0.25), sCurve(G, 0.25), sCurve(B, 0.2)];
  });
  add("duoindigo", "Duotone Indigo", "Duotone", (r, g, b) => duo(r, g, b, [18, 20, 58], [200, 190, 235]));
  add("duoorange", "Duotone Ember", "Duotone", (r, g, b) => duo(r, g, b, [40, 16, 8], [255, 190, 120]));
  add("popred", "Pop Red", "Splash", (r, g, b) => popKeep(r, g, b, 0, 28));
  add("popblue", "Pop Blue", "Splash", (r, g, b) => popKeep(r, g, b, 215, 30));
  add("popgreen", "Pop Green", "Splash", (r, g, b) => popKeep(r, g, b, 130, 32));
  add("flash", "Flash", "White Balance", (r, g, b) => [clamp(r * 1.04), clamp(g * 1.02), clamp(b * 0.98)]);
  add("cloudy", "Cloudy", "White Balance", (r, g, b) => warm(r, g, b, 0.55));
  add("tungsten", "Tungsten", "White Balance", (r, g, b) => cool(r, g, b, 0.9));

  window.T2S_LOOKS = L;
})();
