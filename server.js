// Basit Express sunucusu: statik frontend + çok şubeli yorum API'leri + dinamik şube ekleme.

import express from "express";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { PORT } from "./config.js";
import { getAllBranches, getBranch, addCustomBranch } from "./branches.js";
import { runScrape } from "./scrape.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const app = express();

app.use(express.json());
app.use(express.static(join(__dirname, "public")));

// Şube listesi (sabit + dinamik)
app.get("/api/branches", async (_req, res) => {
  const all = await getAllBranches();
  res.json(all.map((b) => ({ slug: b.slug, label: b.label })));
});

// Bir şubenin önbellekteki yorumları
app.get("/api/reviews", async (req, res) => {
  const all = await getAllBranches();
  const slug = req.query.branch || all[0]?.slug;
  const branch = await getBranch(slug);
  if (!branch) return res.status(404).json({ error: "Şube bulunamadı", slug });
  try {
    const data = await readFile(join(__dirname, "data", `reviews-${slug}.json`), "utf8");
    res.type("application/json").send(data);
  } catch {
    res.json({
      branch: { slug: branch.slug, label: branch.label },
      business: branch.name,
      sourceUrl: branch.placeUrl,
      scrapedAt: null,
      count: 0,
      averageRating: 0,
      reviews: [],
    });
  }
});

// Bir şubeyi yeniden çek ("Yenile")
app.post("/api/scrape", async (req, res) => {
  const slug = req.query.branch;
  const branch = await getBranch(slug);
  if (!branch) return res.status(404).json({ error: "Şube bulunamadı", slug });
  try {
    const payload = await runScrape(branch);
    res.json(payload);
  } catch (err) {
    res.status(500).json({ error: "Yorumlar çekilemedi", detail: String(err?.message || err) });
  }
});

// Yeni şube ekle: Google Haritalar URL'i ver -> kaydet -> hemen çek
app.post("/api/branches", async (req, res) => {
  const { url, label } = req.body || {};
  if (!url) return res.status(400).json({ error: "URL gerekli" });
  try {
    const branch = await addCustomBranch({ url, label });
    const payload = await runScrape(branch);
    res.json({ branch: { slug: branch.slug, label: branch.label }, count: payload.count, averageRating: payload.averageRating });
  } catch (err) {
    res.status(400).json({ error: "Şube eklenemedi", detail: String(err?.message || err) });
  }
});

app.listen(PORT, () => {
  console.log(`Sunucu çalışıyor: http://localhost:${PORT}`);
});
