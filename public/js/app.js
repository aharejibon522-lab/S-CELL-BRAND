import { esc, taka, pad2, date, dateTime, api, toast, plate, badges, formData, countdown, THEME_LABEL, STATUS_LABEL, BADGE_LABEL, setCardArt, cardImage } from './ui.js';
import { mountShelf } from './shelf.js';
import { mountLivingCard, mountMarquee, mountRevealText, mountStack, mountFadeIns, mountSparkField } from './fx.js';
import { adminView } from './admin.js';
import { guidesHub, guidePage, policiesIndex, policyPage, artistDashboard, sponsorDashboard } from './guides.js';

const main = document.getElementById('main');
const state = { me: null, config: null, timers: [], cleanups: [], handlers: { submit: {}, click: {} } };

// ---------- Router ----------
const routes = [
  [/^\/$/, home],
  [/^\/collections$/, collections],
  [/^\/artists\/([\w-]+)$/, artistPage],
  [/^\/cards\/(\d+)$/, cardPage],
  [/^\/night$/, nightPage],
  [/^\/night\/(\d+)$/, nightPage],
  [/^\/market$/, marketPage],
  [/^\/collectors$/, collectorsPage],
  [/^\/verify$/, verifyPage],
  [/^\/verify\/([\w-]+)$/, verifyPage],
  [/^\/partners$/, partnersPage],
  [/^\/how-it-works$/, howPage],
  [/^\/signin$/, signinPage],
  [/^\/join$/, joinPage],
  [/^\/account$/, accountPage],
  [/^\/admin$/, (...a) => adminView(ctx(), ...a)],
  [/^\/guides$/, () => guidesHub(ctx())],
  [/^\/guides\/(collectors|artists|sponsors)$/, (a) => guidePage(ctx(), a)],
  [/^\/policies$/, () => policiesIndex(ctx())],
  [/^\/policies\/([\w-]+)$/, (s) => policyPage(ctx(), s)],
  [/^\/dashboard\/artist$/, () => artistDashboard(ctx())],
  [/^\/concept$/, conceptPage],
  [/^\/dashboard\/sponsor$/, () => sponsorDashboard(ctx())],
];

export function navigate(path, { replace = false } = {}) {
  if (replace) history.replaceState({}, '', path); else history.pushState({}, '', path);
  render();
}

function ctx() {
  return { main, state, on, navigate, refreshMe, setTitle };
}

function on(kind, name, fn) { state.handlers[kind][name] = fn; }
function setTitle(t) { document.title = t ? `${t} — S/CELL` : 'S/CELL — Fifteen. One artist. Forever.'; }

async function render() {
  state.timers.forEach(clearInterval);
  state.timers = [];
  state.cleanups.forEach((f) => { try { f(); } catch {} });
  state.cleanups = [];
  state.handlers = { submit: {}, click: {} };
  const path = location.pathname.replace(/\/+$/, '') || '/';
  document.querySelectorAll('.nav a').forEach((a) => {
    const href = a.getAttribute('href');
    a.toggleAttribute('aria-current', href !== '/' && path.startsWith(href));
    if (a.hasAttribute('aria-current')) a.setAttribute('aria-current', 'page');
  });
  document.getElementById('nav').classList.remove('open');
  document.querySelector('.menu-toggle').setAttribute('aria-expanded', 'false');
  main.innerHTML = '<div class="wrap loading">Loading…</div>';
  window.scrollTo(0, 0);
  try {
    for (const [re, view] of routes) {
      const m = re.exec(path);
      if (m) { await view(...m.slice(1)); finish(); return; }
    }
    notFound();
  } catch (e) {
    main.innerHTML = `<div class="wrap section"><h1 class="h2">This page could not load</h1><p class="lede">${esc(e.message)}</p><a class="btn ghost" href="/" data-link>Go to the home page</a></div>`;
  }
  finish();
}

function finish() {
  const pending = state.me?.pendingPolicies || [];
  if (pending.length && !location.pathname.startsWith('/policies/') && !document.getElementById('policy-banner')) {
    main.insertAdjacentHTML('afterbegin', `<div class="wrap" id="policy-banner"><p class="notice blue" style="margin-top:20px">Please review and accept: ${pending.map((p) => `<a href="/policies/${esc(p.slug)}">${esc(p.title)}</a>`).join(', ')}.</p></div>`);
  }
  if (location.hash) document.getElementById(location.hash.slice(1))?.scrollIntoView();
  main.focus({ preventScroll: true });
}

function notFound() {
  setTitle('Page not found');
  main.innerHTML = `<div class="wrap section"><h1 class="display">Not here.</h1><p class="lede">This page does not exist. The collections and S/CELL Night are a good place to start.</p><div class="btn-row"><a class="btn" href="/collections" data-link>Explore the collections</a></div></div>`;
}

document.addEventListener('click', (e) => {
  const a = e.target.closest('a');
  if (a && a.origin === location.origin && !a.target && !e.metaKey && !e.ctrlKey && !a.hasAttribute('download')) {
    const href = a.getAttribute('href');
    if (href && href.startsWith('/') && !href.startsWith('/api/')) {
      e.preventDefault();
      if (href.includes('#') && href.split('#')[0] === location.pathname) {
        document.getElementById(href.split('#')[1])?.scrollIntoView({ behavior: 'smooth' });
        return;
      }
      navigate(href);
      return;
    }
  }
  const btn = e.target.closest('[data-action]');
  if (btn && state.handlers.click[btn.dataset.action]) {
    e.preventDefault();
    run(btn, () => state.handlers.click[btn.dataset.action](btn));
  }
});

document.addEventListener('submit', (e) => {
  const form = e.target.closest('form[data-form]');
  if (!form) return;
  e.preventDefault();
  const fn = state.handlers.submit[form.dataset.form];
  if (!fn) return;
  const err = form.querySelector('.form-error');
  if (err) err.textContent = '';
  run(form.querySelector('[type=submit]'), () => fn(formData(form), form), (msg) => { if (err) err.textContent = msg; else toast(msg, 'error'); });
});

async function run(button, fn, onError = (m) => toast(m, 'error')) {
  if (button) button.disabled = true;
  try { await fn(); } catch (e) {
    if (e.status === 401) { navigate(`/signin?next=${encodeURIComponent(location.pathname)}`); toast('Sign in to continue.'); }
    else onError(e.message);
  } finally { if (button && button.isConnected) button.disabled = false; }
}

window.addEventListener('popstate', render);
document.querySelector('.menu-toggle').addEventListener('click', (e) => {
  const nav = document.getElementById('nav');
  const open = nav.classList.toggle('open');
  e.currentTarget.setAttribute('aria-expanded', String(open));
});

async function refreshMe() {
  state.me = (await api('/api/auth/me')).user;
  const el = document.getElementById('nav-account');
  el.innerHTML = state.me
    ? `${state.me.role === 'admin' ? '<a href="/admin" data-link>Admin</a>' : ''}${state.me.role === 'artist' ? '<a href="/dashboard/artist" data-link>Artist dashboard</a>' : ''}${state.me.role === 'sponsor' ? '<a href="/dashboard/sponsor" data-link>Sponsor dashboard</a>' : ''}<a class="btn small ghost" href="/account" data-link>${esc(state.me.displayName)}</a>`
    : `<a href="/signin" data-link>Sign in</a><a class="btn small" href="/join" data-link>Join</a>`;
  return state.me;
}

// ---------- Shared bits ----------
function artistRow(a) {
  const statusText = { live: 'S/CELL Night live', upcoming: 'Coming soon', released: 'Released' }[a.status];
  return `<a class="artist-row" href="/artists/${esc(a.slug)}">
    <span class="artist-name">${esc(a.name)}</span>
    <span class="artist-sub">${esc(a.category)}${a.sponsor ? `, supported by ${esc(a.sponsor.name)}` : ''}${a.isDemo ? ' (demo artist)' : ''}</span>
    <span class="artist-side"><span class="status ${esc(a.status)}">${statusText}</span><span class="fill">${a.cardsOwned}<span class="fine"> of 15 owned</span></span></span>
  </a>`;
}

function cardTile(c, caption = '') {
  return `<a class="plate-link" href="/cards/${c.id}">${plate(c)}</a>
    <div class="plate-caption">${caption || `<span>${esc(STATUS_LABEL[c.status] || c.status)}</span><strong>${c.listing ? taka(c.listing.price) : c.lastPrice ? `Last ${taka(c.lastPrice)}` : ''}</strong>`}</div>`;
}

const SAMPLE = { number: 1, series: 'official', orientation: 'landscape', theme: 't1', title: 'Some stories deserve to be owned', body: 'Engraved in steel. Numbered 01 to 15. Verified by chip.', code: 'SCEL-01-A7F2', artist: { name: 'Your artist' } };

