// Basit Express sunucusu: statik frontend + çok şubeli yorum API'leri +
// dinamik şube ekleme + Google giriş (tam kapsam için).

import express from "express";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { PORT } from "./config.js";
import { getAllBranches, getBranch, addCustomBranch } from "./branches.js";
import { runScrape, runLogin, isLoggedIn, clearLogin } from "./scrape.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const app = express();

// Aynı anda tek tarayıcı işi (giriş ve çekim aynı profili kullanır, çakışmasın).
let busy = false;
const withLock = async (res, fn) => {
  if (busy) { res.status(409).json({ error: "Şu an başka bir işlem sürüyor, lütfen bekleyin." }); return; }
  busy = true;
  try { await fn(); } finally { busy = false; }
};

app.use(express.json());
app.use(express.static(join(__dirname, "public")));

app.get("/api/branches", async (_req, res) => {
  const all = await getAllBranches();
  res.json(all.map((b) => ({ slug: b.slug, label: b.label })));
});

app.get("/api/login-status", async (_req, res) => {
  res.json({ loggedIn: await isLoggedIn() });
});

// Google ile giriş: görünür Chrome açar, giriş yapılana kadar bekler.
app.post("/api/login", async (req, res) => {
  await withLock(res, async () => {
    try {
      const r = await runLogin();
      res.json(r);
    } catch (err) {
      res.status(500).json({ error: "Giriş başarısız", detail: String(err?.message || err) });
    }
  });
});

app.post("/api/logout", async (_req, res) => {
  try { res.json(await clearLogin()); }
  catch (err) { res.status(500).json({ error: "Çıkış başarısız", detail: String(err?.message || err) }); }
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

// Bir şubeyi yeniden çek ("Yenile") — giriş yapılmışsa oturumlu (tam kapsam).
app.post("/api/scrape", async (req, res) => {
  const branch = await getBranch(req.query.branch);
  if (!branch) return res.status(404).json({ error: "Şube bulunamadı", slug: req.query.branch });
  await withLock(res, async () => {
    try {
      const payload = await runScrape(branch, { login: await isLoggedIn() });
      res.json(payload);
    } catch (err) {
      res.status(500).json({ error: "Yorumlar çekilemedi", detail: String(err?.message || err) });
    }
  });
});

// Yeni şube ekle: link ver -> kaydet -> hemen çek (giriş yapılmışsa oturumlu).
app.post("/api/branches", async (req, res) => {
  const { url, label } = req.body || {};
  if (!url) return res.status(400).json({ error: "URL gerekli" });
  await withLock(res, async () => {
    try {
      const branch = await addCustomBranch({ url, label });
      const payload = await runScrape(branch, { login: await isLoggedIn() });
      res.json({ branch: { slug: branch.slug, label: branch.label }, count: payload.count, averageRating: payload.averageRating });
    } catch (err) {
      res.status(400).json({ error: "Şube eklenemedi", detail: String(err?.message || err) });
    }
  });
});

app.listen(PORT, () => {
  console.log(`Sunucu çalışıyor: http://localhost:${PORT}`);
});
