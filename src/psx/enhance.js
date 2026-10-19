/* T2Smart-PicHancer — AI Enhance: on-device super-resolution + analysis.
   Real-ESRGAN general-x4v3 (BSD-3-Clause, xinntao) via onnxruntime-web (WASM).
   Model: hosted permanent copy, HF mirror fallback. No data leaves the device.
   Flow: Enhance tab -> Analyze (heuristics) -> run 2x/4x tiled inference with
   progress + cancel + strength blend -> Use as new source (edits reset). */
(function () {
  "use strict";
  const ORT_URL = "https://cdn.jsdelivr.net/npm/onnxruntime-web@1.20.0/dist/ort.wasm.min.js";
  const ORT_WASM_PATH = "https://cdn.jsdelivr.net/npm/onnxruntime-web@1.20.0/dist/";
  const MODELS = [
    "../../media/15ac147c6429.bin",
    "https://huggingface.co/Heliosoph/realesrgan-onnx/resolve/main/realesr-general-x4v3.onnx"
  ];
  const SCALE = 4, TILE = 128, OVERLAP = 16;
  const CAP = { "2x": 768, "4x": 512 }; // AI input max side (speed guard)
  let api = null;
  let ortReady = null, sessPromise = null, cancelled = false;

  function toast(m) { if (api && api.toast) api.toast(m); else try { console.log("[enhance]", m); } catch (e) { /* ignore */ } }

  function loadScriptOnce() {
    if (ortReady) return ortReady;
    ortReady = new Promise((res, rej) => {
      if (window.ort && window.ort.InferenceSession) { res(); return; }
      const s = document.createElement("script");
      s.src = ORT_URL;
      s.onload = () => res();
      s.onerror = () => rej(new Error("AI runtime failed to load (network?)"));
      document.head.appendChild(s);
    }).then(() => {
      try {
        window.ort.env.wasm.wasmPaths = ORT_WASM_PATH;
        window.ort.env.wasm.numThreads = 1;
      } catch (e) { /* ignore */ }
    });
    return ortReady;
  }

  async function getSession(onStatus) {
    if (sessPromise) return sessPromise;
    sessPromise = (async () => {
      await loadScriptOnce();
      let lastErr = null;
      for (const u of MODELS) {
        try {
          if (onStatus) onStatus("Loading AI model…");
          const s = await window.ort.InferenceSession.create(u, { executionProviders: ["wasm"] });
          if (onStatus) onStatus("AI model ready");
          return s;
        } catch (e) { lastErr = e; }
      }
      sessPromise = null;
      throw new Error("Could not load the enhancement model. Check connection and retry. (" + (lastErr && lastErr.message || lastErr) + ")");
    })();
    return sessPromise;
  }

  function toNCHW(imgData) {
    const { data, width: W, height: H } = imgData;
    const out = new Float32Array(1 * 3 * H * W);
    for (let i = 0; i < W * H; i++) {
      out[i] = data[i * 4] / 255;
      out[W * H + i] = data[i * 4 + 1] / 255;
      out[2 * W * H + i] = data[i * 4 + 2] / 255;
    }
    return { arr: out, W, H };
  }

  function drawCover(src, W, H) {
    const c = document.createElement("canvas"); c.width = W; c.height = H;
    const x = c.getContext("2d", { willReadFrequently: true });
    x.imageSmoothingEnabled = true; x.imageSmoothingQuality = "high";
    x.drawImage(src, 0, 0, W, H);
    return x.getImageData(0, 0, W, H);
  }

  // ---- heuristic image analysis (guidance only, not a diagnosis) ----
  function analyze(srcCanvas) {
    const mx = 256, sc = Math.min(1, mx / Math.max(srcCanvas.width, srcCanvas.height));
    const W = Math.max(8, Math.round(srcCanvas.width * sc)), H = Math.max(8, Math.round(srcCanvas.height * sc));
    const id = drawCover(srcCanvas, W, H).data;
    const gray = new Float32Array(W * H);
    for (let i = 0; i < W * H; i++) gray[i] = 0.2126 * id[i * 4] + 0.7152 * id[i * 4 + 1] + 0.0722 * id[i * 4 + 2];
    // blur: variance of Laplacian (higher = sharper)
    let lapSum = 0, lapSq = 0, n = 0;
    for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
      const i = y * W + x;
      const l = -4 * gray[i] + gray[i - 1] + gray[i + 1] + gray[i - W] + gray[i + W];
      lapSum += l; lapSq += l * l; n++;
    }
    const lapVar = Math.max(0, lapSq / n - (lapSum / n) * (lapSum / n));
    // noise: mean abs high-frequency residual vs 3x3 box blur
    let nz = 0, nn = 0;
    for (let y = 1; y < H - 1; y += 2) for (let x = 1; x < W - 1; x += 2) {
      const i = y * W + x;
      const b = (gray[i] + gray[i-1] + gray[i+1] + gray[i-W] + gray[i+W] + gray[i-W-1] + gray[i-W+1] + gray[i+W-1] + gray[i+W+1]) / 9;
      nz += Math.abs(gray[i] - b); nn++;
    }
    const noise = nz / Math.max(1, nn);
    // jpeg blocking: boundary-vs-interior difference on 8px grid
    let be = 0, bn = 0, ie = 0, inn = 0;
    for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
      const d = Math.abs(gray[y * W + x] - gray[y * W + x + 1]) + Math.abs(gray[y * W + x] - gray[(y + 1) * W + x]);
      if (x % 8 === 0 || y % 8 === 0) { be += d; bn++; } else { ie += d; inn++; }
    }
    const block = bn && inn ? (be / bn) / Math.max(1e-6, ie / inn) : 1;
    const mp = (srcCanvas.width * srcCanvas.height) / 1e6;
    const findings = [];
    if (lapVar < 60) findings.push("looks soft or out of focus (low detail energy)");
    else if (lapVar < 200) findings.push("moderately detailed");
    else findings.push("already quite sharp");
    if (noise > 5) findings.push("visible noise/grain");
    if (block > 1.25) findings.push("likely JPEG compression artifacts");
    if (mp < 1) findings.push("low resolution (" + mp.toFixed(1) + " MP)");
    const recommended = (lapVar < 200 || noise > 5 || block > 1.25 || mp < 2) ? "2x" : "4x";
    return { w: srcCanvas.width, h: srcCanvas.height, mp: +mp.toFixed(2),
      lapVar: Math.round(lapVar), noise: +noise.toFixed(2), block: +block.toFixed(2),
      findings, recommended };
  }

  // ---- tiled 4x inference ----
  async function runTiled(sess, imgData, onProgress) {
    const { width: W, height: H } = imgData;
    const src = imgData.data;
    const OW = W * SCALE, OH = H * SCALE;
    const acc = new Float32Array(OW * OH * 3);
    const wgt = new Float32Array(OW * OH);
    const step = TILE - OVERLAP * 2;
    const xs = [], ys = [];
    for (let y = 0; y < H; y += step) ys.push(y);
    for (let x = 0; x < W; x += step) xs.push(x);
    const total = xs.length * ys.length;
    let done = 0;
    const inName = sess.inputNames[0], outName = sess.outputNames[0];
    for (const ty of ys) {
      for (const tx of xs) {
        if (cancelled) throw new Error("cancelled");
        // tile core [tx, min(tx+step,W)) plus an OVERLAP halo each side, clamped
        const xa = Math.max(0, tx - OVERLAP), ya = Math.max(0, ty - OVERLAP);
        const xb = Math.min(W, Math.max(tx + step, tx + TILE - OVERLAP) + OVERLAP);
        const yb = Math.min(H, Math.max(ty + step, ty + TILE - OVERLAP) + OVERLAP);
        const tw = xb - xa, th = yb - ya;
        const inp = new Float32Array(1 * 3 * th * tw);
        for (let y = 0; y < th; y++) for (let x = 0; x < tw; x++) {
          const sx = xa + x, sy = ya + y, si = (sy * W + sx) * 4, di = y * tw + x;
          inp[di] = src[si] / 255; inp[th * tw + di] = src[si + 1] / 255; inp[2 * th * tw + di] = src[si + 2] / 255;
        }
        const feeds = {};
        feeds[inName] = new window.ort.Tensor("float32", inp, [1, 3, th, tw]);
        const out = await sess.run(feeds);
        const od = out[outName].data;
        const oW = tw * SCALE, oH = th * SCALE;
        // paste the tile's core (strip halo), feather-blend the seam band
        for (let oy = 0; oy < oH; oy++) {
          const gy = ya * SCALE + oy;
          const cy0 = ty * SCALE, cy1 = Math.min(ty + step, H) * SCALE;
          if (gy < cy0 || gy >= cy1) continue;
          for (let ox = 0; ox < oW; ox++) {
            const gx = xa * SCALE + ox;
            const cx0 = tx * SCALE, cx1 = Math.min(tx + step, W) * SCALE;
            if (gx < cx0 || gx >= cx1) continue;
            // feather weight: ramp over OVERLAP*SCALE px from tile core edges
            const f = OVERLAP * SCALE;
            const ex = Math.min(gx - cx0, cx1 - 1 - gx, f) / f;
            const ey = Math.min(gy - cy0, cy1 - 1 - gy, f) / f;
            const wgtV = Math.min(1, Math.max(0.001, Math.min(ex, ey) + 0.001));
            const gi = gy * OW + gx, oi = oy * oW + ox;
            acc[gi * 3] += od[oi] * wgtV; acc[gi * 3 + 1] += od[oH * oW + oi] * wgtV; acc[gi * 3 + 2] += od[2 * oH * oW + oi] * wgtV;
            wgt[gi] += wgtV;
          }
        }
        done++;
        if (onProgress) onProgress(done, total);
        // let the UI breathe + honor cancel promptly
        await new Promise((r) => setTimeout(r, 0));
      }
    }
    const outId = new ImageData(OW, OH);
    for (let i = 0; i < OW * OH; i++) {
      const wv = wgt[i] || 1;
      outId.data[i * 4] = Math.max(0, Math.min(255, Math.round(acc[i * 3] / wv * 255)));
      outId.data[i * 4 + 1] = Math.max(0, Math.min(255, Math.round(acc[i * 3 + 1] / wv * 255)));
      outId.data[i * 4 + 2] = Math.max(0, Math.min(255, Math.round(acc[i * 3 + 2] / wv * 255)));
      outId.data[i * 4 + 3] = 255;
    }
    return outId;
  }

  function prepInput(src, mode) {
    // returns {imgData (model input), aiW/aiH, outW/outH (final size)}
    const cap = CAP[mode] || CAP["2x"];
    let iw = src.width, ih = src.height;
    if (mode === "2x") { iw = Math.max(16, Math.round(iw / 2)); ih = Math.max(16, Math.round(ih / 2)); }
    const sc = Math.min(1, cap / Math.max(iw, ih));
    iw = Math.max(16, Math.round(iw * sc)); ih = Math.max(16, Math.round(ih * sc));
    const imgData = drawCover(src, iw, ih);
    return { imgData, outW: iw * SCALE, outH: ih * SCALE };
  }

  async function enhance(opts) {
    // opts: {mode, strength (0-100), onProgress(frac, label), signal}
    const src = api.getSource();
    if (!src) throw new Error("Load a photo first");
    cancelled = false;
    if (opts.signal) opts.signal(cancel);
    const sess = await getSession(opts.onStatus);
    const { imgData, outW, outH } = prepInput(src, opts.mode);
    const ai = await runTiled(sess, imgData, (d, t) =>
      opts.onProgress && opts.onProgress(d / t, "AI pass " + d + "/" + t));
    if (cancelled) throw new Error("cancelled");
    // bicubic baseline at output size + strength blend
    const base = drawCover(src, outW, outH);
    const s = Math.max(0, Math.min(100, opts.strength == null ? 85 : opts.strength)) / 100;
    const c = document.createElement("canvas"); c.width = outW; c.height = outH;
    const x = c.getContext("2d");
    const mixed = x.createImageData(outW, outH);
    for (let i = 0; i < outW * outH; i++) {
      mixed.data[i * 4] = Math.round(base.data[i * 4] * (1 - s) + ai.data[i * 4] * s);
      mixed.data[i * 4 + 1] = Math.round(base.data[i * 4 + 1] * (1 - s) + ai.data[i * 4 + 1] * s);
      mixed.data[i * 4 + 2] = Math.round(base.data[i * 4 + 2] * (1 - s) + ai.data[i * 4 + 2] * s);
      mixed.data[i * 4 + 3] = 255;
    }
    x.putImageData(mixed, 0, 0);
    const baseC = document.createElement("canvas"); baseC.width = outW; baseC.height = outH;
    baseC.getContext("2d").putImageData(base, 0, 0);
    return { canvas: c, baseCanvas: baseC, outW, outH, mode: opts.mode, strength: Math.round(s * 100) };
  }

  function cancel() { cancelled = true; }

  // pre-enhance source stash (one-step revert, since setSource clears undo)
  let lastOriginal = null;
  function applyAsSource(enhCanvas, label) {
    const cur = api.getSource();
    if (cur) {
      lastOriginal = document.createElement("canvas");
      lastOriginal.width = cur.width; lastOriginal.height = cur.height;
      lastOriginal.getContext("2d").drawImage(cur, 0, 0);
    }
    api.setSource(enhCanvas, (api.sourceName() || "photo") + " · " + label);
  }
  function revertSource() {
    if (!lastOriginal) { toast("Nothing to revert"); return false; }
    api.setSource(lastOriginal, api.sourceName() || "photo");
    lastOriginal = null;
    return true;
  }

  function wire(o) { api = o; }

  window.T2S_ENHANCE = { wire, analyze, enhance, cancel, applyAsSource, revertSource,
    get lastOriginal() { return lastOriginal; } };
})();