// ---------- Home ----------
async function home() {
  setTitle('');
  const [{ artists }, { auctions }, { items: show }] = await Promise.all([api('/api/artists'), api('/api/auctions'), api('/api/showcase').catch(() => ({ items: [] }))]);
  const live = auctions.find((a) => a.status === 'live') || auctions.find((a) => a.status === 'scheduled');
  const offset = live ? live.serverTime - Date.now() : 0;
  const slot = (from, to) => Array.from({ length: to - from + 1 }, (_, i) => `<span class="slot">${pad2(from + i)}</span>`).join('');

  main.innerHTML = `
  <section class="shelf-section" aria-label="Featured cards"><div id="shelf"></div></section>
  <section class="hero intro">
    <div class="wrap hero-grid">
      <div class="hero-copy">
        <p class="kicker">Engraved steel collectibles · খোদাই করা ইস্পাতের সংগ্রহ</p>
        <h1 class="display steel-text"><span>Fifteen.</span><span>One artist.</span><span>Forever.</span></h1>
        <p class="lede">S/CELL engraves an artist's own words and art into 15 numbered steel cards. There will never be a sixteenth. Bid at S/CELL Night, own a verified piece of the story, and trade it on the official market.</p>
        <div class="btn-row">
          <a class="btn heat" href="/night">${live && live.status === 'live' ? 'Bid at the live S/CELL Night' : 'See S/CELL Night'}</a>
          <a class="btn ghost" href="/collections">Explore the collections</a>
        </div>
      </div>
      <div class="hero-card">
        <div class="living" id="living">
          ${plate({ ...SAMPLE, title: 'Words are rivers', body: 'They change the land they pass through.', artist: { name: 'Meghla Sultana', slug: 'meghla-sultana' } })}
          <p class="living-hint">Grab the card and pull. Steel remembers its shape.</p>
        </div>
        <div class="structure" aria-label="How the 15 cards are divided">
          <p class="structure-cap">Every collection, the same fifteen</p>
          <div class="structure-row">
            <div class="slot-group l5"><div class="slots">${slot(1, 5)}</div><p>5 foundational thoughts</p></div>
            <div class="slot-group l3"><div class="slots">${slot(6, 8)}</div><p>3 creative philosophies</p></div>
            <div class="slot-group l2"><div class="slots">${slot(9, 10)}</div><p>2 career reflections</p></div>
            <div class="slot-group p5"><div class="slots">${slot(11, 15)}</div><p>5 artistic visuals</p></div>
          </div>
          <p class="structure-note">Cards 1–10 carry the artist's words. Cards 11–15 carry the art they chose. Each is one of one.</p>
        </div>
      </div>
    </div>
  </section>

  ${marqueeHtml()}

  <section class="manifesto dark-band" aria-labelledby="manifesto-h">
    ${manifestoCorners()}
    <div class="wrap manifesto-inner">
      <h2 class="steel-text big-head" id="manifesto-h" data-fade>Why steel</h2>
      <p class="reveal-text" id="reveal">A t-shirt fades. A poster tears. A stream disappears from a playlist. S/CELL keeps what makes an artist matter: what they believe, how they work, the nights that changed them and the images they chose. Engraved in steel, numbered one to fifteen, and never made again.</p>
      <a class="btn heat" href="/how-it-works" data-fade>How S/CELL works</a>
    </div>
  </section>

  <section class="nightfield" id="nightfield" aria-label="S/CELL Night">
    <canvas class="nf-canvas" aria-hidden="true"></canvas>
    <div class="nf-vignette" aria-hidden="true"></div>
    <div class="nf-ui">
      <h2 class="nf-head">Engraved, not printed.</h2>
      <p class="nf-cap">Fifteen cards. One night.<br>${live && live.status === 'live' ? 'Bidding is open right now.' : 'Bid live at the next S/CELL Night.'}</p>
      <a class="nf-go" href="/night" aria-label="Go to S/CELL Night"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 12h16M14 6l6 6-6 6"/></svg></a>
      <div class="nf-corner"><span>Scroll to wander</span><i></i>
        <button class="nf-sound" type="button" aria-pressed="false" aria-label="Ambient sound"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9.5v5h3.5L12 18V6L7.5 9.5Z"/><path class="w" d="M15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11"/><path class="x" d="m16 10 4 4m0-4-4 4"/></svg></button>
      </div>
    </div>
  </section>

  <section class="night section">
    <div class="wrap">
      ${live ? `
        <div class="night-head">
          <div>
            <p class="kicker">${live.status === 'live' ? 'Bidding is open' : 'Coming up'}</p>
            <h2 class="h2">${esc(live.title)}</h2>
            <p class="lede">All 15 of ${esc(live.artist.name)}'s cards, auctioned one by one. Bidding starts at ${taka(live.reserve)}.</p>
          </div>
          <div class="countdown" id="cd">${countdown(live.status === 'live' ? live.endsAt : live.startsAt, offset)}<small>${live.status === 'live' ? 'until bidding closes' : 'until bidding opens'}</small></div>
        </div>
        <div class="lot-grid">
          ${live.lots.slice(0, 4).map((l) => `<div class="lot"><a class="plate-link" href="/night/${live.id}">${plate({ ...l, series: 'official', artist: live.artist })}</a>
            <div class="lot-meta"><span>${l.bids} ${l.bids === 1 ? 'bid' : 'bids'}</span><span class="lot-bid">${l.currentBid ? taka(l.currentBid) : `From ${taka(live.reserve)}`}</span></div></div>`).join('')}
        </div>
        <p style="margin-top:32px"><a class="btn straw" href="/night/${live.id}">See all 15 cards and bid</a></p>
      ` : `<h2 class="h2">The next S/CELL Night is being prepared</h2><p class="lede">Vote for the artist you want next, and get an alert when bidding opens.</p><a class="btn straw" href="/night">Vote for the next artist</a>`}
    </div>
  </section>

  <section class="services" aria-labelledby="svc-h">
    <div class="wrap">
      <h2 class="big-head ink" id="svc-h" data-fade>How it works</h2>
      <ol class="svc-list">
        <li class="svc" data-fade style="--d:0.0s"><span class="svc-n">01</span><div><h3>Collaboration</h3><p>S/CELL works with a living artist on what their 15 cards should say and show.</p></div></li>
        <li class="svc" data-fade style="--d:0.1s"><span class="svc-n">02</span><div><h3>Creation</h3><p>Their words and art are laser-engraved into stainless steel and numbered 01 to 15.</p></div></li>
        <li class="svc" data-fade style="--d:0.2s"><span class="svc-n">03</span><div><h3>Authentication</h3><p>Every card carries its own chip and a record in the S/CELL registry.</p></div></li>
        <li class="svc" data-fade style="--d:0.3s"><span class="svc-n">04</span><div><h3>S/CELL Night</h3><p>The artist plays a short unplugged set, then the cards are auctioned live.</p></div></li>
        <li class="svc" data-fade style="--d:0.4s"><span class="svc-n">05</span><div><h3>Ownership</h3><p>Winners receive the card, its certificate and a verified owner account.</p></div></li>
        <li class="svc" data-fade style="--d:0.5s"><span class="svc-n">06</span><div><h3>Official resale</h3><p>Owners can resell on the marketplace. The artist earns 13% of every resale up to ৳1 lakh (10% above it), for as long as the card trades.</p></div></li>
      </ol>
    </div>
  </section>

  <section class="stack-section" aria-labelledby="stack-h">
    <div class="wrap">
      <h2 class="big-head steel-text" id="stack-h" data-fade>Collections</h2>
      <p class="stack-sub" data-fade>Each one closed at fifteen, forever.</p>
      <div class="stack" id="stack">${artists.slice(0, 4).map((a, i) => stackCard(a, i)).join('') || '<p class="empty">The first collection is on its way.</p>'}</div>
      <p class="stack-more"><a class="btn ghost light" href="/collections">All collections</a></p>
    </div>
  </section>

  <section class="section">
    <div class="wrap split">
      <div>
        <h2 class="h2">Culture deserves more than merchandise</h2>
        <p class="subtitle">Made to be kept for a lifetime, not worn for a season.</p>
        <p class="lede" style="margin-top:18px">A t-shirt fades. A poster tears. S/CELL keeps what makes an artist matter: their beliefs, their way of working, the nights that changed them, and the images they chose. In steel, numbered, and only fifteen times.</p>
      </div>
      <div class="panel">
        <h3 class="h3">Why collectors trust it</h3>
        <dl class="facts" style="margin-top:14px">
          <dt>Every owner</dt><dd>ID-checked with NID and phone</dd>
          <dt>Every card</dt><dd>Chip-verified and registered</dd>
          <dt>Every payment</dt><dd>Held by a licensed payment partner</dd>
          <dt>Every resale</dt><dd>13% to the artist up to ৳1 lakh, 10% above, recorded publicly</dd>
          <dt>Every number</dt><dd>Never reissued</dd>
        </dl>
      </div>
    </div>
  </section>

  <section class="section-tight">
    <div class="wrap">
      <h2 class="h2">Find your place in S/CELL</h2>
      <p class="subtitle">Every facility, option and rule, explained for the people it is for.</p>
      <div class="audience-grid" style="margin-top:28px">
        <a class="audience" href="/guides/collectors"><span class="audience-title">For collectors</span><span class="subtitle">Bid, own, trade and rank.</span><span class="audience-go">Open the guide</span></a>
        <a class="audience" href="/guides/artists"><span class="audience-title">For artists</span><span class="subtitle">Create your fifteen and earn on every resale.</span><span class="audience-go">Open the guide</span></a>
        <a class="audience" href="/guides/sponsors"><span class="audience-title">For sponsors and investors</span><span class="subtitle">Back a collection and share in how it travels.</span><span class="audience-go">Open the guide</span></a>
      </div>
    </div>
  </section>

  <section class="cta-band section-tight">
    <div class="wrap split">
      <div><h2 class="h2">Are you an artist, or a brand that backs culture?</h2><p class="subtitle">Start a conversation. Every partnership begins with one.</p></div>
      <div class="btn-row"><a class="btn" href="/partners">Become an artist partner</a><a class="btn ghost" href="/partners#sponsors">Sponsor a collection</a></div>
    </div>
  </section>`;

  if (live) {
    const cd = document.getElementById('cd');
    const target = live.status === 'live' ? live.endsAt : live.startsAt;
    state.timers.push(setInterval(() => { if (cd.firstChild) cd.firstChild.textContent = countdown(target, offset); }, 1000));
  }
  const shelfEl = document.getElementById('shelf');
  if (show.length) {
    const items = show.map((c) => ({
      img: cardImage(c), group: c.artist.name, title: c.title,
      sub: `${c.artist.name} · ${c.artist.category}`,
      meta: `Card ${pad2(c.number)} / 15 — ${THEME_LABEL[c.theme] || ''}`,
      body: cardStatusLine(c),
      credit: c.artist.isDemo ? 'Fictional demo artist, shown to explain how S/CELL works.' : '',
      href: `/cards/${c.id}`, hrefLabel: 'See this card',
    }));
    const startAt = Math.max(0, items.findIndex((i) => i.group === (live?.artist?.name || '')));
    state.cleanups.push(mountShelf(shelfEl, items, { start: startAt + 2, label: 'Featured S/CELL cards' }));
  } else shelfEl.closest('section').remove();

  const living = document.getElementById('living');
  const livingImg = living?.querySelector('.plate.has-art img');
  if (livingImg) state.cleanups.push(mountLivingCard(living, livingImg.getAttribute('src')));
  const mq = document.getElementById('marquee');
  if (mq) state.cleanups.push(mountMarquee(mq));
  state.cleanups.push(mountRevealText(document.getElementById('reveal')));
  const stack = document.getElementById('stack');
  if (stack?.querySelector('.stack-item')) state.cleanups.push(mountStack(stack));
  state.cleanups.push(mountSparkField(document.getElementById('nightfield')));
  state.cleanups.push(mountFadeIns(main));
}

