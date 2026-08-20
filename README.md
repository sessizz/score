# 🏐 Voleybol Canlı Skorboard & OBS Yayın Sistemi (Coolify Ready)

**Fenerbahçe Altyapı Küçük Erkek Voleybol Ligi** canlı yayınları ve genel voleybol müsabakaları için tasarlanmış; **keepthescore.com** benzeri, ancak canlı yayınlara (OBS / vMix) ve **Coolify** ortamına özel olarak optimize edilmiş, ultra hafif ve sıfır gecikmeli (SSE) canlı skor yönetim sistemi.

---

## 🚀 Öne Çıkan Özellikler

1. **Ultra Hafif & Stabil (Zero-Dependency Node.js + SSE)**:
   - Dış npm bağımlılığı gerektirmez (`node_modules` derdi yoktur).
   - Sunucuda sadece **<25MB RAM** ve neredeyse **%0 CPU** tüketir.
   - **Server-Sent Events (SSE)** ile canlı yayına ve tüm cihazlara `<50ms` sıfır gecikmeyle anlık veri iletir.
   - Bağlantı kopsa bile otomatik yeniden bağlanır (auto-reconnect).

2. **OBS Studio & vMix Canlı Yayın Katmanları (`/overlay`)**:
   - %100 Şeffaf (transparent) arka plan.
   - **3 Farklı TV Yayın Teması**:
     - **Top Bar (Üst Çubuk / Scorebug - Önerilen)**: Voleybol maçlarında sahayı kapatmayan kompakt TV stili.
     - **Lower-Third (Geniş Alt Şerit)**: Set aralarında ve maç içinde detaylı set geçmişi çubuğu.
     - **Mini Bug (Köşe Skor)**: Küçük köşe göstergesi.
   - Sayı değişim efektleri, dinamik parıldayan **"SET SAYISI / SET POINT"** ve **"MAÇ SAYISI / MATCH POINT"** uyarıları, servis topu animasyonu ve mola geri sayımı.

3. **Mobil & Tablet Uyumlu Kumanda Paneli (`/control`)**:
   - Masa başındaki hakem veya veli/operatörün telefondan tek parmakla yönetebileceği büyük dokunmatik butonlar (+1, -1, Servis, Mola, Geri Al, Saha Değişimi).
   - Yanlış basımlara karşı **Geri Al (Undo)** desteği (Ctrl+Z veya butona basarak).
   - 30 saniyelik sesli & görsel mola sayacı.
   - Takım isimleri, formaları, logoları ve şifreli PIN koruması.

4. **Salon & Seyirci Ekranı (`/live`)**:
   - Salondaki TV'ler veya yayını cepten takip eden taraftarlar için tam ekran dev skorboard.

---

## 🛠️ Coolify Üzerinde Kurulum (1 Dakikada Canlıya Alma)

Sistem hem macOS üzerinde çalışan Coolify'da hem de herhangi bir Docker/Linux sunucusunda doğrudan çalışacak şekilde paketlenmiştir.

### Yöntem 1: Coolify Git Repo Entegrasyonu (En Kolay)
1. Bu projeyi GitHub / GitLab hesabınıza push edin (veya public repo olarak bağlayın).
2. Coolify panelinizde **+ New Resource** > **Public / Private Repository** seçin.
3. Repo URL'nizi girin.
4. Coolify `Dockerfile`'ı otomatik algılayacaktır.
5. **Port** alanına `3000` yazın.
6. **Storage / Persistent Volume** bölümüne:
   - Volume Adı: `scoreboard_data`
   - Mount Path: `/app/data` (Maç durumlarının ve geçmişin sunucu yeniden başlasa bile silinmemesi için).
7. **Deploy** butonuna tıklayın!

### Yöntem 2: Coolify Docker Compose ile Kurulum
Coolify'da **+ New Resource** > **Docker Compose** seçip projedeki `docker-compose.yml` içeriğini yapıştırarak tek tıkla ayağa kaldırabilirsiniz.

---

## 💻 Yerel Olarak (Lokalde) Çalıştırma

Projeyi yerel bilgisayarınızda veya sunucunuzda çalıştırmak için:

```bash
# Projeyi başlatın
node src/server.js
```

