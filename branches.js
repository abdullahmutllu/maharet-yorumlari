// Şube yönetimi: config.js'teki sabit şubeler + kullanıcının arayüzden eklediği
// dinamik şubeler (data/custom-branches.json). Tek kaynak burası.

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { BRANCHES as DEFAULTS } from "./config.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, "data");
const CUSTOM_FILE = join(DATA_DIR, "custom-branches.json");

export async function loadCustomBranches() {
  try {
    const arr = JSON.parse(await readFile(CUSTOM_FILE, "utf8"));
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

// Sabit + dinamik şubeler (slug'a göre tekilleştirilmiş).
export async function getAllBranches() {
  const custom = await loadCustomBranches();
  const map = new Map();
  for (const b of [...DEFAULTS, ...custom]) map.set(b.slug, b);
  return [...map.values()];
}

export async function getBranch(slug) {
  return (await getAllBranches()).find((b) => b.slug === slug) || null;
}

export function slugify(s) {
  const tr = { ç: "c", ğ: "g", ı: "i", İ: "i", ö: "o", ş: "s", ü: "u", Ş: "s", Ç: "c", Ğ: "g", Ö: "o", Ü: "u" };
  return (
    String(s)
      .replace(/[çğıİöşüŞÇĞÖÜ]/g, (c) => tr[c] || c)
      .toLowerCase()
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40) || "sube"
  );
}

// Google Haritalar URL'inden işletme adı ve feature id çıkar.
export function parsePlaceUrl(url) {
  let name = "Yeni Şube";
  const m = url.match(/\/maps\/place\/([^/@]+)/);
  if (m) {
    try { name = decodeURIComponent(m[1].replace(/\+/g, " ")).trim(); } catch { name = m[1].replace(/\+/g, " "); }
  }
  const fid = (url.match(/!1s(0x[0-9a-f]+:0x[0-9a-f]+)/i) || [])[1] || "";
  return { name, fid };
}

// Yeni dinamik şube ekle (kalıcı olarak data/custom-branches.json'a yazar).
export async function addCustomBranch({ url, label }) {
  if (!/^https?:\/\/(www\.)?google\.[^/]+\/maps\/place\//.test(url)) {
    throw new Error("Geçerli bir Google Haritalar işletme (/maps/place/...) URL'i girin.");
  }
  const { name, fid } = parsePlaceUrl(url);
  const all = await getAllBranches();
  let slug = slugify(label || name);
  if (all.some((b) => b.slug === slug)) {
    slug = `${slug}-${fid ? fid.slice(-4) : Date.now().toString(36).slice(-4)}`;
  }
  const branch = { slug, label: (label || name).trim(), name, placeUrl: url };

  await mkdir(DATA_DIR, { recursive: true });
  const custom = await loadCustomBranches();
  custom.push(branch);
  await writeFile(CUSTOM_FILE, JSON.stringify(custom, null, 2), "utf8");
  return branch;
}
