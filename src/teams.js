const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const db = require('./db');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
const LOGOS_DIR = path.join(DATA_DIR, 'logos');

// Ensure directories exist
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}
if (!fs.existsSync(LOGOS_DIR)) {
  fs.mkdirSync(LOGOS_DIR, { recursive: true });
}

const DEFAULT_TEAMS = [
  {
    id: 'fenerbahce-default',
    name: 'FENERBAHÇE MEDICANA',
    shortName: 'FB',
    logo: '/assets/fenerbahce.svg',
    color: '#ffed00',
    color2: '#002d72',
    textColor: '#ffffff',
    filename: null,
    isDefault: 1,
    createdAt: 1700000000000
  },
  {
    id: 'opponent-default',
    name: 'RAKİP TAKIM',
    shortName: 'RAK',
    logo: '/assets/opponent.svg',
    color: '#d61c35',
    color2: '#ffed00',
    textColor: '#ffffff',
    filename: null,
    isDefault: 1,
    createdAt: 1700000000001
  },
  {
    id: 'volleyball-default',
    name: 'GENEL VOLEYBOL',
    shortName: 'VOL',
    logo: '/assets/volleyball.svg',
    color: '#1565c0',
    color2: '#ffed00',
    textColor: '#ffffff',
    filename: null,
    isDefault: 1,
    createdAt: 1700000000002
  }
];

// Initialize default teams in DB only if the table is completely empty
function initTeamsInDb() {
  try {
    const countRow = db.db.prepare("SELECT COUNT(*) as cnt FROM logos").get();
    if (countRow && countRow.cnt === 0) {
      for (const item of DEFAULT_TEAMS) {
        db.saveTeamToDb({
          id: item.id,
          userId: null,
          name: item.name,
          shortName: item.shortName,
          logo: item.logo,
          color: item.color,
          color2: item.color2,
          textColor: item.textColor,
          filename: item.filename,
          isDefault: 1
        });
      }
    }
  } catch (e) {}
}

// Run init
initTeamsInDb();

function getAllTeams(userId = null) {
  return db.getTeamsForUser(userId);
}