Tarayıcınızda açın:
- 🏠 **Ana Menü**: `http://localhost:3000/`
- 🎛️ **Fenerbahçe Kumanda**: `http://localhost:3000/control/fenerbahce`
- 📺 **OBS Üst Bant**: `http://localhost:3000/overlay/fenerbahce?theme=topbar`
- 📺 **OBS Alt Şerit**: `http://localhost:3000/overlay/fenerbahce?theme=lowerthird`
- 🏟️ **Salon Ekranı**: `http://localhost:3000/live/fenerbahce`

---

## 📺 OBS Studio Canlı Yayınına Ekleme Kılavuzu

1. OBS Studio'yu açın.
2. **Kaynaklar (Sources)** penceresinin altındaki **+ (Ekle)** butonuna basın.
3. **Tarayıcı (Browser)** kaynağını seçin ve bir isim verin (Örn: *Voleybol Skor*).
4. Ayarlar:
   - **URL**: `https://sunucunuz.com/overlay/fenerbahce?theme=topbar` (veya `theme=lowerthird`)
   - **Genişlik (Width)**: `1920`
   - **Yükseklik (Height)**: `1080`
   - **Özel CSS**: Boş bırakabilirsiniz (kendiliğinden şeffaftır).
5. **Tamam**'a basın. Skor tablonuz yayına şeffaf şekilde yerleşecektir!

### URL Parametreleri (Özelleştirme)
- `theme=topbar` : Standart TV üst bant skoru (Varsayılan).
- `theme=lowerthird` : Geniş TV alt bant skoru ve set geçmişi.
- `theme=bug` : Sol üst köşe mini skor.
- `scale=1.2` : Skorbord boyutunu %120 büyütür (veya `0.9` ile küçültür).
- `sound=1` : Sayı alındığında veya mola başladığında OBS üzerinden düdük/ses efekti çalar.

---

## ⌨️ Hakem / Operatör Klavye Kısayolları

Kumanda panelinde mouse/dokunmatik ekran dışında klavyeyle süper hızlı skor tutabilirsiniz:
- `Sol Ok` / `A Tuşu`: Sol Takıma +1 Sayı
- `Sağ Ok` / `L Tuşu`: Sağ Takıma +1 Sayı
- `Space (Boşluk)`: Servis Yönünü Değiştir
- `Ctrl + Z`: Son Hareketi Geri Al (Undo)
- `S Tuşu`: Saha Yönlerini Değiştir (Swap Sides)
- `F Tuşu`: Salon Ekranında Tam Ekran (Fullscreen) Aç/Kapat

---

## 📁 Proje Yapısı

```
score/
├── src/
│   ├── server.js              # Ultra hafif Native HTTP & SSE Sunucusu (0 dependency)
│   ├── store.js               # Voleybol motoru, skor kuralları, kalıcılık ve SSE
│   └── public/
│       ├── index.html         # Ana karşılama & Maç oluşturma paneli
│       ├── control.html       # Mobil/Tablet Hakem Kumanda Paneli
│       ├── overlay.html       # OBS Studio Şeffaf Grafik Katmanı
│       ├── live.html          # Salon TV / Seyirci Ekranı
│       ├── css/
│       │   ├── common.css     # Tasarım değişkenleri & modallar
│       │   ├── control.css    # Kumanda arayüzü stilleri
│       │   ├── overlay.css    # TV yayın grafikleri & animasyonlar
│       │   └── live.css       # Salon ekranı stilleri
│       ├── js/
│       │   ├── control.js     # Dokunmatik kumanda & SSE istemcisi
│       │   ├── overlay.js     # OBS grafik motoru & animasyonlar
│       │   └── live.js        # Canlı ekran istemcisi
│       └── assets/
│           ├── fenerbahce.svg # Fenerbahçe amblemi
│           ├── volleyball.svg # Voleybol servis topu
│           └── opponent.svg   # Rakip takım varsayılan logosu
├── data/                      # Kalıcı JSON veritabanı (/data/boards.json)
├── Dockerfile                 # Coolify için optimize edilmiş Alpine Node.js
├── docker-compose.yml         # Tek tıkla Coolify deploy dosyası
├── package.json               # Paket konfigürasyonu
└── README.md                  # Kapsamlı kullanım kılavuzu
```
