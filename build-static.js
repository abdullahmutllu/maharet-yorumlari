// GitHub Pages için statik build üretir: public/ dosyalarını, her şubenin
// data/reviews-<slug>.json verisini ve bir branches.json manifestini docs/ klasörüne kopyalar.
// Pages "main /docs" kaynağından sunar.
//
// Kullanım: npm run build  (önce: npm run scrape ile veriyi güncelle)

import { mkdir, copyFile, writeFile, readFile, rm } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { getAllBranches } from "./branches.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DOCS = join(__dirname, "docs");
const DATA = join(__dirname, "data");

await mkdir(DOCS, { recursive: true });

// statik frontend
for (const f of ["index.html", "app.js", "styles.css", "kesfet.html", "kesfet.js", "cankaya.html", "cankaya.js"]) {
  await copyFile(join(__dirname, "public", f), join(DOCS, f));
}

// eski tek-şube dosyası varsa temizle
await rm(join(DOCS, "reviews.json"), { force: true });

// her şubenin verisini kopyala (sabit + dinamik)
const BRANCHES = await getAllBranches();
const manifest = [];
for (const b of BRANCHES) {
  try {
    const data = await readFile(join(DATA, `reviews-${b.slug}.json`), "utf8");
    await writeFile(join(DOCS, `reviews-${b.slug}.json`), data, "utf8");
    const parsed = JSON.parse(data);
    manifest.push({ slug: b.slug, label: b.label });
    console.log(`docs/reviews-${b.slug}.json — ${parsed.count} yorum.`);
  } catch {
    console.warn(`UYARI: data/reviews-${b.slug}.json yok. Önce: npm run scrape ${b.slug}`);
  }
}

// şube manifesti (frontend statik modda bunu okur)
await writeFile(join(DOCS, "branches.json"), JSON.stringify(manifest, null, 2), "utf8");

// Keşfet dizinleri: data/places-*.json -> docs/ + places-index.json
const { readdir } = await import("node:fs/promises");
let placesIndex = [];
try {
  const files = (await readdir(DATA)).filter((f) => /^places-.+\.json$/.test(f));
  for (const f of files) {
    const raw = await readFile(join(DATA, f), "utf8");
    await writeFile(join(DOCS, f), raw, "utf8");
    try { const d = JSON.parse(raw); placesIndex.push({ slug: d.slug, query: d.query, count: d.count, scrapedAt: d.scrapedAt }); } catch {}
  }
  placesIndex.sort((a, b) => (b.count || 0) - (a.count || 0));
} catch {}
await writeFile(join(DOCS, "places-index.json"), JSON.stringify(placesIndex, null, 2), "utf8");

// Toplu yorum veri setleri: data/<dataset>/*.json -> docs/<dataset>/ + <dataset>-manifest.json
// + birleşik CSV/JSON varsa kopyala. (Şimdilik cankaya-ornek)
const { mkdir: mkdirp } = await import("node:fs/promises");
for (const dataset of ["cankaya-ornek"]) {
  try {
    const srcDir = join(DATA, dataset);
    const outDir = join(DOCS, dataset);
    await mkdirp(outDir, { recursive: true });
    const rfiles = (await readdir(srcDir)).filter((f) => f.endsWith(".json") && f !== "_index.json");
    const man = [];
    for (const f of rfiles) {
      const raw = await readFile(join(srcDir, f), "utf8");
      const d = JSON.parse(raw);
      if (!d.count) continue; // boş restoranı atla
      await writeFile(join(outDir, f), raw, "utf8");
      man.push({ slug: f.replace(/\.json$/, ""), label: d.business, count: d.count, averageRating: d.averageRating });
    }
    man.sort((a, b) => (b.count || 0) - (a.count || 0));
    await writeFile(join(DOCS, `${dataset}-manifest.json`), JSON.stringify(man, null, 2), "utf8");
    // birleşik indirilebilir dosyalar
    for (const ext of ["json", "csv"]) {
      try { await copyFile(join(DATA, `${dataset}-combined.${ext}`), join(DOCS, `${dataset}-combined.${ext}`)); } catch {}
    }
    console.log(`Veri seti yayınlandı: ${dataset} (${man.length} restoran)`);
  } catch {}
}

// Jekyll işlemesini kapat
await writeFile(join(DOCS, ".nojekyll"), "", "utf8");

console.log(`Statik build hazır: docs/ (${manifest.length} şube, ${placesIndex.length} dizin)`);
