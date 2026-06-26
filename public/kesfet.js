// Keşfet: bölge+kategori -> işletme dizini (tablo) + filtre/sıralama/export + "yorumları topla".

const state = { places: [], query: "", filter: "", sort: "reviews" };

const els = {
  form: document.getElementById("discover-form"),
  q: document.getElementById("q"),
  goBtn: document.getElementById("go-btn"),
  status: document.getElementById("status"),
  city: document.getElementById("city"),
  cityBtn: document.getElementById("city-btn"),
  deep: document.getElementById("deep"),
  saved: document.getElementById("saved"),
  controls: document.getElementById("controls"),
  filter: document.getElementById("filter"),
  sort: document.getElementById("sort"),
  exportEl: document.getElementById("export"),
  resultCount: document.getElementById("result-count"),
  table: document.getElementById("table"),
  rows: document.getElementById("rows"),
};

const esc = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const trn = (n) => (typeof n === "number" ? n.toLocaleString("tr-TR") : "");

// ---------- Render ----------
function applyView() {
  let list = state.places.slice();
  const q = state.filter.trim().toLocaleLowerCase("tr");
  if (q) list = list.filter((p) => `${p.name} ${p.info}`.toLocaleLowerCase("tr").includes(q));
  list.sort((a, b) => {
    if (state.sort === "rating") return (b.rating || 0) - (a.rating || 0);
    if (state.sort === "name") return String(a.name).localeCompare(String(b.name), "tr");
    return (b.reviewCount || 0) - (a.reviewCount || 0); // reviews
  });
  return list;
}

