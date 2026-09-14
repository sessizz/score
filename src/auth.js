const crypto = require('crypto');
const db = require('./db');
const mailer = require('./mailer');

/**
 * Hash password with salt using scrypt
 */
function hashPassword(password, salt) {
  return crypto.scryptSync(password, salt, 64).toString('hex');
}

/**
 * Generate a random 6-digit verification code
 */
function generateVerificationCode() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

/**
 * Parse cookies from request header
 */
function parseCookies(cookieHeader) {
  const list = {};
  if (!cookieHeader) return list;
  cookieHeader.split(';').forEach(cookie => {
    let [name, ...rest] = cookie.split('=');
    name = name?.trim();
    if (!name) return;
    const value = rest.join('=').trim();
    list[name] = decodeURIComponent(value);
  });
  return list;
}

/**
 * Serialize session cookie
 */
function createSessionCookie(token, maxAgeDays = 30) {
  const maxAge = maxAgeDays * 24 * 60 * 60;
  return `sid=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}`;
}

/**
 * Serialize clear session cookie
 */
function createClearCookie() {
  return `sid=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT`;
}

/**
 * Register a new user
 */
async function register(email, password) {
  if (!email || !email.includes('@')) {
    throw new Error('Geçerli bir e-posta adresi giriniz.');
  }
  if (!password || password.length < 6) {
    throw new Error('Şifre en az 6 karakter olmalıdır.');
  }

  const cleanEmail = email.toLowerCase().trim();
  const existing = db.getUserByEmail(cleanEmail);

  if (existing) {
    if (existing.is_verified) {
      throw new Error('Bu e-posta adresi zaten kullanımda.');
    }
    // Existing but not verified: update verification code and resend email
    const code = generateVerificationCode();
    const expiresAt = Date.now() + 15 * 60 * 1000; // 15 mins
    db.updateVerificationCode(existing.id, code, expiresAt);
    await mailer.sendVerificationEmail(cleanEmail, code);
    return {
      success: true,
      message: 'Doğrulama kodu e-posta adresinize tekrar gönderildi.',
      email: cleanEmail
    };
  }

  const id = 'usr_' + crypto.randomBytes(8).toString('hex');
  const salt = crypto.randomBytes(16).toString('hex');
  const passwordHash = hashPassword(password, salt);
  const verificationCode = generateVerificationCode();
  const verificationExpiresAt = Date.now() + 15 * 60 * 1000;

  db.createUser({
    id,
    email: cleanEmail,
    passwordHash,
    salt,
    verificationCode,
    verificationExpiresAt
  });

  // Send verification email via Resend
  await mailer.sendVerificationEmail(cleanEmail, verificationCode);

  return {
    success: true,
    message: 'Kayıt başarılı! Lütfen e-posta adresinize gönderilen 6 haneli kodu giriniz.',
    email: cleanEmail
  };
}

/**
 * Verify user email with 6-digit code
 */
async function verify(email, code) {
  if (!email || !code) {
    throw new Error('E-posta ve doğrulama kodu zorunludur.');
  }

  const cleanEmail = email.toLowerCase().trim();
  const user = db.getUserByEmail(cleanEmail);

  if (!user) {
    throw new Error('Kullanıcı bulunamadı.');
  }

  if (user.is_verified) {
    // Already verified, just log in
    const session = db.createSession(user.id);
    return {
      success: true,
      alreadyVerified: true,
      user: { id: user.id, email: user.email },
      sessionToken: session.token
    };
  }

  if (!user.verification_code || user.verification_code.trim() !== String(code).trim()) {
    throw new Error('Geçersiz doğrulama kodu.');
  }

  if (user.verification_expires_at && Date.now() > user.verification_expires_at) {
    throw new Error('Doğrulama kodunun süresi dolmuş. Lütfen yeni bir kod isteyin.');
  }

  // Mark as verified
  const verifiedUser = db.verifyUser(user.id);

  // Check if existing legacy boards should be assigned to this user
  db.assignLegacyDataToUser(user.id);

  // Create login session
  const session = db.createSession(user.id);

  return {
    success: true,
    message: 'E-posta adresiniz başarıyla doğrulandı!',
    user: { id: verifiedUser.id, email: verifiedUser.email },
    sessionToken: session.token
  };
}

/**
 * Resend verification code
 */
async function resendCode(email) {
  if (!email) throw new Error('E-posta adresi gereklidir.');
  const cleanEmail = email.toLowerCase().trim();
  const user = db.getUserByEmail(cleanEmail);

  if (!user) throw new Error('Kullanıcı bulunamadı.');
  if (user.is_verified) throw new Error('Bu hesap zaten doğrulanmış.');

  const code = generateVerificationCode();
  const expiresAt = Date.now() + 15 * 60 * 1000;
  db.updateVerificationCode(user.id, code, expiresAt);

  await mailer.sendVerificationEmail(cleanEmail, code);

  return { success: true, message: 'Yeni doğrulama kodu e-postanıza gönderildi.' };
}

/**
 * Login user
 */
async function login(email, password) {
  if (!email || !password) {
    throw new Error('E-posta ve şifre zorunludur.');
  }

  const cleanEmail = email.toLowerCase().trim();
  const user = db.getUserByEmail(cleanEmail);

  if (!user) {
    throw new Error('E-posta veya şifre hatalı.');
  }

  const inputHash = hashPassword(password, user.salt);
  const match = crypto.timingSafeEqual(Buffer.from(inputHash, 'hex'), Buffer.from(user.password_hash, 'hex'));

  if (!match) {
    throw new Error('E-posta veya şifre hatalı.');
  }

  if (!user.is_verified) {
    // Send a fresh code and prompt verification
    const code = generateVerificationCode();
    const expiresAt = Date.now() + 15 * 60 * 1000;
    db.updateVerificationCode(user.id, code, expiresAt);
    await mailer.sendVerificationEmail(cleanEmail, code);

    const err = new Error('Lütfen önce e-posta adresinizi doğrulayın.');
    err.unverified = true;
    err.email = cleanEmail;
    throw err;
  }

  const session = db.createSession(user.id);

  return {
    success: true,
    user: { id: user.id, email: user.email },
    sessionToken: session.token
  };
}

/**
 * Logout
 */
function logout(token) {
  if (token) db.deleteSession(token);
  return { success: true };
}

/**
 * Get current user from HTTP Request (checks Cookie: sid=... or Authorization: Bearer ...)
 */
function getUserFromRequest(req) {
  // 1. Check Authorization header
  const authHeader = req.headers['authorization'];
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.slice(7).trim();
    const user = db.getSessionUser(token);
    if (user) return user;
  }

  // 2. Check Cookie
  const cookies = parseCookies(req.headers['cookie']);
  if (cookies.sid) {
    const user = db.getSessionUser(cookies.sid);
    if (user) return user;
  }

  return null;
}

module.exports = {
  hashPassword,
  parseCookies,
  createSessionCookie,
  createClearCookie,
  register,
  verify,
  resendCode,
  login,
  logout,
  getUserFromRequest
};
