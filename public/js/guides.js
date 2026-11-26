import { esc, taka, pad2, date, api, toast, plate, THEME_LABEL, STATUS_LABEL } from './ui.js';

const AUDIENCES = [
  ['collectors', 'For collectors', 'Bid, own, trade and rank.'],
  ['artists', 'For artists', 'Create your fifteen and earn on every resale.'],
  ['sponsors', 'For sponsors and investors', 'Back a collection and share in how it travels.'],
];
const AUDIENCE_LABEL = { collectors: 'Collectors', artists: 'Artists', sponsors: 'Sponsors' };

const secHead = (title, subtitle, id = '') => `<div class="sec-head"${id ? ` id="${id}"` : ''}><h2 class="h2">${esc(title)}</h2>${subtitle ? `<p class="subtitle">${esc(subtitle)}</p>` : ''}</div>`;

// ---------- Guides hub ----------
export async function guidesHub(ctx) {
  ctx.setTitle('Guides and policies');
  const [{ policies }, stats] = await Promise.all([api('/api/policies'), api('/api/stats')]);
  ctx.main.innerHTML = `
    <div class="wrap page-head">
      <h1 class="display"><span>Every rule,</span><span>in the open.</span></h1>
      <p class="subtitle lead">How S/CELL works for collectors, artists and sponsors, what each of them can do, and the policies behind every trade.</p>
    </div>
    <div class="wrap">
      <div class="audience-grid">
        ${AUDIENCES.map(([k, title, sub]) => `<a class="audience" href="/guides/${k}"><span class="audience-title">${esc(title)}</span><span class="subtitle">${esc(sub)}</span><span class="audience-go">Open the guide</span></a>`).join('')}
      </div>

      <section class="section-tight">
        ${secHead('Open numbers', 'Everything S/CELL has paid and traded, counted from the live ledger.')}
        <div class="stat-grid" style="margin-top:24px">
          <div class="stat"><b>${stats.artists}</b><span>artists</span></div>
          <div class="stat"><b>${stats.cardsOwned} / ${stats.cardsIssued}</b><span>official cards owned</span></div>
          <div class="stat"><b>${stats.verifiedCollectors}</b><span>verified collectors</span></div>
          <div class="stat"><b>${taka(stats.firstSaleVolume)}</b><span>raised at S/CELL Nights</span></div>
          <div class="stat"><b>${taka(stats.resaleVolume)}</b><span>in official resales (${stats.resales})</span></div>
          <div class="stat"><b>${taka(stats.paidToArtists)}</b><span>paid to artists</span></div>
          <div class="stat"><b>${taka(stats.paidToSponsors)}</b><span>paid to sponsors</span></div>
          <div class="stat"><b>${stats.verifications}</b><span>card verifications</span></div>
        </div>
      </section>

      <section class="section-tight" id="policies">
        ${secHead('Policy library', 'Fifteen policies, written in plain language, with every number taken from the live platform.')}
        <div class="policy-list">${policies.map(policyRow).join('')}</div>
      </section>
    </div>`;
}

const policyRow = (p) => `<a class="policy-row" href="/policies/${esc(p.slug)}">
    <span class="policy-title">${esc(p.title)}</span>
    <span class="subtitle">${esc(p.subtitle)}</span>
    <span class="policy-meta">${p.audience.map((a) => AUDIENCE_LABEL[a]).join(', ')}. Version ${p.version}${p.updatedAt ? `, updated ${date(p.updatedAt)}` : ''}</span>
  </a>`;

