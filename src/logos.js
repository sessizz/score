const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const db = require('./db');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
const LOGOS_DIR = path.join(DATA_DIR, 'logos');
const LOGOS_FILE = path.join(DATA_DIR, 'logos.json');

// Ensure directories exist
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}
if (!fs.existsSync(LOGOS_DIR)) {
  fs.mkdirSync(LOGOS_DIR, { recursive: true });
}

const DEFAULT_LOGOS = [
  {
    id: 'fenerbahce-default',
    name: 'Fenerbahçe SK',
    url: '/assets/fenerbahce.svg',
    filename: null,
    isDefault: 1,
    createdAt: 1700000000000
  },
  {
    id: 'opponent-default',
    name: 'Rakip Takım (Genel)',
    url: '/assets/opponent.svg',
    filename: null,
    isDefault: 1,
    createdAt: 1700000000001
  },
  {
    id: 'volleyball-default',
    name: 'Voleybol Topu',
    url: '/assets/volleyball.svg',
    filename: null,
    isDefault: 1,
    createdAt: 1700000000002
  }
];

// Initialize logos in DB
function initLogosInDb() {
  // Ensure default system logos exist in DB
  for (const item of DEFAULT_LOGOS) {
    const existing = db.getLogoById(item.id);
    if (!existing) {
      db.saveLogoToDb({
        id: item.id,
        userId: null,
        name: item.name,
        url: item.url,
        filename: item.filename,
        isDefault: 1
      });
    }
  }

  // Check if legacy logos.json exists and import
  if (fs.existsSync(LOGOS_FILE)) {
    try {
      const raw = fs.readFileSync(LOGOS_FILE, 'utf-8');
      const list = JSON.parse(raw);
      if (Array.isArray(list)) {
        for (const item of list) {
          if (!item.isDefault && !db.getLogoById(item.id)) {
            db.saveLogoToDb({
              id: item.id,
              userId: null, // will be assigned to first user
              name: item.name,
              url: item.url,
              filename: item.filename,
              isDefault: 0
            });
          }
        }
      }
    } catch (e) {
      console.error('Error migrating legacy logos:', e);
    }
  }
}

// Run init
initLogosInDb();

function getAllLogos(userId = null) {
  return db.getLogosForUser(userId);
}

function getLogo(id) {
  return db.getLogoById(id);
}

const MIME_EXT_MAP = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/svg+xml': 'svg',
  'image/webp': 'webp',
  'image/x-icon': 'ico',
  'image/vnd.microsoft.icon': 'ico'
};

function parseDataUri(dataUri) {
  if (typeof dataUri !== 'string') return null;

  const match = dataUri.match(/^data:([^;,]+)(?:;charset=[^;,]+)?;base64,(.+)$/i);
  if (match) {
    const mime = match[1].toLowerCase();
    const ext = MIME_EXT_MAP[mime] || 'png';
    const buffer = Buffer.from(match[2], 'base64');
    return { ext, buffer, mime };
  }

  const svgMatch = dataUri.match(/^data:image\/svg\+xml(?:;utf8)?,(.*)$/i);
  if (svgMatch) {
    const buffer = Buffer.from(decodeURIComponent(svgMatch[1]), 'utf-8');
    return { ext: 'svg', buffer, mime: 'image/svg+xml' };
  }

  try {
    const buffer = Buffer.from(dataUri, 'base64');
    if (buffer.length > 0) {
      return { ext: 'png', buffer, mime: 'image/png' };
    }
  } catch (e) {}

  return null;
}

function saveLogo({ name, data, originalName, userId = null }) {
  if (!name || typeof name !== 'string' || !name.trim()) {
    throw new Error('Logo ismi zorunludur.');
  }
  if (!data) {
    throw new Error('Logo görsel verisi eksik.');
  }

  const parsed = parseDataUri(data);
  if (!parsed || !parsed.buffer || parsed.buffer.length === 0) {
    throw new Error('Geçersiz görsel formatı. PNG, JPG, SVG veya WebP yükleyin.');
  }

  if (parsed.buffer.length > 8 * 1024 * 1024) {
    throw new Error('Dosya boyutu çok büyük. Maksimum 8 MB yükleyebilirsiniz.');
  }

  let ext = parsed.ext;
  if (originalName) {
    const origExt = path.extname(originalName).replace('.', '').toLowerCase();
    if (['png', 'jpg', 'jpeg', 'svg', 'webp'].includes(origExt)) {
      ext = origExt === 'jpeg' ? 'jpg' : origExt;
    }
  }

  const id = 'logo_' + crypto.randomBytes(8).toString('hex');
  const filename = `${id}.${ext}`;
  const filePath = path.join(LOGOS_DIR, filename);

  fs.writeFileSync(filePath, parsed.buffer);

  const url = `/uploads/logos/${filename}`;
  const cleanName = name.trim().slice(0, 80);

  db.saveLogoToDb({
    id,
    userId,
    name: cleanName,
    url,
    filename,
    isDefault: 0
  });

  return { id, name: cleanName, url, filename, userId };
}

function updateLogo(id, { name, data, originalName }, userId = null) {
  const existing = db.getLogoById(id);
  if (!existing) {
    throw new Error('Logo bulunamadı.');
  }
  if (existing.is_default) {
    throw new Error('Varsayılan sistem logoları değiştirilemez.');
  }
  if (userId && existing.user_id && existing.user_id !== userId) {
    throw new Error('Bu logoyu düzenleme yetkiniz yok.');
  }

  let url = existing.url;
  let filename = existing.filename;

  if (data) {
    const parsed = parseDataUri(data);
    if (!parsed || !parsed.buffer || parsed.buffer.length === 0) {
      throw new Error('Geçersiz görsel formatı.');
    }
    let ext = parsed.ext;
    if (originalName) {
      const origExt = path.extname(originalName).replace('.', '').toLowerCase();
      if (['png', 'jpg', 'jpeg', 'svg', 'webp'].includes(origExt)) {
        ext = origExt === 'jpeg' ? 'jpg' : origExt;
      }
    }

    if (existing.filename) {
      const oldPath = path.join(LOGOS_DIR, existing.filename);
      if (fs.existsSync(oldPath)) {
        try { fs.unlinkSync(oldPath); } catch (e) {}
      }
    }

    filename = `${id}_${Date.now()}.${ext}`;
    const filePath = path.join(LOGOS_DIR, filename);
    fs.writeFileSync(filePath, parsed.buffer);
    url = `/uploads/logos/${filename}`;
  }

  const cleanName = (name && name.trim()) ? name.trim().slice(0, 80) : existing.name;

  db.updateLogoInDb(id, userId, { name: cleanName, url });

  return db.getLogoById(id);
}

function deleteLogo(id, userId = null) {
  const existing = db.getLogoById(id);
  if (!existing) return false;
  if (existing.is_default) {
    throw new Error('Varsayılan sistem logoları silinemez.');
  }
  if (userId && existing.user_id && existing.user_id !== userId) {
    throw new Error('Bu logoyu silme yetkiniz yok.');
  }

  if (existing.filename) {
    const filePath = path.join(LOGOS_DIR, existing.filename);
    if (fs.existsSync(filePath)) {
      try { fs.unlinkSync(filePath); } catch (e) {}
    }
  }

  db.deleteLogoFromDb(id, userId || existing.user_id);
  return true;
}

module.exports = {
  LOGOS_DIR,
  DEFAULT_LOGOS,
  getAllLogos,
  getLogo,
  saveLogo,
  updateLogo,
  deleteLogo
};
