// Basit Express sunucusu: statik frontend + yorum API'leri.

import express from "express";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { PORT, BUSINESS_NAME } from "./config.js";
import { runScrape } from "./scrape.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const app = express();

app.use(express.static(join(__dirname, "public")));

// Önbellekteki yorumları döndür.
app.get("/api/reviews", async (_req, res) => {
  try {
    const data = await readFile(join(__dirname, "data", "reviews.json"), "utf8");
    res.type("application/json").send(data);
  } catch {
    // Henüz çekilmemiş.
    res.json({
      business: BUSINESS_NAME,
      sourceUrl: null,
      scrapedAt: null,
      count: 0,
      averageRating: 0,
      reviews: [],
    });
  }
});

// Yorumları yeniden çek (UI'daki "Yenile" butonu).
app.post("/api/scrape", async (_req, res) => {
  try {
    const payload = await runScrape();
    res.json(payload);
  } catch (err) {
    res
      .status(500)
      .json({ error: "Yorumlar çekilemedi", detail: String(err?.message || err) });
  }
});

app.listen(PORT, () => {
  console.log(`Sunucu çalışıyor: http://localhost:${PORT}`);
});