function artCards(filter) {
  const out = [];
  for (const slug of state.config?.cardArt || []) for (let n = 1; n <= 15; n++) if (filter(n)) out.push({ slug, n });
  return out;
}
function marqueeHtml(urls = artCards((n) => n <= 10).map(({ slug, n }) => `/img/cards/${slug}/${pad2(n)}.webp`)) {
  const land = urls;
  if (!land.length) return '';
  const half = Math.ceil(land.length / 2);
  const row = (list) => [...list, ...list, ...list].map((u) => `<img src="${u}" alt="" loading="lazy" decoding="async" width="420" height="265">`).join('');
  return `<section class="marquee dark-band" id="marquee" aria-label="Cards from the collections">
    <div class="mq-row">${row(land.slice(0, half))}</div>
    <div class="mq-row">${row(land.slice(half))}</div>
  </section>`;
}
function manifestoCorners() {
  const p = artCards((n) => n >= 11 && n <= 14).filter((_, i) => i % 3 === 0).slice(0, 4);
  return p.map(({ slug, n }, i) => `<img class="corner-card c${i}" data-fade src="/img/cards/${slug}/${pad2(n)}.webp" alt="" loading="lazy" aria-hidden="true">`).join('');
}
function stackCard(a, i) {
  const statusText = { live: 'S/CELL Night live', upcoming: 'Coming soon', released: 'Released' }[a.status];
  const art = (state.config?.cardArt || []).includes(a.slug);
  const img = (n) => `/img/cards/${a.slug}/${pad2(n)}.webp`;
  return `<div class="stack-item" style="--i:${i}">
    <article class="stack-card">
      <header class="stack-top">
        <span class="stack-n">${pad2(i + 1)}</span>
        <div class="stack-name"><span class="stack-cat">${esc(a.category)}${a.isDemo ? ' · demo artist' : ''}</span><h3>${esc(a.name)}</h3><span class="stack-status">${statusText} · ${a.cardsOwned} of 15 owned</span></div>
        <a class="btn ghost light" href="/artists/${esc(a.slug)}">View collection</a>
      </header>
      ${art ? `<div class="stack-imgs">
        <div class="col1"><img src="${img(1)}" alt="" loading="lazy"><img src="${img(9)}" alt="" loading="lazy"></div>
        <div class="col2"><img src="${img(11)}" alt="" loading="lazy"></div>
      </div>` : `<p class="stack-bio">${esc(a.bio || '')}</p>`}
    </article>
  </div>`;
}

function cardStatusLine(c) {
  if (c.status === 'auction') return `On the block at the live S/CELL Night. Bidding started at ${taka(state.config?.firstSale?.defaultReserve || 1500)}.`;
  if (c.status === 'listed' && c.listing) return `For sale on the official market at ${taka(c.listing.price)}${c.owner ? `, from ${c.owner.displayName}` : ''}.`;
  if (c.owner) return `Owned by ${c.owner.displayName}${c.lastPrice ? `. Last sold for ${taka(c.lastPrice)}` : ''}.`;
  return 'Not sold yet. It goes to auction, one of fifteen, at its artist\'s S/CELL Night.';
}

// ---------- Private concept room ----------
async function conceptPage() {
  setTitle('Private concept room');
  let meta = document.querySelector('meta[name=robots]');
  if (!meta) { meta = document.createElement('meta'); meta.name = 'robots'; document.head.appendChild(meta); }
  meta.content = 'noindex, nofollow';
  state.cleanups.push(() => meta.remove());
  const data = await api('/api/concept');
  if (data.locked) {
    main.innerHTML = `<section class="section"><div class="wrap narrow">
      <p class="kicker">Private</p><h1 class="h2">Concept room</h1>
      <p class="subtitle">Proposals prepared for artists and their teams. Not public, not for sale.</p>
      ${data.codeEnabled ? `<form class="form" data-form="unlock" style="margin-top:28px">
        <label class="field"><span>Access code</span><input class="input" name="code" type="password" autocomplete="off" required></label>
        <button class="btn" type="submit">Open the concept room</button></form>`
      : `<p class="notice" style="margin-top:28px">Sign in with an S/CELL admin account to open this room.</p><a class="btn" href="/signin">Sign in</a>`}
    </div></section>`;
    state.handlers.submit.unlock = async (d) => {
      await api('/api/concept/unlock', { method: 'POST', body: d });
      render();
    };
    return;
  }
  if (!data.artists.length) {
    main.innerHTML = '<section class="section"><div class="wrap narrow"><h1 class="h2">Concept room</h1><p class="subtitle">The concept files are not installed on this server yet.</p></div></section>';
    return;
  }
  const img = (k, f) => `/api/concept/img/${k}/${f}.webp`;
  main.innerHTML = `
  <section class="concept-banner"><div class="wrap"><p><b>Concept proposal.</b> Not affiliated with or endorsed by the artists named here. Nothing on this page is for sale. Every message on the cards will be written by the artist.</p></div></section>
  <section class="shelf-section" aria-label="Founding Set visuals"><div id="shelf"></div></section>
  ${marqueeHtml(data.artists.flatMap((a) => a.cards.filter((c) => c.orientation === 'landscape').map((c) => img(a.key, pad2(c.number)))))}
  <section class="manifesto dark-band concept-intro" aria-labelledby="ci-h">
    ${data.artists.map((a, i) => `<img class="corner-card c${i}" data-fade src="${img(a.key, i === 0 ? '11' : i === 1 ? '12' : '13')}" alt="" aria-hidden="true">`).join('')}
    <img class="corner-card c3" data-fade src="${img(data.artists[0].key, '14')}" alt="" aria-hidden="true">
    <div class="wrap manifesto-inner">
      <h1 class="steel-text big-head" id="ci-h" data-fade>The Founding Set</h1>
      <p class="reveal-text" id="reveal">Three artists who shaped Bangla band music, each told in fifteen steel cards. James, the City Bard, in violet. Oni Hasan, six strings abroad, in steel blue. Hamin Ahmed, Miles since 1979, in warm bronze. Every theme, title and drawing here is a proposal for the artist to change, and every message will be written in their own words.</p>
      <nav class="concept-tabs" aria-label="Artists" data-fade>${data.artists.map((a) => `<a href="#c-${a.key}" style="--acc:${a.tint[2]}">${esc(a.name)} <span class="bnin">${esc(a.nameBn)}</span></a>`).join('')}</nav>
    </div>
  </section>
  <section class="stack-section concept-stack" aria-labelledby="cs-h">
    <div class="wrap">
      <h2 class="big-head steel-text" id="cs-h" data-fade>The artists</h2>
      <p class="stack-sub" data-fade>প্রতিষ্ঠার সেট · Concept proposal, not affiliated or endorsed</p>
      <div class="stack" id="stack">${data.artists.map((a, i) => `<div class="stack-item" style="--i:${i}">
        <article class="stack-card" style="border-color:${a.tint[2]}">
          <header class="stack-top">
            <span class="stack-n">${pad2(i + 1)}</span>
            <div class="stack-name"><span class="stack-cat">${esc(a.subtitle)} · <span class="bnin">${esc(a.subtitleBn)}</span></span><h3>${esc(a.name)} · ${esc(a.title)}</h3><span class="stack-status bnin">${esc(a.nameBn)} · ${esc(a.titleBn)}</span></div>
            <a class="btn ghost light" href="#c-${a.key}">See all 15 cards</a>
          </header>
          <div class="stack-imgs">
            <div class="col1"><img src="${img(a.key, '01')}" alt="" loading="lazy"><img src="${img(a.key, '09')}" alt="" loading="lazy"></div>
            <div class="col2"><img src="${img(a.key, '15')}" alt="" loading="lazy"></div>
          </div>
        </article></div>`).join('')}</div>
    </div>
  </section>
  <section class="nightfield" id="nightfield" aria-label="The Founding Set night">
    <canvas class="nf-canvas" aria-hidden="true"></canvas>
    <div class="nf-vignette" aria-hidden="true"></div>
    <div class="nf-ui">
      <h2 class="nf-head">Forty-five cards. One night.</h2>
      <p class="nf-cap">Three artists, one S/CELL Night.<br>Only once they say yes.</p>
      <a class="nf-go" href="#c-${data.artists[0].key}" aria-label="See the cards"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 12h16M14 6l6 6-6 6"/></svg></a>
      <div class="nf-corner"><span>Scroll to wander</span><i></i>
        <button class="nf-sound" type="button" aria-pressed="false" aria-label="Ambient sound"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9.5v5h3.5L12 18V6L7.5 9.5Z"/><path class="w" d="M15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11"/><path class="x" d="m16 10 4 4m0-4-4 4"/></svg></button>
      </div>
    </div>
  </section>
  ${data.artists.map((a) => `
  <section class="section concept-artist" id="c-${a.key}" style="--acc:${a.tint[1]};--acc2:${a.tint[2]}">
    <div class="wrap">
      <div class="concept-head">
        <div>
          <p class="kicker acc">${esc(a.name)} · <span class="bnin">${esc(a.nameBn)}</span></p>
          <h2 class="display concept-title">${esc(a.title)}</h2>
          <p class="concept-bn bnin">${esc(a.titleBn)}</p>
          <p class="subtitle">${esc(a.subtitle)} · <span class="bnin">${esc(a.subtitleBn)}</span></p>
          <ul class="concept-facts">${a.facts.map((f) => `<li>${esc(f)}</li>`).join('')}</ul>
          <p class="fine">Facts to be confirmed with the artist's management before this is shared.</p>
        </div>
        <img class="concept-back" src="${img(a.key, 'back')}" alt="Back design for ${esc(a.name)}: chip, card ID, edition, story line, verify link, signature space and sponsor slot" loading="lazy">
      </div>
      ${[['t1', 'Roots and beginnings · শুরুর গল্প', 1, 5], ['t2', 'The craft · শিল্পের পথ', 6, 8], ['t3', 'Defining moments · মোড় ঘোরানো মুহূর্ত', 9, 10], ['portrait', 'Artistic visuals · দৃশ্যকল্প', 11, 15]].map(([t, label, from, to]) => `
        <h3 class="concept-chapter"><span>${pad2(from)}–${pad2(to)}</span>${esc(label)}</h3>
        <div class="concept-grid ${t === 'portrait' ? 'portraits' : ''}">
          ${a.cards.filter((c) => c.number >= from && c.number <= to).map((c) => `<figure><img src="${img(a.key, pad2(c.number))}" alt="${esc(`${a.name} card ${c.number}: ${c.title}`)}" loading="lazy"><figcaption><b>${pad2(c.number)}</b> ${esc(c.title)}${c.prompt ? `<span>${esc(c.prompt)}</span>` : ''}</figcaption></figure>`).join('')}
        </div>`).join('')}
    </div>
  </section>`).join('')}
  <section class="section-tight"><div class="wrap"><p class="fine">Prepared by S/CELL for private discussion with each artist and their management. Card themes, titles and art can all change. Facts are drawn from public sources and must be confirmed before use.</p></div></section>`;
  const items = data.artists.flatMap((a) => a.cards.filter((c) => c.orientation === 'portrait').map((c) => ({
    img: img(a.key, pad2(c.number)), group: a.name, title: c.title, sub: `${a.name} · ${a.title}`,
    meta: `Card ${pad2(c.number)} / 15 — ${c.chapter}`, body: `${c.titleBn} · ${a.subtitle}`,
    credit: 'Concept only. Not affiliated with or endorsed by the artist.', href: `#c-${a.key}`, hrefLabel: 'See the full set',
  })));
  state.cleanups.push(mountShelf(document.getElementById('shelf'), items, { start: 2, label: 'Founding Set visual cards', wordLeft: 'প্রতিষ্ঠা', wordRight: 'সেট' }));
  const mq = document.getElementById('marquee');
  if (mq) state.cleanups.push(mountMarquee(mq));
  state.cleanups.push(mountRevealText(document.getElementById('reveal')));
  state.cleanups.push(mountStack(document.getElementById('stack')));
  state.cleanups.push(mountSparkField(document.getElementById('nightfield')));
  state.cleanups.push(mountFadeIns(main));
}

