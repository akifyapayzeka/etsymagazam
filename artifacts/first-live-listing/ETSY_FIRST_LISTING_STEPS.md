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

---

## 0. Genel Bilgi

| Alan | Değer |
|---|---|
| Ürün adı (dahili referans) | The 3-3-3 Rescue Dog Decompression Tracker |
| QA Skoru | 100 / 100 (sistem barı: ≥95) |
| IP Risk Skoru | 0 / 100 (sistem barı: ≤10) |
| Fiyat | **$6.50 USD** |
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
3-3-3 Rescue Dog Decompression Tracker | Printable Adjustment Checklist for New Shelter Dogs | Instant Download PDF
```

**"About this listing" bölümü:**

| Soru | Cevap |
|---|---|
| Who made it? | I did (Ben yaptım) |
| What is it? | A finished product |
| When was it made? | Made to order |

**Category (Kategori):** Etsy'nin kategori arama kutusuna yaz ve öner
listeden en yakınını seç. Önce **"Pet Supplies"** yazıp dijital/printable bir
pet planner/tracker alt kategorisi var mı diye bak; yoksa **"Craft Supplies &
Tools > Paper & Party Supplies > Printables"** yolunu kullan. Detaylı not için
`listing-data/etsy-category.txt` dosyasına bak — sistem sayısal bir
`taxonomy_id` ASLA tahmin etmez, bu yüzden burada kesin bir ID veremiyorum;
Etsy'nin kendi arama kutusunun önerdiği en yakın kategoriyi seç.

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
   — kolaylık dosyası: US Letter boyutunda, 5 sayfa tek PDF
3. `customer-download/333-rescue-dog-decompression-tracker-a_series.pdf`
   — kolaylık dosyası: A4 boyutunda, 5 sayfa tek PDF

---

## 4. "Inventory and pricing" Ekranı

| Alan | Değer |
|---|---|
| Price (Fiyat) | **6.50** (USD) |
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
Just brought home a rescue or shelter dog? The first 3 months are the hardest to navigate — and this tracker turns the widely-recommended "3-3-3 rule" (3 days, 3 weeks, 3 months) into a simple, printable guide so you always know what's normal and what to focus on next.

Instead of one generic checklist, you get 5 focused pages: a Days 1-3 decompression log, a Weeks 1-3 routine-building checklist, a Months 1-3 settling-in checklist, and a Safe Space Setup + Signs of Progress quick-reference — so you're never left wondering "is this normal?" during the adjustment period.

What's included:

- 4 checklist pages (Days 1-3 / Weeks 1-3 / Months 1-3 / Safe Space & Signs of Progress) plus a title page
- 2 print sizes: US Letter and A4, so it prints cleanly no matter where you live
- Delivered as a print-ready PDF (all pages together) and individual PNG pages, zipped into one download
- A short printing guide and personal-use license included

This is a DIGITAL product — no physical item will be shipped. Files are delivered instantly after purchase via Etsy, so you can start using it the moment your new dog gets home.

This is an organizational tool, not veterinary or professional training advice — for behavioral concerns, please consult a certified trainer or your veterinarian.

For personal use — see the included license.txt for details.

This listing's text was written with AI assistance. All product design, layout, and formatting is original and manually reviewed.

Brought to you by Form & Fern.
```

*(Not: "AI disclosure" paragrafı Etsy'nin Creativity Standards politikasına
uymak için otomatik eklenmiştir — silme.)*

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
dog checklist
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
- [ ] Type = Digital seçili mi?
- [ ] 3 dijital dosya doğru sırayla yüklendi mi?
- [ ] Fiyat $6.50 mi?
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
