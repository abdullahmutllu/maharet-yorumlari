// Frontend mantığı: yorumları yükle, filtrele/sırala/ara, ekrana çiz.
// Veri şeması (scrape.js çıktısı):
//   { review_id, author:{name,photo}, rating, text, relativeDate, response:{text,date}|null, images:[url]|null }

const state = {
  all: [],
  search: "",
  rating: "all",
  sort: "newest",
  branch: null,       // seçili şube slug'ı
  staticMode: false,  // arka uç yoksa (GitHub Pages)
  business: "",
  branchLabel: "",
  scrapedAt: null,
};

const els = {
  businessName: document.getElementById("business-name"),
  avgRating: document.getElementById("avg-rating"),
  avgStars: document.getElementById("avg-stars"),
  totalCount: document.getElementById("total-count"),
  scrapedAt: document.getElementById("scraped-at"),
  refreshBtn: document.getElementById("refresh-btn"),
  loginBtn: document.getElementById("login-btn"),
  loginStatus: document.getElementById("login-status"),
  branchSelect: document.getElementById("branch-select"),
  addForm: document.getElementById("add-branch"),
  addUrl: document.getElementById("add-url"),
  addLabel: document.getElementById("add-label"),
  addBtn: document.getElementById("add-btn"),
  addStatus: document.getElementById("add-status"),
  search: document.getElementById("search"),
  ratingFilters: document.getElementById("rating-filters"),
  sort: document.getElementById("sort"),
  resultCount: document.getElementById("result-count"),
  reviews: document.getElementById("reviews"),
  empty: document.getElementById("empty"),
  ratingDist: document.getElementById("rating-dist"),
  exportEl: document.getElementById("export"),
};

// ---------- Yardımcılar ----------

function escapeHtml(str) {
  return String(str ?? "").replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])
  );
}

const getRating = (r) => (typeof r.rating === "number" ? r.rating : 0);
const getText = (r) => r.text || "";
const getAuthorName = (r) => r.author?.name || "Anonim";
const getAuthorPhoto = (r) => r.author?.photo || null;
const getImages = (r) => (Array.isArray(r.images) ? r.images : []);

function starsHtml(rating) {
  const full = Math.round(Number(rating) || 0);
  let out = "";
  for (let i = 1; i <= 5; i++) out += `<span class="s${i <= full ? " on" : ""}">★</span>`;
  return out;
}

function initials(name) {
  return String(name || "?")
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() || "")
    .join("");
}

function formatScrapedAt(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  return isNaN(d.getTime())
    ? ""
    : d.toLocaleDateString("tr-TR", { year: "numeric", month: "long", day: "numeric" });
}

// ---------- Render ----------

function renderSummary(data) {
  if (data.business) els.businessName.textContent = data.business;
  state.business = data.business || "";
  state.branchLabel = data.branch?.label || "";
  state.scrapedAt = data.scrapedAt || null;
  const avg = Number(data.averageRating || 0);
  els.avgRating.textContent = avg ? avg.toFixed(1) : "–";
  els.avgStars.innerHTML = starsHtml(avg);
  els.totalCount.textContent = `${data.count || 0} yorum`;
  els.scrapedAt.textContent = data.scrapedAt ? `Son güncelleme: ${formatScrapedAt(data.scrapedAt)}` : "";
  renderStats();
}

// Puan dağılımı (5★→1★) + mini istatistikler.
function renderStats() {
  const list = state.all;
  if (!list.length) { els.ratingDist.innerHTML = ""; return; }
  const counts = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  let rated = 0;
  for (const r of list) {
    const v = Math.round(getRating(r));
    if (v >= 1 && v <= 5) { counts[v]++; rated++; }
  }
  const withText = list.filter((r) => getText(r)).length;
  const withPhoto = list.filter((r) => getImages(r).length).length;
  const withResp = list.filter((r) => r.response?.text).length;

  const bars = [5, 4, 3, 2, 1]
    .map((star) => {
      const c = counts[star];
      const pct = rated ? Math.round((c / rated) * 100) : 0;
      return `
        <div class="dist-row">
          <span class="dist-star">${star} ★</span>
          <span class="dist-bar"><span class="dist-fill" style="width:${pct}%"></span></span>
          <span class="dist-count">${c.toLocaleString("tr-TR")}</span>
        </div>`;
    })
    .join("");

  els.ratingDist.innerHTML = `
    <div class="dist-bars">${bars}</div>
    <div class="dist-meta muted">
      <span>📝 ${withText.toLocaleString("tr-TR")} metinli</span>
      <span>📷 ${withPhoto.toLocaleString("tr-TR")} fotoğraflı</span>
      <span>💬 ${withResp.toLocaleString("tr-TR")} işletme yanıtlı</span>
    </div>`;
}

