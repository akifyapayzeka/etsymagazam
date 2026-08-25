# Form & Fern — İlk Listing'i Etsy'de Manuel Yayınlama Adımları

**Neden manuel?** Mağaza henüz Etsy'de ACTIVE (aktif/satışa açık) durumda
değil ve Etsy Seller App / OAuth bağlantısı henüz kurulmadı. Etsy Open API
v3 üzerinden otomatik yayın yapabilmek için önce mağazanın aktif olması
gerekiyor. Bu yüzden **ilk listing'i sen, Etsy Shop Manager arayüzünden elle
yayınlamalısın** — kazıma (scraping), tarayıcı otomasyonu veya CAPTCHA atlatma
gibi hiçbir yöntem kullanılmadı ve kullanılmayacak. Sen yayınladıktan sonra
ben bu listing'i Etsy API'sinden okuyup sisteme "import" edeceğim — ikinci
bir kopya listing ASLA oluşturmayacağım.

Tüm dosyalar `artifacts/first-live-listing/` klasöründe hazır. Aşağıda Etsy
Shop Manager'daki **"Add a listing"** (Yeni liste ekle) ekranını sırasıyla
takip et; her alan için tam olarak kopyala-yapıştır yapabileceğin değeri
veriyorum.

**Bu paket, önceki sürümden sonra kullanıcının bağımsız pazar kontrolü
üzerine tamamen yeniden yapıldı**: ürün 5 sayfadan 13 sayfaya (12 içerik
sayfası + kapak) çıkarıldı, rakiplerden somut farklılaşma eklendi, "When
Made" alanı düzeltildi, kategori ve fiyat talimatları katı/hardcoded
varsayımlardan canlı-kontrol talimatlarına çevrildi. Eski sürümü bu yeni
sürümle KARIŞTIRMA — bu klasördeki her dosya yeni sürüme ait.

---

## 0. Genel Bilgi

| Alan | Değer |
|---|---|
| Ürün adı (dahili referans) | The 3-3-3 Rescue Dog Decompression & Adjustment Bundle |
| Sayfa sayısı | 13 (kapak + 12 içerik sayfası) |
| QA Skoru | 100 / 100 (sistem barı: ≥95) |
| IP Risk Skoru | 0 / 100 (sistem barı: ≤10) |
| Referans Fiyat (USD) | **$8.50** — SADECE mağaza para birimi USD ise geçerli, bkz. Bölüm 4 |
| Marka (ürün dosyalarında görünen) | Form & Fern |
| Etsy mağaza adı (teknik, müşteriye asla gösterilmez) | FormAndFernCo |

---

## 1. "Photos and video" (Fotoğraflar) Ekranı

Etsy'de **Shop Manager → Listings → Add a listing** yolunu izle.

Fotoğrafları **tam bu sırayla** yükle (ilk fotoğraf Etsy arama sonuçlarında
kapak görseli olarak kullanılır, bu yüzden sıra önemli):

1. `listing-images/01_cover.png`
2. `listing-images/02_mockup.png`
3. `listing-images/03_whats_included.png`
4. `listing-images/04_features_benefits.png`
5. `listing-images/05_sizes_formats.png`
6. `listing-images/06_how_it_works.png`
7. `listing-images/07_use_case.png`
8. `listing-images/08_instant_download.png`
9. `listing-images/09_important_info.png`

Video alanı boş bırakılabilir (opsiyonel).

---

## 2. "Listing details" Ekranı

**Title (Başlık)** — aşağıdaki metni `listing-data/etsy-title.txt` dosyasından
aynen kopyala:

```
3-3-3 Rescue Dog Adjustment Bundle | 12-Page Printable Planner for New Shelter & Rescue Dogs | Instant Download PDF
```

**"About this listing" bölümü:**

| Soru | Cevap |
|---|---|
| Who made it? | I did (Ben yaptım) |
| What is it? | A finished product |
| When was it made? | **Bkz. aşağıdaki önemli not — "Made to order" DEĞİL.** |

> ⚠️ **"When was it made?" — düzeltme:** Bu ürün hazır (ready-made) bir
> instant-download dosyasıdır — müşteri sipariş verdikten SONRA özel olarak
> üretilmiyor. Bu yüzden **"Made to order" seçme.** Etsy'nin bu alanda
> gerçek zamanlı sunduğu seçeneklerden, ürünün fiilen üretildiği/tasarlandığı
> güncel tarih aralığını seç (bugünün tarihi 2026, yani muhtemelen "2020–2026"
> veya Etsy arayüzünde o anda görünen en güncel tarih aralığı seçeneği neyse
> o). `listing-data/etsy-attributes.json` içinde bu alan referans olarak
> `"2020_2026"` olarak işaretli — ama Etsy arayüzünde göreceğin gerçek
> seçenek listesini esas al, çünkü Etsy bu seçenekleri zamanla güncelleyebilir.
> "Made to order" SADECE müşterinin siparişinden SONRA özel olarak üretilen
> ürünler için kullanılır — bizim durumumuzda geçerli değil.

