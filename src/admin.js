const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const db = require('./db');
const auth = require('./auth');
const store = require('./store');
const teams = require('./teams');

function toPublicUser(row) {
  return {
    id: row.id,
    email: row.email,
    isVerified: Boolean(row.is_verified),
    isDisabled: Boolean(row.is_disabled),
    isAdmin: auth.isAdmin(row),
    createdAt: row.created_at,
    lastLoginAt: row.last_login_at || null,
    boardCount: row.board_count || 0,
    teamCount: row.team_count || 0,
    sessionCount: row.session_count || 0
  };
}

function listUsers() {
  return db.listUsersWithStats().map(toPublicUser);
}

function getUserDetail(id) {
  const user = db.getUserById(id);
  if (!user) throw new Error('Kullanıcı bulunamadı.');
  const boards = db.getBoardsByUser(id).map((b) => ({
    id: b.id,
    title: b.title || b.name,
    teamA: b.teamA ? b.teamA.name : '',
    teamB: b.teamB ? b.teamB.name : '',
    updatedAt: b.updatedAt
  }));
  const userTeams = db.getTeamsForUser(id)
    .filter((t) => t.userId === id && !t.isDefault)
    .map((t) => ({ id: t.id, name: t.name, shortName: t.shortName, logo: t.logo }));
  return { boards, teams: userTeams };
}

// Admins cannot be suspended or deleted from the panel, so nobody can lock themselves out
function requireTarget(id, actor, { allowAdmin = false } = {}) {
  const target = db.getUserById(id);
  if (!target) throw new Error('Kullanıcı bulunamadı.');
  if (!allowAdmin && (target.id === actor.id || auth.isAdmin(target))) {
    throw new Error('Yönetici hesapları üzerinde bu işlem yapılamaz.');
  }
  return target;
}

function updateUser(id, changes, actor) {
  if (changes.isDisabled !== undefined) {
    requireTarget(id, actor);
    db.setUserDisabled(id, Boolean(changes.isDisabled));
  }
  if (changes.isVerified !== undefined) {
    requireTarget(id, actor, { allowAdmin: true });
    db.setUserVerified(id, Boolean(changes.isVerified));
  }
  if (changes.password !== undefined) {
    requireTarget(id, actor, { allowAdmin: true });
    const password = String(changes.password);
    if (password.length < 6) throw new Error('Şifre en az 6 karakter olmalıdır.');
    const salt = crypto.randomBytes(16).toString('hex');
    db.setUserPassword(id, auth.hashPassword(password, salt), salt);
    if (id !== actor.id) db.deleteUserSessions(id);
  }
  const row = db.listUsersWithStats().find((u) => u.id === id);
  return row ? toPublicUser(row) : null;
}

function logoutUser(id, actor) {
  requireTarget(id, actor, { allowAdmin: true });
  db.deleteUserSessions(id);
}

function deleteUser(id, actor) {
  const target = requireTarget(id, actor);

  // Uploaded logo files are removed from disk before their rows go away
  const ownTeams = db.getTeamsForUser(id).filter((t) => t.userId === id && !t.isDefault);
  for (const t of ownTeams) {
    if (!t.filename) continue;
    const filePath = path.join(teams.LOGOS_DIR, path.basename(t.filename));
    try { if (fs.existsSync(filePath)) fs.unlinkSync(filePath); } catch (e) {}
  }

  db.deleteUserCascade(id);
  store.forgetUserBoards(id);
  return { email: target.email };
}

module.exports = { listUsers, getUserDetail, updateUser, logoutUser, deleteUser };
