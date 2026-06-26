// Çankaya veri seti görüntüleyici: restoran seç (veya tümü), ara/filtre/sırala,
// yazar istatistikleriyle yorum kartları, CSV/Excel/JSON export.

const DATASET = "cankaya-ornek";
const state = { all: [], search: "", rating: "all", sort: "newest", rest: "", manifest: [] };

const $ = (id) => document.getElementById(id);
const els = {
  avg: $("avg-rating"), stars: $("avg-stars"), total: $("total-count"),
  sel: $("rest-select"), dist: $("rating-dist"), info: $("dataset-info"),
  search: $("search"), filters: $("rating-filters"), sort: $("sort"),
  exportEl: $("export"), result: $("result-count"), reviews: $("reviews"),
};

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const trn = (n) => (typeof n === "number" ? n.toLocaleString("tr-TR") : "");
const getRating = (r) => (typeof r.rating === "number" ? r.rating : 0);
const starsHtml = (n) => { const f = Math.round(+n || 0); let o = ""; for (let i = 1; i <= 5; i++) o += `<span class="s${i <= f ? " on" : ""}">★</span>`; return o; };
const initials = (n) => String(n || "?").trim().split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() || "").join("");

async function loadJSON(url) { const r = await fetch(url, { cache: "no-store" }); if (!r.ok) throw new Error(url); return r.json(); }

async function loadManifest() {
  try { state.manifest = await loadJSON(`./${DATASET}-manifest.json`); } catch { state.manifest = []; }
}

async function loadRestaurant(slug) {
  if (slug === "__all__") {
    const all = [];
    for (const m of state.manifest) {
      try {
        const d = await loadJSON(`./${DATASET}/${m.slug}.json`);
        for (const r of d.reviews) all.push({ ...r, _restoran: d.business });
      } catch {}
    }
    return { business: "Tüm restoranlar", count: all.length, averageRating: avgOf(all), reviews: all };
  }
  const d = await loadJSON(`./${DATASET}/${slug}.json`);
  d.reviews = d.reviews.map((r) => ({ ...r, _restoran: d.business }));
  return d;
}

function avgOf(list) {
  const r = list.filter((x) => typeof x.rating === "number");
  return r.length ? Number((r.reduce((s, x) => s + x.rating, 0) / r.length).toFixed(2)) : 0;
}

function renderSummary(data) {
  const avg = Number(data.averageRating || 0);
  els.avg.textContent = avg ? avg.toFixed(1) : "–";
  els.stars.innerHTML = starsHtml(avg);
  els.total.textContent = `${trn(data.count || 0)} yorum`;
  // dağılım
  const c = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 }; let rated = 0;
  for (const r of state.all) { const v = Math.round(getRating(r)); if (v >= 1 && v <= 5) { c[v]++; rated++; } }
  els.dist.innerHTML = [5, 4, 3, 2, 1].map((s) => {
    const pct = rated ? Math.round((c[s] / rated) * 100) : 0;
    return `<div class="dist-row"><span class="dist-star">${s} ★</span><span class="dist-bar"><span class="dist-fill" style="width:${pct}%"></span></span><span class="dist-count">${trn(c[s])}</span></div>`;
  }).join("");
}

function applyView() {
  let list = state.all.map((r, i) => ({ r, i }));
  if (state.rating !== "all") { const t = +state.rating; list = list.filter(({ r }) => Math.round(getRating(r)) === t); }
  const q = state.search.trim().toLocaleLowerCase("tr");
  if (q) list = list.filter(({ r }) => `${r.text || ""} ${r.author?.name || ""} ${r._restoran || ""}`.toLocaleLowerCase("tr").includes(q));
  list.sort((a, b) => {
    switch (state.sort) {
      case "oldest": return b.i - a.i;
      case "highest": return getRating(b.r) - getRating(a.r) || a.i - b.i;
      case "lowest": return getRating(a.r) - getRating(b.r) || a.i - b.i;
      case "author": return (b.r.author?.reviewCount || 0) - (a.r.author?.reviewCount || 0);
      default: return a.i - b.i; // newest (çekme sırası)
    }
  });
  return list.map(({ r }) => r);
}

function card(r) {
  const name = r.author?.name || "Anonim";
  const sub = [];
  if (r.author?.reviewCount != null) sub.push(`${trn(r.author.reviewCount)} yorum`);
  if (r.author?.localGuide) sub.push("Yerel Rehber");
  const avatar = r.author?.photo
    ? `<img class="avatar" src="${esc(r.author.photo)}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.replaceWith(Object.assign(document.createElement('div'),{className:'avatar-fallback',textContent:'${esc(initials(name))}'}))" />`
    : `<div class="avatar-fallback">${esc(initials(name))}</div>`;
  const resp = r.response?.text
    ? `<div class="owner-response"><span class="label">İşletme yanıtı${r.response.date ? ` · ${esc(r.response.date)}` : ""}</span>${esc(r.response.text)}</div>` : "";
  const body = r.text ? `<div class="review-body">${esc(r.text)}</div>` : `<div class="review-body empty-text">(Yalnızca puan)</div>`;
  const el = document.createElement("article");
  el.className = "review";
  el.innerHTML = `
    <div class="review-head">${avatar}
      <div class="review-author">
        <span class="name">${esc(name)}${state.rest === "__all__" && r._restoran ? ` <span class="muted">· ${esc(r._restoran)}</span>` : ""}</span>
        <span class="review-meta">
          <span class="stars">${starsHtml(getRating(r))}</span>
          ${r.relativeDate ? `<span>·</span><span>${esc(r.relativeDate)}</span>` : ""}
          ${sub.length ? `<span>·</span><span class="muted">${esc(sub.join(" · "))}</span>` : ""}
        </span>
      </div>
    </div>${body}${resp}`;
  return el;
}

