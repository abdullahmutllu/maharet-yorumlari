// Çankaya toplu yorum çekimi: places-cankaya.json'daki tüm restoranların yorumlarını
// (foto hariç tüm detaylarla) tek tek çeker. En çok yorumludan başlar, her restoranı
// ayrı dosyaya yazar, DEVAM EDİLEBİLİR (biten restoranları atlar).
//
// Kullanım: node batch.js [places-dosyası] [limit]
//   node batch.js                       -> data/places-cankaya.json, tümü
//   node batch.js places-cankaya.json 5 -> ilk 5 (test)

import { runScrape } from "./scrape.js";
import { slugify } from "./branches.js";
import { launchLoginChrome, cdpAlive } from "./login.js";
import { readFile, writeFile, mkdir, readdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA = join(__dirname, "data");

const placesFile = process.argv[2] || "places-cankaya.json";
const limit = process.argv[3] ? Number(process.argv[3]) : Infinity;

const dir = JSON.parse(await readFile(join(DATA, placesFile), "utf8"));
const OUT_DIR = join(DATA, dir.slug || "cankaya");
await mkdir(OUT_DIR, { recursive: true });

// en çok yorumludan başla (en değerli veri önce)
const places = dir.places
  .filter((p) => p.fid || p.placeUrl)
  .sort((a, b) => (b.reviewCount || 0) - (a.reviewCount || 0))
  .slice(0, limit);

console.log(`Toplu çekim: ${dir.query} — ${places.length} restoran`);
console.log(`Çıktı: ${OUT_DIR}\n`);

// Tek bir paylaşılan giriş Chrome'u (CDP) — tüm çekimler bunu kullanır (tek tarayıcı, hızlı).
try { await launchLoginChrome(); } catch (e) { console.warn("Giriş Chrome'u açılamadı, oturumsuz devam:", e.message); }
console.log("CDP (giriş Chrome'u) aktif mi:", await cdpAlive(), "\n");

const slugFor = (p) => `${slugify(p.name)}-${(p.fid || "").replace(/[^0-9a-f]/gi, "").slice(-6) || "x"}`;

let done = 0, skipped = 0, failed = 0, totalReviews = 0;
const index = [];
const startedAt = Date.now();

for (let i = 0; i < places.length; i++) {
  const p = places[i];
  const slug = slugFor(p);
  const outFile = join(OUT_DIR, `${slug}.json`);
  const tag = `[${i + 1}/${places.length}] ${p.name} (Google: ${p.reviewCount ?? "?"})`;

  // devam edilebilirlik: bitmiş dosyayı atla
  if (existsSync(outFile)) {
    try {
      const prev = JSON.parse(await readFile(outFile, "utf8"));
      if (prev.count > 0) {
        skipped++;
        index.push({ name: p.name, slug, googleReviewCount: p.reviewCount, scraped: prev.count, avg: prev.averageRating, file: `${slug}.json` });
        console.log(`${tag} → ATLANDI (zaten ${prev.count})`);
        continue;
      }
    } catch {}
  }

  const branch = { slug, label: p.name, name: p.name, placeUrl: p.placeUrl };
  try {
    const res = await runScrape(branch, { outFile });
    done++;
    totalReviews += res.count;
    index.push({ name: p.name, slug, googleReviewCount: p.reviewCount, scraped: res.count, avg: res.averageRating, file: `${slug}.json` });
    const elapsedMin = (Date.now() - startedAt) / 60000;
    const rate = (done + skipped) / Math.max(elapsedMin, 0.1);
    const remain = Math.round((places.length - i - 1) / Math.max(rate, 0.01));
    console.log(`${tag} → ${res.count} yorum (ort ${res.averageRating}) | toplam ${totalReviews} | ~${remain} dk kaldı`);
  } catch (e) {
    failed++;
    console.warn(`${tag} → HATA: ${e.message}`);
  }

  // ilerleyen özet indeksi yaz
  await writeFile(join(OUT_DIR, "_index.json"), JSON.stringify({
    query: dir.query, generatedAt: new Date().toISOString(),
    restaurants: index.length, totalReviews,
    items: index,
  }, null, 2), "utf8");
}

console.log(`\n==== BİTTİ ====`);
console.log(`Çekilen restoran: ${done}, atlanan: ${skipped}, hatalı: ${failed}`);
console.log(`Toplam yorum: ${totalReviews}`);
console.log(`İndeks: ${join(OUT_DIR, "_index.json")}`);
