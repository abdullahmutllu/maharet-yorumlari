# Maharet Mantı — Google Yorumları

Maharet Mantı'nın **Google Maps yorumlarını** çekip basit bir web arayüzünde gösteren küçük bir uygulama. Çok şubeli: üstteki seçiciyle şube değiştirilir.

- **Ankara / Çankaya** — Maharet Mantı Ankara & Kayseri Yağlaması
- **İzmir / Bayraklı** — Maharet Mantı & Kayseri Yağlaması

**Canlı (statik) sürüm:** https://abdullahmutllu.github.io/maharet-yorumlari/

## Nasıl çalışır?

Resmi Google Places API yer başına yalnızca 5 yorum döndürür; dahili yorum endpoint'leri ise oturumsuz boş döner. Bu yüzden **gerçek bir tarayıcı (Playwright)** sürülür:

1. `google.com`'da kısa bir "ısınma" + çerez/onay → oturum çerezleri oluşur.
2. `/maps/place/...` yerine **arama URL'i** (`/maps/search/...`) ile gidilir → oturumsuz "sınırlı görünüm" aşılır, tam panel gelir.
3. "Yorumlar" sekmesi açılır, kaydırılabilir liste sonuna kadar kaydırılır; Google listeyi sanallaştırdığı için **her adımda** DOM'dan çekilip biriktirilir.
4. Google oturumsuz kaydırmayı ~1000 yorumda sınırladığından, **farklı sıralamalar** (en yeni / en yüksek / en düşük / en alakalı) ayrı ayrı taranıp **birleştirilir** → kapsam tüm yorumlara yaklaşır.

Her yorum: yazar, profil fotoğrafı, puan, metin, göreli tarih, işletme yanıtı ve fotoğraflar.

## Kurulum & çalıştırma (yerel)

```bash
npm install
npm run scrape            # tüm şubeleri çeker -> data/reviews-<slug>.json
npm run scrape ankara     # sadece tek şube
npm start                 # http://localhost:4545 (şube seçici + arama + filtre + sıralama + Yenile)
```

> Headless çalışır. Görünür tarayıcı için: `HEADLESS=0 npm run scrape`
> Port değiştirmek için: `PORT=3001 npm start`

## GitHub Pages (statik yayın)

GitHub Pages Node çalıştırmaz; bu yüzden `docs/` altına, çekilen yorumları gömülü
`reviews.json`'dan gösteren statik bir görüntüleyici üretiriz.

```bash
npm run scrape     # veriyi güncelle
npm run build      # public/ + data/reviews.json -> docs/
git add -A && git commit -m "yorumları güncelle" && git push
```

Pages kaynağı: `main` dalı, `/docs` klasörü. (Statik sürümde "Yenile" gizlidir.)

## Yapı

| Dosya | İşlev |
|------|------|
| `config.js` | Şubeler (`BRANCHES`: slug, label, ad, URL) ve port |
| `scrape.js` | Playwright ile şube yorumlarını çeker → `data/reviews-<slug>.json` |
| `server.js` | Express: arayüz + `/api/branches` + `/api/reviews?branch=` + `/api/scrape?branch=` |
| `public/` | Tek sayfalık arayüz (şube seçici, index.html, app.js, styles.css) |
| `build-static.js` | GitHub Pages için `docs/` üretir (her şube JSON'u + `branches.json`) |

Yeni şube eklemek: `config.js`'teki `BRANCHES` dizisine `{ slug, label, name, placeUrl }` ekle, `npm run scrape <slug>` çalıştır.

## Not

Veriler Google Maps'ten alınmıştır; yalnızca görüntüleme amaçlıdır.
