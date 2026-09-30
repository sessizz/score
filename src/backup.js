// Yedek: kullanıcının verisini (veya yöneticiye tüm veritabanını) .zip olarak hazırlar.
// Dış bağımlılık yok: küçük bir ZIP yazıcı (zlib ile sıkıştırma) içerir.
const fs = require('fs');
const os = require('os');
const path = require('path');
const zlib = require('zlib');
const db = require('./db');
const teams = require('./teams');

// ---- Minimal ZIP yazıcı ----
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function dosDateTime(d) {
  const time = (d.getHours() << 11) | (d.getMinutes() << 5) | Math.floor(d.getSeconds() / 2);
  const date = ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
  return { time, date };
}

const STORED_EXT = /\.(png|jpe?g|webp|zip|gz)$/i;

// entries: [{ name, data: Buffer }]
function createZip(entries, when = new Date()) {
  const { time, date } = dosDateTime(when);
  const locals = [];
  const centrals = [];
  let offset = 0;

  for (const e of entries) {
    const nameBuf = Buffer.from(e.name, 'utf8');
    const raw = e.data;
    const crc = crc32(raw);
    let method = 8;
    let body = STORED_EXT.test(e.name) ? null : zlib.deflateRawSync(raw, { level: 6 });
    if (!body || body.length >= raw.length) {
      method = 0;
      body = raw;
    }

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x0800, 6); // UTF-8 dosya adı
    local.writeUInt16LE(method, 8);
    local.writeUInt16LE(time, 10);
    local.writeUInt16LE(date, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(body.length, 18);
    local.writeUInt32LE(raw.length, 22);
    local.writeUInt16LE(nameBuf.length, 26);
    local.writeUInt16LE(0, 28);
    locals.push(local, nameBuf, body);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0x0800, 8);
    central.writeUInt16LE(method, 10);
    central.writeUInt16LE(time, 12);
    central.writeUInt16LE(date, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(body.length, 20);
    central.writeUInt32LE(raw.length, 24);
    central.writeUInt16LE(nameBuf.length, 28);
    central.writeUInt32LE(offset, 42);
    centrals.push(central, nameBuf);

    offset += local.length + nameBuf.length + body.length;
  }

  const centralBuf = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralBuf.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, centralBuf, end]);
}

// ---- Yedek içeriği ----
function isAdmin(user) {
  const list = String(process.env.ADMIN_EMAILS || '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  return Boolean(user && user.email && list.includes(String(user.email).toLowerCase()));
}

function readLogoFile(filename) {
  if (!filename) return null;
  const safe = path.basename(filename);
  const p = path.join(teams.LOGOS_DIR, safe);
  try {
    return fs.existsSync(p) ? { name: safe, data: fs.readFileSync(p) } : null;
  } catch (e) {
    return null;
  }
}

function collectUserData(user) {
  const boards = db.getBoardsByUser(user.id)
    .map((b) => db.getBoardFromDb(b.id))
    .filter(Boolean);
  const userTeams = db.getTeamsForUser(user.id).filter((t) => t.userId === user.id && !t.isDefault);
  return { boards, userTeams };
}

function snapshotDatabase() {
  const tmp = path.join(os.tmpdir(), `skorboard-${process.pid}-${Date.now()}.db`);
  try {
    db.db.exec(`VACUUM INTO '${tmp.replace(/'/g, "''")}'`);
    return fs.readFileSync(tmp);
  } finally {
    try { fs.unlinkSync(tmp); } catch (e) {}
  }
}

function summary(user) {
  const admin = isAdmin(user);
  const { boards, userTeams } = collectUserData(user);
  let logoFiles = 0;
  if (admin) {
    try { logoFiles = fs.readdirSync(teams.LOGOS_DIR).length; } catch (e) {}
  } else {
    logoFiles = userTeams.filter((t) => readLogoFile(t.filename)).length;
  }
  return { mode: admin ? 'admin' : 'user', boards: boards.length, teams: userTeams.length, logoFiles };
}

function createBackup(user) {
  const admin = isAdmin(user);
  const now = new Date();
  const stamp = now.toISOString().slice(0, 10);
  const { boards, userTeams } = collectUserData(user);
  const entries = [];

  const meta = {
    exportedAt: now.toISOString(),
    app: 'voleybol-scoreboard',
    mode: admin ? 'admin-tam-yedek' : 'kullanici-yedegi',
    user: { id: user.id, email: user.email },
    counts: { boards: boards.length, teams: userTeams.length }
  };

  entries.push({
    name: 'yedek.json',
    data: Buffer.from(JSON.stringify({ ...meta, boards, teams: userTeams }, null, 2), 'utf8')
  });

  if (admin) {
    entries.push({ name: 'scoreboard.db', data: snapshotDatabase() });
    let files = [];
    try { files = fs.readdirSync(teams.LOGOS_DIR); } catch (e) {}
    for (const f of files) {
      const item = readLogoFile(f);
      if (item) entries.push({ name: `logos/${item.name}`, data: item.data });
    }
  } else {
    const seen = new Set();
    for (const t of userTeams) {
      const item = readLogoFile(t.filename);
      if (item && !seen.has(item.name)) {
        seen.add(item.name);
        entries.push({ name: `logos/${item.name}`, data: item.data });
      }
    }
  }

  const readme = admin
    ? [
        'VOLEYBOL SKORBOARD - TAM YEDEK',
        `Tarih: ${now.toISOString()}`,
        '',
        'scoreboard.db : Tum veritabani (kullanicilar, maclar, takimlar). Gizli bilgiler (sifre ozetleri) icerir, guvenli saklayin.',
        'logos/        : Yuklenen takim logolari.',
        'yedek.json    : Sizin hesabiniza ait maclar ve takimlar (okunabilir kopya).',
        '',
        'Geri yukleme: uygulamayi durdurun, scoreboard.db dosyasini /app/data/scoreboard.db olarak, logos klasorunu /app/data/logos olarak koyun.'
      ]
    : [
        'VOLEYBOL SKORBOARD - KULLANICI YEDEGI',
        `Tarih: ${now.toISOString()}`,
        '',
        'yedek.json : Maclarinizin tamami (skorlar, set gecmisi, sayi gecmisi) ve takimlariniz.',
        'logos/     : Takimlariniza ait logo dosyalari.'
      ];
  entries.push({ name: 'OKU-BENI.txt', data: Buffer.from(readme.join('\r\n') + '\r\n', 'utf8') });

  return {
    buffer: createZip(entries, now),
    filename: `skorboard-yedek-${stamp}.zip`,
    mode: meta.mode
  };
}

module.exports = { createBackup, summary, createZip, isAdmin };