**Category (Kategori):** Etsy'nin kategori arama kutusuna ürünün gerçek
açıklamasını yaz (örn. "pet adjustment planner" veya "dog printable") ve
Etsy'nin O ANDA canlı olarak önerdiği kategorilerden en yakınını seç.
**Sabit/hardcoded bir kategori yolu dayatma** — ürünü dijital diye zorla
alakasız bir "Craft Supplies" kategorisine sokma. Etsy'nin kendi kategori
ağacı zamanla değişebilir; bu yüzden aşağıdaki `pet_supplies_printable`
sadece bir İPUCU'dur, kesin bir `taxonomy_id` DEĞİLDİR (sistem sayısal bir
taxonomy_id'yi asla tahmin etmez). Detaylı not için
`listing-data/etsy-category.txt` dosyasına bak.

**Type (Tür):** **Digital** seç (Physical değil). Bu seçildiğinde Etsy
otomatik olarak kargo/shipping bölümünü gizleyecek.

**Renewal options:** "Automatic" ya da "Manual" — ikisi de kabul edilebilir,
tercihen **Automatic** seç (sistemin varsayılan davranışıyla eşleşir,
`etsy-attributes.json` içinde `should_auto_renew: true` olarak işaretli).

Kategoriye göre Etsy ek özellik (attribute) alanları gösterebilir
(**Occasion, Style, Recipient, Color** gibi). `listing-data/etsy-attributes.json`
dosyasındaki değerleri kullan:

| Attribute | Değer |
|---|---|
| Occasion | New pet |
| Style | Minimalist |
| Recipient | Pet owner |
| Primary color | Green |
| Color (detay) | Sage green |

Etsy bu alanların hepsini göstermeyebilir — sadece gösterilenleri doldur.

---

## 3. "Digital files" (Dijital Dosyalar) Ekranı

Şu 3 dosyayı **bu sırayla** yükle (Etsy dijital listing başına en fazla 5
dosyaya izin verir, biz 3 kullanıyoruz):

1. `customer-download/333-rescue-dog-decompression-tracker-complete-bundle.zip`
   — tam paket: her iki kağıt boyutunda (Letter + A4) tüm PNG sayfalar +
   her iki PDF + `instructions.txt` + `license.txt`
2. `customer-download/333-rescue-dog-decompression-tracker-letter.pdf`
   — kolaylık dosyası: US Letter boyutunda, 13 sayfa tek PDF
3. `customer-download/333-rescue-dog-decompression-tracker-a_series.pdf`
   — kolaylık dosyası: A4 boyutunda, 13 sayfa tek PDF

---

## 4. "Inventory and pricing" Ekranı

⚠️ **Fiyat — para birimi kontrolü şart:** Etsy'nin fiyat alanının kendi
para birimi parametresi yoktur — girdiğin sayı her zaman mağazanın kayıtlı
para biriminde yorumlanır. **Fiyatı girmeden önce mağaza para birimini
kontrol et** (Etsy Shop Manager → Finances → Payment account, veya Settings).

| Mağaza para birimi | Ne yapmalısın |
|---|---|
| **USD** ise | Fiyata **8.50** yaz |
| **USD değilse** (örn. TRY) | **8.50 sayısını OLDUĞU GİBİ yazma** — bu yanlış tutar/yanlış para birimi olur. Önce 8.50 USD'yi güncel bir kur ile mağaza para birimine çevir, sonra o çevrilmiş tutarı gir. |

Detaylı not için `listing-data/etsy-price.txt` dosyasına bak.