// ---------- Audience guide ----------
export async function guidePage(ctx, audience) {
  const { guide: g } = await api(`/api/guides/${audience}`);
  ctx.setTitle(g.title);
  const me = ctx.state.me;
  const cta = {
    collectors: me ? '<a class="btn" href="/night">Go to S/CELL Night</a><a class="btn ghost" href="/market">Browse the marketplace</a>' : '<a class="btn" href="/join">Create a free account</a><a class="btn ghost" href="/night">See S/CELL Night</a>',
    artists: me?.role === 'artist' ? '<a class="btn" href="/dashboard/artist">Open your artist dashboard</a>' : '<a class="btn" href="/partners">Apply for an artist partnership</a>',
    sponsors: me?.role === 'sponsor' ? '<a class="btn" href="/dashboard/sponsor">Open your sponsor dashboard</a>' : '<a class="btn" href="/partners#sponsors">Ask about sponsorship</a>',
  }[audience];

  ctx.main.innerHTML = `
    <div class="wrap page-head">
      <p class="fine"><a href="/guides">Guides and policies</a></p>
      <h1 class="display" style="margin-top:12px">${esc(g.title)}.</h1>
      <p class="subtitle lead">${esc(g.subtitle)}</p>
      <p class="lede" style="margin-top:14px">${esc(g.intro)}</p>
      <nav class="jump" aria-label="On this page"><a href="#facilities">Facilities</a><a href="#options">Options</a><a href="#trade">How it works</a><a href="#calculator">Calculator</a><a href="#rules">Policies</a><a href="#faq">Questions</a></nav>
    </div>
    <div class="wrap">
      <section class="section-tight">
        ${secHead('Facilities', g.facilities.subtitle, 'facilities')}
        <dl class="facility-list">${g.facilities.items.map((f) => `<div><dt>${esc(f.name)}</dt><dd>${esc(f.desc)}</dd></div>`).join('')}</dl>
      </section>

      <section class="section-tight">
        ${secHead('Options', g.options.subtitle, 'options')}
        <div class="table-scroll"><table class="table" style="margin-top:20px"><thead><tr><th>Option</th><th>Cost or terms</th><th>What you get</th></tr></thead><tbody>
          ${g.options.rows.map((r) => `<tr><td><strong>${esc(r[0])}</strong></td><td>${esc(r[1])}</td><td>${esc(r[2])}</td></tr>`).join('')}
        </tbody></table></div>
      </section>

      <section class="section-tight">
        ${secHead('How it works', g.trade.subtitle, 'trade')}
        <div class="systems">${g.trade.systems.map((s) => `<div class="system"><h3 class="h3">${esc(s.name)}</h3><ol class="flow">${s.steps.map((x) => `<li>${esc(x)}</li>`).join('')}</ol></div>`).join('')}</div>
      </section>

      <section class="section-tight" id="calculator">
        ${calculatorShell(g.calculator)}
      </section>

      <section class="section-tight">
        ${secHead('Policies that apply to you', 'The full rules, in plain language.', 'rules')}
        <div class="policy-list">${g.policies.map((p) => `<a class="policy-row" href="/policies/${esc(p.slug)}"><span class="policy-title">${esc(p.title)}</span><span class="subtitle">${esc(p.subtitle)}</span></a>`).join('')}</div>
      </section>

      <section class="section-tight">
        ${secHead('Questions', 'The ones people ask first.', 'faq')}
        <div class="faq">${g.faq.map(([q, a]) => `<details><summary>${esc(q)}</summary><p>${esc(a)}</p></details>`).join('')}</div>
      </section>

      <section class="cta-band section-tight" style="margin-bottom:40px"><div class="btn-row">${cta}</div></section>
    </div>`;
  wireCalculator(ctx, g.calculator);
}

