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

function createUser({ email, password, isVerified = true }) {
  const cleanEmail = String(email || '').toLowerCase().trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) throw new Error('Geçerli bir e-posta adresi giriniz.');
  if (!password || String(password).length < 6) throw new Error('Şifre en az 6 karakter olmalıdır.');
  if (db.getUserByEmail(cleanEmail)) throw new Error('Bu e-posta adresi zaten kayıtlı.');

  const id = 'usr_' + crypto.randomBytes(8).toString('hex');
  const salt = crypto.randomBytes(16).toString('hex');
  db.createUser({
    id,
    email: cleanEmail,
    passwordHash: auth.hashPassword(String(password), salt),
    salt,
    verificationCode: null,
    verificationExpiresAt: null
  });
  if (isVerified) db.setUserVerified(id, true);
  const row = db.listUsersWithStats().find((u) => u.id === id);
  return toPublicUser(row);
}

// Teams are copied, not moved: the source keeps its team and the target gets an independent copy
function copyTeams(teamIds, toUserId) {
  let copied = 0;
  for (const id of teamIds) {
    const team = db.getTeamById(id);
    if (!team || team.isDefault || !team.userId) continue;

    // Uploaded logo gets its own file so deleting one team never removes the other's logo
    let logo = team.logo;
    let filename = null;
    if (team.filename) {
      const src = path.join(teams.LOGOS_DIR, path.basename(team.filename));
      if (fs.existsSync(src)) {
        filename = 'team_' + crypto.randomBytes(8).toString('hex') + path.extname(src);
        fs.copyFileSync(src, path.join(teams.LOGOS_DIR, filename));
        logo = `/uploads/logos/${filename}`;
      }
    }

    db.saveTeamToDb({
      id: 'team_' + crypto.randomBytes(8).toString('hex'),
      userId: toUserId,
      name: team.name,
      shortName: team.shortName,
      logo,
      color: team.color,
      color2: team.color2,
      textColor: team.textColor,
      filename
    });
    copied++;
  }
  return copied;
}

function transfer({ type, ids, toUserId }) {
  if (!Array.isArray(ids) || ids.length === 0) throw new Error('Aktarılacak öğe seçilmedi.');
  const target = db.getUserById(toUserId);
  if (!target) throw new Error('Hedef kullanıcı bulunamadı.');
  const cleanIds = ids.map(String);

  if (type === 'board') {
    const moved = db.transferBoardsInDb(cleanIds, target.id);
    store.setBoardsOwner(cleanIds, target.id);
    return { moved, email: target.email };
  }
  if (type === 'team') {
    return { copied: copyTeams(cleanIds, target.id), email: target.email };
  }
  throw new Error('Geçersiz aktarım türü.');
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

module.exports = { listUsers, createUser, transfer, getUserDetail, updateUser, logoutUser, deleteUser };
