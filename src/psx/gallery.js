/* T2Smart-PicHancer — example gallery + save-your-edits (kv-backed).
   Built-in AI-photo examples open like samples; any opened + edited photo can be
   saved to the gallery (1280px JPEG in kv, max 24, oldest evicted). */
(function () {
  "use strict";
  const $ = (s) => document.querySelector(s);
  const BUILTINS = [
    { id: "ex-portrait", name: "Golden Portrait", url: "../../media/f541ac7cc203.jpg" },
    { id: "ex-lake", name: "Alpine Lake", url: "../../media/966d1229c632.jpg" },
    { id: "ex-city", name: "Neon Alley", url: "../../media/b05b98022aa0.jpg" },
    { id: "ex-flower", name: "Dew Dahlia", url: "../../media/c01cac652271.jpg" },
  ];
  const MAX_USER = 24;
  let api = null;

  function kv() {
    try {
      const r = typeof root !== "undefined" ? root : window.root;
      return (r && r.kv && r.kv.gallery) || null;
    } catch (e) { return null; }
  }

  async function userItems() {
    const k = kv();
    if (!k) return [];
    try {
      const keys = await k.keys();
      if (!keys || !keys.length) return [];
      const vals = await k.getMany(keys);
      const out = [];
      for (let i = 0; i < keys.length; i++) {
        if (vals && vals[i] && vals[i].dataUrl) out.push(Object.assign({ key: keys[i] }, vals[i]));
      }
      out.sort((a, b) => (b.savedAt || 0) - (a.savedAt || 0));
      return out;
    } catch (e) { return []; }
  }

  function card({ img, name, sub, onOpen, onDelete }) {
    const d = document.createElement("div");
    d.className = "gcard";
    const im = document.createElement("img");
    im.src = img; im.alt = name; im.loading = "lazy";
    im.onclick = onOpen;
    const nm = document.createElement("span");
    nm.textContent = name;
    nm.onclick = onOpen;
    d.appendChild(im); d.appendChild(nm);
    if (sub) {
      const s = document.createElement("small");
      s.textContent = sub;
      d.appendChild(s);
    }
    if (onDelete) {
      const del = document.createElement("button");
      del.textContent = "Delete"; del.className = "gdel";
      del.onclick = (e) => { e.stopPropagation(); onDelete(); };
      d.appendChild(del);
    }
    return d;
  }

  function section(title) {
    const h = document.createElement("div");
    h.className = "gsec";
    h.textContent = title;
    return h;
  }

  async function refresh() {
    const grid = $("#exampleGrid");
    if (!grid || !api) return;
    grid.innerHTML = "";
    grid.appendChild(section("Examples — open one and make it yours"));
    for (const b of BUILTINS) {
      grid.appendChild(card({
        img: b.url, name: b.name, sub: "example photo",
        onOpen: () => api.loadURL(b.url, b.id)
      }));
    }
    const items = await userItems();
    grid.appendChild(section("Your saved edits (" + items.length + "/" + MAX_USER + ")"));
    if (!items.length) {
      const p = document.createElement("p");
      p.className = "hint";
      p.textContent = "Nothing saved yet — edit any photo, then hit “Save to gallery” in the editor.";
      grid.appendChild(p);
    }
    for (const it of items) {
      grid.appendChild(card({
        img: it.dataUrl, name: it.name || "edit",
        sub: (it.w && it.h ? it.w + "×" + it.h : "edit") + (it.savedAt ? " · " + new Date(it.savedAt).toLocaleDateString() : ""),
        onOpen: () => openUser(it),
        onDelete: async () => {
          const k = kv();
          if (k) { try { await k.delete(it.key); } catch (e) {} }
          api.toast("Deleted from gallery");
          refresh();
        }
      }));
    }
  }

  function openUser(it) {
    const img = new Image();
    img.onload = () => {
      const c = document.createElement("canvas");
      c.width = img.width; c.height = img.height;
      c.getContext("2d").drawImage(img, 0, 0);
      api.setSource(c, it.name || "gallery-edit");
    };
    img.onerror = () => api.toast("Could not open that saved photo");
    img.src = it.dataUrl;
  }

  function saveCurrent() {
    if (!api || !api.getSource()) { api.toast("Open a photo first"); return; }
    api.toast("Rendering for gallery…");
    setTimeout(async () => {
      try {
        const k = kv();
        if (!k) { api.toast("Gallery storage unavailable here"); return; }
        const off = api.renderFull(1280);
        const dataUrl = off.toDataURL("image/jpeg", 0.85);
        const S = api.getState();
        const look = S && S.look ? S.look : "edit";
        const srcName = (api.getSourceName ? api.getSourceName() : "photo") || "photo";
        const name = srcName + "-" + look + "-" + new Date().toLocaleDateString();
        await k.set("u" + Date.now(), { name, dataUrl, w: off.width, h: off.height, savedAt: Date.now() });
        // evict oldest beyond cap
        const items = await userItems();
        for (let i = MAX_USER; i < items.length; i++) {
          try { await k.delete(items[i].key); } catch (e) {}
        }
        api.toast("Saved to gallery ✓");
        refresh();
      } catch (e) { api.toast("Gallery save failed: " + e.message); }
    }, 30);
  }

  function wire(a) {
    api = a;
    const btn = $("#saveGalleryBtn");
    if (btn) btn.onclick = saveCurrent;
    refresh();
  }

  window.T2S_GALLERY = { wire, refresh, saveCurrent, BUILTINS };
})();
