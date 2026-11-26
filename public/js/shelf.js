// S/CELL card shelf: a curved arc of steel cards seen edge-on. The centre card turns to face you;
// clicking it grows a detail sheet out of the card. One requestAnimationFrame loop drives everything.
import { esc } from './ui.js';

const reduce = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const smooth = (t) => t * t * (3 - 2 * t);
const EASE = 'cubic-bezier(.2,.8,.2,1)';

/**
 * items: [{ img, title, sub, meta, group, body, credit, href, hrefLabel }]
 * opts:  { start, wordLeft, wordRight, label }
 */
export function mountShelf(root, items, opts = {}) {
  const N = items.length;
  if (!N) return () => {};
  const COPIES = 3, TOTAL = N * COPIES;
  const groups = [...new Set(items.map((i) => i.group))];

  root.classList.add('shelf-hero');
  root.innerHTML = `
    <div class="sh-grain" aria-hidden="true"></div>
    <div class="sh-word left" aria-hidden="true">${esc(opts.wordLeft || 'ইস্পাত')}</div>
    <div class="sh-word right" aria-hidden="true">${esc(opts.wordRight || 'স্মৃতি')}</div>
    <div class="sh-probe" aria-hidden="true"></div>
    <div class="sh-floor" aria-hidden="true"></div>
    <div class="sh-shelf" role="listbox" aria-label="${esc(opts.label || 'Cards')}" tabindex="0">
      <div class="sh-stage">${Array.from({ length: TOTAL }, (_, v) => {
        const it = items[v % N];
        return `<div class="sh-card" data-v="${v}" role="option" aria-label="${esc(it.title)}"><div class="sh-face" style="background-image:url('${it.img}')"></div></div>`;
      }).join('')}</div>
    </div>
    <button class="sh-play" type="button" aria-label="Open this card"><svg viewBox="0 0 12 12" aria-hidden="true"><path d="M3 1.5v9l7.5-4.5z"/></svg></button>
    <div class="sh-caption" aria-live="polite">
      <div class="sh-mask sh-title"></div>
      <div class="sh-mask sh-sub"></div>
      <div class="sh-rule"></div>
      <div class="sh-mask sh-meta"></div>
    </div>
    <button class="sh-arrow prev" type="button" aria-label="Previous card"><svg viewBox="0 0 25 12"><path d="M6 1L1 6l5 5M1 6h23"/></svg></button>
    <button class="sh-arrow next" type="button" aria-label="Next card"><svg viewBox="0 0 25 12"><path d="M19 1l5 5-5 5M24 6H1"/></svg></button>
    <div class="sh-ruler" aria-hidden="true">
      <div class="sh-line"></div>
      ${items.map((it, i) => `<i class="sh-tick ${i === 0 || items[i - 1].group !== it.group ? 'major' : ''}" style="left:${(i / (N - 1)) * 100}%"></i>`).join('')}
      ${groups.map((g) => {
        const idx = items.map((it, i) => (it.group === g ? i : -1)).filter((i) => i >= 0);
        const mid = (idx[0] + idx[idx.length - 1]) / 2 / (N - 1) * 100;
        return `<span class="sh-glabel" style="left:${mid}%">${esc(g)}</span>`;
      }).join('')}
      <div class="sh-dot"></div>
      <div class="sh-hit"></div>
    </div>
    <div class="sh-cursor" aria-hidden="true"><div class="ring"></div><div class="dot"></div><div class="lab">OPEN<br>খুলুন</div></div>
    <div class="sh-detail" role="dialog" aria-modal="true" aria-label="Card details" hidden>
      <button class="sh-close" type="button">Close · বন্ধ</button>
      <div class="sh-dgrid">
        <div class="sh-dtext">
          <div class="dm"><p class="d-sub"></p></div>
          <div class="dm"><h2 class="d-title"></h2></div>
          <div class="dm"><p class="d-meta"></p></div>
          <div class="dm"><p class="d-body"></p></div>
          <div class="dm"><p class="d-credit"></p></div>
          <div class="dm"><a class="d-btn btn" href="#" data-link></a></div>
        </div>
        <div class="sh-dposter">
          <svg viewBox="0 0 640 1016" aria-hidden="true">
            <defs>
              <filter id="sh-ink" x="-20%" y="-20%" width="140%" height="140%"><feTurbulence type="fractalNoise" baseFrequency=".011" numOctaves="3" seed="7"/><feDisplacementMap in="SourceGraphic" scale="120" xChannelSelector="R" yChannelSelector="G"/></filter>
              <mask id="sh-mask"><g filter="url(#sh-ink)">${[[200, 370, 0], [460, 680, 120], [330, 140, 220], [120, 860, 300], [540, 280, 360], [350, 970, 420], [310, 530, 180]].map(([x, y, d]) => `<circle cx="${x}" cy="${y}" r="0" data-d="${d}" fill="#fff"/>`).join('')}</g></mask>
            </defs>
            <image class="d-img" href="" x="0" y="0" width="640" height="1016" mask="url(#sh-mask)" preserveAspectRatio="xMidYMid meet"/>
          </svg>
        </div>
      </div>
    </div>`;

  const $ = (s) => root.querySelector(s);
  const shelfEl = $('.sh-shelf'), probe = $('.sh-probe'), cards = [...root.querySelectorAll('.sh-card')];
  const capT = $('.sh-title'), capS = $('.sh-sub'), capM = $('.sh-meta');
  const dot = $('.sh-dot'), play = $('.sh-play'), cursor = $('.sh-cursor'), detail = $('.sh-detail');
  const circles = [...root.querySelectorAll('#sh-mask circle')];
  const fine = matchMedia('(pointer:fine)').matches;

  let H = 0, ws = 0, d = 0, gap = 0, U = 0, XS = [];
  const P = 1400;
  function measure() {
    H = probe.getBoundingClientRect().height || 320;
    d = H * 0.63; ws = H * 0.16; gap = H * 0.035;
    U = H * (innerWidth < 768 ? 1.05 : 1.3);
    XS = [0];
    let acc = 0;
    for (let u = 2; u <= 3 * U; u += 2) { acc += 2 / (1 + (u / U) ** 1.6); XS.push(acc); }
  }
  const xsc = (u) => { const i = Math.min(XS.length - 1, Math.round(Math.abs(u) / 2)); return Math.sign(u) * XS[i]; };
  const scl = (u) => 1 / (1 + (Math.abs(u) / U) ** 1.6);
  const B = (r) => (Math.abs(r) < 1 ? (r + Math.sin(Math.PI * r) / Math.PI) / 2 : Math.sign(r) * 0.5);
  const F = (r) => r * (ws + gap) + (d - ws + 1.4 * gap) * B(r);
  const rel = (v, s) => { let r = (v - s) % TOTAL; if (r < -TOTAL / 2) r += TOTAL; if (r >= TOTAL / 2) r -= TOTAL; return r; };

  let s = N + (opts.start || 0), T = s, active = -1;
  let tiltX = 0, tiltY = 0, mx = innerWidth / 2, my = 0, cx = mx, cy = my, onCover = false;
  let dragging = false, dragMoved = false, dragX0 = 0, T0 = 0, wheelTimer = 0, last = performance.now();
  let open = false, rulerYear = 0;
  const lift = new Float32Array(TOTAL);
  let hoverV = -1;

  // ---------- caption swap (mask slide) ----------
  function swap(el, html, dir) {
    if (reduce() || !el.firstChild) { el.innerHTML = `<span>${html}</span>`; return; }
    const n = document.createElement('span'); n.innerHTML = html; el.appendChild(n);
    n.animate([{ transform: `translateY(${dir * 105}%)` }, { transform: 'translateY(0)' }], { duration: 650, easing: EASE, fill: 'both' });
    for (const old of [...el.children].slice(0, -1)) {
      old.animate([{ transform: getComputedStyle(old).transform === 'none' ? 'translateY(0)' : getComputedStyle(old).transform }, { transform: `translateY(${-dir * 105}%)` }], { duration: 650, easing: EASE, fill: 'both' }).onfinish = () => old.remove();
    }
  }
  function setCaption(i, dir) {
    const it = items[i];
    swap(capT, esc(it.title), dir); swap(capS, esc(it.sub), dir); swap(capM, esc(it.meta), dir);
    cards.forEach((c) => c.setAttribute('aria-selected', String(Number(c.dataset.v) % N === i)));
  }

  // ---------- frame loop ----------
  function frame(t) {
    if (!root.isConnected) return;
    const dt = Math.min(0.05, (t - last) / 1000); last = t;
    const k = dragging ? 18 : 5.2;
    s = reduce() ? T : s + (T - s) * (1 - Math.exp(-k * dt));
    if (Math.abs(s - N) > 4 * N) { const shift = Math.round((s - N) / N) * N; s -= shift; T -= shift; }
    const idx = ((Math.round(s) % N) + N) % N;
    if (idx !== active) { const dir = active < 0 ? 1 : Math.sign(T - s) || 1; active = idx; setCaption(idx, dir); }

    cx += (mx - cx) * (1 - Math.exp(-16 * dt)); cy += (my - cy) * (1 - Math.exp(-16 * dt));
    const rect = shelfEl.getBoundingClientRect();
    const scy = rect.top + rect.height / 2, W = rect.width;
    const settled = Math.abs(T - s) < 0.3;
    onCover = settled && !open && Math.abs(mx - (rect.left + W / 2)) < d * 0.55 && Math.abs(my - scy) < H * 0.55;
    const ty = onCover ? ((mx - rect.left - W / 2) / (d * 0.55)) * 8 : ((mx - W / 2) / W) * 4;
    const tx = onCover ? (-(my - scy) / (H / 2)) * 5 : 0;
    tiltY += (ty - tiltY) * (1 - Math.exp(-7 * dt)); tiltX += (tx - tiltX) * (1 - Math.exp(-7 * dt));

    for (let v = 0; v < TOTAL; v++) {
      const el = cards[v];
      const r = rel(v, s);
      const o = smooth(Math.max(0, 1 - Math.abs(r)));
      const u = F(r);
      if (Math.abs(u) > U * 1.95) { if (el.style.visibility !== 'hidden') el.style.visibility = 'hidden'; continue; }
      el.style.visibility = '';
      const target = v === hoverV && Math.abs(r) > 0.5 ? 1 : 0;
      lift[v] = reduce() ? target : lift[v] + (target - lift[v]) * (1 - Math.exp(-12 * dt));
      const sc = scl(u), kk = 1 / sc;
      const z = P * (1 - kk) + o * H * 0.1;
      const x = xsc(u) * kk;
      const y = (H * 0.5 * (1 - sc) * 0.42 + o * H * 0.012 - lift[v] * H * 0.05) * kk;
      const turn = -Math.sign(u) * (66 + 14 * Math.min(1, Math.abs(u) / U));
      const rY = turn * (1 - o) + tiltY * o;
      el.style.transform = `translate3d(${x.toFixed(1)}px,${y.toFixed(1)}px,${z.toFixed(1)}px) rotateX(${(tiltX * o).toFixed(2)}deg) rotateY(${rY.toFixed(2)}deg)`;
      el.style.zIndex = String(Math.round(3000 + z));
      el.style.setProperty('--shade', (Math.min(0.62, (1 - o) * 0.28 + (1 - sc) * 0.36)).toFixed(3));
    }

    // play ring and cursor
    const ps = open ? 0 : smooth(Math.max(0, 1 - Math.abs(T - s) * 3));
    play.style.transform = `translate(-50%,-50%) scale(${ps.toFixed(3)})`;
    play.style.left = `${W / 2 - d / 2 + 4}px`; play.style.top = `${rect.top - root.getBoundingClientRect().top + rect.height / 2 + H * 0.38}px`;
    if (fine) {
      const rr = root.getBoundingClientRect();
      cursor.style.transform = `translate(${(cx - rr.left).toFixed(1)}px,${(cy - rr.top).toFixed(1)}px)`;
      cursor.classList.toggle('open', onCover);
    }

    // ruler dot
    const f = s - Math.floor(s), a = ((Math.floor(s) % N) + N) % N, b = (a + 1) % N;
    let target = b === 0 ? (f < 0.5 ? a : 0) : a + (b - a) * f;
    rulerYear = Math.abs(target - rulerYear) > 3 ? target : rulerYear + (target - rulerYear) * (1 - Math.exp(-14 * dt));
    dot.style.left = `${(rulerYear / (N - 1)) * 100}%`;
    requestAnimationFrame(frame);
  }

  // ---------- inputs ----------
  const step = (n) => { if (!open) T = Math.round(T) + n; };
  const go = (i) => { let r = ((i - (((Math.round(T) % N) + N) % N)) % N + N) % N; if (r > N / 2) r -= N; T = Math.round(T) + r; };
  $('.sh-arrow.prev').addEventListener('click', () => step(-1));
  $('.sh-arrow.next').addEventListener('click', () => step(1));
  shelfEl.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowLeft') { step(-1); e.preventDefault(); }
    if (e.key === 'ArrowRight') { step(1); e.preventDefault(); }
    if (e.key === 'Enter') openDetail();
  });
  root.addEventListener('keydown', (e) => { if (e.key === 'Escape' && open) closeDetail(); });
  shelfEl.addEventListener('pointerdown', (e) => { dragging = true; dragMoved = false; dragX0 = e.clientX; T0 = T; });
  addEventListener('pointermove', onMove);
  function onMove(e) {
    mx = e.clientX; my = e.clientY;
    if (!dragging) return;
    const dx = e.clientX - dragX0;
    if (Math.abs(dx) > 5) dragMoved = true;
    if (dragMoved) T = T0 - dx / (ws + gap);
  }
  addEventListener('pointerup', onUp);
  function onUp() { if (dragging) { dragging = false; if (dragMoved) T = Math.round(T); } }
  shelfEl.addEventListener('click', (e) => {
    if (dragMoved) return;
    const c = e.target.closest('.sh-card'); if (!c) return;
    const r = Math.round(rel(Number(c.dataset.v), T));
    if (r === 0) openDetail(); else T = Math.round(T + r);
  });
  shelfEl.addEventListener('pointerover', (e) => { const c = e.target.closest('.sh-card'); hoverV = c ? Number(c.dataset.v) : -1; cursor.classList.toggle('spine', !!c); });
  shelfEl.addEventListener('pointerleave', () => { hoverV = -1; cursor.classList.remove('spine'); });
  // Only sideways scrolling moves the shelf, so the page keeps scrolling normally.
  shelfEl.addEventListener('wheel', (e) => {
    if (open || Math.abs(e.deltaX) <= Math.abs(e.deltaY)) return;
    e.preventDefault();
    T += (e.deltaX / (ws + gap)) * 0.5;
    clearTimeout(wheelTimer); wheelTimer = setTimeout(() => { T = Math.round(T); }, 160);
  }, { passive: false });
  $('.sh-hit').addEventListener('click', (e) => {
    const r = e.currentTarget.getBoundingClientRect();
    go(Math.round(((e.clientX - r.left) / r.width) * (N - 1)));
  });
  play.addEventListener('click', () => openDetail());
  for (const b of root.querySelectorAll('button, a, .sh-hit')) {
    b.addEventListener('pointerenter', () => cursor.classList.add('btn'));
    b.addEventListener('pointerleave', () => cursor.classList.remove('btn'));
  }
  root.addEventListener('pointerenter', () => cursor.classList.add('on'));
  root.addEventListener('pointerleave', () => cursor.classList.remove('on'));

  // ---------- detail sheet ----------
  const centreCard = () => cards.reduce((best, c) => (Math.abs(rel(Number(c.dataset.v), s)) < Math.abs(rel(Number(best.dataset.v), s)) ? c : best), cards[0]);
  const insetOf = (r) => `inset(${r.top}px ${innerWidth - r.right}px ${innerHeight - r.bottom}px ${r.left}px round 3px)`;
  function openDetail() {
    if (open) return;
    T = Math.round(T); open = true;
    const it = items[active];
    detail.querySelector('.d-sub').textContent = it.sub;
    detail.querySelector('.d-title').textContent = it.title;
    detail.querySelector('.d-meta').textContent = it.meta;
    detail.querySelector('.d-body').textContent = it.body || '';
    detail.querySelector('.d-credit').textContent = it.credit || '';
    const btn = detail.querySelector('.d-btn'); btn.textContent = it.hrefLabel || 'See this card'; btn.setAttribute('href', it.href || '#');
    detail.querySelector('.d-img').setAttribute('href', it.img);
    circles.forEach((c) => c.setAttribute('r', '0'));
    const r = centreCard().querySelector('.sh-face').getBoundingClientRect();
    detail.hidden = false; document.body.classList.add('sh-lock');
    const fast = reduce();
    detail.animate([{ clipPath: insetOf(r) }, { clipPath: 'inset(0 round 0)' }], { duration: fast ? 1 : 1050, easing: 'cubic-bezier(.76,0,.18,1)', fill: 'both' });
    [...detail.querySelectorAll('.dm > *')].forEach((el, i) => el.animate([{ transform: 'translateY(110%)' }, { transform: 'translateY(0)' }], { duration: fast ? 1 : 900, delay: fast ? 0 : 620 + i * 75, easing: EASE, fill: 'both' }));
    const t0 = performance.now() + (fast ? -5000 : 520);
    const grow = (t) => {
      if (!open) return;
      let done = true;
      for (const c of circles) {
        const p = Math.min(1, Math.max(0, (t - t0 - Number(c.dataset.d)) / 1250));
        if (p < 1) done = false;
        c.setAttribute('r', String(720 * (1 - (1 - p) ** 3)));
      }
      if (!done) requestAnimationFrame(grow);
    };
    requestAnimationFrame(grow);
    detail.querySelector('.sh-close').focus({ preventScroll: true });
  }
  function closeDetail() {
    if (!open) return;
    open = false;
    const r = centreCard().querySelector('.sh-face').getBoundingClientRect();
    const anim = detail.animate([{ clipPath: 'inset(0 round 0)' }, { clipPath: insetOf(r) }], { duration: reduce() ? 1 : 850, easing: 'cubic-bezier(.76,0,.18,1)', fill: 'both' });
    anim.onfinish = () => { detail.hidden = true; detail.getAnimations({ subtree: true }).forEach((a) => a.cancel()); document.body.classList.remove('sh-lock'); shelfEl.focus({ preventScroll: true }); };
  }
  detail.querySelector('.sh-close').addEventListener('click', closeDetail);
  detail.querySelector('.d-btn').addEventListener('click', () => { open = false; detail.hidden = true; document.body.classList.remove('sh-lock'); });

  measure();
  addEventListener('resize', measure);
  requestAnimationFrame(frame);
  return () => { removeEventListener('pointermove', onMove); removeEventListener('pointerup', onUp); removeEventListener('resize', measure); document.body.classList.remove('sh-lock'); };
}
