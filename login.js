// Google girişi için NORMAL bir Chrome açar (uzaktan hata ayıklama portuyla).
// Önemli: Playwright'in açtığı tarayıcıda Google "güvenli değil" deyip girişi engeller.
// Bu yüzden girişi, otomasyon bayrağı OLMAYAN gerçek bir Chrome'da yaptırıp,
// scraper'ı sonradan bu pencereye (CDP / port 9222) bağlıyoruz.

import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
export const CHROME_PROFILE = join(__dirname, ".gchrome");
export const CDP_PORT = Number(process.env.CDP_PORT) || 9222;

export function findChrome() {
  const cands = [
    "C:/Program Files/Google/Chrome/Application/chrome.exe",
    "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
    join(process.env.LOCALAPPDATA || "", "Google/Chrome/Application/chrome.exe"),
  ];
  return cands.find((p) => existsSync(p)) || null;
}

// 9222 zaten açık mı? (Chrome debug penceresi çalışıyor mu)
export async function cdpAlive() {
  try {
    const r = await fetch(`http://localhost:${CDP_PORT}/json/version`, { signal: AbortSignal.timeout(1500) });
    return r.ok;
  } catch {
    return false;
  }
}

export async function launchLoginChrome() {
  if (await cdpAlive()) return { ok: true, already: true, port: CDP_PORT };
  const exe = findChrome();
  if (!exe) throw new Error("Chrome bulunamadı (chrome.exe). Google Chrome kurulu olmalı.");
  const child = spawn(
    exe,
    [
      `--remote-debugging-port=${CDP_PORT}`,
      `--user-data-dir=${CHROME_PROFILE}`,
      "--no-first-run",
      "--no-default-browser-check",
      "https://accounts.google.com/",
    ],
    { detached: true, stdio: "ignore" }
  );
  child.unref();
  return { ok: true, port: CDP_PORT };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  launchLoginChrome().then((r) => {
    console.log(`Chrome açıldı (port ${r.port}). Google'a giriş yapın ve pencereyi AÇIK bırakın.`);
    console.log("Sonra: npm run scrape izmir   (veya arayüzde Yenile)");
  });
}