function getTeam(id) {
  return db.getTeamById(id);
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

function saveTeam({
  name,
  shortName,
  logo = '',
  color = '#ffed00',
  color2 = '#002d72',
  textColor = '#ffffff',
  data = null,
  originalName = null,
  userId = null
}) {
  if (!name || typeof name !== 'string' || !name.trim()) {
    throw new Error('Takım ismi zorunludur.');
  }

  const cleanName = name.trim().slice(0, 80);
  let cleanShort = (shortName || '').trim().slice(0, 10).toUpperCase();
  if (!cleanShort) {
    cleanShort = cleanName.replace(/[^a-zA-Z0-9çÇğĞıİöÖşŞüÜ]/g, '').slice(0, 3).toUpperCase();
  }

  let finalLogoUrl = logo || '';
  let filename = null;

  // If a file was uploaded as base64
  if (data) {
    const parsed = parseDataUri(data);
    if (!parsed || !parsed.buffer || parsed.buffer.length === 0) {
      throw new Error('Geçersiz görsel formatı. PNG, JPG, SVG veya WebP yükleyin.');
    }
    if (parsed.buffer.length > 8 * 1024 * 1024) {
      throw new Error('Görsel boyutu çok büyük. Maksimum 8 MB yükleyebilirsiniz.');
    }

    let ext = parsed.ext;
    if (originalName) {
      const origExt = path.extname(originalName).replace('.', '').toLowerCase();
      if (['png', 'jpg', 'jpeg', 'svg', 'webp'].includes(origExt)) {
        ext = origExt === 'jpeg' ? 'jpg' : origExt;
      }
    }

    const fileId = 'team_' + crypto.randomBytes(8).toString('hex');
    filename = `${fileId}.${ext}`;
    const filePath = path.join(LOGOS_DIR, filename);
    fs.writeFileSync(filePath, parsed.buffer);
    finalLogoUrl = `/uploads/logos/${filename}`;
  }

  const id = 'team_' + crypto.randomBytes(8).toString('hex');

  db.saveTeamToDb({
    id,
    userId,
    name: cleanName,
    shortName: cleanShort,
    logo: finalLogoUrl,
    color: color || '#ffed00',
    color2: color2 || '#002d72',
    textColor: textColor || '#ffffff',
    filename,
    isDefault: 0
  });

  return db.getTeamById(id);
}

function updateTeam(id, {
  name,
  shortName,
  logo,
  color,
  color2,
  textColor,
  data,
  originalName
}, userId = null) {
  const existing = db.getTeamById(id);
  if (!existing) {
    throw new Error('Takım bulunamadı.');
  }

  let finalLogoUrl = logo !== undefined ? logo : existing.logo;
  let filename = existing.filename;

  // New file upload
  if (data) {
    const parsed = parseDataUri(data);
    if (!parsed || !parsed.buffer || parsed.buffer.length === 0) {
      throw new Error('Geçersiz görsel formatı.');
    }
    if (parsed.buffer.length > 8 * 1024 * 1024) {
      throw new Error('Görsel boyutu çok büyük. Maksimum 8 MB yükleyebilirsiniz.');
    }

    let ext = parsed.ext;
    if (originalName) {
      const origExt = path.extname(originalName).replace('.', '').toLowerCase();
      if (['png', 'jpg', 'jpeg', 'svg', 'webp'].includes(origExt)) {
        ext = origExt === 'jpeg' ? 'jpg' : origExt;
      }
    }

    // Delete previous file if user uploaded one
    if (existing.filename) {
      const oldPath = path.join(LOGOS_DIR, existing.filename);
      if (fs.existsSync(oldPath)) {
        try { fs.unlinkSync(oldPath); } catch (e) {}
      }
    }

    filename = `${id}_${Date.now()}.${ext}`;
    const filePath = path.join(LOGOS_DIR, filename);
    fs.writeFileSync(filePath, parsed.buffer);
    finalLogoUrl = `/uploads/logos/${filename}`;
  } else if (logo === '') {
    // Explicitly removed logo
    finalLogoUrl = '';
    if (existing.filename) {
      const oldPath = path.join(LOGOS_DIR, existing.filename);
      if (fs.existsSync(oldPath)) {
        try { fs.unlinkSync(oldPath); } catch (e) {}
      }
      filename = null;
    }
  }

  const cleanName = (name && name.trim()) ? name.trim().slice(0, 80) : existing.name;
  let cleanShort = shortName !== undefined ? shortName.trim().slice(0, 10).toUpperCase() : existing.shortName;
  if (!cleanShort) {
    cleanShort = cleanName.replace(/[^a-zA-Z0-9çÇğĞıİöÖşŞüÜ]/g, '').slice(0, 3).toUpperCase();
  }

  db.updateTeamInDb(id, userId, {
    name: cleanName,
    shortName: cleanShort,
    logo: finalLogoUrl,
    color: color || existing.color,
    color2: color2 || existing.color2,
    textColor: textColor || existing.textColor,
    filename
  });

  return db.getTeamById(id);
}

function deleteTeam(id, userId = null) {
  const existing = db.getTeamById(id);
  if (!existing) return false;

  // If there's an uploaded file on disk, delete it
  if (existing.filename) {
    const filePath = path.join(LOGOS_DIR, existing.filename);
    if (fs.existsSync(filePath)) {
      try { fs.unlinkSync(filePath); } catch (e) {}
    }
  }

  // System logos/teams CAN BE DELETED now!
  db.deleteTeamFromDb(id, userId);
  return true;
}

module.exports = {
  LOGOS_DIR,
  DEFAULT_TEAMS,
  getAllTeams,
  getTeam,
  saveTeam,
  updateTeam,
  deleteTeam,
  // Backwards compatibility aliases
  getAllLogos: getAllTeams,
  getLogo: getTeam,
  saveLogo: saveTeam,
  updateLogo: updateTeam,
  deleteLogo: deleteTeam
};
