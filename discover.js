// "Keşfet": bir bölge+kategori aramasından (ör. "Bornova restoran") tüm işletmelerin
// DİZİNİNİ çıkarır — ad, puan, yorum sayısı, kategori/adres, feature-id, harita linki.
// Yorumları çekmez (hızlı, düşük engellenme riski). Tek tek yorum için bu fid'ler
// runScrape'e şube olarak verilebilir.

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

function buildSearchUrl(query) {
  // Kullanıcı tam bir Google Haritalar URL'i verdiyse onu kullan.
  if (/^https?:\/\/(www\.)?google\.[^/]+\/maps\//.test(query)) return query;
  return `https://www.google.com/maps/search/${encodeURIComponent(query)}?hl=tr`;
}

async function dismissConsent(page) {
  for (const label of ["Tümünü kabul et", "Accept all", "Kabul et", "Tümünü reddet", "Reddet"]) {
    const b = page.getByRole("button", { name: label });
    if (await b.count().catch(() => 0)) { await b.first().click().catch(() => {}); await sleep(1200); return; }
  }
}

// Sayfa içinde dizini ayıklar.
function pageExtractPlaces() {
  window.__extractPlaces = function () {
    const toFloat = (s) => {
      const m = String(s || "").match(/(\d+(?:[.,]\d+)?)/);
      return m ? parseFloat(m[1].replace(",", ".")) : null;
    };
    const toInt = (s) => {
      const m = String(s || "").match(/(\d[\d.\s]*)/);
      return m ? parseInt(m[1].replace(/[.\s]/g, ""), 10) : null;
    };
    const cards = [...document.querySelectorAll('[role="feed"] > div')].filter((d) =>
      d.querySelector('a[href*="/maps/place/"]')
    );
    return cards.map((card) => {
      const a = card.querySelector('a[href*="/maps/place/"]');
      const href = a.href;
      const name = a.getAttribute("aria-label") || card.querySelector(".qBF1Pd")?.textContent?.trim() || "";
      const fid = (href.match(/!1s(0x[0-9a-f]+:0x[0-9a-f]+)/i) || [])[1] || "";

      // puan + yorum sayısı: yıldız aria-label'ından (en sağlam) veya sınıflardan
      let rating = null, reviewCount = null;
      const star = card.querySelector('[role="img"][aria-label*="ıldız"], [role="img"][aria-label*="star" i]');
      if (star) {
        const al = star.getAttribute("aria-label") || "";
        const rm = al.match(/(\d+(?:[.,]\d+)?)\s*(?:yıldız|star)/i);
        if (rm) rating = toFloat(rm[1]);
        const cm = al.match(/(\d[\d.\s]*)\s*(?:yorum|review|değerlendirme)/i);
        if (cm) reviewCount = toInt(cm[1]);
      }
      if (rating == null) rating = toFloat(card.querySelector(".MW4etd")?.textContent);
      if (reviewCount == null) reviewCount = toInt(card.querySelector(".UY7F9")?.textContent);

      // kategori/adres/diğer satırlar (baştaki puan satırını "4,4(1.621)" at)
      const lines = [...card.querySelectorAll(".W4Efsd")]
        .map((e) => e.textContent.replace(/\s+/g, " ").trim())
        .filter(Boolean)
        .filter((t) => !/^\d+[.,]\d+\s*\(/.test(t));
      const info = [...new Set(lines)].join(" · ").replace(/(·\s*)+/g, "· ").slice(0, 220);

      return { name, rating, reviewCount, info, fid, placeUrl: href.split("?")[0] };
    }).filter((p) => p.name);
  };
}

export async function discoverPlaces(query, { headless = process.env.HEADLESS !== "0", maxScrolls = 140 } = {}) {
  const searchUrl = buildSearchUrl(query);
  console.log(`Keşfet: "${query}"`);
  console.log(`Arama: ${searchUrl}`);

  const launchArgs = { headless, args: ["--disable-blink-features=AutomationControlled", "--no-sandbox", "--lang=tr-TR"] };
  let browser;
  try { browser = await chromium.launch({ ...launchArgs, channel: "chrome" }); }
  catch { browser = await chromium.launch(launchArgs); }
  const context = await browser.newContext({ userAgent: UA, locale: "tr-TR", timezoneId: "Europe/Istanbul", viewport: { width: 1360, height: 950 } });
  await context.addInitScript(() => { Object.defineProperty(navigator, "webdriver", { get: () => undefined }); });

  const page = await context.newPage();
  let places = [];
  try {
    await page.goto("https://www.google.com/?hl=tr", { waitUntil: "domcontentloaded", timeout: 60000 });
    await sleep(1200);
    await dismissConsent(page);
    await page.goto(searchUrl, { waitUntil: "domcontentloaded", timeout: 60000 });
    await sleep(4000);
    await dismissConsent(page);
    await page.evaluate(pageExtractPlaces);

    // sonuç feed'ini sona kadar kaydır
    let stable = 0, last = -1;
    for (let i = 0; i < maxScrolls; i++) {
      const n = await page.evaluate(() => {
        const feed = document.querySelector('[role="feed"]');
        if (feed) feed.scrollTo(0, feed.scrollHeight);
        return document.querySelectorAll('[role="feed"] a[href*="/maps/place/"]').length;
      });
      const end = await page.evaluate(() =>
        /listenin sonu|end of the list|sonuna ula/i.test(document.body.innerText)
      );
      if (i % 5 === 0) console.log(`  bulunan yer: ${n}`);
      if (n === last) stable++; else { stable = 0; last = n; }
      if (end) { console.log("  listenin sonuna ulaşıldı"); break; }
      if (stable >= 6) break;
      await sleep(900);
    }

    places = await page.evaluate(() => window.__extractPlaces());
  } finally {
    await browser.close().catch(() => {});
  }

  // tekilleştir (fid'e göre)
  const seen = new Set();
  places = places.filter((p) => {
    const k = p.fid || p.placeUrl || p.name;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });

  const slug = slugify(query);
  const payload = { query, slug, scrapedAt: new Date().toISOString(), count: places.length, places };
  await mkdir(DATA_DIR, { recursive: true });
  await writeFile(join(DATA_DIR, `places-${slug}.json`), JSON.stringify(payload, null, 2), "utf8");

  console.log(`\nKeşfedilen yer: ${places.length} -> data/places-${slug}.json`);
  return payload;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const query = process.argv.slice(2).join(" ") || "Bornova restoran";
  discoverPlaces(query).catch((e) => { console.error("Keşfet başarısız:", e); process.exit(1); });
}
