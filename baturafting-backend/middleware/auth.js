const crypto = require('crypto');
const { TOKEN_TTL_SECONDS } = require('../config/constants');

const b64url = (buf) => Buffer.from(buf).toString('base64url');

function getSecret() {
  return process.env.ADMIN_TOKEN_SECRET || '';
}

// Membuat token bertanda tangan HMAC-SHA256: <payload>.<signature>
function signToken(payload = {}) {
  const body = b64url(JSON.stringify({
    ...payload,
    exp: Math.floor(Date.now() / 1000) + TOKEN_TTL_SECONDS
  }));
  const sig = crypto.createHmac('sha256', getSecret()).update(body).digest('base64url');
  return `${body}.${sig}`;
}

// Mengembalikan payload jika token valid dan belum kedaluwarsa, selain itu null
function verifyToken(token) {
  const secret = getSecret();
  if (!secret || typeof token !== 'string') return null;
  const [body, sig] = token.split('.');
  if (!body || !sig) return null;

  const expected = crypto.createHmac('sha256', secret).update(body).digest('base64url');
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;

  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    if (!payload.exp || payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch {
    return null;
  }
}

// Middleware: lindungi route admin
function requireAdmin(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  const payload = verifyToken(token);
  if (!payload) {
    return res.status(401).json({ success: false, message: 'Akses ditolak. Silakan login sebagai admin.' });
  }
  req.admin = payload;
  next();
}

// Pembatas percobaan login: maksimal 5 kali gagal per 15 menit per IP
const attempts = new Map();
const WINDOW_MS = 15 * 60 * 1000;
const MAX_FAILED = 5;

function loginRateLimit(req, res, next) {
  const key = req.ip || 'unknown';
  const now = Date.now();
  const rec = attempts.get(key);
  if (rec && rec.resetAt > now && rec.count >= MAX_FAILED) {
    return res.status(429).json({ success: false, message: 'Terlalu banyak percobaan login. Coba lagi dalam 15 menit.' });
  }
  req.recordLoginFailure = () => {
    const cur = attempts.get(key);
    if (!cur || cur.resetAt <= now) attempts.set(key, { count: 1, resetAt: now + WINDOW_MS });
    else cur.count += 1;
  };
  req.clearLoginFailures = () => attempts.delete(key);
  next();
}

module.exports = { signToken, verifyToken, requireAdmin, loginRateLimit };
