// Uygulama yapılandırması — çok şubeli.
// Yeni şube eklemek için BRANCHES dizisine { slug, label, name, placeUrl } ekle.
//   - slug:     dosya/anahtar adı (data/reviews-<slug>.json)
//   - label:    arayüzde görünen kısa etiket
//   - name:     Google Haritalar'daki tam işletme adı (arama için kullanılır)
//   - placeUrl: işletmenin Google Haritalar URL'i (koordinat + feature id içerir)

export const BRANCHES = [
  {
    slug: "ankara",
    label: "Ankara / Çankaya",
    name: "Maharet Mantı Ankara & Kayseri Yağlaması",
    placeUrl:
      "https://www.google.com/maps/place/Maharet+Mant%C4%B1+Ankara+%26+Kayseri+Ya%C4%9Flamas%C4%B1/@39.8949016,32.8776725,17z/data=!4m6!3m5!1s0x14d34f4df2208bff:0x29f0142ca75b2661!8m2!3d39.8949016!4d32.8776725!16s%2Fg%2F11kp9s718s?hl=tr",
  },
  {
    slug: "izmir",
    label: "İzmir / Bayraklı",
    name: "Maharet Mantı & Kayseri Yağlaması",
    placeUrl:
      "https://www.google.com/maps/place/Maharet+Mant%C4%B1+%26+Kayseri+Ya%C4%9Flamas%C4%B1/@38.4516459,27.1808987,17z/data=!3m1!4b1!4m6!3m5!1s0x14bbd79aaaaaaac7:0x57790eab3d86a168!8m2!3d38.4516459!4d27.1808987!16s%2Fg%2F11f1k6v4ny!18m1!1e1?entry=ttu",
  },
];

export const branchBySlug = (slug) => BRANCHES.find((b) => b.slug === slug);

// 3000 sıkça doludur; çakışmayı önlemek için 4545. Gerekirse: PORT=3001 npm start
export const PORT = process.env.PORT ? Number(process.env.PORT) : 4545;