function applyFilters() {
  const q = state.search.trim().toLocaleLowerCase("tr");
  // orijinal sıra = scrape sırası (en yeni önce)
  let list = state.all.map((r, i) => ({ r, i }));

  if (state.rating !== "all") {
    const target = Number(state.rating);
    list = list.filter(({ r }) => Math.round(getRating(r)) === target);
  }
  if (q) {
    list = list.filter(({ r }) =>
      `${getText(r)} ${getAuthorName(r)}`.toLocaleLowerCase("tr").includes(q)
    );
  }

  list.sort((a, b) => {
    switch (state.sort) {
      case "oldest":
        return b.i - a.i;
      case "highest":
        return getRating(b.r) - getRating(a.r) || a.i - b.i;
      case "lowest":
        return getRating(a.r) - getRating(b.r) || a.i - b.i;
      case "newest":
      default:
        return a.i - b.i;
    }
  });

  return list.map(({ r }) => r);
}

function reviewCard(r) {
  const name = getAuthorName(r);
  const photo = getAuthorPhoto(r);
  const rating = getRating(r);
  const date = r.relativeDate || "";
  const text = getText(r);
  const response = r.response?.text || null;
  const responseDate = r.response?.date || "";
  const images = getImages(r);

  const avatar = photo
    ? `<img class="avatar" src="${escapeHtml(photo)}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.replaceWith(Object.assign(document.createElement('div'),{className:'avatar-fallback',textContent:'${escapeHtml(
        initials(name)
      )}'}))" />`
    : `<div class="avatar-fallback">${escapeHtml(initials(name))}</div>`;

  const photosHtml = images.length
    ? `<div class="review-photos">${images
        .map(
          (u) =>
            `<a href="${escapeHtml(u)}" target="_blank" rel="noopener"><img src="${escapeHtml(
              u
            )}" alt="" loading="lazy" referrerpolicy="no-referrer" /></a>`
        )
        .join("")}</div>`
    : "";

  const responseHtml = response
    ? `<div class="owner-response"><span class="label">İşletme yanıtı${
        responseDate ? ` · ${escapeHtml(responseDate)}` : ""
      }</span>${escapeHtml(response)}</div>`
    : "";

  const bodyHtml = text
    ? `<div class="review-body">${escapeHtml(text)}</div>`
    : `<div class="review-body empty-text">(Yorum metni yok — yalnızca puan)</div>`;

  const card = document.createElement("article");
  card.className = "review";
  card.innerHTML = `
    <div class="review-head">
      ${avatar}
      <div class="review-author">
        <span class="name">${escapeHtml(name)}</span>
        <span class="review-meta">
          <span class="stars">${starsHtml(rating)}</span>
          ${date ? `<span>·</span><span>${escapeHtml(date)}</span>` : ""}
        </span>
      </div>
    </div>
    ${bodyHtml}
    ${photosHtml}
    ${responseHtml}
  `;
  return card;
}

function render() {
  const list = applyFilters();
  els.resultCount.textContent = state.all.length
    ? `${list.length} yorum gösteriliyor${
        list.length !== state.all.length ? ` (toplam ${state.all.length})` : ""
      }`
    : "";
  els.reviews.replaceChildren(...list.map(reviewCard));
  els.empty.classList.toggle("hidden", state.all.length !== 0);
}

// ---------- Veri ----------

// Önce yerel sunucudaki /api/reviews denenir; başarısızsa (ör. GitHub Pages gibi
// statik barındırma) yanındaki reviews.json'dan okunur.
// Şube listesi: önce /api/branches, başarısızsa statik ./branches.json.
async function fetchBranches() {
  try {
    const r = await fetch("/api/branches", { cache: "no-store" });
    if (r.ok) {
      const j = await r.json();
      if (Array.isArray(j) && j.length) return { branches: j, staticMode: false };
    }
  } catch {}
  try {
    const r2 = await fetch("./branches.json", { cache: "no-store" });
    const j2 = await r2.json();
    if (Array.isArray(j2) && j2.length) return { branches: j2, staticMode: true };
  } catch {}
  return { branches: [], staticMode: true };
}

// Bir şubenin yorumları: önce /api/reviews?branch=, başarısızsa ./reviews-<slug>.json.
async function fetchBranchData(slug) {
  try {
    const r = await fetch(`/api/reviews?branch=${encodeURIComponent(slug)}`, { cache: "no-store" });
    if (r.ok) {
      const j = await r.json();
      if (j && Array.isArray(j.reviews)) return j;
    }
  } catch {}
  const r2 = await fetch(`./reviews-${slug}.json`, { cache: "no-store" });
  return await r2.json();
}

async function loadReviews() {
  const data = await fetchBranchData(state.branch);
  state.all = Array.isArray(data.reviews) ? data.reviews : [];
  renderSummary(data);
  render();
}

async function refresh() {
  const btn = els.refreshBtn;
  btn.disabled = true;
  btn.classList.add("is-loading");
  btn.querySelector(".btn-label").textContent = "Çekiliyor";
  try {
    const res = await fetch(`/api/scrape?branch=${encodeURIComponent(state.branch)}`, { method: "POST" });
    const data = await res.json();
    if (!res.ok) throw new Error(data.detail || "Hata");
    state.all = Array.isArray(data.reviews) ? data.reviews : [];
    renderSummary(data);
    render();
  } catch (err) {
    alert("Yorumlar çekilemedi: " + err.message);
  } finally {
    btn.disabled = false;
    btn.classList.remove("is-loading");
    btn.querySelector(".btn-label").textContent = "Yenile";
  }
}

function populateBranches(branches, selectSlug) {
  els.branchSelect.innerHTML = branches
    .map((b) => `<option value="${b.slug}">${b.label}</option>`)
    .join("");
  // Birden çok şube varsa veya şube eklenebiliyorsa (canlı arka uç) seçiciyi göster.
  els.branchSelect.parentElement.style.display =
    branches.length > 1 || !state.staticMode ? "" : "none";
  if (selectSlug) els.branchSelect.value = selectSlug;
}

// "Link yapıştır → topla": yeni şube ekle, çek, seçili yap.
async function addBranch(e) {
  e.preventDefault();
  const url = els.addUrl.value.trim();
  if (!url) return;
  const label = els.addLabel.value.trim();
  els.addBtn.disabled = true;
  els.addBtn.classList.add("is-loading");
  els.addBtn.querySelector(".btn-label").textContent = "Toplanıyor";
  els.addStatus.textContent = "Yorumlar toplanıyor… (birkaç dakika sürebilir)";
  try {
    const res = await fetch("/api/branches", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url, label }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.detail || data.error || "Hata");
    els.addStatus.textContent = `Eklendi: ${data.branch.label} — ${data.count} yorum (ort. ${data.averageRating})`;
    els.addUrl.value = "";
    els.addLabel.value = "";
    const { branches } = await fetchBranches();
    state.branch = data.branch.slug;
    populateBranches(branches, state.branch);
    await loadReviews();
  } catch (err) {
    els.addStatus.textContent = "Hata: " + err.message;
  } finally {
    els.addBtn.disabled = false;
    els.addBtn.classList.remove("is-loading");
    els.addBtn.querySelector(".btn-label").textContent = "Topla";
  }
}

// ---------- Google giriş (tam kapsam) ----------
function setLoginUI(loggedIn) {
  if (!els.loginBtn) return;
  els.loginBtn.dataset.state = loggedIn ? "in" : "out";
  els.loginBtn.querySelector(".btn-label").textContent = loggedIn ? "Çıkış" : "Google ile giriş";
  els.loginStatus.textContent = loggedIn ? "Google: giriş yapıldı ✓" : "";
}

async function refreshLoginStatus() {
  try {
    const r = await fetch("/api/login-status");
    const j = await r.json();
    setLoginUI(!!j.loggedIn);
    return !!j.loggedIn;
  } catch {
    setLoginUI(false);
    return false;
  }
}

async function handleLogin() {
  if (els.loginBtn.dataset.state === "in") {
    if (!confirm("Google oturumu silinsin mi?")) return;
    els.loginBtn.disabled = true;
    try { await fetch("/api/logout", { method: "POST" }); } catch {}
    await refreshLoginStatus();
    els.loginBtn.disabled = false;
    return;
  }
  els.loginBtn.disabled = true;
  els.loginStatus.textContent = "Tarayıcı açıldı — açılan pencerede Google'a giriş yapın…";
  try {
    const r = await fetch("/api/login", { method: "POST" });
    const j = await r.json();
    if (j.loggedIn) {
      setLoginUI(true);
      els.loginStatus.textContent = "Giriş yapıldı ✓ — artık 'Yenile' tüm yorumları çeker.";
    } else {
      setLoginUI(false);
      els.loginStatus.textContent = "Giriş algılanamadı, tekrar deneyin.";
    }
  } catch (e) {
    els.loginStatus.textContent = "Giriş hatası: " + e.message;
  } finally {
    els.loginBtn.disabled = false;
  }
}

// Şube seçiciyi doldur ve ilk şubeyi yükle.
async function init() {
  const { branches, staticMode } = await fetchBranches();
  state.staticMode = staticMode;

  // Statik barındırmada arka uç yok -> "Yenile", "şube ekle", "giriş" gizli.
  if (staticMode) {
    if (els.refreshBtn) els.refreshBtn.style.display = "none";
    if (els.addForm) els.addForm.style.display = "none";
    if (els.loginBtn) els.loginBtn.style.display = "none";
  } else {
    if (els.addForm) els.addForm.addEventListener("submit", addBranch);
    if (els.loginBtn) {
      els.loginBtn.addEventListener("click", handleLogin);
      refreshLoginStatus();
    }
  }

  if (!branches.length) {
    els.resultCount.textContent = "Henüz şube yok. Üstten bir Google Haritalar linki ekleyin.";
    return;
  }

  state.branch = branches[0].slug;
  populateBranches(branches, state.branch);

  els.branchSelect.addEventListener("change", (e) => {
    state.branch = e.target.value;
    loadReviews().catch((err) => {
      console.error(err);
      els.resultCount.textContent = "Yorumlar yüklenemedi.";
    });
  });

  await loadReviews();
}

// ---------- Dışa aktarma (CSV / Excel / JSON) ----------

function exportRows(list) {
  return list.map((r, i) => ({
    "#": i + 1,
    Yazar: getAuthorName(r),
    Puan: getRating(r),
    Tarih: r.relativeDate || "",
    Yorum: getText(r),
    "İşletme Yanıtı": r.response?.text || "",
    "Yanıt Tarihi": r.response?.date || "",
    Fotoğraf: getImages(r).length,
    "Yorum ID": r.review_id || "",
  }));
}

function downloadBlob(content, filename, type) {
  const blob = content instanceof Blob ? content : new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function exportFilename(ext) {
  const d = new Date().toISOString().slice(0, 10);
  return `maharet-${state.branch || "yorumlar"}-${d}.${ext}`;
}

function toCSV(rows) {
  if (!rows.length) return "";
  const headers = Object.keys(rows[0]);
  const esc = (v) => {
    const s = String(v ?? "");
    return /[",\r\n;]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  };
  const lines = [headers.join(",")];
  for (const row of rows) lines.push(headers.map((h) => esc(row[h])).join(","));
  return "﻿" + lines.join("\r\n"); // BOM -> Excel Türkçe karakterleri doğru açar
}

async function ensureXLSX() {
  if (window.XLSX) return window.XLSX;
  await new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = "https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js";
    s.onload = resolve;
    s.onerror = () => reject(new Error("Excel kütüphanesi yüklenemedi"));
    document.head.appendChild(s);
  });
  return window.XLSX;
}

async function exportData(fmt) {
  const list = applyFilters(); // ekrandaki (filtreli/sıralı) yorumlar
  if (!list.length) { alert("Dışa aktarılacak yorum yok."); return; }

  if (fmt === "json") {
    const payload = {
      business: state.business,
      branch: state.branchLabel,
      scrapedAt: state.scrapedAt,
      count: list.length,
      reviews: list,
    };
    downloadBlob(JSON.stringify(payload, null, 2), exportFilename("json"), "application/json");
    return;
  }

  const rows = exportRows(list);
  if (fmt === "csv") {
    downloadBlob(toCSV(rows), exportFilename("csv"), "text/csv;charset=utf-8");
    return;
  }

  if (fmt === "xlsx") {
    try {
      const XLSX = await ensureXLSX();
      const ws = XLSX.utils.json_to_sheet(rows);
      ws["!cols"] = [
        { wch: 5 }, { wch: 22 }, { wch: 6 }, { wch: 14 }, { wch: 60 },
        { wch: 50 }, { wch: 14 }, { wch: 9 }, { wch: 26 },
      ];
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Yorumlar");
      XLSX.writeFile(wb, exportFilename("xlsx"));
    } catch (e) {
      alert("Excel oluşturulamadı: " + e.message + "\nCSV indirip Excel'de açabilirsiniz.");
    }
  }
}

// ---------- Olaylar ----------

els.exportEl.addEventListener("click", (e) => {
  const btn = e.target.closest("button[data-fmt]");
  if (btn) exportData(btn.dataset.fmt);
});

els.search.addEventListener("input", (e) => {
  state.search = e.target.value;
  render();
});
els.sort.addEventListener("change", (e) => {
  state.sort = e.target.value;
  render();
});
els.ratingFilters.addEventListener("click", (e) => {
  const btn = e.target.closest(".chip");
  if (!btn) return;
  state.rating = btn.dataset.rating;
  els.ratingFilters.querySelectorAll(".chip").forEach((c) => c.classList.toggle("is-active", c === btn));
  render();
});
els.refreshBtn.addEventListener("click", refresh);

init().catch((err) => {
  console.error(err);
  els.resultCount.textContent = "Yorumlar yüklenemedi.";
});