// ---------- Collections ----------
async function collections() {
  setTitle('Collections');
  const { artists } = await api('/api/artists');
  main.innerHTML = `
    <div class="wrap page-head">
      <h1 class="display">Collections</h1>
      <p class="lede">Each artist has exactly 15 cards: five foundational thoughts, three creative philosophies, two career reflections and five artistic visuals.</p>
    </div>
    <div class="wrap"><div class="artist-rows">${artists.map(artistRow).join('') || '<p class="empty">No collections yet.</p>'}</div></div>`;
}

async function artistPage(slug) {
  const { artist: a } = await api(`/api/artists/${slug}`);
  setTitle(a.name);
  const official = a.cards.filter((c) => c.series === 'official');
  const reward = a.cards.filter((c) => c.series === 'reward');
  const group = (theme, count) => {
    const cs = official.filter((c) => c.theme === theme);
    return `<div class="group-head"><h2>${THEME_LABEL[theme]}</h2><span>${count} ${count === 1 ? 'card' : 'cards'}</span></div>
      <div class="plates ${theme === 'portrait' ? 'portrait' : 'landscape'}">${cs.map((c) => `<div>${cardTile(c)}</div>`).join('')}</div>`;
  };
  const au = a.auction;
  main.innerHTML = `
    <div class="wrap page-head">
      <p class="kicker"><span class="status ${esc(a.status)}">${{ live: 'S/CELL Night live', upcoming: 'Coming soon', released: 'Released' }[a.status]}</span></p>
      <h1 class="display">${esc(a.name)}</h1>
      <p class="lede">${esc(a.category)}. ${esc(a.bio)}</p>
      <div class="stat-grid" style="margin-top:28px;max-width:720px">
        <div class="stat"><b>${a.cardsOwned} / 15</b><span>cards with owners</span></div>
        <div class="stat"><b>${a.sponsor ? esc(a.sponsor.name) : 'Open'}</b><span>${a.sponsor ? 'collection sponsor' : 'sponsorship available'}</span></div>
        ${au ? `<div class="stat"><b>${au.status === 'closed' ? date(au.endsAt) : dateTime(au.status === 'live' ? au.endsAt : au.startsAt)}</b><span>${au.status === 'closed' ? 'S/CELL Night held' : au.status === 'live' ? 'bidding closes' : 'S/CELL Night'}</span></div>` : ''}
      </div>
      ${au && au.status !== 'closed' ? `<p style="margin-top:28px"><a class="btn straw" href="/night/${au.id}">${au.status === 'live' ? 'Bid now at S/CELL Night' : 'See the S/CELL Night'}</a></p>` : ''}
      ${a.isDemo ? '<p class="fine" style="margin-top:16px">This is a fictional demo artist, shown so you can try the platform.</p>' : ''}
    </div>
    <div class="wrap section-tight" style="padding-top:0">
      ${group('t1', 5)}${group('t2', 3)}${group('t3', 2)}${group('portrait', 5)}
      ${reward.length ? `<div class="group-head"><h2>Reward Edition</h2><span>Separate series, outside the official 15</span></div>
        <div class="plates landscape">${reward.map((c) => `<div>${cardTile(c)}</div>`).join('')}</div>` : ''}
    </div>`;
}

// ---------- Card ----------
async function cardPage(id) {
  const { card: c, history } = await api(`/api/cards/${id}`);
  const me = state.me;
  const cfg = state.config;
  setTitle(`${c.artist.name} ${c.series === 'reward' ? 'R' : ''}${pad2(c.number)}`);
  const p = c.pricing;

  let action = '';
  if (c.status === 'auction') {
    action = `<p>This card is in a live S/CELL Night.</p><a class="btn straw" href="/night">Go to the auction</a>`;
  } else if (c.isOwner && c.status === 'owned') {
    action = `<h3 class="h3">Sell this card</h3>
      <p class="fine">The minimum official price is ${taka(p.minPrice)}${p.decaying ? `, after a ${p.decayPct}% decay because it has gone unsold for over a year` : `, the last price plus ${taka(cfg.resale.minStep)}`}. When it sells, you receive ${cfg.resale.low.seller}% (${cfg.resale.high.seller}% above ${taka(cfg.resale.tierBreak)}).</p>
      <form class="form" data-form="list"><label class="field"><span>Your price (৳)</span><input class="input" name="price" type="number" min="${p.minPrice}" step="1" value="${p.minPrice}" required></label>
      <p class="form-error"></p><div><button class="btn" type="submit">List for sale</button></div></form>`;
  } else if (c.isOwner && c.status === 'listed') {
    action = `<h3 class="h3">Listed for ${taka(c.listing.price)}</h3><p class="fine">Buyers see it on the marketplace now.</p><button class="btn ghost" data-action="cancel" data-id="${c.listing.id}">Cancel the listing</button>`;
  } else if (c.status === 'listed' && c.listing) {
    const total = c.listing.price + c.listing.transferFee;
    action = `<h3 class="h3">For sale</h3>
      <dl class="facts" style="margin:12px 0 18px"><dt>Price</dt><dd>${taka(c.listing.price)}</dd><dt>Secure-transfer charge</dt><dd>${taka(c.listing.transferFee)}</dd><dt>You pay</dt><dd>${taka(total)}</dd></dl>
      <p class="fine">Your payment is held by the payment partner for ${cfg.resale.verifyDays} days. You confirm the chip when the card reaches you, then the seller is paid.</p>
      ${me ? `${me.walletCredit ? `<label class="check" style="margin-bottom:12px"><input type="checkbox" id="use-credit"> Use my ${taka(me.walletCredit)} credit</label>` : ''}<button class="btn" data-action="buy" data-id="${c.listing.id}">Buy for ${taka(total)}</button>`
        : `<a class="btn" href="/signin?next=/cards/${c.id}">Sign in to buy</a>`}`;
  } else if (c.status === 'escrow') {
    action = '<h3 class="h3">Transfer in progress</h3><p class="fine">This card has been bought and is in its verification period.</p>';
  } else if (c.status === 'retired') {
    action = '<h3 class="h3">Retired</h3><p class="fine">This card went unsold until its official price reached zero, so it has left the official market.</p>';
  } else if (c.status === 'vault') {
    action = '<h3 class="h3">Not yet sold</h3><p class="fine">This card will be offered at a coming S/CELL Night.</p>';
  }

  main.innerHTML = `
    <div class="wrap section-tight">
      <p class="fine"><a href="/artists/${esc(c.artist.slug)}">${esc(c.artist.name)}</a> / ${esc(THEME_LABEL[c.theme])}</p>
      <div class="split wide-left" style="margin-top:20px">
        <div>${plate(c)}</div>
        <div>
          <h1 class="h2">${esc(c.title)}</h1>
          <p class="lede" style="margin-top:12px">${c.series === 'reward' ? 'Reward Edition card' : `Card ${pad2(c.number)} of 15`} by ${esc(c.artist.name)}.</p>
          <div class="panel" style="margin-top:20px">
            <dl class="facts">
              <dt>Status</dt><dd>${esc(STATUS_LABEL[c.status])}</dd>
              <dt>Owner</dt><dd>${c.owner ? esc(c.owner.displayName) : '—'}</dd>
              <dt>First sale</dt><dd>${taka(c.firstSalePrice)}</dd>
              <dt>Last official price</dt><dd>${taka(c.lastPrice)}</dd>
              <dt>Official trades</dt><dd>${c.tradeCount}</dd>
              ${p ? `<dt>Next minimum price</dt><dd>${p.retired ? 'Retired' : taka(p.minPrice)}</dd>` : ''}
              <dt>Card ID</dt><dd>${esc(c.code)}</dd>
            </dl>
          </div>
          ${action ? `<div class="panel">${action}</div>` : ''}
          ${c.isOwner ? `<div class="panel"><h3 class="h3">Your certificate</h3><p class="fine">Chip ID: <strong>${esc(c.chipUid)}</strong>. Give it to your buyer only after they have paid through S/CELL.</p></div>` : ''}
        </div>
      </div>
      <h2 class="h3" style="margin:48px 0 12px">Ownership history</h2>
      <div class="table-scroll"><table class="table"><thead><tr><th>Date</th><th>Type</th><th>From</th><th>To</th><th class="r">Price</th></tr></thead><tbody>
        ${history.map((h) => `<tr><td>${date(h.completedAt || h.createdAt)}</td><td>${{ first_sale: 'S/CELL Night', resale: h.status === 'escrow' ? 'Resale (verifying)' : 'Official resale', reward: 'Reward issued' }[h.kind]}</td><td>${esc(h.seller || 'S/CELL')}</td><td>${esc(h.buyer)}</td><td class="r">${taka(h.price)}</td></tr>`).join('') || '<tr><td colspan="5">No owners yet.</td></tr>'}
      </tbody></table></div>
    </div>`;

  on('submit', 'list', async (d) => {
    await api(`/api/cards/${c.id}/list`, { method: 'POST', body: { price: Number(d.price) } });
    toast('Listed. Your card is on the marketplace.');
    render();
  });
  on('click', 'cancel', async (b) => {
    await api(`/api/listings/${b.dataset.id}/cancel`, { method: 'POST' });
    toast('Listing cancelled.');
    render();
  });
  on('click', 'buy', async (b) => {
    const r = await api(`/api/listings/${b.dataset.id}/buy`, { method: 'POST', body: { useCredit: !!document.getElementById('use-credit')?.checked } });
    toast(`Bought. ${taka(r.charged)} is held for ${r.verifyDays} days. Confirm the chip from your account when the card arrives.`);
    await refreshMe();
    navigate('/account#trades');
  });
}

