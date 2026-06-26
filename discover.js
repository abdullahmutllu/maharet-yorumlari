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

// Tek bölge dizini.
export async function discoverPlaces(query, { headless = process.env.HEADLESS !== "0" } = {}) {
  console.log(`Keşfet: "${query}"`);
  const { browser, context } = await launch(headless);
  let places = [];
  try {
    const warm = await context.newPage();
    await warm.goto("https://www.google.com/?hl=tr", { waitUntil: "domcontentloaded", timeout: 60000 });
    await sleep(1200); await dismissConsent(warm); await warm.close().catch(() => {});
    const page = await context.newPage();
    places = await discoverOnPage(page, query);
    await page.close().catch(() => {});
  } finally { await browser.close().catch(() => {}); }
  return save(query, dedupe(places));
}

// Şehir dizini: tüm ilçeleri (paralel, batch) gezip birleştir.
export async function discoverCity(city, category = "restoran", { headless = process.env.HEADLESS !== "0", concurrency = 3, areas } = {}) {
  const list = areas || CITY_AREAS[slugify(city)] || CITY_AREAS[String(city).toLowerCase()] || null;
  if (!list) throw new Error(`"${city}" için ilçe listesi yok. Bilinen: ${Object.keys(CITY_AREAS).join(", ")}`);
  console.log(`Şehir taraması: ${city} / ${category} — ${list.length} bölge`);

  const { browser, context } = await launch(headless);
  const merged = new Map();
  try {
    const warm = await context.newPage();
    await warm.goto("https://www.google.com/?hl=tr", { waitUntil: "domcontentloaded", timeout: 60000 });
    await sleep(1200); await dismissConsent(warm); await warm.close().catch(() => {});

    for (let i = 0; i < list.length; i += concurrency) {
      const batch = list.slice(i, i + concurrency);
      const results = await Promise.all(
        batch.map(async (area) => {
          const page = await context.newPage();
          try { return await discoverOnPage(page, `${area} ${category}`, { label: area }); }
          catch (e) { console.warn(`  [${area}] hata: ${e.message}`); return []; }
          finally { await page.close().catch(() => {}); }
        })
      );
      for (const arr of results) for (const p of arr) merged.set(p.fid || p.placeUrl || p.name, p);
      console.log(`— Bölgeler ${i + 1}-${Math.min(i + concurrency, list.length)}/${list.length} bitti → birleşik: ${merged.size}`);
    }
  } finally { await browser.close().catch(() => {}); }

  return save(`${city} ${category} (tüm ilçeler)`, [...merged.values()]);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = process.argv.slice(2);
  if (args[0] === "--city") {
    discoverCity(args[1] || "ankara", args[2] || "restoran").catch((e) => { console.error("Şehir taraması başarısız:", e); process.exit(1); });
  } else {
    discoverPlaces(args.join(" ") || "Bornova restoran").catch((e) => { console.error("Keşfet başarısız:", e); process.exit(1); });
  }
}
