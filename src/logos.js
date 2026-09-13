const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

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
    isDefault: true,
    createdAt: 1700000000000,
    updatedAt: 1700000000000
  },
  {
    id: 'opponent-default',
    name: 'Rakip Takım (Genel)',
    url: '/assets/opponent.svg',
    filename: null,
    isDefault: true,
    createdAt: 1700000000001,
    updatedAt: 1700000000001
  },
  {
    id: 'volleyball-default',
    name: 'Voleybol Topu',
    url: '/assets/volleyball.svg',
    filename: null,
    isDefault: true,
    createdAt: 1700000000002,
    updatedAt: 1700000000002
  }
];

function readLogosFile() {
  try {
    if (!fs.existsSync(LOGOS_FILE)) {
      fs.writeFileSync(LOGOS_FILE, JSON.stringify(DEFAULT_LOGOS, null, 2), 'utf-8');
      return [...DEFAULT_LOGOS];
    }
    const raw = fs.readFileSync(LOGOS_FILE, 'utf-8');
    const list = JSON.parse(raw);
    if (!Array.isArray(list)) return [...DEFAULT_LOGOS];
    return list;
  } catch (err) {
    console.error('Error reading logos.json:', err);
    return [...DEFAULT_LOGOS];
  }
}

function writeLogosFile(list) {
  try {
    fs.writeFileSync(LOGOS_FILE, JSON.stringify(list, null, 2), 'utf-8');
    return true;
  } catch (err) {
    console.error('Error writing logos.json:', err);
    return false;
  }
}

function getAllLogos() {
  const list = readLogosFile();
  // Sort custom logos first (newest to oldest), then default logos
  return list.sort((a, b) => {
    if (a.isDefault && !b.isDefault) return 1;
    if (!a.isDefault && b.isDefault) return -1;
    return (b.createdAt || 0) - (a.createdAt || 0);
  });
}

function getLogo(id) {
  const list = readLogosFile();
  return list.find(item => item.id === id) || null;
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

  // Pattern: data:image/png;base64,iVBORw...
  const match = dataUri.match(/^data:([^;,]+)(?:;charset=[^;,]+)?;base64,(.+)$/i);
  if (match) {
    const mime = match[1].toLowerCase();
    const ext = MIME_EXT_MAP[mime] || 'png';
    const buffer = Buffer.from(match[2], 'base64');
    return { ext, buffer, mime };
  }

  // Raw SVG UTF-8 check: data:image/svg+xml;utf8,...
  const svgMatch = dataUri.match(/^data:image\/svg\+xml(?:;utf8)?,(.*)$/i);
  if (svgMatch) {
    const buffer = Buffer.from(decodeURIComponent(svgMatch[1]), 'utf-8');
    return { ext: 'svg', buffer, mime: 'image/svg+xml' };
  }

  // Fallback: try raw base64 string
  try {
    const buffer = Buffer.from(dataUri, 'base64');
    if (buffer.length > 0) {
      return { ext: 'png', buffer, mime: 'image/png' };
    }
  } catch (e) {}

  return null;
}

function saveLogo({ name, data, originalName }) {
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

  // Max 8MB
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

  const cleanName = name.trim().toLowerCase().replace(/[^a-z0-9]/gi, '_').substring(0, 30);
  const id = `logo_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
  const filename = `${cleanName}_${id}.${ext}`;
  const filePath = path.join(LOGOS_DIR, filename);

  fs.writeFileSync(filePath, parsed.buffer);

  const newLogo = {
    id,
    name: name.trim(),
    filename,
    url: `/uploads/logos/${filename}`,
    isDefault: false,
    sizeBytes: parsed.buffer.length,
    createdAt: Date.now(),
    updatedAt: Date.now()
  };

  const list = readLogosFile();
  list.unshift(newLogo);
  writeLogosFile(list);

  return newLogo;
}

function updateLogo(id, { name, data, originalName }) {
  const list = readLogosFile();
  const index = list.findIndex(item => item.id === id);
  if (index === -1) {
    throw new Error('Düzenlenecek logo bulunamadı.');
  }

  const logo = list[index];

  if (name && typeof name === 'string' && name.trim()) {
    logo.name = name.trim();
  }

  if (data) {
    const parsed = parseDataUri(data);
    if (!parsed || !parsed.buffer || parsed.buffer.length === 0) {
      throw new Error('Geçersiz görsel verisi.');
    }
    if (parsed.buffer.length > 8 * 1024 * 1024) {
      throw new Error('Dosya boyutu çok büyük (maks 8 MB).');
    }

    let ext = parsed.ext;
    if (originalName) {
      const origExt = path.extname(originalName).replace('.', '').toLowerCase();
      if (['png', 'jpg', 'jpeg', 'svg', 'webp'].includes(origExt)) {
        ext = origExt === 'jpeg' ? 'jpg' : origExt;
      }
    }

    // Delete old file if existed and not a default asset
    if (logo.filename) {
      const oldPath = path.join(LOGOS_DIR, logo.filename);
      if (fs.existsSync(oldPath)) {
        try { fs.unlinkSync(oldPath); } catch (e) {}
      }
    }

    const cleanName = logo.name.toLowerCase().replace(/[^a-z0-9]/gi, '_').substring(0, 30);
    const newFilename = `${cleanName}_${logo.id}_v${Date.now()}.${ext}`;
    const newFilePath = path.join(LOGOS_DIR, newFilename);

    fs.writeFileSync(newFilePath, parsed.buffer);
    logo.filename = newFilename;
    logo.url = `/uploads/logos/${newFilename}`;
    logo.sizeBytes = parsed.buffer.length;
    logo.isDefault = false;
  }

  logo.updatedAt = Date.now();
  list[index] = logo;
  writeLogosFile(list);

  return logo;
}

function deleteLogo(id) {
  const list = readLogosFile();
  const index = list.findIndex(item => item.id === id);
  if (index === -1) {
    return false;
  }

  const logo = list[index];

  // If there's an uploaded file, delete it
  if (logo.filename) {
    const filePath = path.join(LOGOS_DIR, logo.filename);
    if (fs.existsSync(filePath)) {
      try {
        fs.unlinkSync(filePath);
      } catch (err) {
        console.error(`Failed to delete logo file ${filePath}:`, err);
      }
    }
  }

  list.splice(index, 1);
  writeLogosFile(list);
  return true;
}

module.exports = {
  DATA_DIR,
  LOGOS_DIR,
  getAllLogos,
  getLogo,
  saveLogo,
  updateLogo,
  deleteLogo
};
