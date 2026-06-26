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
for (const f of ["index.html", "app.js", "styles.css", "kesfet.html", "kesfet.js"]) {
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

// Jekyll işlemesini kapat
await writeFile(join(DOCS, ".nojekyll"), "", "utf8");

console.log(`Statik build hazır: docs/ (${manifest.length} şube)`);
