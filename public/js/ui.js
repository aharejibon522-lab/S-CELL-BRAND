// Small helpers shared by every page.

export const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const taka = (n) => (n === null || n === undefined ? '—' : `৳${Number(n).toLocaleString('en-IN')}`);
export const pad2 = (n) => String(n).padStart(2, '0');
export const date = (ms) => (ms ? new Date(ms).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '—');
export const dateTime = (ms) => (ms ? new Date(ms).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—');

export async function api(path, { method = 'GET', body } = {}) {
  const res = await fetch(path, {
    method,
    headers: { 'content-type': 'application/json', 'x-scell': '1' },
    body: body ? JSON.stringify(body) : undefined,
    credentials: 'same-origin',
  });
  let data = {};
  try { data = await res.json(); } catch { /* empty */ }
  if (!res.ok) { const e = new Error(data.error || 'Something went wrong. Try again.'); e.status = res.status; throw e; }
  return data;
}

let toastTimer;
export function toast(message, kind = '') {
  const el = document.getElementById('toast');
  el.textContent = message;
  el.className = `toast show ${kind}`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.className = 'toast'; }, 4200);
}

export const THEME_LABEL = {
  t1: 'Foundational thoughts', t2: 'Creative philosophies', t3: 'Career reflections', portrait: 'Artistic visuals', reward: 'Reward Edition',
};
export const STATUS_LABEL = {
  vault: 'Not yet sold', auction: 'At auction', owned: 'Owned', listed: 'For sale', escrow: 'Transfer in progress', retired: 'Retired', lost: 'Reported lost',
};
export const BADGE_LABEL = { blue: 'Blue', resale: 'Resale buyer', round1: 'Round 1', round2: 'Round 2', round3: 'Round 3' };

export function badges(codes = []) {
  const uniq = [...new Set(codes.map((b) => (typeof b === 'string' ? b : b.code)))];
  if (!uniq.length) return '';
  return `<span class="badges">${uniq.map((c) => `<span class="badge ${esc(c)}">${esc(BADGE_LABEL[c] || c)}</span>`).join('')}</span>`;
}

// Renders a card as an engraved steel plate.
// Artists with finished illustrated artwork (from /api/config). Their cards render as the engraved artwork itself.
let CARD_ART = new Set();
export const setCardArt = (list) => { CARD_ART = new Set(list || []); };
const slugOf = (name) => String(name || '').toLowerCase().normalize('NFKD').replace(/[^\w\s-]/g, '').trim().replace(/[\s_]+/g, '-').slice(0, 60);
export function cardImage(c) {
  if (c.series === 'reward') return null;
  const slug = c.artist?.slug || slugOf(c.artist?.name || c.artistName);
  return CARD_ART.has(slug) ? `/img/cards/${slug}/${pad2(c.number)}.webp` : null;
}

export function plate(c, { engrave = false, extraClass = '' } = {}) {
  const img = cardImage(c);
  if (img) {
    const portraitI = c.orientation === 'portrait';
    const nI = pad2(c.number);
    const dim = ['retired', 'lost'].includes(c.status) ? 'dim' : '';
    return `<div class="plate has-art ${portraitI ? 'portrait' : ''} ${dim} ${extraClass}" role="img" aria-label="${esc(`${c.artist?.name || c.artistName || ''} card ${nI} of 15: ${c.title}`)}"><img src="${img}" alt="" loading="lazy" decoding="async"></div>`;
  }
  const portrait = c.orientation === 'portrait';
  const reward = c.series === 'reward';
  const artistName = c.artist?.name || c.artistName || '';
  const n = reward ? `R${pad2(c.number)}` : pad2(c.number);
  const seedX = 20 + ((c.number * 37) % 60);
  const seedY = 15 + ((c.number * 23) % 50);
  const classes = ['plate', portrait ? 'portrait' : '', reward ? 'reward' : '', ['retired', 'lost'].includes(c.status) ? 'dim' : '', extraClass].join(' ');
  return `
    <div class="${classes}" role="img" aria-label="${esc(`${artistName} card ${n}${reward ? '' : ' of 15'}: ${c.title}`)}">
      ${portrait ? `<div class="plate-art" style="--ax:${seedX}%;--ay:${seedY}%"></div>` : '<div class="plate-chip" aria-hidden="true"></div>'}
      <div class="plate-inner etch ${engrave ? 'engrave' : ''}">
        <div class="plate-top"><span>${esc(artistName)}</span><span>S/CELL</span></div>
        <div class="plate-num">${n}<small>${reward ? ' reward' : '/15'}</small></div>
        <div class="plate-title">${esc(c.title)}</div>
        ${!portrait && c.body ? `<div class="plate-body">${esc(c.body)}</div>` : ''}
        <div class="plate-foot"><span>${esc(c.code || '')}</span><span>${esc(THEME_LABEL[c.theme] || '')}</span></div>
      </div>
    </div>`;
}

export function formData(form) {
  const out = {};
  for (const [k, v] of new FormData(form).entries()) out[k] = v;
  for (const cb of form.querySelectorAll('input[type=checkbox]')) out[cb.name] = cb.checked;
  return out;
}

export function countdown(endsAt, serverOffset = 0) {
  const ms = Math.max(0, endsAt - (Date.now() + serverOffset));
  const d = Math.floor(ms / 86400000), h = Math.floor((ms % 86400000) / 3600000), m = Math.floor((ms % 3600000) / 60000), s = Math.floor((ms % 60000) / 1000);
  if (ms === 0) return 'Bidding closed';
  return d > 0 ? `${d}d ${pad2(h)}h ${pad2(m)}m` : `${pad2(h)}:${pad2(m)}:${pad2(s)}`;
}