// ---------- Calculators ----------
const CALCS = {
  resale: {
    title: 'Resale calculator', subtitle: 'See exactly where every taka of a resale goes.',
    fields: [['price', 'Resale price (৳)', 25000], ['advance', 'The artist took an advance', false], ['sponsored', 'The collection has a sponsor', true]],
    render: (r) => `<dl class="facts">
        <dt>Buyer pays</dt><dd>${taka(r.buyerPays)}${r.transferFee ? ` <span class="fine">(incl. ${taka(r.transferFee)} transfer)</span>` : ''}</dd>
        <dt>Seller receives (${r.pct.seller}%)</dt><dd>${taka(r.seller)}</dd>
        <dt>Artist royalty (${r.pct.artist}%)</dt><dd>${taka(r.artist)}</dd>
        <dt>Sponsor co-branding fee (${r.pct.sponsor}%)</dt><dd>${taka(r.sponsor)}${r.sponsorHeldByScell ? ' <span class="fine">held by S/CELL</span>' : ''}</dd>
        <dt>S/CELL (${r.pct.scell}%)</dt><dd>${taka(r.scell)}</dd>
        <dt>Next minimum price</dt><dd>${taka(r.nextMinimum)}</dd>
        <dt>A buyer at this price needs to resell at</dt><dd>${taka(r.breakEvenIfBoughtAtThisPrice)} to get their money back</dd>
      </dl>`,
  },
  artist: {
    title: 'Artist earnings calculator', subtitle: 'Try your own numbers. The shares are the real ones.',
    fields: [['avgFirst', 'Average first-sale price per card (৳)', 8000], ['resalesPerYear', 'Official resales of your cards per year', 10], ['avgResale', 'Average resale price (৳)', 15000], ['years', 'Years', 5], ['advance', 'I take an advance', false]],
    render: (r) => `<dl class="facts">
        <dt>Your 15 cards at S/CELL Night</dt><dd>${taka(r.firstSaleTotal)}</dd>
        <dt>Your first-sale share (${r.firstSalePct}%)</dt><dd>${taka(r.firstSaleShare)}</dd>
        <dt>Royalty per resale (${r.royaltyPct}%)</dt><dd>${taka(r.royaltyPerResale)}</dd>
        <dt>Royalties per year</dt><dd>${taka(r.royaltiesPerYear)}</dd>
        <dt>Total over ${r.inputs.years} ${r.inputs.years === 1 ? 'year' : 'years'}</dt><dd>${taka(r.totalOverPeriod)}</dd>
      </dl>`,
  },
  sponsor: {
    title: 'Sponsor calculator', subtitle: 'What a Card Sponsorship costs, and what the co-branding fee could bring back.',
    fields: [['artists', 'Artists sponsored', 1], ['monthlyFee', 'Monthly fee per artist (৳)', 3750], ['resalesPerArtistPerYear', 'Resales per artist per year', 10], ['avgResale', 'Average resale price (৳)', 15000], ['months', 'Months', 12]],
    render: (r) => `<dl class="facts">
        <dt>Sponsorship fees over ${r.inputs.months} months</dt><dd>${taka(r.feesPaid)}</dd>
        <dt>Resales in that time</dt><dd>${r.resales}</dd>
        <dt>Co-branding fee per resale (${r.feePct}%)</dt><dd>${taka(r.feePerResale)}</dd>
        <dt>Co-branding fees</dt><dd>${taka(r.coBrandingFees)}</dd>
        <dt>${r.netCost >= 0 ? 'Net cost of the sponsorship' : 'Co-branding fees above the sponsorship fees'}</dt><dd>${taka(Math.abs(r.netCost))}</dd>
      </dl>`,
  },
};

export function calculatorShell(kind) {
  const c = CALCS[kind];
  return `${secHead(c.title, c.subtitle)}
    <div class="split calc" style="margin-top:20px">
      <form class="form" id="calc-form">
        ${c.fields.map(([name, label, def]) => typeof def === 'boolean'
          ? `<label class="check"><input type="checkbox" name="${name}" ${def ? 'checked' : ''}> ${esc(label)}</label>`
          : `<label class="field"><span>${esc(label)}</span><input class="input" type="number" min="0" name="${name}" value="${def}"></label>`).join('')}
      </form>
      <div class="panel" id="calc-out" aria-live="polite">Calculating…</div>
    </div>`;
}

