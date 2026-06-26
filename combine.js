// Bir batch klasöründeki (data/<slug>/*.json) tüm restoranların yorumlarını TEK
// birleşik dosyaya toplar: <slug>-combined.json + <slug>-combined.csv (Excel-uyumlu).
//
// Kullanım: node combine.js [slug]   (varsayılan: cankaya-ornek)

import { readFile, writeFile, readdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA = join(__dirname, "data");
const sub = process.argv[2] || "cankaya-ornek";
const dir = join(DATA, sub);

const files = (await readdir(dir)).filter((f) => f.endsWith(".json") && f !== "_index.json");
const rows = [];
const perRest = [];

for (const f of files) {
  const d = JSON.parse(await readFile(join(dir, f), "utf8"));
  perRest.push({ restoran: d.business, cekilen: d.count, ortalama: d.averageRating, kaynak: d.sourceUrl });
  for (const r of d.reviews) {
    rows.push({
      Restoran: d.business,
      Yazar: r.author?.name || "",
      "Yazar Yorum Sayısı": r.author?.reviewCount ?? "",
      "Yazar Foto Sayısı": r.author?.photoCount ?? "",
      "Yerel Rehber": r.author?.localGuide ? "Evet" : "Hayır",
      Puan: r.rating ?? "",
      Tarih: r.relativeDate || "",
      Yorum: r.text || "",
      "İşletme Yanıtı": r.response?.text || "",
      "Yanıt Tarihi": r.response?.date || "",
      "Bu Yorumda Foto": r.reviewPhotoCount ?? 0,
      "Yorum ID": r.review_id || "",
    });
  }
}

const combined = { kaynak: sub, restoranSayisi: perRest.length, toplamYorum: rows.length, restoranlar: perRest, reviews: rows };
await writeFile(join(DATA, `${sub}-combined.json`), JSON.stringify(combined, null, 2), "utf8");

const esc = (v) => { const s = String(v ?? ""); return /[",\r\n;]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
const headers = Object.keys(rows[0] || { Restoran: "" });
const csv = "﻿" + [headers.join(","), ...rows.map((r) => headers.map((h) => esc(r[h])).join(","))].join("\r\n");
await writeFile(join(DATA, `${sub}-combined.csv`), csv, "utf8");

console.log(`Restoran: ${perRest.length} | Toplam yorum: ${rows.length}`);
console.log(`-> data/${sub}-combined.json`);
console.log(`-> data/${sub}-combined.csv (Excel'de açılır)`);
perRest.forEach((r) => console.log(`   ${r.restoran}: ${r.cekilen} yorum (ort ${r.ortalama})`));