function render() {
  const list = applyView();
  els.resultCount.textContent = state.places.length
    ? `${list.length} işletme${list.length !== state.places.length ? ` (toplam ${state.places.length})` : ""}`
    : "";
  els.rows.replaceChildren(
    ...list.map((p, i) => {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td class="muted">${i + 1}</td>
        <td><a href="${esc(p.placeUrl)}" target="_blank" rel="noopener">${esc(p.name)}</a></td>
        <td class="num">${p.rating != null ? p.rating.toFixed(1) + " ★" : "–"}</td>
        <td class="num">${trn(p.reviewCount)}</td>
        <td class="info">${esc(p.info || "")}</td>
        <td><button class="chip collect" data-url="${esc(p.placeUrl)}" data-name="${esc(p.name)}">Yorumları topla</button></td>
      `;
      return tr;
    })
  );
  els.table.style.display = state.places.length ? "" : "none";
  els.controls.style.display = state.places.length ? "" : "none";
}

// ---------- Keşfet ----------
async function discover(query) {
  els.goBtn.disabled = true;
  els.goBtn.classList.add("is-loading");
  els.goBtn.querySelector(".btn-label").textContent = "Keşfediliyor";
  els.status.textContent = "İşletmeler taranıyor… (yarım–bir dakika)";
  try {
    const r = await fetch("/api/discover", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query, deep: els.deep.checked }),
    });
    const data = await r.json();
    if (!r.ok) throw new Error(data.detail || data.error || "Hata");
    state.places = Array.isArray(data.places) ? data.places : [];
    state.query = data.query || query;
    els.status.textContent = `${state.places.length} işletme bulundu.`;
    render();
  } catch (e) {
    els.status.textContent = "Hata: " + e.message + " (Keşfet yalnızca yerel sunucuda çalışır)";
  } finally {
    els.goBtn.disabled = false;
    els.goBtn.classList.remove("is-loading");
    els.goBtn.querySelector(".btn-label").textContent = "Keşfet";
  }
}

async function scanCity(city) {
  els.cityBtn.disabled = true;
  els.cityBtn.classList.add("is-loading");
  els.cityBtn.querySelector(".btn-label").textContent = "Taranıyor";
  els.status.textContent = `${city}: tüm ilçeler taranıyor… (birkaç dakika)`;
  try {
    const r = await fetch("/api/discover-city", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ city, deep: els.deep.checked }),
    });
    const data = await r.json();
    if (!r.ok) throw new Error(data.detail || data.error || "Hata");
    state.places = Array.isArray(data.places) ? data.places : [];
    state.query = data.query || city;
    els.status.textContent = `${state.places.length} işletme bulundu (${city}, tüm ilçeler).`;
    render();
  } catch (e) {
    els.status.textContent = "Hata: " + e.message + " (Keşfet yalnızca yerel sunucuda çalışır)";
  } finally {
    els.cityBtn.disabled = false;
    els.cityBtn.classList.remove("is-loading");
    els.cityBtn.querySelector(".btn-label").textContent = "Tüm şehri tara";
  }
}

async function collect(btn) {
  const url = btn.dataset.url, name = btn.dataset.name;
  btn.disabled = true;
  const old = btn.textContent;
  btn.textContent = "Toplanıyor…";
  try {
    const r = await fetch("/api/branches", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url, label: name }),
    });
    const data = await r.json();
    if (!r.ok) throw new Error(data.detail || data.error || "Hata");
    btn.textContent = `✓ ${data.count} yorum`;
    alert(`Eklendi: ${data.branch.label} — ${data.count} yorum.\n"Yorumlar" sayfasında şube seçiciden görebilirsin.`);
  } catch (e) {
    btn.textContent = old;
    btn.disabled = false;
    alert("Toplanamadı: " + e.message);
  }
}

// ---------- Export ----------
function rows() {
  return applyView().map((p, i) => ({
    "#": i + 1,
    "İşletme": p.name,
    Puan: p.rating ?? "",
    "Yorum Sayısı": p.reviewCount ?? "",
    Bilgi: p.info || "",
    "Harita": p.placeUrl || "",
    "Feature ID": p.fid || "",
  }));
}
function download(content, filename, type) {
  const blob = content instanceof Blob ? content : new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function fname(ext) {
  const d = new Date().toISOString().slice(0, 10);
  return `dizin-${(state.query || "kesfet").replace(/[^\wçğıöşü-]+/gi, "-").toLowerCase()}-${d}.${ext}`;
}
function toCSV(rs) {
  if (!rs.length) return "";
  const h = Object.keys(rs[0]);
  const e = (v) => { const s = String(v ?? ""); return /[",\r\n;]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
  return "﻿" + [h.join(","), ...rs.map((r) => h.map((k) => e(r[k])).join(","))].join("\r\n");
}
async function ensureXLSX() {
  if (window.XLSX) return window.XLSX;
  await new Promise((res, rej) => {
    const s = document.createElement("script");
    s.src = "https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js";
    s.onload = res; s.onerror = () => rej(new Error("Excel kütüphanesi yüklenemedi"));
    document.head.appendChild(s);
  });
  return window.XLSX;
}
async function exportData(fmt) {
  const rs = rows();
  if (!rs.length) { alert("Önce keşfet."); return; }
  if (fmt === "json") return download(JSON.stringify({ query: state.query, count: rs.length, places: applyView() }, null, 2), fname("json"), "application/json");
  if (fmt === "csv") return download(toCSV(rs), fname("csv"), "text/csv;charset=utf-8");
  if (fmt === "xlsx") {
    try {
      const XLSX = await ensureXLSX();
      const ws = XLSX.utils.json_to_sheet(rs);
      ws["!cols"] = [{ wch: 5 }, { wch: 30 }, { wch: 6 }, { wch: 10 }, { wch: 50 }, { wch: 40 }, { wch: 26 }];
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Dizin");
      XLSX.writeFile(wb, fname("xlsx"));
    } catch (e) { alert("Excel oluşturulamadı: " + e.message); }
  }
}

// ---------- Kayıtlı dizinler ----------
async function loadSavedList() {
  let list = [];
  try {
    const r = await fetch("/api/places-list");
    if (r.ok) list = await r.json();
  } catch {}
  if (!list.length) {
    try { const r2 = await fetch("./places-index.json"); if (r2.ok) list = await r2.json(); } catch {}
  }
  if (!list.length) { els.saved.innerHTML = ""; return; }
  els.saved.innerHTML =
    '<span class="muted">Kayıtlı dizinler:</span> ' +
    list.map((d) => `<button type="button" class="chip" data-slug="${d.slug}">${d.query} (${d.count})</button>`).join(" ");
}

async function loadSaved(slug) {
  els.status.textContent = "Yükleniyor…";
  let data = null;
  try {
    const r = await fetch("/api/places?slug=" + encodeURIComponent(slug));
    if (r.ok) data = await r.json();
  } catch {}
  if (!data) { try { const r2 = await fetch(`./places-${slug}.json`); if (r2.ok) data = await r2.json(); } catch {} }
  if (!data) { els.status.textContent = "Dizin yüklenemedi."; return; }
  state.places = data.places || [];
  state.query = data.query || slug;
  els.status.textContent = `${state.places.length} işletme yüklendi.`;
  render();
}

// ---------- Olaylar ----------
els.saved.addEventListener("click", (e) => { const b = e.target.closest("button[data-slug]"); if (b) loadSaved(b.dataset.slug); });
els.form.addEventListener("submit", (e) => { e.preventDefault(); const q = els.q.value.trim(); if (q) discover(q); });
els.cityBtn.addEventListener("click", () => { const c = els.city.value.trim(); if (c) scanCity(c); else els.status.textContent = "Şehir yaz (ör. Ankara)."; });
els.filter.addEventListener("input", (e) => { state.filter = e.target.value; render(); });
els.sort.addEventListener("change", (e) => { state.sort = e.target.value; render(); });
els.exportEl.addEventListener("click", (e) => { const b = e.target.closest("button[data-fmt]"); if (b) exportData(b.dataset.fmt); });
els.rows.addEventListener("click", (e) => { const b = e.target.closest("button.collect"); if (b) collect(b); });

loadSavedList();