export function wireCalculator(ctx, kind) {
  const form = document.getElementById('calc-form');
  const out = document.getElementById('calc-out');
  if (!form) return;
  let timer;
  const run = async () => {
    const q = new URLSearchParams();
    for (const el of form.elements) if (el.name) q.set(el.name, el.type === 'checkbox' ? String(el.checked) : el.value);
    try {
      const r = await api(`/api/calc/${kind}?${q}`);
      out.innerHTML = CALCS[kind].render(r) + `<p class="fine" style="margin-top:14px">${esc(r.disclaimer)}</p>`;
    } catch (e) { out.textContent = e.message; }
  };
  form.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(run, 250); });
  form.addEventListener('submit', (e) => { e.preventDefault(); run(); });
  run();
}

// ---------- Policies ----------
export async function policiesIndex(ctx) {
  ctx.setTitle('Policies');
  const { policies } = await api('/api/policies');
  ctx.main.innerHTML = `<div class="wrap page-head">
      <h1 class="display">Policies.</h1>
      <p class="subtitle lead">The rules of S/CELL, for collectors, artists and sponsors. Plain language, real numbers, nothing in small print.</p>
    </div>
    <div class="wrap" style="padding-bottom:60px"><div class="policy-list">${policies.map(policyRow).join('')}</div></div>`;
}

export async function policyPage(ctx, slug) {
  const { policy: p, accepted } = await api(`/api/policies/${slug}`);
  ctx.setTitle(p.title);
  const me = ctx.state.me;
  const needsAccept = me && me.pendingPolicies?.some((x) => x.slug === p.slug);
  const id = (i) => `s${i + 1}`;
  ctx.main.innerHTML = `
    <div class="wrap page-head">
      <p class="fine"><a href="/guides#policies">Policy library</a></p>
      <h1 class="display" style="margin-top:12px;font-size:clamp(36px,5vw,68px)">${esc(p.title)}</h1>
      <p class="subtitle lead">${esc(p.subtitle)}</p>
      <p class="fine" style="margin-top:14px">For ${p.audience.map((a) => AUDIENCE_LABEL[a].toLowerCase()).join(', ')}. Version ${p.version}${p.updatedAt ? `, updated ${date(p.updatedAt)}` : ''}.${accepted ? ' You have accepted this version.' : ''}</p>
    </div>
    <div class="wrap policy-layout">
      <nav class="toc" aria-label="Sections"><p class="fine">In this policy</p>${p.sections.map((s, i) => `<a href="#${id(i)}">${esc(s.h)}</a>`).join('')}</nav>
      <article class="policy-body">
        <p class="lede">${esc(p.summary)}</p>
        ${needsAccept ? `<div class="notice blue" style="margin:20px 0"><p style="margin:0 0 10px">Please read and accept this policy to continue using your account.</p><button class="btn small" data-action="accept" data-slug="${esc(p.slug)}">I have read and accept version ${p.version}</button></div>` : ''}
        ${p.sections.map((s, i) => `<section id="${id(i)}"><h2 class="h3">${esc(s.h)}</h2>
          ${(s.p || []).map((x) => `<p>${esc(x)}</p>`).join('')}
          ${s.items?.length ? `<ul>${s.items.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>` : ''}</section>`).join('')}
        <p class="notice" style="margin-top:40px">This policy is a plain-language draft prepared for legal review in Bangladesh. If it differs from a signed agreement, the signed agreement applies.</p>
      </article>
    </div>`;
  ctx.on('click', 'accept', async (b) => {
    await api('/api/me/accept', { method: 'POST', body: { slug: b.dataset.slug } });
    await ctx.refreshMe();
    toast('Accepted. Thank you.');
    const next = ctx.state.me.pendingPolicies?.[0];
    ctx.navigate(next ? `/policies/${next.slug}` : (ctx.state.me.role === 'artist' ? '/dashboard/artist' : ctx.state.me.role === 'sponsor' ? '/dashboard/sponsor' : '/account'));
  });
}

// ---------- Dashboards ----------
const monthName = (ym) => { const [y, m] = ym.split('-'); return new Date(Number(y), Number(m) - 1, 1).toLocaleDateString('en-GB', { month: 'short', year: 'numeric' }); };

