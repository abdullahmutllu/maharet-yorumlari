// Google Maps'ten TÜM yorumları çeker ve data/reviews.json dosyasına kaydeder.
//
// Yöntem (2026'da çalışan): resmi/dahili API'ler oturumsuz boş döndüğü için
// gerçek bir tarayıcı sürülür:
//   1) google.com'da "ısın" + consent kabul -> çerezler oluşur
//   2) /maps/place yerine ARAMA URL'i ile gidilir -> "sınırlı görünüm" aşılır, tam panel gelir
//   3) "Yorumlar" sekmesine geçilir, kaydırılabilir liste sonuna kadar kaydırılır
//   4) Tüm yorum kartları DOM'dan ayrıştırılır
//
// Kaynak yöntem referansları: gosom/google-maps-scraper, georgekhananaev/google-reviews-scraper-pro

import { chromium } from "playwright";
import { writeFile, mkdir, readFile, access, rm } from "node:fs/promises";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join } from "node:path";
import { getAllBranches } from "./branches.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, "data");
export const PROFILE_DIR = process.env.PROFILE_DIR || join(__dirname, ".gprofile");
const LOGIN_MARKER = join(PROFILE_DIR, ".logged_in");

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Profilde kayıtlı Google oturumu var mı? (işaret dosyası — hızlı kontrol)
export async function isLoggedIn() {
  try { await access(LOGIN_MARKER); return true; } catch { return false; }
}

const hasGoogleSession = async (context) =>
  (await context.cookies("https://www.google.com")).some((c) =>
    ["SID", "SAPISID", "__Secure-1PSID"].includes(c.name)
  );

// Görünür Chrome açar, kullanıcı Google'a giriş yapana kadar bekler, oturumu profile kaydeder.
export async function runLogin({ timeoutMs = 8 * 60 * 1000 } = {}) {
  const ctxOpts = { userAgent: UA, locale: "tr-TR", timezoneId: "Europe/Istanbul", viewport: { width: 1280, height: 900 } };
  const args = ["--disable-blink-features=AutomationControlled", "--no-sandbox", "--lang=tr-TR"];
  await mkdir(DATA_DIR, { recursive: true });
  let context;
  try {
    context = await chromium.launchPersistentContext(PROFILE_DIR, { headless: false, channel: "chrome", args, ...ctxOpts });
  } catch {
    context = await chromium.launchPersistentContext(PROFILE_DIR, { headless: false, args, ...ctxOpts });
  }
  try {
    const page = context.pages()[0] || (await context.newPage());
    if (await hasGoogleSession(context)) { await writeFile(LOGIN_MARKER, "1"); return { loggedIn: true, already: true }; }
    await page.goto("https://accounts.google.com/", { waitUntil: "domcontentloaded", timeout: 60000 }).catch(() => {});
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline && !(await hasGoogleSession(context))) await sleep(2000);
    const ok = await hasGoogleSession(context);
    if (ok) await writeFile(LOGIN_MARKER, "1");
    return { loggedIn: ok };
  } finally {
    await context.close().catch(() => {});
  }
}

// Oturumu sıfırla (çıkış): profili siler.
export async function clearLogin() {
  await rm(PROFILE_DIR, { recursive: true, force: true }).catch(() => {});
  return { loggedIn: false };
}

// PLACE_URL'den arama URL'i bileşenlerini çıkar (@lat,lng veya !3d!4d biçiminden).
function buildSearchUrl(placeUrl, name) {
  let coords = placeUrl.match(/@(-?[\d.]+),(-?[\d.]+)/);
  if (!coords) coords = placeUrl.match(/!3d(-?[\d.]+)!4d(-?[\d.]+)/);
  const at = coords ? `/@${coords[1]},${coords[2]},17z` : "";
  return `https://www.google.com/maps/search/${encodeURIComponent(name)}${at}?hl=tr`;
}

