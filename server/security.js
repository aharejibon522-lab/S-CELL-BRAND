import { scryptSync, randomBytes, timingSafeEqual, createHash, createHmac } from 'node:crypto';

export const now = () => Date.now();
export const DAY = 24 * 60 * 60 * 1000;

export function hashPassword(password) {
  const salt = randomBytes(16);
  const key = scryptSync(password, salt, 64, { N: 16384, r: 8, p: 1 });
  return `scrypt$${salt.toString('hex')}$${key.toString('hex')}`;
}

export function verifyPassword(password, stored) {
  const [alg, saltHex, keyHex] = String(stored).split('$');
  if (alg !== 'scrypt' || !saltHex || !keyHex) return false;
  const key = scryptSync(password, Buffer.from(saltHex, 'hex'), 64, { N: 16384, r: 8, p: 1 });
  const expected = Buffer.from(keyHex, 'hex');
  return expected.length === key.length && timingSafeEqual(expected, key);
}

export const sha256 = (s) => createHash('sha256').update(s).digest('hex');
export const newToken = () => randomBytes(32).toString('base64url');

// NIDs are never stored in full: only the last 4 digits and a keyed hash (to stop one NID opening many accounts).
const NID_KEY = process.env.NID_HASH_KEY || 'dev-only-change-me';
export const hashNid = (nid) => createHmac('sha256', NID_KEY).update(nid).digest('hex');

export function chipUid() {
  // 7-byte UID, the size used by NTAG424 DNA chips.
  return randomBytes(7).toString('hex').toUpperCase();
}

export function cardCode(prefix, number, series) {
  const tag = series === 'reward' ? 'R' : '';
  return `${prefix}-${tag}${String(number).padStart(2, '0')}-${randomBytes(2).toString('hex').toUpperCase()}`;
}

// Very small fixed-window rate limiter for login and sign-up.
const buckets = new Map();
export function rateLimit(key, limit, windowMs) {
  const t = now();
  const b = buckets.get(key);
  if (!b || t > b.reset) { buckets.set(key, { count: 1, reset: t + windowMs }); return true; }
  b.count++;
  return b.count <= limit;
}