function pendingGate(ctx) {
  const pending = ctx.state.me?.pendingPolicies || [];
  if (!pending.length) return false;
  ctx.main.innerHTML = `<div class="wrap section"><h1 class="h2">One step before your dashboard</h1>
    <p class="subtitle">Read and accept the agreements that apply to you.</p>
    <div class="policy-list" style="margin-top:24px">${pending.map((p) => `<a class="policy-row" href="/policies/${esc(p.slug)}"><span class="policy-title">${esc(p.title)}</span><span class="policy-meta">Version ${p.version}, waiting for your acceptance</span></a>`).join('')}</div></div>`;
  return true;
}

export async function artistDashboard(ctx) {
  const me = await ctx.refreshMe();
  const adminId = new URLSearchParams(location.search).get('id');
  if (!me) { ctx.navigate('/signin?next=/dashboard/artist', { replace: true }); return; }
  if (me.role !== 'admin' && pendingGate(ctx)) return;
  const d = await api(me.role === 'admin' && adminId ? `/api/admin/artist-dashboard/${adminId}` : '/api/artist/dashboard');
  ctx.setTitle(`${d.artist.name}: artist dashboard`);
  const maxMonth = Math.max(1, ...d.monthly.map((m) => m.firstSale + m.resale));
  ctx.main.innerHTML = `
    <div class="wrap page-head">
      <p class="fine">Artist dashboard${me.role === 'admin' ? ' (admin view)' : ''}</p>
      <h1 class="display" style="margin-top:10px">${esc(d.artist.name)}.</h1>
      <p class="subtitle lead">Your fifteen, where they are now, and every taka they have earned you.</p>
    </div>
    <div class="wrap">
      <div class="stat-grid">
        <div class="stat"><b>${taka(d.totals.firstSale + d.totals.resale)}</b><span>earned in total</span></div>
        <div class="stat"><b>${taka(d.totals.firstSale)}</b><span>from S/CELL Night (${d.shares.firstSale}%)</span></div>
        <div class="stat"><b>${taka(d.totals.resale)}</b><span>resale royalties (${d.shares.resaleLow}%)</span></div>
        <div class="stat"><b>${d.totals.cardsOwned} / 15</b><span>cards with owners</span></div>
        <div class="stat"><b>${d.totals.resales}</b><span>official resales</span></div>
        <div class="stat"><b>${taka(d.totals.collectionValue)}</b><span>collection value at last prices</span></div>
      </div>

      <section class="section-tight">
        ${secHead('Earnings by month', 'First sales in blue, royalties in straw. Paid with your monthly statement.')}
        <div class="bars" role="img" aria-label="Earnings by month">${d.monthly.slice().reverse().map((m) => `<div class="bar-col"><div class="bar-stack" style="height:${((m.firstSale + m.resale) / maxMonth) * 160}px">
            <i class="b-resale" style="flex:${m.resale}"></i><i class="b-first" style="flex:${m.firstSale}"></i></div><span>${monthName(m.month)}</span><b>${taka(m.firstSale + m.resale)}</b></div>`).join('') || '<p class="empty">No earnings yet.</p>'}</div>
        <p style="margin-top:18px"><a class="btn ghost small" href="/api/artist/statement.csv" download>Download full statement (CSV)</a></p>
      </section>

      <section class="section-tight">
        ${secHead('Your audience', 'How often fans look at and check your cards.')}
        <div class="stat-grid" style="margin-top:20px">
          <div class="stat"><b>${d.exposure.views}</b><span>collection page views</span></div>
          <div class="stat"><b>${d.exposure.cardViews}</b><span>card page views</span></div>
          <div class="stat"><b>${d.exposure.verifications}</b><span>card verifications</span></div>
          <div class="stat"><b>${d.exposure.bids}</b><span>bids at your S/CELL Nights</span></div>
        </div>
      </section>

      <section class="section-tight">
        ${secHead('Your fifteen', 'Every card, its owner and its last official price.')}
        <div class="table-scroll"><table class="table" style="margin-top:16px"><thead><tr><th>Card</th><th>Group</th><th>Status</th><th>Owner</th><th class="r">First sale</th><th class="r">Last price</th><th class="r">Trades</th></tr></thead><tbody>
          ${d.cards.map((c) => `<tr><td><a href="/cards/${c.id}">${c.series === 'reward' ? 'R' : ''}${pad2(c.number)} ${esc(c.title)}</a></td><td>${esc(THEME_LABEL[c.theme])}</td><td>${esc(STATUS_LABEL[c.status])}</td><td>${esc(c.owner || '—')}</td><td class="r">${taka(c.firstSalePrice)}</td><td class="r">${taka(c.lastPrice)}</td><td class="r">${c.tradeCount}</td></tr>`).join('')}
        </tbody></table></div>
      </section>

      <div class="split section-tight">
        <div>
          ${secHead('Latest royalties', 'Recorded the moment a trade settles.')}
          <table class="table" style="margin-top:16px"><tbody>${d.recent.map((r) => `<tr><td>${date(r.at)}</td><td><a href="/cards/${r.cardId}">${r.series === 'reward' ? 'R' : ''}${pad2(r.number)}</a>, ${esc(r.note)}</td><td class="r">${taka(r.amount)}</td></tr>`).join('') || '<tr><td>No royalties yet.</td></tr>'}</tbody></table>
        </div>
        <div>
          ${secHead('Your terms', d.artist.tookAdvance ? 'Advance agreement.' : 'Standard agreement.')}
          <dl class="facts" style="margin-top:16px">
            <dt>First-sale share</dt><dd>${d.shares.firstSale}%</dd>
            <dt>Resale royalty up to ${taka(d.shares.tierBreak)}</dt><dd>${d.shares.resaleLow}%</dd>
            <dt>Resale royalty above</dt><dd>${d.shares.resaleHigh}%</dd>
            <dt>Sponsor</dt><dd>${d.sponsor ? esc(d.sponsor.name) : 'None yet'}</dd>
          </dl>
          <h3 class="h3" style="margin-top:28px">Promotion you agreed to</h3>
          <ul class="ticks">${d.obligations.map((o) => `<li>${esc(o)}</li>`).join('')}</ul>
          <p class="fine"><a href="/policies/artist-terms">Read the Artist Partnership Terms</a></p>
        </div>
      </div>

      <section class="section-tight" style="padding-bottom:80px">
        ${secHead('S/CELL Nights', 'Your launches and their results.')}
        <table class="table" style="margin-top:16px"><thead><tr><th>Night</th><th>Status</th><th>Date</th><th class="r">Sold</th><th class="r">Raised</th></tr></thead><tbody>
          ${d.auctions.map((a) => `<tr><td><a href="/night/${a.id}">${esc(a.title)}</a></td><td>${esc(a.status)}</td><td>${date(a.endsAt)}</td><td class="r">${a.sold}/${a.lots}</td><td class="r">${taka(a.total)}</td></tr>`).join('') || '<tr><td colspan="5">Your S/CELL Night has not been scheduled yet.</td></tr>'}
        </tbody></table>
      </section>
    </div>`;
}