// Sayfa içinde çalışan kurulum: kaydırıcı bulma, kart ayıklama ve birikimli toplama.
// Birikim sayfa içinde (window.__acc) tutulur; her adımda yalnızca sayı Node'a döner,
// böylece sanallaştırılan (DOM'dan silinen) kartlar kaybolmadan biriktirilir.
function pageSetup() {
  window.__getScroller = function () {
    const card = document.querySelector("div[data-review-id]");
    let el = card ? card.parentElement : null;
    while (el) {
      const oy = getComputedStyle(el).overflowY;
      if ((oy === "auto" || oy === "scroll") && el.scrollHeight > el.clientHeight + 40) return el;
      el = el.parentElement;
    }
    return (
      document.querySelector('div[role="main"] div.m6QErb.DxyBCb.kA9KIf.dS8AEf') ||
      document.scrollingElement
    );
  };

  const num = (s) => {
    if (!s) return null;
    const m = String(s).match(/([\d]+(?:[.,]\d+)?)/);
    return m ? parseFloat(m[1].replace(",", ".")) : null;
  };

  function extractCard(c) {
    const id = c.getAttribute("data-review-id");
    const author =
      c.querySelector(".d4r55")?.textContent?.trim() ||
      c.querySelector("button[data-href] div")?.textContent?.trim() ||
      null;

    let photo = null;
    const img = c.querySelector("img");
    if (img && /lh3|googleusercontent/.test(img.src)) photo = img.src;

    let rating = null;
    const rEl = c.querySelector('span[role="img"][aria-label]') || c.querySelector(".kvMYJc[aria-label]");
    if (rEl) rating = num(rEl.getAttribute("aria-label"));

    const date =
      c.querySelector(".rsqaWe")?.textContent?.trim() ||
      c.querySelector(".xRkPPb")?.textContent?.trim() ||
      null;

    const text =
      c.querySelector(".MyEned .wiI7pd")?.textContent?.trim() ||
      c.querySelector(".wiI7pd")?.textContent?.trim() ||
      c.querySelector('span[jsname="bN97Pc"]')?.textContent?.trim() ||
      null;

    let response = null;
    const respEl = c.querySelector(".CDe7pd");
    if (respEl) {
      response = {
        text: respEl.querySelector(".wiI7pd")?.textContent?.trim() || null,
        date: respEl.querySelector(".DZSIDd")?.textContent?.trim() || null,
      };
    }

    const images = [...c.querySelectorAll("button.Tya61d, button[data-photo-index]")]
      .map((b) => {
        const s = b.getAttribute("style") || "";
        const m = s.match(/url\(["']?(.*?)["']?\)/);
        return m ? m[1] : null;
      })
      .filter(Boolean);

    return {
      review_id: id,
      author: { name: author, photo },
      rating,
      text,
      relativeDate: date,
      response,
      images: images.length ? images : null,
    };
  }

  window.__acc = new Map();

  // Görünür kısaltılmış metinleri açar, mevcut kartları çekip biriktirir, toplam sayıyı döndürür.
  window.__collect = function () {
    document
      .querySelectorAll('button[aria-label*="Daha fazla"], button[aria-label*="More" i], button.w8nwRe')
      .forEach((b) => { try { b.click(); } catch {} });

    document.querySelectorAll("div[data-review-id]").forEach((c) => {
      const r = extractCard(c);
      const k = r.review_id || `${r.author?.name}|${(r.text || "").slice(0, 40)}`;
      const prev = window.__acc.get(k);
      // daha uzun metin geldiyse güncelle (genişlemiş metni yakala)
      if (!prev || (r.text || "").length >= (prev.text || "").length) window.__acc.set(k, r);
    });

    return window.__acc.size;
  };

  window.__dump = function () {
    return [...window.__acc.values()];
  };
}

// Toplam yorum sayısını sayfadan oku (ilerleme/bitiş için, best-effort).
function readTotalCount() {
  const txt = document.body.innerText;
  // "2.155 yorum" (TR binlik ayıracı nokta). Sayıyı boşluk/öteki sayılara taşmadan yakala.
  const m = txt.match(/([\d][\d.]*)\s*yorum/);
  if (m) {
    const n = parseInt(m[1].replace(/[.\s]/g, ""), 10);
    if (Number.isFinite(n)) return n;
  }
  return null;
}

async function dismissConsent(page) {
  for (const label of [
    "Tümünü kabul et", "Accept all", "Kabul et", "I agree",
    "Tümünü reddet", "Reddet", "Reject all",
  ]) {
    const b = page.getByRole("button", { name: label });
    if (await b.count().catch(() => 0)) {
      await b.first().click().catch(() => {});
      await sleep(1500);
      return label;
    }
  }
  return null;
}

async function clickReviewsTab(page) {
  const tab = page.locator(
    '[role="tab"][aria-label*="yorum" i], [role="tab"][aria-label*="review" i]'
  );
  if (await tab.count().catch(() => 0)) {
    await tab.first().click().catch(() => {});
    await sleep(3500);
    return true;
  }
  return false;
}

// Sıralama menüsünü açıp verilen sıralamayı seçer (best-effort).
// Not: Sıralama butonu "Sırala" değil, MEVCUT sıralamanın adını gösterir
// (ör. "En alakalı"/"En yeni"). Bu yüzden olası tüm değerleri hedefliyoruz.
async function applySort(page, name) {
  try {
    const sortBtn = page.locator(
      'button.HQzyZ, button[aria-label*="Sırala" i], button[aria-label*="Sort" i], ' +
        'button[aria-label*="En alakal" i], button[aria-label*="En yeni" i], ' +
        'button[aria-label*="En yüksek" i], button[aria-label*="En düşük" i]'
    );
    if (!(await sortBtn.count().catch(() => 0))) return false;
    await sortBtn.first().click().catch(() => {});
    await sleep(1200);
    let opt = page.getByRole("menuitemradio", { name });
    if (!(await opt.count().catch(() => 0))) opt = page.getByRole("menuitem", { name });
    if (await opt.count().catch(() => 0)) {
      await opt.first().click().catch(() => {});
      await sleep(3000);
      return true;
    }
    await page.keyboard.press("Escape").catch(() => {});
  } catch {}
  return false;
}

// Yorum listesini sonuna kadar kaydırır; her adımda biriktirir (window.__acc).
// Bitiş sinyali: kaydırma yüksekliği (scrollHeight) uzun süre değişmiyorsa feed tükenmiştir.
async function scrollToEnd(page, { total, label, maxScrolls = 800 }) {
  let stable = 0, lastH = -1;
  let size = await page.evaluate(() => window.__acc.size);
  for (let i = 0; i < maxScrolls; i++) {
    const res = await page.evaluate((stuck) => {
      const n = window.__collect();
      const sc = window.__getScroller();
      let h = 0;
      if (sc) {
        if (stuck) sc.scrollBy(0, -600);
        sc.scrollTo(0, sc.scrollHeight);
        h = sc.scrollHeight;
      }
      return { size: n, h };
    }, stable > 0);

    size = res.size;
    if (res.h === lastH) stable++;
    else { stable = 0; lastH = res.h; }

    if (i % 8 === 0) console.log(`  [${label}] benzersiz: ${size}${total ? ` / ~${total}` : ""}`);

    if (total && size >= total) break;
    if (stable >= 16) break; // feed yüksekliği uzun süre sabit -> bu sıralamada son
    await sleep(700);
  }
  return size;
}

export async function runScrape(
  branch,
  {
    headless = process.env.HEADLESS !== "0",
    maxScrolls = 600,
    maxRounds = Number(process.env.MAX_ROUNDS) || 12,
    login = process.env.LOGIN === "1" || process.env.USE_PROFILE === "1",
  } = {}
) {
  const outFile = join(DATA_DIR, `reviews-${branch.slug}.json`);
  const searchUrl = buildSearchUrl(branch.placeUrl, branch.name);
  console.log(`\n######## Şube: ${branch.label} (${branch.name}) ########`);
  console.log(`Arama URL: ${searchUrl}`);
  console.log(`Tarayıcı modu: ${headless ? "headless" : "görünür"}`);

  // GİRİŞ MODU: LOGIN=1 ile kalıcı profil kullanılır (Google oturumu .gprofile'da saklanır).
  // Oturum açıldığında Google daha fazla (genelde tüm) yorumu sunar -> tavan yükselir.
  const LOGIN = login;
  if (LOGIN) console.log(`Giriş modu: AÇIK (profil: ${PROFILE_DIR})`);

  const launchArgs = {
    headless,
    args: ["--disable-blink-features=AutomationControlled", "--no-sandbox", "--lang=tr-TR"],
  };
  const ctxOpts = {
    userAgent: UA,
    locale: "tr-TR",
    timezoneId: "Europe/Istanbul",
    viewport: { width: 1360, height: 950 },
  };

  const CDP_URL = process.env.CDP_URL || "http://localhost:9222";
  let browser = null;
  let context;
  let usingCDP = false;

  // 1) ÖNCELİK: Kullanıcının "Google ile giriş" ile açtığı GERÇEK Chrome'a bağlan (CDP/9222).
  //    Bu Chrome'da giriş gerçek olduğundan Google engellemez; oturum tam -> tüm yorumlar gelir.
  try {
    const b = await chromium.connectOverCDP(CDP_URL, { timeout: 2500 });
    const ctx = b.contexts()[0];
    if (ctx) {
      browser = b;
      context = ctx;
      usingCDP = true;
      console.log("CDP: giriş yapılmış Chrome'a bağlanıldı (tam kapsam modu).");
    } else {
      await b.close().catch(() => {});
    }
  } catch {}

  if (!usingCDP) {
    if (LOGIN) {
      try {
        context = await chromium.launchPersistentContext(PROFILE_DIR, { ...launchArgs, channel: "chrome", ...ctxOpts });
      } catch {
        context = await chromium.launchPersistentContext(PROFILE_DIR, { ...launchArgs, ...ctxOpts });
      }
    } else {
      try {
        browser = await chromium.launch({ ...launchArgs, channel: "chrome" });
      } catch {
        browser = await chromium.launch(launchArgs);
      }
      context = await browser.newContext(ctxOpts);
    }
    await context.addInitScript(() => {
      Object.defineProperty(navigator, "webdriver", { get: () => undefined });
      Object.defineProperty(navigator, "languages", { get: () => ["tr-TR", "tr", "en"] });
      Object.defineProperty(navigator, "plugins", { get: () => [1, 2, 3, 4, 5] });
    });
  }

  // Google oturumu açık mı?
  const isLoggedIn = async () => {
    const cookies = await context.cookies("https://www.google.com");
    return cookies.some((c) => c.name === "SID" || c.name === "SAPISID" || c.name === "__Secure-1PSID");
  };

  let reviews = [];
  const merged = new Map();
  const keyOf = (r) => r.review_id || `${r.author?.name}|${(r.text || "").slice(0, 40)}`;

  // Çok-sıralamalı birleştirme: Google oturumsuz kaydırmayı ~1000'lerde sınırladığı için
  // HER SIRALAMA İÇİN TAZE BİR SAYFA açıp (sıralama butonu en baştan erişilebilir),
  // sona kadar kaydırıp Node tarafında birleştiriyoruz. Her sıralama farklı yorumları
  // yüzeye çıkardığından birleşim tüm yorumlara yaklaşır.
  const sorts = [
    { key: "en yeni", name: /en yeni|newest/i },
    { key: "en yüksek puan", name: /en yüksek|highest/i },
    { key: "en düşük puan", name: /en düşük|lowest/i },
    { key: "en alakalı", name: /en alakal|most relevant|relevant/i },
  ];

  try {
    // 1) ısınma + consent (CDP'de gerek yok — kullanıcının Chrome'u zaten hazır)
    if (!usingCDP) {
      const warm = await context.newPage();
      await warm.goto("https://www.google.com/?hl=tr", { waitUntil: "domcontentloaded", timeout: 60000 });
      await sleep(1500);
      await dismissConsent(warm);

      // GİRİŞ MODU (kalıcı profil): oturum yoksa görünür pencerede giriş bekle.
      if (LOGIN) {
        if (await isLoggedIn()) {
          console.log("Kayıtlı Google oturumu bulundu, devam ediliyor.");
          await writeFile(LOGIN_MARKER, "1").catch(() => {});
        } else if (headless) {
          console.warn("UYARI: Giriş modu açık ama oturum yok ve headless. Önce arayüzden 'Google ile giriş' yapın.");
        } else {
          console.log("\n>>> GİRİŞ GEREKLİ: Açılan pencerede Google hesabınızla giriş yapın...\n");
          await warm.goto("https://accounts.google.com/", { waitUntil: "domcontentloaded", timeout: 60000 }).catch(() => {});
          const deadline = Date.now() + 8 * 60 * 1000;
          while (Date.now() < deadline && !(await isLoggedIn())) await sleep(3000);
          const ok = await isLoggedIn();
          if (ok) await writeFile(LOGIN_MARKER, "1").catch(() => {});
          console.log(ok ? "✓ Giriş algılandı." : "Giriş algılanamadı; yine de denenecek.");
        }
      }
      await warm.close().catch(() => {});
    } else if (await isLoggedIn()) {
      console.log("✓ CDP oturumu Google'a giriş yapmış durumda — tam kapsam bekleniyor.");
    } else {
      console.warn("CDP bağlandı ama Google oturumu görünmüyor. Açılan Chrome'da giriş yaptığınızdan emin olun.");
    }

    // Önceki kayıttan başla (birikimli; tekrar çalıştırınca kapsam artar).
    try {
      const prev = JSON.parse(await readFile(outFile, "utf8"));
      if (Array.isArray(prev.reviews)) {
        for (const r of prev.reviews) merged.set(keyOf(r), r);
        console.log(`Önceki kayıttan başlangıç: ${merged.size}`);
      }
    } catch {}

    // Tek bir sıralama geçişi: taze sayfa, sona kadar kaydır, yorumları döndür.
    let total = null;
    const runPass = async (s, idx) => {
      await sleep(idx * 1500); // kademeli başlat (aynı anda 4 navigasyonu önle)
      const page = await context.newPage();
      try {
        await page.goto(searchUrl, { waitUntil: "domcontentloaded", timeout: 60000 });
        await sleep(3500);
        await dismissConsent(page);

        const opened = await clickReviewsTab(page);
        if (!opened) console.warn(`[${s.key}] Yorumlar sekmesi bulunamadı.`);

        await page.evaluate(pageSetup);
        if (total == null) {
          total = await page.evaluate(readTotalCount).catch(() => null);
          if (total) console.log(`Google'daki toplam yorum: ~${total}`);
        }

        const applied = await applySort(page, s.name);
        await sleep(900);
        await scrollToEnd(page, { total, label: s.key, maxScrolls });
        const arr = await page.evaluate(() => window.__dump());
        return arr;
      } catch (e) {
        console.warn(`[${s.key}] hata: ${e.message}`);
        return [];
      } finally {
        await page.close().catch(() => {});
      }
    };

    // Anahtar kelime geçişi: yorum-içi aramaya terim yazılır (sunucu-taraflı filtre,
    // KAYDIRMA TAVANINDAN BAĞIMSIZ ayrı sonuç kümesi) ve sona kadar kaydırılır.
    const runKeywordPass = async (term, idx) => {
      await sleep(idx * 1500);
      const page = await context.newPage();
      try {
        await page.goto(searchUrl, { waitUntil: "domcontentloaded", timeout: 60000 });
        await sleep(3500);
        await dismissConsent(page);
        await clickReviewsTab(page);
        await page.evaluate(pageSetup);
        let input = page.locator("input.yBHhWb");
        if (!(await input.count().catch(() => 0))) {
          // magnifier'ı açmayı dene
          const ara = page.locator('[role="main"] button[aria-label="Ara"]');
          if (await ara.count().catch(() => 0)) { await ara.first().click().catch(() => {}); await sleep(800); }
          input = page.locator("input.yBHhWb");
        }
        if (!(await input.count().catch(() => 0))) return [];
        await input.first().click().catch(() => {});
        await input.first().fill(term).catch(() => {});
        await page.keyboard.press("Enter").catch(() => {});
        await sleep(2800);
        await scrollToEnd(page, { label: `ara:${term}`, maxScrolls });
        return await page.evaluate(() => window.__dump());
      } catch (e) {
        console.warn(`[ara:${term}] hata: ${e.message}`);
        return [];
      } finally {
        await page.close().catch(() => {});
      }
    };

    // 2) TUR DÖNGÜSÜ: Google oturumsuz her seferinde biraz farklı alt küme sunduğundan,
    //    hedefe (Google toplamı) ulaşana ya da doygunluğa (yeni yorum gelmemesi) kadar
    //    4 sıralamayı PARALEL tekrar tekrar çalıştırıp birleştiriyoruz.
    const MIN_NEW = 4;   // bir turda bundan az yeni gelirse "kuru" tur say
    const DRY_MAX = 2;   // üst üste bu kadar kuru tur olursa dur
    let dryStreak = 0;
    for (let round = 1; round <= maxRounds; round++) {
      const before = merged.size;
      const passArrays = await Promise.all(sorts.map((s, i) => runPass(s, i)));
      for (const arr of passArrays) for (const r of arr) merged.set(keyOf(r), r);
      const added = merged.size - before;
      const pct = total ? ` (%${Math.round((merged.size / total) * 100)})` : "";
      console.log(`— Tur ${round}: +${added} → toplam ${merged.size}${total ? ` / ${total}` : ""}${pct}`);

      if (total && merged.size >= total) { console.log("✓ Hedefe ulaşıldı."); break; }
      if (added < MIN_NEW) {
        if (++dryStreak >= DRY_MAX) {
          console.log("Doygunluk: yeni yorum gelmiyor, durduruldu (Google oturumsuz tavanı).");
          break;
        }
      } else {
        dryStreak = 0;
      }
    }

    // 3) ANAHTAR KELİME AUGMENTASYONU: kaydırma tavanını aşmak için yorum-içi aramayı
    //    çok sayıda yaygın Türkçe kelimeyle çalıştır. Her arama, tavandan bağımsız ayrı
    //    bir sonuç kümesi döndürür; birleşimi metinli yorumların büyük kısmını yakalar.
    const KEYWORDS = [
      "lezzet", "lezzetli", "güzel", "tavsiye", "servis", "porsiyon", "fiyat", "temiz",
      "mantı", "yağlama", "tatlı", "çorba", "sıcak", "personel", "mekan", "hızlı", "taze",
      "kötü", "harika", "mükemmel", "gittik", "yedik", "sipariş", "kayseri", "peynir",
      "yemek", "tat", "keyifli", "çok", "ama", "için", "bir", "ve", "da",
    ];
    // Not: Test edildi — oturumsuz, anahtar kelime aramasının döndürdüğü yorumlar zaten
    // kaydırmayla gelen kümede; tavanın ötesine +0 ekliyor. Bu yüzden VARSAYILAN KAPALI;
    // denemek için KW=1. Tam kapsam için giriş modu (LOGIN=1) kullanın.
    if (process.env.KW === "1" && (!total || merged.size < total)) {
      console.log(`\n=== Anahtar kelime augmentasyonu (${KEYWORDS.length} terim) ===`);
      const BATCH = 4;
      for (let i = 0; i < KEYWORDS.length; i += BATCH) {
        const batch = KEYWORDS.slice(i, i + BATCH);
        const before = merged.size;
        const arrays = await Promise.all(batch.map((t, j) => runKeywordPass(t, j)));
        for (const arr of arrays) for (const r of arr) merged.set(keyOf(r), r);
        console.log(`  [${batch.join(", ")}]: +${merged.size - before} → toplam ${merged.size}${total ? ` / ${total}` : ""}`);
        if (total && merged.size >= total) { console.log("✓ Hedefe ulaşıldı (anahtar kelime)."); break; }
      }
    }

    reviews = [...merged.values()];
  } finally {
    if (usingCDP) {
      // Kullanıcının Chrome'unu KAPATMA; sadece bağlantıyı bırak.
      // (Açtığımız sekmeler runPass içinde zaten kapatıldı.)
    } else {
      await (browser ? browser.close() : context.close()).catch(() => {});
    }
  }

  // tekilleştir (review_id'ye göre)
  const seen = new Set();
  reviews = reviews.filter((r) => {
    const k = r.review_id || JSON.stringify([r.author?.name, r.text]);
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });

  const count = reviews.length;
  const rated = reviews.filter((r) => typeof r.rating === "number");
  const averageRating = rated.length
    ? Number((rated.reduce((s, r) => s + r.rating, 0) / rated.length).toFixed(2))
    : 0;

  const payload = {
    branch: { slug: branch.slug, label: branch.label },
    business: branch.name,
    sourceUrl: branch.placeUrl,
    scrapedAt: new Date().toISOString(),
    count,
    averageRating,
    reviews,
  };

  await mkdir(DATA_DIR, { recursive: true });
  await writeFile(outFile, JSON.stringify(payload, null, 2), "utf8");

  console.log(`\n[${branch.label}] Çekilen yorum sayısı: ${count}, ortalama: ${averageRating}`);
  console.log(`Kaydedildi: ${outFile}`);
  return payload;
}

// Tüm şubeleri (veya CLI ile verilen tek şubeyi) sırayla çeker.
export async function runAll(slug) {
  const all = await getAllBranches();
  const targets = slug ? all.filter((b) => b.slug === slug) : all;
  if (!targets.length) {
    throw new Error(`Şube bulunamadı: "${slug}". Geçerli: ${all.map((b) => b.slug).join(", ")}`);
  }
  const results = [];
  for (const branch of targets) {
    results.push(await runScrape(branch));
  }
  console.log(`\n==== Özet ====`);
  for (const r of results) console.log(`${r.branch.label}: ${r.count} yorum, ort. ${r.averageRating}`);
  return results;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  // Kullanım: node scrape.js            -> tüm şubeler
  //           node scrape.js ankara     -> sadece "ankara"
  runAll(process.argv[2]).catch((e) => {
    console.error("Çekme başarısız:", e);
    process.exit(1);
  });
}
