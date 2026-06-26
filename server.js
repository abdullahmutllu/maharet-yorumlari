// Basit Express sunucusu: statik frontend + çok şubeli yorum API'leri +
// dinamik şube ekleme + Google giriş (gerçek Chrome + CDP ile tam kapsam).

import express from "express";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { PORT } from "./config.js";
import { getAllBranches, getBranch, addCustomBranch } from "./branches.js";
import { runScrape } from "./scrape.js";
import { launchLoginChrome, cdpAlive } from "./login.js";
import { discoverPlaces, discoverCity } from "./discover.js";
import { slugify } from "./branches.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const app = express();

// Aynı anda tek tarayıcı çekim işi.
let busy = false;
const withLock = async (res, fn) => {
  if (busy) { res.status(409).json({ error: "Şu an başka bir çekim sürüyor, lütfen bekleyin." }); return; }
  busy = true;
  try { await fn(); } finally { busy = false; }
};

app.use(express.json());
app.use(express.static(join(__dirname, "public")));

app.get("/api/branches", async (_req, res) => {
  const all = await getAllBranches();
  res.json(all.map((b) => ({ slug: b.slug, label: b.label })));
});

// Giriş durumu: giriş için açılan gerçek Chrome (CDP/9222) çalışıyor mu?
app.get("/api/login-status", async (_req, res) => {
  res.json({ chrome: await cdpAlive() });
});

// "Google ile giriş": otomasyon bayrağı olmayan GERÇEK bir Chrome açar (Google engellemez).
app.post("/api/login", async (_req, res) => {
  try {
    const r = await launchLoginChrome();
    res.json(r);
  } catch (err) {
    res.status(500).json({ error: "Chrome açılamadı", detail: String(err?.message || err) });
  }
});

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

// Bir şubeyi yeniden çek ("Yenile") — giriş Chrome'u açıksa CDP ile oturumlu (tam kapsam).
app.post("/api/scrape", async (req, res) => {
  const branch = await getBranch(req.query.branch);
  if (!branch) return res.status(404).json({ error: "Şube bulunamadı", slug: req.query.branch });
  await withLock(res, async () => {
    try {
      const payload = await runScrape(branch);
      res.json(payload);
    } catch (err) {
      res.status(500).json({ error: "Yorumlar çekilemedi", detail: String(err?.message || err) });
    }
  });
});

// Yeni şube ekle: link ver -> kaydet -> hemen çek (giriş açıksa oturumlu).
app.post("/api/branches", async (req, res) => {
  const { url, label } = req.body || {};
  if (!url) return res.status(400).json({ error: "URL gerekli" });
  await withLock(res, async () => {
    try {
      const branch = await addCustomBranch({ url, label });
      const payload = await runScrape(branch);
      res.json({ branch: { slug: branch.slug, label: branch.label }, count: payload.count, averageRating: payload.averageRating });
    } catch (err) {
      res.status(400).json({ error: "Şube eklenemedi", detail: String(err?.message || err) });
    }
  });
});

// KEŞFET: bölge+kategori -> yer dizini (ad, puan, yorum sayısı, kategori/adres)
app.post("/api/discover", async (req, res) => {
  const query = (req.body && req.body.query) ? String(req.body.query).trim() : "";
  if (!query) return res.status(400).json({ error: "Sorgu (bölge + kategori) gerekli" });
  await withLock(res, async () => {
    try {
      const payload = await discoverPlaces(query);
      res.json(payload);
    } catch (err) {
      res.status(500).json({ error: "Keşfet başarısız", detail: String(err?.message || err) });
    }
  });
});

// KEŞFET (şehir): tüm ilçeleri gezip birleşik dizin
app.post("/api/discover-city", async (req, res) => {
  const city = (req.body && req.body.city) ? String(req.body.city).trim() : "";
  const category = (req.body && req.body.category) ? String(req.body.category).trim() : "restoran";
  if (!city) return res.status(400).json({ error: "Şehir gerekli" });
  await withLock(res, async () => {
    try {
      const payload = await discoverCity(city, category);
      res.json(payload);
    } catch (err) {
      res.status(500).json({ error: "Şehir taraması başarısız", detail: String(err?.message || err) });
    }
  });
});

// Kaydedilmiş bir dizini getir
app.get("/api/places", async (req, res) => {
  const slug = slugify(req.query.query || req.query.slug || "");
  try {
    const data = await readFile(join(__dirname, "data", `places-${slug}.json`), "utf8");
    res.type("application/json").send(data);
  } catch {
    res.status(404).json({ error: "Dizin bulunamadı", slug });
  }
});

app.listen(PORT, () => {
  console.log(`Sunucu çalışıyor: http://localhost:${PORT}`);
});
