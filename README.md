# Maharet Mantı — Google Yorumları

[Maharet Mantı & Kayseri Yağlaması](https://www.google.com/maps/place/Maharet+Mant%C4%B1+%26+Kayseri+Ya%C4%9Flamas%C4%B1) (Bayraklı/İzmir) işletmesinin **Google Maps yorumlarını** çekip basit bir web arayüzünde gösteren küçük bir uygulama.

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
npm run scrape     # tüm yorumları çeker -> data/reviews.json
npm start          # http://localhost:4545 (arama + puan filtresi + sıralama + Yenile)
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
| `config.js` | İşletme URL'i, adı, port |
| `scrape.js` | Playwright ile tüm yorumları çeker → `data/reviews.json` |
| `server.js` | Express: statik arayüz + `/api/reviews` + `/api/scrape` |
| `public/` | Tek sayfalık arayüz (index.html, app.js, styles.css) |
| `build-static.js` | GitHub Pages için `docs/` üretir |

## Not

Veriler Google Maps'ten alınmıştır; yalnızca görüntüleme amaçlıdır.
