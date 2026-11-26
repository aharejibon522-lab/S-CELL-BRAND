import { readFile, stat } from 'node:fs/promises';
import { join, normalize, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from './config.js';
import { now, DAY, sha256, newToken } from './security.js';
import { createServices, HttpError } from './services.js';
import { createApi } from './api.js';
import { createPortal } from './portal.js';

const PUBLIC_DIR = fileURLToPath(new URL('../public/', import.meta.url));
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.ico': 'image/x-icon',
  '.json': 'application/json', '.woff2': 'font/woff2', '.txt': 'text/plain; charset=utf-8',
};
const COOKIE = 'scell_session';

const SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
  'Content-Security-Policy': [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com",
    "img-src 'self' data:",
    "connect-src 'self'",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join('; '),
};

function parseCookies(header = '') {
  const out = {};
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

function readBody(req, limit = 100_000) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > limit) { reject(new HttpError(413, 'Request too large.')); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => {
      if (!chunks.length) return resolve({});
      try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))); }
      catch { reject(new HttpError(400, 'Send the request as JSON.')); }
    });
    req.on('error', reject);
  });
}

export function createApp(db) {
  const svc = createServices(db);
  const portal = createPortal(db, svc);
  const api = createApi(db, svc, portal);

  const sessionUser = (token) => {
    if (!token) return null;
    const row = db.get('SELECT user_id, expires_at FROM sessions WHERE token_hash = ?', sha256(token));
    if (!row || row.expires_at < now()) return null;
    return svc.user(row.user_id) || null;
  };

  async function serveStatic(req, res, path) {
    let rel = decodeURIComponent(path);
    if (rel === '/' || !extname(rel)) rel = '/index.html'; // single-page app routes
    const file = normalize(join(PUBLIC_DIR, rel));
    if (!file.startsWith(PUBLIC_DIR)) { res.writeHead(403).end(); return; }
    try {
      const st = await stat(file);
      if (!st.isFile()) throw new Error('not a file');
      const ext = extname(file);
      const type = TYPES[ext] || 'application/octet-stream';
      // Code and pages are revalidated on every visit so a new deploy shows at once; images may be cached.
      const etag = `"${st.size.toString(36)}-${Math.round(st.mtimeMs).toString(36)}"`;
      const headers = {
        ...SECURITY_HEADERS, 'Content-Type': type, ETag: etag,
        'Cache-Control': ['.html', '.js', '.css', '.json', '.txt'].includes(ext) ? 'no-cache' : 'public, max-age=86400',
      };
      if (req.headers['if-none-match'] === etag) { res.writeHead(304, headers).end(); return; }
      const data = await readFile(file);
      res.writeHead(200, headers);
      res.end(req.method === 'HEAD' ? undefined : data);
    } catch {
      res.writeHead(404, { ...SECURITY_HEADERS, 'Content-Type': 'text/plain' }).end('Not found');
    }
  }

  async function handler(req, res) {
    const url = new URL(req.url, 'http://localhost');
    const path = url.pathname;
    if (!path.startsWith('/api/')) return serveStatic(req, res, path);

    const headers = { ...SECURITY_HEADERS, 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' };
    const cookies = parseCookies(req.headers.cookie);
    const setCookies = [];
    const cookieFlags = `Path=/; HttpOnly; SameSite=Lax${config.production ? '; Secure' : ''}`;

    const ctx = {
      method: req.method, path, query: url.searchParams, body: {},
      ip: (req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').toString().split(',')[0].trim(),
      user: sessionUser(cookies[COOKIE]),
      cookies,
      setCookie(pair, maxAge) { setCookies.push(`${pair}; ${cookieFlags}; Max-Age=${maxAge}`); },
      setSession(userId) {
        const token = newToken();
        db.run('INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?,?,?)', sha256(token), userId, now() + config.sessionDays * DAY);
        setCookies.push(`${COOKIE}=${token}; ${cookieFlags}; Max-Age=${config.sessionDays * 86400}`);
      },
      clearSession() {
        if (cookies[COOKIE]) db.run('DELETE FROM sessions WHERE token_hash = ?', sha256(cookies[COOKIE]));
        setCookies.push(`${COOKIE}=; ${cookieFlags}; Max-Age=0`);
      },
    };

    try {
      if (req.method !== 'GET' && req.method !== 'HEAD') {
        // CSRF protection: state-changing calls must come from our own scripts as JSON with our header.
        if (req.headers['x-scell'] !== '1') throw new HttpError(403, 'Request blocked.');
        ctx.body = await readBody(req);
      }
      const out = await api.handle(ctx);
      if (setCookies.length) headers['Set-Cookie'] = setCookies;
      if (out && out.__file) {
        const data = out.__file.data;
        res.writeHead(200, { ...SECURITY_HEADERS, 'Content-Type': out.__file.type, 'Cache-Control': 'private, no-store', 'X-Robots-Tag': 'noindex, nofollow' }).end(data);
        return;
      }
      if (out && out.__raw) {
        headers['Content-Type'] = out.__raw.type;
        headers['Content-Disposition'] = `attachment; filename="${out.__raw.filename}"`;
        res.writeHead(200, headers).end('\uFEFF' + out.__raw.body); // BOM so Excel reads ৳ and Bangla correctly
        return;
      }
      res.writeHead(200, headers).end(JSON.stringify(out ?? {}));
    } catch (e) {
      const status = e instanceof HttpError ? e.status : 500;
      if (status === 500) console.error(e);
      if (setCookies.length) headers['Set-Cookie'] = setCookies;
      res.writeHead(status, headers).end(JSON.stringify({ error: status === 500 ? 'Something went wrong on our side. Try again.' : e.message }));
    }
  }

  return { handler, svc, portal };
}
