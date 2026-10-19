/* T2Smart-PicHancer — M4 video looks: grade uploaded clips live (full GPU pipeline per
   frame) and export via MediaRecorder. Heal/text are photo-only and skipped. */
(function () {
  "use strict";
  let api = null;
  const $ = (s) => document.querySelector(s);
  const V = { el: null, playing: false, raf: 0, url: null, rec: null, chunks: [], recording: false, lastT: -1 };

  function S() { return api.getState(); }

  function frameState() {
    const base = S();
    return Object.assign({}, base, { heal: [], texts: [], collage: { active: false } });
  }

  function drawFrame() {
    const el = V.el;
    if (!el || !el.videoWidth) return false;
    const maxW = 960;
    const sc = Math.min(1, maxW / el.videoWidth);
    const W = Math.max(2, Math.round(el.videoWidth * sc));
    const H = Math.max(2, Math.round(el.videoHeight * sc));
    const tmp = drawFrame._c || (drawFrame._c = document.createElement("canvas"));
    tmp.width = W; tmp.height = H;
    const t = tmp.getContext("2d");
    t.drawImage(el, 0, 0, W, H);
    const st = frameState();
    const look = api.lookById(st.look);
    let img = null;
    if (window.T2SGPU && window.T2SGPU.ready()) {
      try { img = window.T2SGPU.process(tmp, st, look, st.lookStack); } catch (e) { img = null; }
    }
    if (!img) {
      img = t.getImageData(0, 0, W, H);
      if (window.T2S_LENS) window.T2S_LENS.lensPass(img, st.lens);
      if (window.T2S_PORTRAIT) window.T2S_PORTRAIT.bokehPass(img, st.bokeh);
      window.T2SEngine.gradeStack(img, st, st.lookStack);
      window.T2SEngine.gradePass(img, st, look);
      window.T2SEngine.detailPass(img, st);
      if (window.T2S_MASKS) window.T2S_MASKS.applyLayers(img, st);
      if (window.T2S_PORTRAIT) window.T2S_PORTRAIT.facePass(img, st.face);
    }
    const disp = $("#stageCanvas");
    disp.width = W; disp.height = H;
    disp.getContext("2d").putImageData(img, 0, 0);
    return true;
  }

  function loop() {
    if (!V.playing) return;
    try { drawFrame(); } catch (e) { console.warn("vframe", e); }
    const el = V.el;
    if (el && isFinite(el.duration) && el.duration > 0) {
      $("#videoScrub").value = Math.round((el.currentTime / el.duration) * 1000);
    }
    V.raf = requestAnimationFrame(loop);
  }

  function setPlaying(p) {
    const el = V.el;
    if (!el) return;
    V.playing = p;
    if (p) { el.play().catch(() => {}); cancelAnimationFrame(V.raf); V.raf = requestAnimationFrame(loop); }
    else { el.pause(); cancelAnimationFrame(V.raf); }
    $("#videoPlay").textContent = p ? "Pause" : "Play";
  }

  function loadFile(f) {
    if (!f) return;
    if (V.url) URL.revokeObjectURL(V.url);
    setPlaying(false);
    V.url = URL.createObjectURL(f);
    const el = V.el || (V.el = document.createElement("video"));
    el.muted = true; el.loop = true; el.playsInline = true; el.preload = "auto";
    el.onloadeddata = () => {
      $("#videoStatus").textContent = el.videoWidth + "×" + el.videoHeight + " · " + f.name;
      $("#videoPlay").disabled = false;
      $("#videoExport").disabled = false;
      try { el.currentTime = 0; } catch (e) {}
      setTimeout(() => { setPlaying(false); drawFrame(); }, 120);
      api.toast("Video loaded — looks apply live");
    };
    el.onerror = () => api.toast("Could not read that video");
    el.src = V.url;
  }

  function exportClip() {
    const el = V.el;
    if (!el || !el.videoWidth) return;
    if (typeof MediaRecorder === "undefined") { api.toast("MediaRecorder not supported here"); return; }
    const cap = Math.min(1280, el.videoWidth);
    const sc = cap / el.videoWidth;
    const W = Math.round(el.videoWidth * sc), H = Math.round(el.videoHeight * sc);
    const rc = document.createElement("canvas");
    rc.width = W; rc.height = H;
    const rx = rc.getContext("2d");
    const stream = rc.captureStream(30);
    const mime = MediaRecorder.isTypeSupported("video/webm;codecs=vp9") ? "video/webm;codecs=vp9" : "video/webm";
    V.chunks = [];
    try {
      V.rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 8e6 });
    } catch (e) { api.toast("Recorder failed: " + e.message); return; }
    V.rec.ondataavailable = (e) => { if (e.data && e.data.size) V.chunks.push(e.data); };
    V.rec.onstop = () => {
      const blob = new Blob(V.chunks, { type: "video/webm" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = "t2smart-look-" + Date.now() + ".webm";
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 4000);
      V.recording = false;
      $("#videoStatus").textContent = "exported ✓";
      api.toast("Clip exported (" + (blob.size / 1e6).toFixed(1) + " MB)");
    };
    const st0 = frameState();
    const look0 = api.lookById(st0.look);
    const tmp = document.createElement("canvas");
    tmp.width = W; tmp.height = H;
    const t = tmp.getContext("2d", { willReadFrequently: true });
    V.recording = true;
    V.rec.start(250);
    $("#videoStatus").textContent = "recording…";
    const wasPlaying = V.playing;
    try { el.currentTime = 0; } catch (e) {}
    el.muted = true;
    el.play().catch(() => {});
    const step = () => {
      if (!V.recording) return;
      if (el.ended || el.currentTime >= (el.duration || 1e9) - 0.05) { finish(); return; }
      t.drawImage(el, 0, 0, W, H);
      const st = frameState();
      const look = api.lookById(st.look);
      let img = null;
      if (window.T2SGPU && window.T2SGPU.ready()) {
        try { img = window.T2SGPU.process(tmp, st, look, st.lookStack); } catch (e) { img = null; }
      }
      if (!img) {
        img = t.getImageData(0, 0, W, H);
        window.T2SEngine.gradeStack(img, st, st.lookStack);
        window.T2SEngine.gradePass(img, st, look);
        window.T2SEngine.detailPass(img, st);
      }
      rx.putImageData(img, 0, 0);
      // live preview on stage too
      const disp = $("#stageCanvas");
      if (disp.width !== Math.min(W, 960)) {
        const sw = Math.min(W, 960), sh = Math.round(sw * H / W);
        disp.width = sw; disp.height = sh;
      }
      disp.getContext("2d").drawImage(rc, 0, 0, disp.width, disp.height);
      setTimeout(() => requestAnimationFrame(step), 1000 / 30);
    };
    const finish = () => {
      V.recording = false;
      try { V.rec.stop(); } catch (e) {}
      el.pause();
      if (wasPlaying) setPlaying(true);
    };
    // cap at 20s
    setTimeout(() => { if (V.recording) finish(); }, 20000);
    requestAnimationFrame(step);
    void look0;
  }

  function wire(a) {
    api = a;
    $("#videoLoad").onclick = () => $("#videoInput").click();
    $("#videoInput").onchange = (e) => loadFile(e.target.files[0]);
    $("#videoPlay").onclick = () => setPlaying(!V.playing);
    $("#videoScrub").addEventListener("input", (e) => {
      const el = V.el;
      if (el && isFinite(el.duration) && el.duration > 0) {
        try { el.currentTime = (parseFloat(e.target.value) / 1000) * el.duration; } catch (err) {}
        setTimeout(drawFrame, 60);
      }
    });
    $("#videoExport").onclick = exportClip;
  }

  window.T2S_VIDEO = { wire, loadFile, drawFrame, _v: V };
})();
