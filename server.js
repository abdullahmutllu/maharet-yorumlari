// Basit Express sunucusu: statik frontend + çok şubeli yorum API'leri.

import express from "express";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { PORT, BRANCHES, branchBySlug } from "./config.js";
import { runScrape } from "./scrape.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const app = express();

app.use(express.static(join(__dirname, "public")));

// Şube listesi
app.get("/api/branches", (_req, res) => {
  res.json(BRANCHES.map((b) => ({ slug: b.slug, label: b.label })));
});

// Bir şubenin önbellekteki yorumları
app.get("/api/reviews", async (req, res) => {
  const slug = req.query.branch || BRANCHES[0].slug;
  const branch = branchBySlug(slug);
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
  const slug = req.query.branch || BRANCHES[0].slug;
  const branch = branchBySlug(slug);
  if (!branch) return res.status(404).json({ error: "Şube bulunamadı", slug });
  try {
    const payload = await runScrape(branch);
    res.json(payload);
  } catch (err) {
    res.status(500).json({ error: "Yorumlar çekilemedi", detail: String(err?.message || err) });
  }
});

app.listen(PORT, () => {
  console.log(`Sunucu çalışıyor: http://localhost:${PORT}`);
});
