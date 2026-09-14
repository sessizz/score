const { DatabaseSync } = require('node:sqlite');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
const DB_PATH = path.join(DATA_DIR, 'scoreboard.db');

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

const db = new DatabaseSync(DB_PATH);

// Enable WAL mode for high performance concurrent reads and writes
try {
  db.exec('PRAGMA journal_mode = WAL;');
  db.exec('PRAGMA foreign_keys = ON;');
} catch (e) {
  // Ignore if pragma fails
}

// Initialize tables
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    email TEXT UNIQUE NOT NULL COLLATE NOCASE,
    password_hash TEXT NOT NULL,
    salt TEXT NOT NULL,
    is_verified INTEGER DEFAULT 0,
    verification_code TEXT,
    verification_expires_at INTEGER,
    reset_token TEXT,
    reset_expires_at INTEGER,
    created_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS sessions (
    token TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    expires_at INTEGER NOT NULL,
    created_at INTEGER NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS boards (
    id TEXT PRIMARY KEY,
    user_id TEXT,
    name TEXT NOT NULL,
    operator_token TEXT NOT NULL,
    state_json TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_boards_user ON boards(user_id);
  CREATE INDEX IF NOT EXISTS idx_boards_operator ON boards(operator_token);

  CREATE TABLE IF NOT EXISTS logos (
    id TEXT PRIMARY KEY,
    user_id TEXT,
    name TEXT NOT NULL,
    url TEXT NOT NULL,
    filename TEXT,
    is_default INTEGER DEFAULT 0,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_logos_user ON logos(user_id);
`);

// Ensure all existing boards have an operator_token
try {
  const missingTokens = db.prepare("SELECT id FROM boards WHERE operator_token IS NULL OR operator_token = ''").all();
  for (const row of missingTokens) {
    const code = crypto.randomBytes(3).toString('hex').slice(0, 4);
    db.prepare('UPDATE boards SET operator_token = ? WHERE id = ?').run(code, row.id);
  }
} catch (e) {}

// --- Users DB Functions ---
function createUser({ id, email, passwordHash, salt, verificationCode, verificationExpiresAt }) {
  const stmt = db.prepare(`
    INSERT INTO users (id, email, password_hash, salt, is_verified, verification_code, verification_expires_at, created_at)
    VALUES (?, ?, ?, ?, 0, ?, ?, ?)
  `);
  stmt.run(id, email.toLowerCase().trim(), passwordHash, salt, verificationCode, verificationExpiresAt, Date.now());
  return getUserById(id);
}

function getUserById(id) {
  const stmt = db.prepare('SELECT * FROM users WHERE id = ?');
  return stmt.get(id) || null;
}

function getUserByEmail(email) {
  const stmt = db.prepare('SELECT * FROM users WHERE email = ? COLLATE NOCASE');
  return stmt.get(email.toLowerCase().trim()) || null;
}

function getUserCount() {
  const stmt = db.prepare('SELECT COUNT(*) as count FROM users');
  const res = stmt.get();
  return res ? res.count : 0;
}

function verifyUser(id) {
  const stmt = db.prepare(`
    UPDATE users
    SET is_verified = 1, verification_code = NULL, verification_expires_at = NULL
    WHERE id = ?
  `);
  stmt.run(id);
  return getUserById(id);
}

function updateVerificationCode(id, code, expiresAt) {
  const stmt = db.prepare(`
    UPDATE users
    SET verification_code = ?, verification_expires_at = ?
    WHERE id = ?
  `);
  stmt.run(code, expiresAt, id);
}

// --- Sessions DB Functions ---
function createSession(userId, daysValid = 30) {
  const token = crypto.randomBytes(32).toString('hex');
  const expiresAt = Date.now() + (daysValid * 24 * 60 * 60 * 1000);
  const stmt = db.prepare(`
    INSERT INTO sessions (token, user_id, expires_at, created_at)
    VALUES (?, ?, ?, ?)
  `);
  stmt.run(token, userId, expiresAt, Date.now());
  return { token, expiresAt };
}

function getSessionUser(token) {
  if (!token) return null;
  const stmt = db.prepare(`
    SELECT u.id, u.email, u.is_verified, u.created_at
    FROM sessions s
    JOIN users u ON s.user_id = u.id
    WHERE s.token = ? AND s.expires_at > ?
  `);
  return stmt.get(token, Date.now()) || null;
}

function deleteSession(token) {
  const stmt = db.prepare('DELETE FROM sessions WHERE token = ?');
  stmt.run(token);
}

function cleanExpiredSessions() {
  const stmt = db.prepare('DELETE FROM sessions WHERE expires_at <= ?');
  stmt.run(Date.now());
}

// --- Boards DB Functions ---
function saveBoardToDb(board) {
  const existing = db.prepare('SELECT id, operator_token, user_id FROM boards WHERE id = ?').get(board.id);
  const now = Date.now();
  if (!board.operatorToken) {
    board.operatorToken = (existing && existing.operator_token) ? existing.operator_token : crypto.randomBytes(3).toString('hex').slice(0, 4);
  }
  const stateJson = JSON.stringify(board);
  const name = (board.title || board.id);

  if (existing) {
    const stmt = db.prepare(`
      UPDATE boards
      SET name = ?, user_id = coalesce(?, user_id), operator_token = ?, state_json = ?, updated_at = ?
      WHERE id = ?
    `);
    stmt.run(name, board.userId || null, board.operatorToken, stateJson, now, board.id);
  } else {
    const opToken = board.operatorToken || crypto.randomBytes(3).toString('hex').slice(0, 4);
    board.operatorToken = opToken;
    const stmt = db.prepare(`
      INSERT INTO boards (id, user_id, name, operator_token, state_json, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    stmt.run(board.id, board.userId || null, name, opToken, JSON.stringify(board), now, now);
  }
}

function getBoardFromDb(id) {
  if (!id) return null;
  const clean = String(id).trim().toLowerCase();
  const stmt = db.prepare('SELECT * FROM boards WHERE LOWER(id) = ? OR LOWER(operator_token) = ?');
  const row = stmt.get(clean, clean);
  if (!row) return null;
  try {
    const board = JSON.parse(row.state_json);
    board.id = row.id;
    board.userId = row.user_id;
    board.operatorToken = row.operator_token;
    return board;
  } catch (e) {
    return null;
  }
}

function getBoardByOperatorToken(token) {
  if (!token) return null;
  const clean = String(token).trim().toLowerCase();
  const stmt = db.prepare('SELECT * FROM boards WHERE LOWER(operator_token) = ? OR LOWER(id) = ?');
  const row = stmt.get(clean, clean);
  if (!row) return null;
  try {
    const board = JSON.parse(row.state_json);
    board.id = row.id;
    board.userId = row.user_id;
    board.operatorToken = row.operator_token;
    return board;
  } catch (e) {
    return null;
  }
}

function getBoardsByUser(userId) {
  const stmt = db.prepare('SELECT id, user_id, name, operator_token, state_json, updated_at FROM boards WHERE user_id = ? ORDER BY updated_at DESC');
  const rows = stmt.all(userId);
  return rows.map(r => {
    try {
      const parsed = JSON.parse(r.state_json);
      return {
        id: r.id,
        name: r.name,
        operatorToken: r.operator_token,
        title: parsed.title,
        subtitle: parsed.subtitle,
        teamA: parsed.teamA,
        teamB: parsed.teamB,
        currentSet: parsed.currentSet,
        status: parsed.status,
        updatedAt: r.updated_at
      };
    } catch (e) {
      return { id: r.id, name: r.name, operatorToken: r.operator_token };
    }
  });
}

function deleteBoardFromDb(id, userId) {
  const stmt = db.prepare('DELETE FROM boards WHERE id = ? AND user_id = ?');
  stmt.run(id, userId);
}

function getAllBoardsFromDb() {
  const stmt = db.prepare('SELECT * FROM boards');
  const rows = stmt.all();
  return rows.map(r => {
    try {
      const b = JSON.parse(r.state_json);
      b.id = r.id;
      b.userId = r.user_id;
      b.operatorToken = r.operator_token;
      return b;
    } catch (e) {
      return null;
    }
  }).filter(Boolean);
}

// Assign legacy / unclaimed boards & custom logos to the first registered user
function assignLegacyDataToUser(userId) {
  // 1. Assign boards with user_id IS NULL to this user
  const stmtBoards = db.prepare('UPDATE boards SET user_id = ? WHERE user_id IS NULL');
  stmtBoards.run(userId);

  // 2. Assign custom logos with user_id IS NULL and is_default = 0 to this user
  const stmtLogos = db.prepare('UPDATE logos SET user_id = ? WHERE user_id IS NULL AND is_default = 0');
  stmtLogos.run(userId);
}

// --- Logos DB Functions ---
function getLogosForUser(userId) {
  // Returns user's own logos + default system logos
  const stmt = db.prepare(`
    SELECT * FROM logos 
    WHERE user_id = ? OR is_default = 1
    ORDER BY is_default ASC, created_at DESC
  `);
  return stmt.all(userId || '');
}

function saveLogoToDb({ id, userId, name, url, filename, isDefault = 0 }) {
  const now = Date.now();
  const stmt = db.prepare(`
    INSERT INTO logos (id, user_id, name, url, filename, is_default, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);
  stmt.run(id, userId || null, name, url, filename || null, isDefault ? 1 : 0, now, now);
}

function updateLogoInDb(id, userId, { name, url }) {
  const now = Date.now();
  const stmt = db.prepare(`
    UPDATE logos
    SET name = ?, url = ?, updated_at = ?
    WHERE id = ? AND (user_id = ? OR user_id IS NULL)
  `);
  stmt.run(name, url, now, id, userId || '');
}

function deleteLogoFromDb(id, userId) {
  const stmt = db.prepare('DELETE FROM logos WHERE id = ? AND user_id = ? AND is_default = 0');
  stmt.run(id, userId);
}

function getLogoById(id) {
  const stmt = db.prepare('SELECT * FROM logos WHERE id = ?');
  return stmt.get(id) || null;
}

module.exports = {
  db,
  createUser,
  getUserById,
  getUserByEmail,
  getUserCount,
  verifyUser,
  updateVerificationCode,
  createSession,
  getSessionUser,
  deleteSession,
  cleanExpiredSessions,
  saveBoardToDb,
  getBoardFromDb,
  getBoardByOperatorToken,
  getBoardsByUser,
  deleteBoardFromDb,
  getAllBoardsFromDb,
  assignLegacyDataToUser,
  getLogosForUser,
  saveLogoToDb,
  updateLogoInDb,
  deleteLogoFromDb,
  getLogoById
};
