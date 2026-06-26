// "Keşfet": bir bölge+kategori aramasından işletme DİZİNİNİ çıkarır
// (ad, puan, yorum sayısı, kategori/adres, feature-id, harita linki). Yorumları çekmez.
// discoverCity: bir şehrin tüm ilçelerini gezip birleşik dizin üretir.

import { chromium } from "playwright";
import { writeFile, mkdir } from "node:fs/promises";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join } from "node:path";
import { slugify } from "./branches.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, "data");
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Şehir -> taranacak ilçe/semt listesi (yoğun bölgeler dahil; her arama ~120 yerle sınırlı).
export const CITY_AREAS = {
  ankara: [
    "Çankaya", "Kızılay", "Bahçelievler", "Çayyolu", "Ümitköy", "Keçiören",
    "Yenimahalle", "Batıkent", "Demetevler", "Mamak", "Etimesgut", "Eryaman",
    "Sincan", "Altındağ", "Ulus", "Pursaklar", "Gölbaşı", "Dikmen", "Tunalı Hilmi",
  ],
  izmir: [
    "Konak", "Alsancak", "Bornova", "Karşıyaka", "Bostanlı", "Mavişehir", "Bayraklı",
    "Buca", "Çiğli", "Gaziemir", "Balçova", "Narlıdere", "Karabağlar", "Göztepe", "Güzelbahçe",
  ],
};

// Restoran alt-türleri: derin taramada tek "restoran" aramasının ~120 sınırını aşmak için
// her tür ayrı aranıp birleştirilir (yalnızca yeme-içme; araç restoran-odaklı).
export const FOOD_CATEGORIES = [
  "restoran", "lokanta", "ev yemekleri", "kebapçı", "dönerci", "pideci", "pizzacı",
  "izgara", "köfteci", "çorbacı", "kahvaltı", "cafe", "mantı", "çiğköfte",
  "balık restoran", "tatlıcı", "fast food", "burger", "meyhane", "vegan restoran",
];