// ---------- S/CELL Night ----------
async function nightPage(id) {
  setTitle('S/CELL Night');
  const [{ auctions }, pollData] = await Promise.all([api('/api/auctions'), api('/api/polls/current')]);
  const current = id ? auctions.find((a) => String(a.id) === id) : auctions.find((a) => a.status !== 'closed') || auctions[0];
  const past = auctions.filter((a) => a !== current);
  const me = state.me;

  const lotHtml = (au) => au.lots.map((l) => `
    <div class="lot" data-lot="${l.id}">
      <a class="plate-link" href="/cards/${l.cardId}">${plate({ ...l, series: 'official', artist: au.artist })}</a>
      <div class="lot-meta"><span>${l.bids} ${l.bids === 1 ? 'bid' : 'bids'}${l.leading ? ', <span class="leading">you lead</span>' : ''}</span>
        <span class="lot-bid">${l.status === 'sold' ? `Sold ${taka(l.currentBid)}` : l.status === 'unsold' ? 'Unsold' : l.currentBid ? taka(l.currentBid) : `From ${taka(au.reserve)}`}</span></div>
      ${au.status === 'live' && l.status === 'open' ? `<form class="lot-form" data-form="bid" data-lot="${l.id}">
        <input class="input" id="bid-${l.id}" name="amount" type="number" inputmode="numeric" min="${l.nextMin}" step="1" value="${l.nextMin}" aria-label="Your bid for card ${pad2(l.number)} in taka">
        <input type="hidden" name="lot" value="${l.id}"><button class="btn straw small" type="submit">Bid</button></form>` : ''}
    </div>`).join('');

  const pollHtml = () => {
    const pd = pollData;
    if (!pd.poll) return '';
    const max = Math.max(1, ...pd.poll.options.map((o) => o.points));
    return `<section class="section-tight" style="border-top:1px solid #3a424a;margin-top:56px" id="vote">
      <div class="split">
        <div><h2 class="h2">${esc(pd.poll.title)}</h2>
          <p class="lede">The Next Artist Vote runs alongside every S/CELL Night. Votes count more for collectors: verified fans 1, Blue badge 2, resale buyers 3, plus 1 for each round mark. The top three go to S/CELL's artist review; an artist can still say no.</p>
          ${pd.myVote ? `<p class="leading">You voted with a weight of ${pd.myVote.weight}.</p>` : me ? `<p class="fine">Your vote counts ${pd.myWeight || 'once your identity is verified'}${pd.myWeight ? (pd.myWeight === 1 ? ' point' : ' points') : ''}.</p>` : ''}
        </div>
        <div>${pd.poll.options.map((o) => `<div class="vote-option"><strong>${esc(o.name)}</strong>
            <span>${o.points} pts${pd.poll.status === 'open' && !pd.myVote ? ` <button class="btn small ghost" data-action="vote" data-poll="${pd.poll.id}" data-option="${o.id}">Vote</button>` : ''}</span>
            <span class="vote-bar"><i style="width:${(o.points / max) * 100}%"></i></span></div>`).join('')}</div>
      </div></section>`;
  };

  if (!current) {
    main.innerHTML = `<div class="night"><div class="wrap section"><h1 class="display">S/CELL Night</h1><p class="lede">No S/CELL Night is scheduled yet. Vote for the artist you want to see first.</p>${pollHtml()}</div></div>`;
  } else {
    const offset = current.serverTime - Date.now();
    const target = current.status === 'scheduled' ? current.startsAt : current.endsAt;
    main.innerHTML = `
      <div class="night">
        <div class="wrap section">
          <div class="night-head">
            <div>
              <p class="kicker"><span class="status ${current.status === 'live' ? 'live' : current.status === 'closed' ? 'released' : 'upcoming'}">${{ live: 'Bidding is open', scheduled: 'Scheduled', closed: 'This night has ended' }[current.status]}</span></p>
              <h1 class="display" style="font-size:clamp(38px,5.6vw,80px)">${esc(current.title)}</h1>
              <p class="lede" style="margin-top:16px">All 15 cards by <a href="/artists/${esc(current.artist.slug)}">${esc(current.artist.name)}</a>, auctioned one by one. Bidding starts at ${taka(current.reserve)} and rises by at least ${taka(state.config.firstSale.bidIncrement)}. ${me ? '' : '<a href="/signin?next=/night">Sign in</a> to bid.'}</p>
              ${me && me.kycStatus !== 'verified' ? '<p class="fine">Verify your identity in <a href="/account">your account</a> before bidding.</p>' : ''}
              ${me && me.kycStatus === 'verified' && !me.membershipActive ? `<p class="fine">Bidding needs membership (${taka(state.config.membership.monthlyFee)} a month). <a href="/account">Start membership</a></p>` : ''}
            </div>
            ${current.status !== 'closed' ? `<div class="countdown" id="cd">${countdown(target, offset)}<small>${current.status === 'live' ? 'until bidding closes' : 'until bidding opens'}</small></div>` : ''}
          </div>
          <div class="lot-grid" id="lots">${lotHtml(current)}</div>
          ${pollHtml()}
          ${past.length ? `<h2 class="h3" style="margin-top:56px">Other nights</h2><table class="table" style="margin-top:12px"><tbody>${past.map((a) => `<tr><td><a href="/night/${a.id}">${esc(a.title)}</a></td><td>${{ live: 'Live', scheduled: 'Scheduled', closed: 'Ended' }[a.status]}</td><td class="r">${date(a.endsAt)}</td></tr>`).join('')}</tbody></table>` : ''}
        </div>
      </div>`;
    if (current.status !== 'closed') {
      const cd = document.getElementById('cd');
      state.timers.push(setInterval(() => { if (cd?.firstChild) cd.firstChild.textContent = countdown(target, offset); }, 1000));
      state.timers.push(setInterval(async () => {
        if (document.activeElement?.closest('#lots')) return; // don't redraw while someone is typing a bid
        try {
          const { auction } = await api(`/api/auctions/${current.id}`);
          if (auction.status !== current.status) { render(); return; }
          document.getElementById('lots').innerHTML = lotHtml(auction);
        } catch { /* keep the last view */ }
      }, 5000));
    }
  }

  on('submit', 'bid', async (d) => {
    const r = await api(`/api/lots/${d.lot}/bid`, { method: 'POST', body: { amount: Number(d.amount) } });
    toast(`Bid placed: ${taka(r.amount)}. You lead this card.`);
    const { auction } = await api(`/api/auctions/${current.id}`);
    document.getElementById('lots').innerHTML = lotHtml(auction);
  });
  on('click', 'vote', async (b) => {
    if (!state.me) { navigate('/signin?next=/night'); return; }
    const r = await api(`/api/polls/${b.dataset.poll}/vote`, { method: 'POST', body: { optionId: Number(b.dataset.option) } });
    toast(`Vote counted with a weight of ${r.weight}.`);
    render();
  });
}

