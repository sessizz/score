# Sayı Geçmişi (Point History) Overlay — Tasarım

## Amaç
Setteki her sayıyı sırasıyla kaydet. Tek tuşla overlay 5 sn boyunca scoreboard yerine "sayı geçmişi şeridi" göstersin, sonra normale dönsün. Loglar kontrol panelinden görülebilsin. Yanlış girilen sayılar (A'ya ver, geri al, B'ye ver) log'da görünmesin.

## Veri
- `board.pointLog = [{ set, team: 'teamA'|'teamB', t }]` (state_json içinde saklanır). Skor kaydedilmez, sayılarak türetilir.
- `board.historyUntil` (ms, sunucu saati): bu zamana kadar overlay geçmiş şeridini gösterir.
- Eski board'larda alanlar yoksa `[]` / `0` kabul edilir.

## Kayıt kuralları
`reconcilePointLog(board)`: mevcut setin log'undaki takım başına kayıt sayısını `points` ile eşitler (fazlayı sondan siler, eksiği sona ekler). `point_a/b`, `sub_point_a/b`, `set_points` öncesinde ve sonrasında çağrılır.
- `undo`: tüm board snapshot'ı geri gelir, log da geri gelir (`historyUntil` korunur).
- `reset_current_set`: o setin kayıtları silinir. `reset_match`: log temizlenir. `end_set`: log korunur.

## Overlay
- Yeni eylem `show_history` (operatör dahil, undo stack'e girmez): `historyUntil = now + 5000`.
- Overlay `historyUntil` süresince `.dc-grid` yerine şeridi gösterir; süre bitince (250 ms ticker) geri döner.
- Şerit: 2 satır (sol/sağ takım, `courtSwapped`'a uyar). Lacivert isim kutusu + logo, sayı kutuları takım `color`ı, boş kutular arka plana yakın sönük, sağda beyaz skor kutusu, son sayı vurgulu. Üst kapsül: `N. SET • SAYI GEÇMİŞİ • süre`.
- En fazla 30 sütun (son 30 sayı penceresi). Numaralar gerçek skoru gösterir. Minimum 26 sütun.

## Paneller
- Kontrol paneli: "Sayı Geçmişi" butonu → modal (set set, sıralı liste: saat, takım, skor) + "Overlay'de göster (5 sn)".
- Operate: "Geçmişi Göster" butonu.

## Test
`store.js` senaryoları Node script ile (undo, sub_point, set_points, reset), overlay tarayıcıda gözle.
