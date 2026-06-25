// Uygulama yapılandırması — sadece bu işletme.
// Başka bir işletme için PLACE_URL ve BUSINESS_NAME değerlerini değiştirmen yeterli.

export const PLACE_URL =
  "https://www.google.com/maps/place/Maharet+Mant%C4%B1+%26+Kayseri+Ya%C4%9Flamas%C4%B1/@38.4516459,27.1808987,17z/data=!3m1!4b1!4m6!3m5!1s0x14bbd79aaaaaaac7:0x57790eab3d86a168!8m2!3d38.4516459!4d27.1808987!16s%2Fg%2F11f1k6v4ny!18m1!1e1?entry=ttu&g_ep=EgoyMDI2MDYyMi4wIKXMDSoASAFQAw%3D%3D";

export const BUSINESS_NAME = "Maharet Mantı & Kayseri Yağlaması";

// 3000 sıkça doludur (ör. başka bir dev sunucusu); çakışmayı önlemek için 4545.
// Gerekirse: PORT=3001 npm start
export const PORT = process.env.PORT ? Number(process.env.PORT) : 4545;