function buildSearchUrl(query) {
  if (/^https?:\/\/(www\.)?google\.[^/]+\/maps\//.test(query)) return query;
  return `https://www.google.com/maps/search/${encodeURIComponent(query)}?hl=tr`;
}

async function dismissConsent(page) {
  for (const label of ["Tümünü kabul et", "Accept all", "Kabul et", "Tümünü reddet", "Reddet"]) {
    const b = page.getByRole("button", { name: label });
    if (await b.count().catch(() => 0)) { await b.first().click().catch(() => {}); await sleep(1200); return; }
  }
}

// Sayfa içi ayıklayıcı (init script).
function pageExtractPlaces() {
  window.__extractPlaces = function () {
    const toFloat = (s) => { const m = String(s || "").match(/(\d+(?:[.,]\d+)?)/); return m ? parseFloat(m[1].replace(",", ".")) : null; };
    const toInt = (s) => { const m = String(s || "").match(/(\d[\d.\s]*)/); return m ? parseInt(m[1].replace(/[.\s]/g, ""), 10) : null; };
    const cards = [...document.querySelectorAll('[role="feed"] > div')].filter((d) => d.querySelector('a[href*="/maps/place/"]'));
    return cards.map((card) => {
      const a = card.querySelector('a[href*="/maps/place/"]');
      const href = a.href;
      const name = a.getAttribute("aria-label") || card.querySelector(".qBF1Pd")?.textContent?.trim() || "";
      const fid = (href.match(/!1s(0x[0-9a-f]+:0x[0-9a-f]+)/i) || [])[1] || "";
      let rating = null, reviewCount = null;
      const star = card.querySelector('[role="img"][aria-label*="ıldız"], [role="img"][aria-label*="star" i]');
      if (star) {
        const al = star.getAttribute("aria-label") || "";
        const rm = al.match(/(\d+(?:[.,]\d+)?)\s*(?:yıldız|star)/i); if (rm) rating = toFloat(rm[1]);
        const cm = al.match(/(\d[\d.\s]*)\s*(?:yorum|review|değerlendirme)/i); if (cm) reviewCount = toInt(cm[1]);
      }
      if (rating == null) rating = toFloat(card.querySelector(".MW4etd")?.textContent);
      if (reviewCount == null) reviewCount = toInt(card.querySelector(".UY7F9")?.textContent);
      const lines = [...card.querySelectorAll(".W4Efsd")]
        .map((e) => e.textContent.replace(/\s+/g, " ").trim())
        .filter(Boolean)
        .filter((t) => !/^\d+[.,]\d+\s*\(/.test(t));
      const info = [...new Set(lines)].join(" · ").replace(/(·\s*)+/g, "· ").slice(0, 220);
      return { name, rating, reviewCount, info, fid, placeUrl: href.split("?")[0] };
    }).filter((p) => p.name);
  };
}

// Tek bir aramayı (verilen sayfada) sona kadar kaydırıp dizini döndürür.
async function discoverOnPage(page, query, { maxScrolls = 140, label = "" } = {}) {
  await page.goto(buildSearchUrl(query), { waitUntil: "domcontentloaded", timeout: 60000 });
  await sleep(3500);
  await dismissConsent(page);
  await page.evaluate(pageExtractPlaces);
  let stable = 0, last = -1;
  for (let i = 0; i < maxScrolls; i++) {
    const n = await page.evaluate(() => {
      const feed = document.querySelector('[role="feed"]');
      if (feed) feed.scrollTo(0, feed.scrollHeight);
      return document.querySelectorAll('[role="feed"] a[href*="/maps/place/"]').length;
    });
    const end = await page.evaluate(() => /listenin sonu|end of the list|sonuna ula/i.test(document.body.innerText));
    if (n === last) stable++; else { stable = 0; last = n; }
    if (end || stable >= 6) break;
    await sleep(850);
  }
  const places = await page.evaluate(() => window.__extractPlaces());
  if (label) console.log(`  [${label}] ${places.length} yer`);
  return places;
}

async function launch(headless) {
  const launchArgs = { headless, args: ["--disable-blink-features=AutomationControlled", "--no-sandbox", "--lang=tr-TR"] };
  let browser;
  try { browser = await chromium.launch({ ...launchArgs, channel: "chrome" }); }
  catch { browser = await chromium.launch(launchArgs); }
  const context = await browser.newContext({ userAgent: UA, locale: "tr-TR", timezoneId: "Europe/Istanbul", viewport: { width: 1360, height: 950 } });
  await context.addInitScript(() => { Object.defineProperty(navigator, "webdriver", { get: () => undefined }); });
  return { browser, context };
}

function dedupe(places) {
  const seen = new Set();
  return places.filter((p) => { const k = p.fid || p.placeUrl || p.name; if (seen.has(k)) return false; seen.add(k); return true; });
}

async function save(query, places) {
  const slug = slugify(query);
  const payload = { query, slug, scrapedAt: new Date().toISOString(), count: places.length, places };
  await mkdir(DATA_DIR, { recursive: true });
  await writeFile(join(DATA_DIR, `places-${slug}.json`), JSON.stringify(payload, null, 2), "utf8");
  console.log(`\nKeşfedilen yer: ${places.length} -> data/places-${slug}.json`);
  return payload;
}

// Bir sorgu listesini paralel batch'lerle gezip birleştirir (ortak çekirdek).
async function runQueriesMerged(context, queries, { concurrency = 3, onProgress } = {}) {
  const merged = new Map();
  for (let i = 0; i < queries.length; i += concurrency) {
    const batch = queries.slice(i, i + concurrency);
    const results = await Promise.all(
      batch.map(async (q) => {
        const page = await context.newPage();
        try { return await discoverOnPage(page, q, { label: q }); }
        catch (e) { console.warn(`  [${q}] hata: ${e.message}`); return []; }
        finally { await page.close().catch(() => {}); }
      })
    );
    for (const arr of results) for (const p of arr) merged.set(p.fid || p.placeUrl || p.name, p);
    if (onProgress) onProgress(Math.min(i + concurrency, queries.length), queries.length, merged.size);
  }
  return [...merged.values()];
}

async function withBrowser(headless, fn) {
  const { browser, context } = await launch(headless);
  try {
    const warm = await context.newPage();
    await warm.goto("https://www.google.com/?hl=tr", { waitUntil: "domcontentloaded", timeout: 60000 });
    await sleep(1200); await dismissConsent(warm); await warm.close().catch(() => {});
    return await fn(context);
  } finally { await browser.close().catch(() => {}); }
}

// Tek bölge dizini. deep=true -> restoran alt-türlerini ayrı ayrı arayıp birleştir (daha tam).
export async function discoverPlaces(query, { headless = process.env.HEADLESS !== "0", deep = false, concurrency = 3 } = {}) {
  const queries = deep ? FOOD_CATEGORIES.map((c) => `${query} ${c}`) : [query];
  console.log(`Keşfet: "${query}"${deep ? ` (derin: ${queries.length} restoran türü)` : ""}`);
  const places = await withBrowser(headless, (context) =>
    runQueriesMerged(context, queries, {
      concurrency,
      onProgress: deep ? (done, total, size) => console.log(`  türler ${done}/${total} → birleşik: ${size}`) : null,
    })
  );
  return save(query, places);
}

// Şehir dizini: tüm ilçeleri gez. deep=true -> her ilçede restoran alt-türlerini de ayrı ara.
export async function discoverCity(city, category = "restoran", { headless = process.env.HEADLESS !== "0", concurrency = 3, areas, deep = false } = {}) {
  const list = areas || CITY_AREAS[slugify(city)] || CITY_AREAS[String(city).toLowerCase()] || null;
  if (!list) throw new Error(`"${city}" için ilçe listesi yok. Bilinen: ${Object.keys(CITY_AREAS).join(", ")}`);
  const queries = deep
    ? list.flatMap((area) => FOOD_CATEGORIES.map((c) => `${area} ${c}`))
    : list.map((area) => `${area} ${category}`);
  console.log(`Şehir taraması: ${city} — ${list.length} bölge${deep ? ` × ${FOOD_CATEGORIES.length} tür = ${queries.length} arama` : ""}`);
  const places = await withBrowser(headless, (context) =>
    runQueriesMerged(context, queries, {
      concurrency,
      onProgress: (done, total, size) => console.log(`— ${done}/${total} arama bitti → birleşik: ${size}`),
    })
  );
  return save(`${city} ${category}${deep ? " (tüm ilçeler, derin)" : " (tüm ilçeler)"}`, places);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  let args = process.argv.slice(2);
  const deep = args.includes("--deep");
  args = args.filter((a) => a !== "--deep");
  if (args[0] === "--city") {
    discoverCity(args[1] || "ankara", args[2] || "restoran", { deep }).catch((e) => { console.error("Şehir taraması başarısız:", e); process.exit(1); });
  } else {
    discoverPlaces(args.join(" ") || "Bornova restoran", { deep }).catch((e) => { console.error("Keşfet başarısız:", e); process.exit(1); });
  }
}