// ---------- Marketplace ----------
async function marketPage() {
  setTitle('Marketplace');
  const params = new URLSearchParams(location.search);
  const artist = params.get('artist') || '';
  const [{ listings, recent }, { artists }] = await Promise.all([api(`/api/market${artist ? `?artist=${encodeURIComponent(artist)}` : ''}`), api('/api/artists')]);
  const cfg = state.config.resale;
  main.innerHTML = `
    <div class="wrap page-head">
      <h1 class="display">The collection continues.</h1>
      <p class="lede">Every card here belongs to a verified owner. Each official resale is recorded in the card's history, and the artist earns from it.</p>
    </div>
    <div class="wrap">
      <p class="notice">S/CELL cards are cultural collectibles, not financial investments. Prices can rise or fall, and a resale depends on a real buyer. S/CELL does not promise appreciation or profit.</p>
      <div style="display:flex;justify-content:space-between;align-items:end;gap:16px;flex-wrap:wrap;margin:40px 0 24px">
        <div><h2 class="h2">${listings.length} ${listings.length === 1 ? 'card' : 'cards'} for sale</h2><p class="subtitle">Verified owners, held payments, recorded history.</p></div>
        <label class="field" style="min-width:240px"><span>Artist</span>
          <select class="input" id="artist-filter"><option value="">All artists</option>${artists.map((a) => `<option value="${esc(a.slug)}" ${a.slug === artist ? 'selected' : ''}>${esc(a.name)}</option>`).join('')}</select></label>
      </div>
      <div class="plates landscape">${listings.map((c) => `<div>${cardTile(c, `<span>${esc(c.artist.name)}, owned by ${esc(c.owner?.displayName || '')}</span><strong>${taka(c.listing.price)}</strong>`)}</div>`).join('') || '<p class="empty">Nothing is listed right now. Owners list cards from their account.</p>'}</div>

      <div class="split section">
        <div>
          <h2 class="h3">Recent official resales</h2>
          <table class="table" style="margin-top:12px"><thead><tr><th>Card</th><th>Date</th><th class="r">Price</th></tr></thead><tbody>
            ${recent.map((r) => `<tr><td><a href="/cards/${r.cardId}">${esc(r.artist)} ${r.series === 'reward' ? 'R' : ''}${pad2(r.number)}</a></td><td>${date(r.at)}</td><td class="r">${taka(r.price)}</td></tr>`).join('') || '<tr><td colspan="3">No resales yet.</td></tr>'}
          </tbody></table>
        </div>
        <div>
          <h2 class="h3">Where the money from a resale goes</h2>
          <table class="table" style="margin-top:12px"><thead><tr><th></th><th class="r">Up to ${taka(cfg.tierBreak)}</th><th class="r">Above ${taka(cfg.tierBreak)}</th></tr></thead><tbody>
            <tr><td>Seller</td><td class="r">${cfg.low.seller}%</td><td class="r">${cfg.high.seller}%</td></tr>
            <tr><td>Artist</td><td class="r">${cfg.low.artist}%</td><td class="r">${cfg.high.artist}%</td></tr>
            <tr><td>Sponsor</td><td class="r">${cfg.low.sponsor}%</td><td class="r">${cfg.high.sponsor}%</td></tr>
            <tr><td>S/CELL</td><td class="r">${cfg.low.scell}%</td><td class="r">${cfg.high.scell}%</td></tr>
          </tbody></table>
          <p class="fine" style="margin-top:12px">${cfg.transferFeePct ? `The buyer also pays a ${cfg.transferFeePct}% secure-transfer charge (minimum ${taka(cfg.transferFeeMin)}). ` : ''}Each resale must be at least ${taka(cfg.minStep)} above the last official price. Payments are held for ${cfg.verifyDays} days while the buyer confirms the chip.</p>
        </div>
      </div>
    </div>`;
  document.getElementById('artist-filter').addEventListener('change', (e) => navigate(`/market${e.target.value ? `?artist=${e.target.value}` : ''}`));
}

// ---------- Collectors ----------
async function collectorsPage() {
  setTitle('Collectors');
  const d = await api('/api/collectors');
  const cfg = state.config;
  main.innerHTML = `
    <div class="wrap page-head">
      <h1 class="display">The collectors.</h1>
      <p class="lede">${esc(d.season.name)} runs until ${date(d.season.endsAt)}. At the end of the season, collectors are ranked by the value of the cards they have held for at least a quarter of the season, and receive reward credit by rank.</p>
    </div>
    <div class="wrap">
      <div class="stat-grid">
        <div class="stat"><b>${taka(d.pool)}</b><span>in the Season Reward Pool</span></div>
        <div class="stat"><b>${d.ranking.length}</b><span>ranked collectors</span></div>
        <div class="stat"><b>${date(d.season.endsAt)}</b><span>season ends</span></div>
      </div>
      <p class="notice blue" style="margin-top:28px">Season rewards are paid as credit you can spend on S/CELL cards and membership. They come from the Season Reward Pool, funded by a share of S/CELL's fees, and never exceed what the pool holds. They are not interest or investment returns.</p>

      <h2 class="h2" style="margin-top:56px">Season ranking</h2>
      <p class="subtitle">Ranked by what you hold, rewarded from what the pool holds.</p>
      <div class="table-scroll"><table class="table" style="margin-top:16px"><thead><tr><th>Rank</th><th>Collector</th><th>Badges</th><th class="r">Cards</th><th class="r">Holding value</th><th class="r">Reward tier</th></tr></thead><tbody>
        ${d.ranking.map((r) => `<tr><td class="num">${r.rank}</td><td>${esc(r.displayName)}</td><td>${badges(r.badges)}</td><td class="r">${r.cards}</td><td class="r">${taka(r.value)}</td><td class="r">${r.rewardPct}%</td></tr>`).join('') || '<tr><td colspan="6">No eligible holdings yet this season.</td></tr>'}
      </tbody></table></div>

      <div class="split section">
        <div>
          <h2 class="h3">Trade score</h2>
          <p class="fine">A collector's trade score is the total number of official trades on the cards they hold. Reaching ${cfg.rounds.slice().reverse().map((r) => r.score).join(', ')} earns the round marks, each with a personal card from an artist.</p>
          <table class="table" style="margin-top:12px"><thead><tr><th>Collector</th><th>Badges</th><th class="r">Score</th></tr></thead><tbody>
            ${d.tradeScores.map((s) => `<tr><td>${esc(s.displayName)}</td><td>${badges(s.badges)}</td><td class="r num">${s.score}</td></tr>`).join('') || '<tr><td colspan="3">No trades yet.</td></tr>'}
          </tbody></table>
        </div>
        <div>
          <h2 class="h3">Badges</h2>
          <dl class="facts" style="margin-top:12px">
            <dt>${badges(['blue'])}</dt><dd>Bought a card at S/CELL Night</dd>
            <dt>${badges(['resale'])}</dt><dd>Bought a card through an official resale</dd>
            <dt>${badges(['round1'])}</dt><dd>Trade score of 10</dd>
            <dt>${badges(['round2'])}</dt><dd>Trade score of 20</dd>
            <dt>${badges(['round3'])}</dt><dd>Trade score of 30</dd>
          </dl>
          <h2 class="h3" style="margin-top:32px">Reward tiers</h2>
          <table class="table" style="margin-top:12px"><tbody>${cfg.ranking.tiers.map((t, i, arr) => `<tr><td>${i === 0 ? `Top ${t.topPct}%` : `${arr[i - 1].topPct}–${t.topPct}%`}</td><td class="r">${t.rewardPct}% of holding value</td></tr>`).join('')}</tbody></table>
        </div>
      </div>
    </div>`;
}

// ---------- Verify ----------
async function verifyPage(code) {
  setTitle('Verify a card');
  main.innerHTML = `
    <div class="wrap page-head">
      <h1 class="display">Verify a card.</h1>
      <p class="lede">Tap the card's chip with your phone, or enter the card ID engraved on the back. Physical possession alone does not change ownership: only an official S/CELL transfer does.</p>
    </div>
    <div class="wrap split">
      <form class="form" data-form="verify">
        <label class="field"><span>Card ID or chip ID</span><input class="input" name="code" value="${esc(code || '')}" placeholder="For example ARJO-01-4F2A" required autocomplete="off"></label>
        <div><button class="btn" type="submit">Verify card</button></div>
      </form>
      <div id="verify-result" aria-live="polite"></div>
    </div>`;
  const check = async (value) => {
    const r = await api(`/api/verify/${encodeURIComponent(value.trim())}`);
    const el = document.getElementById('verify-result');
    if (!r.found) { el.innerHTML = `<div class="panel"><p class="status bad">Card not found</p><p class="fine">No S/CELL card has this ID. Check the engraving and try again. If you were offered this card, do not pay for it.</p></div>`; return; }
    el.innerHTML = `<div class="panel">
      <p class="status ok">${r.viaChip ? 'Chip verified: this card is authentic' : 'Card ID found in the registry'}</p>
      <h2 class="h3" style="margin-top:10px">${esc(r.artist.name)}, ${r.card.series === 'reward' ? 'Reward Edition' : `card ${pad2(r.card.number)} of 15`}</h2>
      <dl class="facts" style="margin-top:14px"><dt>Title</dt><dd>${esc(r.card.title)}</dd><dt>Registered owner</dt><dd>${esc(r.owner || 'Not yet sold')}</dd>
        <dt>Status</dt><dd>${esc(STATUS_LABEL[r.card.status])}</dd><dt>Official trades</dt><dd>${r.card.tradeCount}</dd></dl>
      ${r.transferInProgress ? '<p class="notice" style="margin-top:14px">A transfer is in progress for this card.</p>' : ''}
      <p style="margin-top:16px"><a href="/cards/${r.card.id}">See the card's history</a></p></div>`;
  };
  on('submit', 'verify', async (d) => { history.replaceState({}, '', `/verify/${encodeURIComponent(d.code.trim())}`); await check(d.code); });
  if (code) await check(code);
}

