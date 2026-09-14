# 🏐 Voleybol Canlı Skorboard & OBS Yayın Sistemi (Multi-User & Coolify Ready)

**Fenerbahçe Altyapı Küçük Erkek Voleybol Ligi** canlı yayınları ve tüm kulüp/okul müsabakaları için tasarlanmış; **kullanıcı girişli, e-posta doğrulamalı, SQLite veritabanlı, çok kullanıcılı (multi-tenant)**, OBS / vMix canlı yayınlarına ve **Coolify** ortamına özel olarak optimize edilmiş, ultra hafif ve sıfır gecikmeli (SSE) canlı skor yönetim sistemi.

---

## 🚀 Yeni & Öne Çıkan Özellikler

1. **Çok Kullanıcılı Üyelik & E-posta Doğrulama (Resend Entegrasyonu)**:
   - İsteyen herkes e-posta ve şifre ile üye olabilir.
   - Resend API üzerinden 6 haneli doğrulama kodu ve tek tıkla aktivasyon linki gönderilir.
   - Her kullanıcının kendi skorboard'ları, takımları ve yüklediği logoları izoledir.
   - Sistemde daha önceden var olan skorboard ve veriler, **ilk kaydolan ve doğrulanan kullanıcıya otomatik olarak aktarılır.**

2. **Gömülü SQLite Veritabanı (Sıfır Ek Maliyet & Sıfır Bakım)**:
   - Node 22 yerleşik `node:sqlite` mimarisiyle çalışır; ek PostgreSQL veya MySQL konteyneri gerektirmez.
   - Veriler kalıcı Docker Volume'daki `/app/data/scoreboard.db` dosyasında tutulur.

3. **PIN Muhabbeti Kalktı & Şifresiz "Operatör Kumanda Linki"**:
   - Kullanıcı zaten kendi hesabıyla giriş yaptığı için PIN girme zorunluluğu kaldırılmıştır.
   - **Skorcu / Hakem Linki (`/operate/:token`)**: Salondaki görevliye veya arkadaşınıza şifresiz verebileceğiniz özel bir link üretilir. Bu kişi telefonundan skor ve mola girebilir, geri alabilir (Undo); ancak takım isimlerini, kuralları değiştiremez veya maçı sıfırlayamaz!

4. **OBS Studio & vMix Canlı Yayın Katmanları (`/overlay`)**:
   - %100 Şeffaf (transparent) arka plan.
   - **Üst Bar (Top Bar)**: `https://alanadiniz.com/overlay/{id}?theme=topbar`
   - **Alt Bant (Lower Third)**: `https://alanadiniz.com/overlay/{id}?theme=bottom`
   - **Mini Skor (Köşe Bug)**: `https://alanadiniz.com/overlay/{id}?theme=mini`
   - **Salon & Seyirci Ekranı**: `https://alanadiniz.com/live/{id}`
   - Dinamik **"SET SAYISI"** ve **"MAÇ SAYISI"** uyarıları, animasyonlu servis topu ve 30 saniyelik mola geri sayımı.

---

## 🛠️ Coolify Üzerinde Kurulum (1 Dakikada Canlıya Alma)

### Yöntem 1: Coolify Git Repo Entegrasyonu (Önerilen)
1. Bu repoyu GitHub hesabınıza push edin.
2. Coolify panelinizde **+ New Resource** > **Public / Private Repository** seçin.
3. Repo URL'nizi bağlayın. Coolify `Dockerfile`'ı otomatik algılayacaktır.
4. **Environment Variables (.env)** bölümüne şunları ekleyin:
   ```env
   NODE_ENV=production
   PORT=3000
   DATA_DIR=/app/data
   APP_URL=https://skor.alanadiniz.com
   RESEND_API_KEY=re_xxxxxxxxxxxxxxxxxxxx
   RESEND_FROM=Voleybol Skorboard <onboarding@resend.dev>
   ```
   *(Not: `RESEND_API_KEY` girilmediğinde doğrulama kodları sunucu konsoluna yazdırılır; geliştirme ve test modunda sizi asla kitlemez).*
5. **Storage / Persistent Volume** bölümüne:
   - Volume Adı: `scoreboard_data`
   - Mount Path: `/app/data` (Kullanıcılar, maçlar, SQLite DB ve yüklenen logolar kalıcı diskte saklanır).
6. **Deploy** butonuna tıklayın!

### Yöntem 2: Coolify Docker Compose ile Kurulum
Coolify'da **+ New Resource** > **Docker Compose** seçip projedeki `docker-compose.yml` içeriğini yapıştırarak tek tıkla ayağa kaldırabilirsiniz.

---

## 💻 Yerel Olarak (Lokalde) Çalıştırma

```bash
# Projeyi başlatın
node src/server.js
```

Tarayıcınızda açın:
- 🏠 **Kullanıcı Paneli (Dashboard)**: `http://localhost:3000/`
- 🔑 **Giriş / Kayıt**: `http://localhost:3000/login`
- 🎛️ **Yönetici Kumandası**: `http://localhost:3000/control/fenerbahce`
- 📱 **Skorcu Kumandası**: `http://localhost:3000/operate/{operatorToken}`
- 📺 **OBS Canlı Katman**: `http://localhost:3000/overlay/fenerbahce?theme=topbar`
- 🏟️ **Salon Ekranı**: `http://localhost:3000/live/fenerbahce`

---

## 📺 OBS Studio Canlı Yayınına Ekleme Kılavuzu

1. OBS Studio'yu açın.
2. **Kaynaklar (Sources)** penceresinin altındaki **+ (Ekle)** butonuna basın.
3. **Tarayıcı (Browser)** kaynağını seçin.
4. Ayarlar:
   - **URL**: `https://alanadiniz.com/overlay/{boardId}?theme=topbar` (veya `theme=bottom`, `theme=mini`)
   - **Genişlik (Width)**: `1920`
   - **Yükseklik (Height)**: `1080`
   - **Özel CSS**: Boş bırakabilirsiniz.
5. **Tamam**'a basın. Skor tablonuz yayına şeffaf şekilde yerleşecektir!
