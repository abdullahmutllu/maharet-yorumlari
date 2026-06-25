// GitHub Pages için statik build üretir: public/ dosyalarını ve son çekilen
// data/reviews.json'u docs/ klasörüne kopyalar. Pages "main /docs" kaynağından sunar.
//
// Kullanım: npm run build  (önce: npm run scrape ile veriyi güncelle)

import { mkdir, copyFile, writeFile, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DOCS = join(__dirname, "docs");

await mkdir(DOCS, { recursive: true });

// statik frontend
for (const f of ["index.html", "app.js", "styles.css"]) {
  await copyFile(join(__dirname, "public", f), join(DOCS, f));
}

// çekilen yorumlar (statik sürümün veri kaynağı)
try {
  const data = await readFile(join(__dirname, "data", "reviews.json"), "utf8");
  await writeFile(join(DOCS, "reviews.json"), data, "utf8");
  const parsed = JSON.parse(data);
  console.log(`docs/reviews.json yazıldı — ${parsed.count} yorum.`);
} catch {
  console.warn("UYARI: data/reviews.json bulunamadı. Önce `npm run scrape` çalıştır.");
}

// Jekyll işlemesini kapat (dosyalar olduğu gibi sunulsun)
await writeFile(join(DOCS, ".nojekyll"), "", "utf8");

console.log("Statik build hazır: docs/");