// ---------- Partners ----------
async function partnersPage() {
  setTitle('Partner with S/CELL');
  const f = state.config.firstSale, r = state.config.resale;
  main.innerHTML = `
    <div class="wrap page-head">
      <h1 class="display"><span>Your legacy.</span><span>Your fifteen.</span></h1>
      <p class="lede">Your words, your philosophy and your journey deserve more than another promotional product. You bring the story; S/CELL handles the engraving, the launch night, the registry and the market.</p>
    </div>
    <div class="wrap">
      <div class="split">
        <div>
          <h2 class="h2">What artists earn</h2>
          <table class="table" style="margin-top:18px"><tbody>
            <tr><td>Each first sale at S/CELL Night</td><td class="r num">${f.artistPct}%</td></tr>
            <tr><td>Each first sale, with an advance paid upfront</td><td class="r num">${f.artistPctWithAdvance}%</td></tr>
            <tr><td>Every official resale up to ${taka(r.tierBreak)}</td><td class="r num">${r.low.artist}%</td></tr>
            <tr><td>Every official resale above ${taka(r.tierBreak)}</td><td class="r num">${r.high.artist}%</td></tr>
          </tbody></table>
          <p class="fine" style="margin-top:12px">With an advance, the resale share is one point lower. Final terms are set in the signed artist agreement.</p>
          <ol class="steps" style="grid-template-columns:1fr 1fr">
            <li><h3>Apply</h3><p>Tell us about your work.</p></li>
            <li><h3>Agree</h3><p>Rights, approvals and royalties in writing.</p></li>
            <li><h3>Create</h3><p>You approve every word and image.</p></li>
            <li><h3>Launch</h3><p>Your S/CELL Night, with an unplugged set.</p></li>
          </ol>
        </div>
        <div class="panel">
          <h2 class="h3">Apply for an artist partnership</h2>
          <form class="form" data-form="artist" style="margin-top:14px">
            <label class="field"><span>Full name</span><input class="input" name="fullName" required></label>
            <label class="field"><span>Artist or stage name</span><input class="input" name="stageName" required></label>
            <label class="field"><span>Email</span><input class="input" name="email" type="email" required></label>
            <label class="field"><span>Phone</span><input class="input" name="phone" required></label>
            <label class="field"><span>Category</span><select class="input" name="category" required><option value="">Choose one</option><option>Singer</option><option>Band</option><option>Poet</option><option>Author</option><option>Songwriter</option><option>Visual artist</option><option>Other</option></select></label>
            <label class="field"><span>Portfolio or social media link</span><input class="input" name="link"></label>
            <label class="field"><span>Short biography</span><textarea class="input" name="bio"></textarea></label>
            <p class="form-error"></p>
            <div><button class="btn" type="submit">Send application</button></div>
          </form>
        </div>
      </div>

      <div class="split section" id="sponsors">
        <div>
          <h2 class="h2">Don't just sponsor culture. Be part of its story.</h2>
          <table class="table" style="margin-top:18px"><thead><tr><th>Partnership</th><th>What you get</th><th class="r">From</th></tr></thead><tbody>
            <tr><td>Card Sponsor</td><td>Your mark on one artist's collection, in the app on every chip tap, and ${r.low.sponsor}% of that artist's resales</td><td class="r">৳3,750 / month</td></tr>
            <tr><td>S/CELL Night Sponsor</td><td>"Presented by" naming, stage and stream branding, press</td><td class="r">৳50,000 / night</td></tr>
            <tr><td>Series Sponsor</td><td>Naming of the unplugged session series</td><td class="r">৳25,000 / month</td></tr>
            <tr><td>Payment Partner</td><td>Payments, escrow and payouts for the whole platform</td><td class="r">By agreement</td></tr>
          </tbody></table>
          <p class="fine" style="margin-top:12px">Resale shares depend on actual resales and are never guaranteed.</p>
        </div>
        <div class="panel">
          <h2 class="h3">Ask about sponsorship</h2>
          <form class="form" data-form="sponsor" style="margin-top:14px">
            <label class="field"><span>Company</span><input class="input" name="company" required></label>
            <label class="field"><span>Contact person</span><input class="input" name="contact" required></label>
            <label class="field"><span>Business email</span><input class="input" name="email" type="email" required></label>
            <label class="field"><span>Phone</span><input class="input" name="phone" required></label>
            <label class="field"><span>Partnership</span><select class="input" name="partnershipType" required><option value="">Choose one</option><option>Card Sponsor</option><option>S/CELL Night Sponsor</option><option>Series Sponsor</option><option>Payment Partner</option></select></label>
            <label class="field"><span>Message</span><textarea class="input" name="message"></textarea></label>
            <p class="form-error"></p>
            <div><button class="btn" type="submit">Request a conversation</button></div>
          </form>
        </div>
      </div>
    </div>`;
  on('submit', 'artist', async (d, form) => { await api('/api/applications/artist', { method: 'POST', body: d }); form.reset(); toast('Application sent. The partnership team will contact you.'); });
  on('submit', 'sponsor', async (d, form) => { await api('/api/applications/sponsor', { method: 'POST', body: d }); form.reset(); toast('Thank you. The partnership team will contact you.'); });
}

// ---------- How it works ----------
async function howPage() {
  setTitle('How it works');
  const c = state.config;
  main.innerHTML = `
    <div class="wrap page-head">
      <h1 class="display">How it works.</h1>
      <p class="lede">The rules that keep every card scarce, every owner real, and every artist paid.</p>
    </div>
    <div class="wrap">
      <div class="split">
        <div><h2 class="h3">For collectors</h2><ol class="steps" style="grid-template-columns:1fr;margin-top:16px">
          <li><h3>Create an account</h3><p>Free to join and browse.</p></li>
          <li><h3>Verify your identity</h3><p>NID and phone, once. Every owner on S/CELL is a real person.</p></li>
          <li><h3>Bid at S/CELL Night</h3><p>Membership (${taka(c.membership.monthlyFee)} a month) lets you bid and vote. Card owners get it free.</p></li>
          <li><h3>Receive and verify</h3><p>Your card, certificate and chip ID arrive; the registry shows you as the owner.</p></li>
        </ol></div>
        <div><h2 class="h3">For sellers</h2><ol class="steps" style="grid-template-columns:1fr;margin-top:16px">
          <li><h3>List from your account</h3><p>At or above the card's minimum official price.</p></li>
          <li><h3>A buyer pays into escrow</h3><p>The licensed payment partner holds the money.</p></li>
          <li><h3>Hand over the card</h3><p>The buyer confirms the chip within the ${c.resale.verifyDays}-day verification period.</p></li>
          <li><h3>Get paid</h3><p>You receive ${c.resale.low.seller}%; the artist, sponsor and S/CELL are paid automatically.</p></li>
        </ol></div>
      </div>
      <h2 class="h2 section" id="rules" style="padding-bottom:0">Fees and rules</h2>
      <div class="table-scroll"><table class="table" style="margin:20px 0 80px"><tbody>
        <tr><td>Cards per artist</td><td>Exactly 15, numbered 01 to 15, never reissued. Reward Edition cards are a separate, marked series.</td></tr>
        <tr><td>First sale</td><td>Live auction at S/CELL Night, starting at ${taka(c.firstSale.defaultReserve)}. Artist ${c.firstSale.artistPct}%, S/CELL the rest.</td></tr>
        <tr><td>Resale fee</td><td>${100 - c.resale.low.seller}% up to ${taka(c.resale.tierBreak)} (artist ${c.resale.low.artist}%, sponsor ${c.resale.low.sponsor}%, S/CELL ${c.resale.low.scell}%); ${100 - c.resale.high.seller}% above (${c.resale.high.artist}% / ${c.resale.high.sponsor}% / ${c.resale.high.scell}%).</td></tr>
        ${c.resale.transferFeePct ? `<tr><td>Secure-transfer charge</td><td>${c.resale.transferFeePct}% of the price, minimum ${taka(c.resale.transferFeeMin)}, paid by the buyer.</td></tr>` : ''}
        <tr><td>Minimum resale price</td><td>The last official price plus ${taka(c.resale.minStep)}.</td></tr>
        <tr><td>Unsold cards</td><td>After ${Math.round(c.decay.startAfterDays / 30)} months without a sale, the minimum price falls ${c.decay.pctPerYear}% a year. At zero the card retires from the official market.</td></tr>
        <tr><td>Verification</td><td>${c.resale.verifyDays} days with the payment held, and a chip confirmation by the buyer.</td></tr>
        <tr><td>Loyalty cashback</td><td>${c.cashback.slice().reverse().map((x) => `${x.minCards}${x.minCards === 2 ? 'nd' : x.minCards === 3 ? 'rd' : 'th'} card ${x.pct}%`).join(', ')}, as credit.</td></tr>
        <tr><td>Season ranking</td><td>Every 12 months, reward credit by rank from the Season Reward Pool. Cards must be held for a quarter of the season to count.</td></tr>
      </tbody></table></div>
    </div>`;
}

// ---------- Auth ----------
function nextPath() { return new URLSearchParams(location.search).get('next') || '/account'; }

async function signinPage() {
  setTitle('Sign in');
  main.innerHTML = `<div class="wrap page-head split">
    <div><h1 class="display">Sign in.</h1><p class="lede">Welcome back. Your collection is waiting.</p></div>
    <form class="form panel" data-form="signin">
      <label class="field"><span>Email</span><input class="input" name="email" type="email" autocomplete="email" required></label>
      <label class="field"><span>Password</span><input class="input" name="password" type="password" autocomplete="current-password" required></label>
      <p class="form-error"></p>
      <div class="btn-row"><button class="btn" type="submit">Sign in</button><a class="btn ghost" href="/join">Create an account</a></div>
    </form></div>`;
  on('submit', 'signin', async (d) => {
    await api('/api/auth/login', { method: 'POST', body: d });
    await refreshMe();
    toast(`Signed in. Welcome back, ${state.me.displayName}.`);
    navigate(nextPath(), { replace: true });
  });
}

