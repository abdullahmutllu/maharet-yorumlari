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
};

const els = {
  businessName: document.getElementById("business-name"),
  avgRating: document.getElementById("avg-rating"),
  avgStars: document.getElementById("avg-stars"),
  totalCount: document.getElementById("total-count"),
  scrapedAt: document.getElementById("scraped-at"),
  refreshBtn: document.getElementById("refresh-btn"),
  branchSelect: document.getElementById("branch-select"),
  search: document.getElementById("search"),
  ratingFilters: document.getElementById("rating-filters"),
  sort: document.getElementById("sort"),
  resultCount: document.getElementById("result-count"),
  reviews: document.getElementById("reviews"),
  empty: document.getElementById("empty"),
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
  const avg = Number(data.averageRating || 0);
  els.avgRating.textContent = avg ? avg.toFixed(1) : "–";
  els.avgStars.innerHTML = starsHtml(avg);
  els.totalCount.textContent = `${data.count || 0} yorum`;
  els.scrapedAt.textContent = data.scrapedAt ? `Son güncelleme: ${formatScrapedAt(data.scrapedAt)}` : "";
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

// Şube seçiciyi doldur ve ilk şubeyi yükle.
async function init() {
  const { branches, staticMode } = await fetchBranches();
  state.staticMode = staticMode;
  // Statik barındırmada arka uç yok -> "Yenile" gizli.
  if (staticMode && els.refreshBtn) els.refreshBtn.style.display = "none";

  if (!branches.length) {
    els.resultCount.textContent = "Şube bulunamadı.";
    return;
  }

  els.branchSelect.innerHTML = branches
    .map((b) => `<option value="${b.slug}">${b.label}</option>`)
    .join("");
  // Tek şube varsa seçiciyi gizle.
  els.branchSelect.parentElement.style.display = branches.length > 1 ? "" : "none";

  state.branch = branches[0].slug;
  els.branchSelect.value = state.branch;

  els.branchSelect.addEventListener("change", (e) => {
    state.branch = e.target.value;
    // filtreleri sıfırlamadan yeni şubeyi yükle
    loadReviews().catch((err) => {
      console.error(err);
      els.resultCount.textContent = "Yorumlar yüklenemedi.";
    });
  });

  await loadReviews();
}

// ---------- Olaylar ----------

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
