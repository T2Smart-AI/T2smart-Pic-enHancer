/* T2Smart-PicHancer — M4 preset share links: state <-> URL hash.
   Tiers: full state -> strip genfill tile -> thin brush strokes. */
(function () {
  "use strict";

  function thinState(S) {
    const c = JSON.parse(JSON.stringify(S));
    if (c.genfill) delete c.genfill.result;
    return c;
  }
  function thinnerState(S) {
    const c = thinState(S);
    for (const L of (c.layers || [])) {
      if (L.brush && L.brush.strokes) {
        for (const st of L.brush.strokes) {
          if (st.pts && st.pts.length > 40) {
            st.pts = st.pts.filter((_, i) => i % 3 === 0);
          }
        }
      }
    }
    return c;
  }

  function enc(obj) {
    const json = JSON.stringify(obj);
    const b64 = btoa(unescape(encodeURIComponent(json)))
      .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
    return b64;
  }
  function dec(s) {
    let b64 = s.replace(/-/g, "+").replace(/_/g, "/");
    while (b64.length % 4) b64 += "=";
    return JSON.parse(decodeURIComponent(escape(atob(b64))));
  }

  function encode(S) {
    const payload = { v: 1, S: S };
    let tiers = [payload];
    try { tiers = [{ v: 1, S: S }, { v: 1, S: thinState(S) }, { v: 1, S: thinnerState(S) }]; }
    catch (e) { /* fall through */ }
    for (const t of tiers) {
      try {
        const s = enc(t);
        if (s.length <= 12000) return s;
      } catch (e) { /* try next tier */ }
    }
    return null;
  }

  function linkFor(code) {
    const base = "https://perchance.org/" + (window.generatorName || "");
    return base + "#s=" + code;
  }

  function readHash() {
    try {
      const h = window.location.hash || "";
      const m = h.match(/#s=([A-Za-z0-9\-_]+)/);
      if (!m) return null;
      const p = dec(m[1]);
      if (!p || p.v !== 1 || !p.S) return null;
      return p.S;
    } catch (e) { return null; }
  }

  window.T2S_SHARE = { encode, decode: dec, linkFor, readHash };
})();