async function joinPage() {
  setTitle('Join S/CELL');
  main.innerHTML = `<div class="wrap page-head split">
    <div><h1 class="display">Join S/CELL.</h1><p class="lede">Free to join. Verify your identity to bid, buy, sell and vote.</p></div>
    <form class="form panel" data-form="join">
      <label class="field"><span>Full name</span><input class="input" name="name" autocomplete="name" required></label>
      <label class="field"><span>Display name</span><input class="input" name="displayName" maxlength="40"><small>Shown on rankings and card histories.</small></label>
      <label class="field"><span>Email</span><input class="input" name="email" type="email" autocomplete="email" required></label>
      <label class="field"><span>Mobile number</span><input class="input" name="phone" autocomplete="tel" placeholder="01712345678" required></label>
      <label class="field"><span>Password</span><input class="input" name="password" type="password" autocomplete="new-password" minlength="8" required><small>At least 8 characters.</small></label>
      <label class="check"><input type="checkbox" name="acceptTerms" required> I have read and accept the <a href="/policies/terms" target="_blank">Terms of Use</a> and <a href="/policies/privacy" target="_blank">Privacy Policy</a>.</label>
      <p class="form-error"></p>
      <div class="btn-row"><button class="btn" type="submit">Create account</button><a class="btn ghost" href="/signin">I have an account</a></div>
    </form></div>`;
  on('submit', 'join', async (d) => {
    await api('/api/auth/register', { method: 'POST', body: d });
    await refreshMe();
    toast('Account created. Verify your identity next.');
    navigate('/account', { replace: true });
  });
}

// ---------- Account ----------
async function accountPage() {
  const me = await refreshMe();
  if (!me) { navigate('/signin?next=/account', { replace: true }); return; }
  setTitle('My account');
  const [{ cards }, { trades, earnings }, { bids }, pol] = await Promise.all([api('/api/me/collection'), api('/api/me/trades'), api('/api/me/bids'), api('/api/me/policies')]);
  const earned = (p) => earnings.find((e) => e.party === p)?.total || 0;
  const kyc = {
    none: `<p class="fine">Verify once with your NID to bid, buy, sell and vote. S/CELL stores only the last 4 digits.</p>
      <form class="form" data-form="kyc"><label class="field"><span>NID number</span><input class="input" name="nid" inputmode="numeric" required></label><p class="form-error"></p><div><button class="btn" type="submit">Submit for verification</button></div></form>`,
    pending: `<p class="status warn">Waiting for review</p><p class="fine">NID ending ${esc(me.nidLast4)}. You'll be able to bid and trade once it's approved.</p>`,
    verified: `<p class="status ok">Verified</p><p class="fine">NID ending ${esc(me.nidLast4)}.</p>`,
    rejected: `<p class="status bad">Not approved</p><p class="fine">Check your NID number and submit again.</p>
      <form class="form" data-form="kyc"><label class="field"><span>NID number</span><input class="input" name="nid" inputmode="numeric" required></label><p class="form-error"></p><div><button class="btn" type="submit">Submit again</button></div></form>`,
  }[me.kycStatus];

  main.innerHTML = `
    <div class="wrap page-head">
      <h1 class="display">${esc(me.displayName)}.</h1>
      <p class="lede">Your collection is a record of the stories you chose to keep.</p>
      <div style="margin-top:16px">${badges(me.badges)}</div>
    </div>
    <div class="wrap">
      <div class="stat-grid">
        <div class="stat"><b>${me.cardsOwned}</b><span>cards owned</span></div>
        <div class="stat"><b>${me.tradeScore}</b><span>trade score</span></div>
        <div class="stat"><b>${taka(me.walletCredit)}</b><span>credit to spend</span></div>
        <div class="stat"><b>${me.voteWeight || '—'}</b><span>vote weight</span></div>
        <div class="stat"><b>${taka(earned('seller'))}</b><span>earned from resales</span></div>
      </div>

      <div class="split section-tight">
        <div class="panel"><h2 class="h3">Identity check</h2>${kyc}</div>
        <div class="panel"><h2 class="h3">Membership</h2>
          ${me.membershipActive
            ? `<p class="status ok">Active</p><p class="fine">${me.cardsOwned ? 'Free while you own a card.' : `Renews on ${date(me.membershipUntil)}.`} You can bid, vote and earn badges.</p>`
            : `<p class="fine">${taka(state.config.membership.monthlyFee)} a month to bid at S/CELL Night, vote for the next artist, earn badges and get early access. Your credit is used first.</p>`}
          ${me.cardsOwned ? '' : `<button class="btn ${me.membershipActive ? 'ghost' : ''}" data-action="membership">${me.membershipActive ? 'Add 30 days' : 'Start membership'}</button>`}
        </div>
      </div>

      <h2 class="h2" id="collection">My collection</h2>
      <p class="subtitle">The stories you chose to keep, and their proof.</p>
      <div class="plates landscape" style="margin-top:20px">${cards.map((c) => `<div>${cardTile(c)}</div>`).join('') || `<p class="empty">No cards yet. <a href="/night">See S/CELL Night</a> or <a href="/market">browse the marketplace</a>.</p>`}</div>

      <h2 class="h2 section-tight" id="trades" style="padding-bottom:12px">Purchases and sales</h2>
      <div class="table-scroll"><table class="table"><thead><tr><th>Card</th><th>Type</th><th>Status</th><th class="r">Price</th><th>Action</th></tr></thead><tbody>
        ${trades.map((t) => `<tr>
          <td><a href="/cards/${t.card.id}">${esc(t.artist.name)} ${t.card.series === 'reward' ? 'R' : ''}${pad2(t.card.number)}</a></td>
          <td>${t.kind === 'first_sale' ? 'Won at S/CELL Night' : t.kind === 'reward' ? 'Reward' : t.role === 'buyer' ? 'Bought' : 'Sold'}</td>
          <td>${t.status === 'escrow' ? `Verifying until ${date(t.verifyUntil)}${t.chipConfirmed ? ', chip confirmed' : ''}` : esc(t.status)}</td>
          <td class="r">${taka(t.price)}${t.transferFee && t.role === 'buyer' ? `<br><span class="fine">+ ${taka(t.transferFee)} transfer</span>` : ''}</td>
          <td>${t.status === 'escrow' && t.role === 'buyer' && !t.chipConfirmed ? `<form class="lot-form" data-form="chip"><input type="hidden" name="trade" value="${t.id}"><input class="input" name="chip" placeholder="Chip ID" aria-label="Chip ID from the card" required><button class="btn small" type="submit">Confirm</button></form>` : ''}
              ${t.status === 'escrow' ? `<button class="btn small danger" data-action="dispute" data-id="${t.id}">Report a problem</button>` : ''}</td>
        </tr>`).join('') || '<tr><td colspan="5">No purchases or sales yet.</td></tr>'}
      </tbody></table></div>

      <h2 class="h2 section-tight" style="padding-bottom:12px">My bids</h2>
      <div class="table-scroll"><table class="table" style="margin-bottom:60px"><thead><tr><th>Card</th><th>Date</th><th class="r">My bid</th><th class="r">Current</th><th>Position</th></tr></thead><tbody>
        ${bids.map((b) => `<tr><td><a href="/night/${b.auctionId}">${esc(b.artist)} ${pad2(b.number)}</a></td><td>${dateTime(b.createdAt)}</td><td class="r">${taka(b.amount)}</td><td class="r">${taka(b.currentBid)}</td><td>${b.status === 'open' ? (b.leading ? '<span class="status ok">Leading</span>' : '<span class="status warn">Outbid</span>') : b.leading ? 'Won' : 'Closed'}</td></tr>`).join('') || '<tr><td colspan="5">No bids yet.</td></tr>'}
      </tbody></table></div>
      <div class="split section-tight" style="padding-top:0">
        <div class="panel"><h2 class="h3">Your records</h2><p class="fine">Every purchase, sale, credit and payout, ready for your own accounts.</p><a class="btn ghost small" href="/api/me/statement.csv" download>Download statement (CSV)</a></div>
        <div class="panel"><h2 class="h3">Agreements</h2>${pol.accepted.length ? `<ul class="ticks">${pol.accepted.map((a) => `<li><a href="/policies/${esc(a.slug)}">${esc(a.slug.replace(/-/g, ' '))}</a>, version ${a.version}${a.current ? '' : ' (a newer version is waiting)'}</li>`).join('')}</ul>` : '<p class="fine">None yet.</p>'}<p class="fine"><a href="/guides/collectors">Collector guide</a> and <a href="/policies">all policies</a></p></div>
      </div>
      <button class="btn ghost" data-action="logout" style="margin-bottom:40px">Sign out</button>
    </div>`;

  on('submit', 'kyc', async (d) => {
    const r = await api('/api/me/kyc', { method: 'POST', body: d });
    toast(r.status === 'verified' ? 'Identity verified.' : 'Submitted. We will review your NID shortly.');
    render();
  });
  on('click', 'membership', async () => {
    const r = await api('/api/me/membership', { method: 'POST' });
    toast(`Membership active. ${r.fromCredit ? `${taka(r.fromCredit)} credit used. ` : ''}${r.charged ? `${taka(r.charged)} charged.` : ''}`);
    render();
  });
  on('submit', 'chip', async (d) => {
    await api(`/api/trades/${d.trade}/confirm-chip`, { method: 'POST', body: { chip: d.chip } });
    toast('Chip confirmed. The seller is paid when the verification period ends.');
    render();
  });
  on('click', 'dispute', async (b) => {
    if (!confirm('Report a problem with this trade? The payment stays held until S/CELL reviews it.')) return;
    await api(`/api/trades/${b.dataset.id}/dispute`, { method: 'POST' });
    toast('Reported. The payment stays held while S/CELL reviews it.');
    render();
  });
  on('click', 'logout', async () => {
    await api('/api/auth/logout', { method: 'POST' });
    await refreshMe();
    toast('Signed out.');
    navigate('/');
  });
}

// ---------- Boot ----------
(async () => {
  try { state.config = await api('/api/config'); } catch { state.config = null; }
  setCardArt(state.config?.cardArt);
  await refreshMe().catch(() => null);
  render();
})();