| Alan | Değer |
|---|---|
| Price (Fiyat) | Yukarıdaki tabloya göre (USD ise **8.50**) |
| Quantity (Adet) | **999** (dijital üründe stok mantığı geçerli değil, Etsy'nin önerdiği yüksek bir sayı kullanılır) |
| SKU | Boş bırakabilirsin (opsiyonel) |

---

## 5. "Variations" Ekranı

Bu ürün için varyasyon **yok** — bu ekranı atla / "No, I don't want variations" seç.

---

## 6. "Personalization" Ekranı

Bu ürün kişiselleştirme **gerektirmiyor** — "No, this listing doesn't require personalization" seç.

---

## 7. "Description" (Açıklama) Ekranı

`listing-data/etsy-description.txt` dosyasının **tamamını** aynen kopyala-yapıştır yap. İçeriği:

```
Just brought home a rescue or shelter dog? The first 3 months are the hardest to navigate — and this bundle turns the widely-recommended "3-3-3 rule" (3 days, 3 weeks, 3 months) into a complete, printable system so you always know what's normal and what to focus on next.

This isn't a single checklist — it's a full 12-page adjustment system covering the parts most trackers skip: a First 72 Hours calm-home plan, a Safe Space setup guide, a Daily Routine Builder, a Food/Water/Sleep watch list, a Trigger & Comfort log, a First 3 Days reflection page, Week 1-3 and Month 1-3 trackers, a Questions-for-Vet-or-Trainer prep page, a New Home Emergency Information sheet, a Family Consistency sheet for multi-person households, and a Progress Without Deadlines page so you never feel behind schedule.

What's included:

- 12 focused pages plus a title page (13 pages total), covering setup, daily routine, observation logs, reflection, vet/trainer prep, emergency info, and family alignment
- 2 print sizes: US Letter and A4, so it prints cleanly no matter where you live
- Delivered as a print-ready PDF (all pages together) and individual PNG pages, zipped into one download
- A short printing guide and personal-use license included

This is a DIGITAL product — no physical item will be shipped. Files are delivered instantly after purchase via Etsy, so you can start using it the moment your new dog gets home.

This is an organizational tool, not veterinary or professional training advice — for behavioral concerns, please consult a certified trainer or your veterinarian.

For personal use — see the included license.txt for details.

This listing's description and written product content (e.g. checklist/planner text) were drafted with AI assistance, directed and edited by the shop owner. The page layout, typography, and final design are original, non-AI work.

Brought to you by Form & Fern.
```

*(Not: "AI disclosure" paragrafı Etsy'nin Creativity Standards politikasına
uymak için otomatik eklenmiştir — silme. Bu paragraf gerçek üretim sürecini
doğru yansıtır: hem bu açıklama metni hem de ürünün kendi içerik metni
(checklist maddeleri) AI yardımıyla yazıldı; sayfa tasarımı/düzeni ise
satori/resvg ile deterministik olarak render edildi, AI görsel üretimi
kullanılmadı.)*

---

## 8. "Production partners" Ekranı

Atla — üretim ortağı yok, "I didn't work with a production partner" seç.

---

## 9. "Tags" (Etiketler) Ekranı

`listing-data/etsy-tags.txt` dosyasındaki **13 etiketin her birini** ayrı
ayrı ekle (her satır bir etiket):

```
rescue dog
dog adoption
decompression
shelter dog
new dog owner
dog adjustment
printable pdf
pet planner
foster dog
dog tracker
3 3 3 rule
instant download
dog printable
```

---

## 10. "Materials" (Malzemeler) Ekranı — opsiyonel ama doldur

```
Digital File
PDF
PNG
```

---

## 11. Son kontrol ve "Publish" (Yayınla)

Yayınlamadan önce:

- [ ] 9 fotoğraf doğru sırayla yüklendi mi?
- [ ] Title tam olarak kopyalandı mı? (140 karakter sınırı içinde)
- [ ] "When was it made?" alanında "Made to order" DEĞİL, gerçek/güncel bir
      tarih aralığı seçildi mi?
- [ ] Mağaza para birimi kontrol edildi mi ve fiyat ona göre mi girildi?
- [ ] Kategori Etsy'nin canlı önerdiği listeden mi seçildi (zorla alakasız
      bir kategoriye sokulmadı)?
- [ ] Type = Digital seçili mi?
- [ ] 3 dijital dosya doğru sırayla yüklendi mi?
- [ ] 13 etiketin hepsi eklendi mi?
- [ ] Description tam olarak yapıştırıldı mı (AI disclosure paragrafı dahil)?

Hepsi tamamsa **Publish** butonuna bas. Listing artık Etsy'de canlı.

---

## 12. Bana ne göndermelisin

Listing yayınlandıktan sonra bana şunu söyle (chat üzerinden yeterli):

**"PUBLISHED"**

Bunu yazdığında, listing'in gerçek Etsy `listing_id`'sini ve URL'sini API
üzerinden okuyup sisteme kaydedeceğim (ikinci bir kopya listing OLUŞTURMADAN
— sadece var olanı içe aktararak), ardından Seller App oluşturma, OAuth
bağlantısı, production deploy, taxonomy import, canlı smoke test ve PR
merge adımlarına geçeceğim.