export async function sponsorDashboard(ctx) {
  const me = await ctx.refreshMe();
  const adminId = new URLSearchParams(location.search).get('id');
  if (!me) { ctx.navigate('/signin?next=/dashboard/sponsor', { replace: true }); return; }
  if (me.role !== 'admin' && pendingGate(ctx)) return;
  const d = await api(me.role === 'admin' && adminId ? `/api/admin/sponsor-dashboard/${adminId}` : '/api/sponsor/dashboard');
  ctx.setTitle(`${d.sponsor.name}: sponsor dashboard`);
  ctx.main.innerHTML = `
    <div class="wrap page-head">
      <p class="fine">Sponsor dashboard${me.role === 'admin' ? ' (admin view)' : ''}</p>
      <h1 class="display" style="margin-top:10px">${esc(d.sponsor.name)}.</h1>
      <p class="subtitle lead">Your reach, your co-branding fees, and the collections you stand beside.</p>
    </div>
    <div class="wrap">
      <div class="stat-grid">
        <div class="stat"><b>${d.totals.artists}</b><span>${d.totals.artists === 1 ? 'collection' : 'collections'} sponsored</span></div>
        <div class="stat"><b>${taka(d.totals.coBranding)}</b><span>co-branding fees earned</span></div>
        <div class="stat"><b>${taka(d.totals.feesPaid)}</b><span>sponsorship fees paid</span></div>
        <div class="stat"><b>${taka(Math.abs(d.totals.net))}</b><span>${d.totals.net >= 0 ? 'earned above fees' : 'net cost so far'}</span></div>
        <div class="stat"><b>${taka(d.sponsor.monthlyFee)}</b><span>monthly fee per artist</span></div>
      </div>

      <section class="section-tight">
        ${secHead('Your reach', 'Every view, check and bid on the collections you sponsor.')}
        <div class="stat-grid" style="margin-top:20px">
          <div class="stat"><b>${d.exposure.views}</b><span>collection page views</span></div>
          <div class="stat"><b>${d.exposure.cardViews}</b><span>card page views</span></div>
          <div class="stat"><b>${d.exposure.verifications}</b><span>verifications showing your name</span></div>
          <div class="stat"><b>${d.exposure.bids}</b><span>bids at sponsored nights</span></div>
        </div>
      </section>

      <section class="section-tight">
        ${secHead('Your collections', 'How each sponsored artist is trading.')}
        <div class="table-scroll"><table class="table" style="margin-top:16px"><thead><tr><th>Artist</th><th class="r">Owned</th><th class="r">Trades</th><th class="r">Value at last prices</th><th class="r">Views</th><th class="r">Verifications</th></tr></thead><tbody>
          ${d.perArtist.map((a) => `<tr><td><a href="/artists/${esc(a.slug)}">${esc(a.name)}</a></td><td class="r">${a.owned}/${a.cards}</td><td class="r">${a.trades}</td><td class="r">${taka(a.value)}</td><td class="r">${a.exposure.views + a.exposure.cardViews}</td><td class="r">${a.exposure.verifications}</td></tr>`).join('') || '<tr><td colspan="6">No collections linked yet.</td></tr>'}
        </tbody></table></div>
      </section>

      <div class="split section-tight">
        <div>
          ${secHead('Latest co-branding fees', `${d.shares.low}% of each resale up to ${taka(d.shares.tierBreak)}, ${d.shares.high}% above.`)}
          <table class="table" style="margin-top:16px"><tbody>${d.recent.map((r) => `<tr><td>${date(r.at)}</td><td>${esc(r.artist)} <a href="/cards/${r.cardId}">${r.series === 'reward' ? 'R' : ''}${pad2(r.number)}</a> sold for ${taka(r.price)}</td><td class="r">${taka(r.amount)}</td></tr>`).join('') || '<tr><td>No resales yet.</td></tr>'}</tbody></table>
          <p style="margin-top:18px"><a class="btn ghost small" href="/api/sponsor/statement.csv" download>Download full statement (CSV)</a></p>
        </div>
        <div>
          ${secHead('By month', 'Co-branding fees earned against fees paid.')}
          <table class="table" style="margin-top:16px"><thead><tr><th>Month</th><th class="r">Earned</th><th class="r">Paid</th></tr></thead><tbody>
            ${d.monthly.map((m) => `<tr><td>${monthName(m.month)}</td><td class="r">${taka(m.coBranding)}</td><td class="r">${taka(m.feesPaid)}</td></tr>`).join('') || '<tr><td colspan="3">Nothing yet.</td></tr>'}
          </tbody></table>
          <p class="fine" style="margin-top:16px">Co-branding fees depend on real resales and may be zero in any month. They are not a return on investment. <a href="/policies/sponsor-terms">Sponsor and Partner Terms</a></p>
        </div>
      </div>
      <div style="height:60px"></div>
    </div>`;
}