function render() {
  const list = applyView();
  els.result.textContent = state.all.length
    ? `${trn(list.length)} yorum gösteriliyor${list.length !== state.all.length ? ` (toplam ${trn(state.all.length)})` : ""}` : "";
  els.reviews.replaceChildren(...list.slice(0, 3000).map(card));
  if (list.length > 3000) {
    const note = document.createElement("p");
    note.className = "muted"; note.style.textAlign = "center"; note.style.padding = "16px";
    note.textContent = `İlk 3000 gösteriliyor (${trn(list.length)} toplam). Tümü için CSV/JSON indirin.`;
    els.reviews.appendChild(note);
  }
}

// ---------- Export ----------
function rows(list) {
  return list.map((r, i) => ({
    "#": i + 1, Restoran: r._restoran || "", Yazar: r.author?.name || "",
    "Yazar Yorum Sayısı": r.author?.reviewCount ?? "", "Yerel Rehber": r.author?.localGuide ? "Evet" : "Hayır",
    Puan: r.rating ?? "", Tarih: r.relativeDate || "", Yorum: r.text || "",
    "İşletme Yanıtı": r.response?.text || "", "Bu Yorumda Foto": r.reviewPhotoCount ?? 0, "Yorum ID": r.review_id || "",
  }));
}
function dl(content, fn, type) {
  const b = content instanceof Blob ? content : new Blob([content], { type });
  const u = URL.createObjectURL(b); const a = document.createElement("a");
  a.href = u; a.download = fn; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(u), 1000);
}
const fn = (ext) => `cankaya-${(state.rest === "__all__" ? "tum" : state.rest || "veri")}-${new Date().toISOString().slice(0, 10)}.${ext}`;
function toCSV(rs) { if (!rs.length) return ""; const h = Object.keys(rs[0]); const e = (v) => { const s = String(v ?? ""); return /[",\r\n;]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; }; return "﻿" + [h.join(","), ...rs.map((r) => h.map((k) => e(r[k])).join(","))].join("\r\n"); }
async function xlsx() { if (window.XLSX) return window.XLSX; await new Promise((res, rej) => { const s = document.createElement("script"); s.src = "https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js"; s.onload = res; s.onerror = () => rej(new Error("Excel yüklenemedi")); document.head.appendChild(s); }); return window.XLSX; }
async function doExport(fmt) {
  const list = applyView(); if (!list.length) return alert("Veri yok.");
  if (fmt === "json") return dl(JSON.stringify(list, null, 2), fn("json"), "application/json");
  const rs = rows(list);
  if (fmt === "csv") return dl(toCSV(rs), fn("csv"), "text/csv;charset=utf-8");
  if (fmt === "xlsx") { try { const X = await xlsx(); const ws = X.utils.json_to_sheet(rs); const wb = X.utils.book_new(); X.utils.book_append_sheet(wb, ws, "Yorumlar"); X.writeFile(wb, fn("xlsx")); } catch (e) { alert("Excel: " + e.message); } }
}

// ---------- Akış ----------
async function selectRest(slug) {
  state.rest = slug;
  els.result.textContent = "Yükleniyor…";
  try {
    const data = await loadRestaurant(slug);
    state.all = data.reviews || [];
    renderSummary(data);
    render();
  } catch (e) { els.result.textContent = "Yüklenemedi: " + e.message; }
}

async function init() {
  await loadManifest();
  if (!state.manifest.length) { els.result.textContent = "Veri seti bulunamadı."; return; }
  const total = state.manifest.reduce((s, m) => s + (m.count || 0), 0);
  els.info.textContent = `${state.manifest.length} restoran · ${trn(total)} yorum`;
  els.sel.innerHTML =
    `<option value="__all__">Tüm restoranlar (${trn(total)})</option>` +
    state.manifest.map((m) => `<option value="${m.slug}">${esc(m.label)} (${trn(m.count)})</option>`).join("");
  els.sel.value = state.manifest[0].slug;
  els.sel.addEventListener("change", (e) => selectRest(e.target.value));
  els.search.addEventListener("input", (e) => { state.search = e.target.value; render(); });
  els.sort.addEventListener("change", (e) => { state.sort = e.target.value; render(); });
  els.filters.addEventListener("click", (e) => { const b = e.target.closest(".chip"); if (!b) return; state.rating = b.dataset.rating; els.filters.querySelectorAll(".chip").forEach((c) => c.classList.toggle("is-active", c === b)); render(); });
  els.exportEl.addEventListener("click", (e) => { const b = e.target.closest("button[data-fmt]"); if (b) doExport(b.dataset.fmt); });
  await selectRest(state.manifest[0].slug);
}

init();
