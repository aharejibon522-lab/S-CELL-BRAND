import { esc, taka, date, dateTime, api, toast } from './ui.js';

const TABS = [
  ['overview', 'Overview'], ['kyc', 'Identity checks'], ['artists', 'Artists'], ['sponsors', 'Sponsors'], ['auctions', 'S/CELL Nights'],
  ['trades', 'Escrow'], ['votes', 'Votes'], ['season', 'Season'], ['accounts', 'Accounts'], ['policies', 'Policies'], ['applications', 'Applications'], ['ledger', 'Ledger'], ['tools', 'Tools'],
];

const THEMES = [['Foundational thoughts', 5], ['Creative philosophies', 3], ['Career reflections', 2], ['Artistic visuals', 5]];

export async function adminView({ main, state, on, navigate, refreshMe, setTitle }) {
  const me = state.me || (await refreshMe());
  if (!me || me.role !== 'admin') { navigate('/signin?next=/admin', { replace: true }); return; }
  setTitle('Admin');
  const tab = new URLSearchParams(location.search).get('tab') || 'overview';

  main.innerHTML = `<div class="wrap page-head" style="padding-bottom:0">
      <h1 class="display" style="font-size:clamp(36px,5vw,64px)">Admin</h1>
      <div class="tabs" role="tablist">${TABS.map(([k, l]) => `<button role="tab" aria-selected="${k === tab}" data-action="tab" data-tab="${k}">${l}</button>`).join('')}</div>
    </div><div class="wrap" id="admin-body" style="padding-bottom:80px"></div>`;
  const body = document.getElementById('admin-body');
  on('click', 'tab', (b) => navigate(`/admin?tab=${b.dataset.tab}`));
  const reload = () => navigate(`/admin?tab=${tab}`, { replace: true });

  const artistsList = async () => (await api('/api/artists')).artists;

  if (tab === 'overview') {
    const o = await api('/api/admin/overview');
    const stat = (v, l) => `<div class="stat"><b>${v}</b><span>${l}</span></div>`;
    body.innerHTML = `<div class="stat-grid">
      ${stat(o.users, 'accounts')}${stat(o.verified, 'verified')}${stat(o.pendingKyc, 'identity checks waiting')}${stat(o.artists, 'artists')}
      ${stat(o.cardsOwned, 'cards with owners')}${stat(o.activeListings, 'cards for sale')}${stat(o.escrow, 'trades in escrow')}${stat(o.applications, 'new applications')}
      ${stat(taka(o.firstSaleVolume), 'first-sale volume')}${stat(taka(o.resaleVolume), 'resale volume')}${stat(taka(o.scellIncome), 'S/CELL income')}
      ${stat(taka(o.artistPaid), 'paid to artists')}${stat(taka(o.sponsorPaid), 'paid to sponsors')}${stat(taka(o.membershipIncome), 'membership income')}${stat(taka(o.rewardPool), 'Season Reward Pool')}
    </div>
    <p class="notice blue" style="margin-top:28px">Payments, identity checks and chip verification run in sandbox mode until the licensed partners are connected. See the README for where each one plugs in.</p>`;
  }

  if (tab === 'kyc') {
    const { pending } = await api('/api/admin/kyc');
    body.innerHTML = `<table class="table"><thead><tr><th>Name</th><th>Email</th><th>Phone</th><th>NID ends</th><th>Joined</th><th></th></tr></thead><tbody>
      ${pending.map((u) => `<tr><td>${esc(u.name)}</td><td>${esc(u.email)}</td><td>${esc(u.phone)}</td><td>${esc(u.nidLast4)}</td><td>${date(u.createdAt)}</td>
        <td><div class="btn-row"><button class="btn small" data-action="kyc" data-id="${u.id}" data-ok="1">Approve</button><button class="btn small danger" data-action="kyc" data-id="${u.id}" data-ok="0">Reject</button></div></td></tr>`).join('') || '<tr><td colspan="6">No identity checks waiting.</td></tr>'}
    </tbody></table>`;
    on('click', 'kyc', async (b) => { await api(`/api/admin/kyc/${b.dataset.id}`, { method: 'POST', body: { approve: b.dataset.ok === '1' } }); toast(b.dataset.ok === '1' ? 'Approved.' : 'Rejected.'); reload(); });
  }

  if (tab === 'artists') {
    const [artists, { sponsors }] = await Promise.all([artistsList(), api('/api/admin/sponsors')]);
    let n = 0;
    const cardFields = THEMES.map(([label, count]) => `<fieldset class="panel" style="grid-column:1/-1"><legend class="h3">${label}</legend>
      ${Array.from({ length: count }, () => { n++; return `<div class="form wide" style="margin-top:10px"><label class="field"><span>Card ${String(n).padStart(2, '0')} title</span><input class="input" name="title${n}" maxlength="80"></label>
      ${label === 'Artistic visuals' ? '' : `<label class="field"><span>Text engraved on card ${String(n).padStart(2, '0')}</span><input class="input" name="body${n}" maxlength="280"></label>`}</div>`; }).join('')}</fieldset>`).join('');
    body.innerHTML = `
      <table class="table"><thead><tr><th>Artist</th><th>Status</th><th>Owned</th><th>Sponsor</th><th>Advance</th></tr></thead><tbody>
        ${artists.map((a) => `<tr><td><a href="/artists/${esc(a.slug)}">${esc(a.name)}</a><br><span class="fine">ID ${a.id}, ${esc(a.category)}. <a href="/dashboard/artist?id=${a.id}">Dashboard</a></span></td><td>${esc(a.status)}</td><td>${a.cardsOwned}/15</td>
          <td><select class="input" data-sponsor-for="${a.id}"><option value="">None</option>${sponsors.map((s) => `<option value="${s.id}" ${a.sponsor && a.sponsor.id === s.id ? 'selected' : ''}>${esc(s.name)}</option>`).join('')}</select></td>
          <td>${a.tookAdvance ? 'Yes' : 'No'}</td></tr>`).join('')}
      </tbody></table>
      <h2 class="h2" style="margin:48px 0 16px">Add an artist</h2>
      <p class="fine">Creates exactly 15 cards in the 5 / 3 / 2 / 5 structure, each with its own chip ID and card ID. Card text can be edited until a card is sold.</p>
      <form class="form wide" data-form="artist" style="margin-top:16px">
        <label class="field"><span>Name</span><input class="input" name="name" required></label>
        <label class="field"><span>Category</span><input class="input" name="category" placeholder="Singer, band, poet…" required></label>
        <label class="field" style="grid-column:1/-1"><span>Biography</span><textarea class="input" name="bio"></textarea></label>
        <label class="check"><input type="checkbox" name="tookAdvance"> Artist took an advance (18% first sale, 12% resale)</label>
        ${cardFields}
        <p class="form-error"></p><div><button class="btn" type="submit">Create artist and 15 cards</button></div>
      </form>`;
    body.querySelectorAll('[data-sponsor-for]').forEach((sel) => sel.addEventListener('change', async () => {
      try { await api(`/api/admin/artists/${sel.dataset.sponsorFor}/sponsor`, { method: 'POST', body: { sponsorId: sel.value || null } }); toast('Sponsor updated.'); }
      catch (e) { toast(e.message, 'error'); }
    }));
    on('submit', 'artist', async (d) => {
      const cards = Array.from({ length: 15 }, (_, i) => ({ title: d[`title${i + 1}`] || '', body: d[`body${i + 1}`] || '' }));
      const r = await api('/api/admin/artists', { method: 'POST', body: { name: d.name, category: d.category, bio: d.bio, tookAdvance: d.tookAdvance, cards } });
      toast('Artist created with 15 cards.');
      navigate(`/artists/${r.slug}`);
    });
  }

  if (tab === 'sponsors') {
    const { sponsors } = await api('/api/admin/sponsors');
    body.innerHTML = `<table class="table"><thead><tr><th>Sponsor</th><th>Category</th><th class="r">Monthly fee</th><th>Added</th></tr></thead><tbody>
      ${sponsors.map((s) => `<tr><td>${esc(s.name)} <span class="fine">(ID ${s.id}). <a href="/dashboard/sponsor?id=${s.id}">Dashboard</a></span></td><td>${esc(s.category)}</td><td class="r">${taka(s.monthly_fee)}</td><td>${date(s.created_at)}</td></tr>`).join('') || '<tr><td colspan="4">No sponsors yet.</td></tr>'}
      </tbody></table>
      <h2 class="h3" style="margin:40px 0 12px">Record a sponsorship fee received</h2>
      <form class="form wide" data-form="payment"><label class="field"><span>Sponsor</span><select class="input" name="sponsorId">${sponsors.map((s) => `<option value="${s.id}">${esc(s.name)}</option>`).join('')}</select></label>
        <label class="field"><span>Amount received (৳)</span><input class="input" name="amount" type="number" min="1" required></label>
        <label class="field"><span>Note</span><input class="input" name="note" placeholder="For example: December fee"></label>
        <p class="form-error"></p><div><button class="btn" type="submit">Record payment</button></div></form>
      <h2 class="h3" style="margin:40px 0 12px">Add a sponsor</h2>
      <form class="form wide" data-form="sponsor"><label class="field"><span>Name</span><input class="input" name="name" required></label>
        <label class="field"><span>Category</span><input class="input" name="category" placeholder="payments, bank, brand"></label>
        <label class="field"><span>Monthly fee (৳)</span><input class="input" name="monthlyFee" type="number" value="3750"></label>
        <p class="form-error"></p><div><button class="btn" type="submit">Add sponsor</button></div></form>`;
    on('submit', 'sponsor', async (d) => { await api('/api/admin/sponsors', { method: 'POST', body: d }); toast('Sponsor added. Assign it to an artist in the Artists tab.'); reload(); });
    on('submit', 'payment', async (d) => { await api(`/api/admin/sponsors/${d.sponsorId}/payment`, { method: 'POST', body: d }); toast('Payment recorded. It shows in the sponsor dashboard.'); reload(); });
  }

  if (tab === 'auctions') {
    const [{ auctions }, artists] = await Promise.all([api('/api/auctions'), artistsList()]);
    const local = (ms) => new Date(ms - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16);
    body.innerHTML = `<table class="table"><thead><tr><th>Night</th><th>Status</th><th>Starts</th><th>Ends</th><th class="r">Reserve</th><th>Sold</th><th></th></tr></thead><tbody>
      ${auctions.map((a) => `<tr><td><a href="/night/${a.id}">${esc(a.title)}</a></td><td>${esc(a.status)}</td><td>${dateTime(a.startsAt)}</td><td>${dateTime(a.endsAt)}</td><td class="r">${taka(a.reserve)}</td>
        <td>${a.lots.filter((l) => l.status === 'sold').length}/${a.lots.length}</td><td>${a.status !== 'closed' ? `<button class="btn small" data-action="close" data-id="${a.id}">Close now</button>` : ''}</td></tr>`).join('') || '<tr><td colspan="7">No S/CELL Nights yet.</td></tr>'}
      </tbody></table>
      <h2 class="h3" style="margin:40px 0 12px">Schedule an S/CELL Night</h2>
      <p class="fine">All unsold cards of the artist go up for auction. Winners are charged and own their cards when the night closes; unsold cards return to the vault for a second auction.</p>
      <form class="form wide" data-form="auction" style="margin-top:12px">
        <label class="field"><span>Artist</span><select class="input" name="artistId" required>${artists.filter((a) => a.cardsOwned < 15).map((a) => `<option value="${a.id}">${esc(a.name)}</option>`).join('')}</select></label>
        <label class="field"><span>Title</span><input class="input" name="title" placeholder="S/CELL Night: artist name"></label>
        <label class="field"><span>Bidding opens</span><input class="input" type="datetime-local" name="startsAt" value="${local(Date.now())}" required></label>
        <label class="field"><span>Bidding closes</span><input class="input" type="datetime-local" name="endsAt" value="${local(Date.now() + 3 * 3600000)}" required></label>
        <label class="field"><span>Starting price per card (৳)</span><input class="input" type="number" name="reserve" value="${state.config.firstSale.defaultReserve}" min="1"></label>
        <p class="form-error"></p><div><button class="btn" type="submit">Schedule night</button></div></form>`;
    on('click', 'close', async (b) => { const r = await api(`/api/admin/auctions/${b.dataset.id}/close`, { method: 'POST' }); toast(`Closed: ${r.sold} sold, ${r.unsold} unsold.`); reload(); });
    on('submit', 'auction', async (d) => {
      await api('/api/admin/auctions', { method: 'POST', body: { ...d, startsAt: new Date(d.startsAt).toISOString(), endsAt: new Date(d.endsAt).toISOString() } });
      toast('S/CELL Night scheduled.'); reload();
    });
  }

  if (tab === 'trades') {
    const { trades } = await api('/api/admin/trades');
    body.innerHTML = `<p class="fine">Trades settle automatically once the buyer has confirmed the chip and the verification period has ended. Release early or cancel (refund) here, for example after a dispute.</p>
      <table class="table" style="margin-top:16px"><thead><tr><th>Card</th><th>Seller</th><th>Buyer</th><th class="r">Price</th><th>Chip</th><th>Status</th><th></th></tr></thead><tbody>
      ${trades.map((t) => `<tr><td>${esc(t.artist)} ${esc(t.code)}</td><td>${esc(t.seller)}</td><td>${esc(t.buyer)}</td><td class="r">${taka(t.price)}<br><span class="fine">+${taka(t.transferFee)}</span></td>
        <td>${t.chipConfirmed ? 'Confirmed' : 'Waiting'}</td><td>${esc(t.status)}<br><span class="fine">until ${dateTime(t.verifyUntil)}</span></td>
        <td><div class="btn-row"><button class="btn small" data-action="release" data-id="${t.id}">Release</button><button class="btn small danger" data-action="cancel" data-id="${t.id}">Cancel and refund</button></div></td></tr>`).join('') || '<tr><td colspan="7">No trades in escrow.</td></tr>'}
      </tbody></table>`;
    on('click', 'release', async (b) => { await api(`/api/admin/trades/${b.dataset.id}/release`, { method: 'POST' }); toast('Released. Everyone has been paid.'); reload(); });
    on('click', 'cancel', async (b) => { if (!confirm('Cancel this trade and refund the buyer?')) return; await api(`/api/admin/trades/${b.dataset.id}/cancel`, { method: 'POST' }); toast('Cancelled and refunded.'); reload(); });
  }

  if (tab === 'votes') {
    const { poll } = await api('/api/polls/current');
    body.innerHTML = `${poll ? `<div class="panel"><h2 class="h3">${esc(poll.title)} <span class="fine">(${esc(poll.status)})</span></h2>
        ${poll.options.map((o) => `<div class="vote-option light"><strong>${esc(o.name)}</strong><span>${o.points} pts from ${o.voters} ${o.voters === 1 ? 'voter' : 'voters'}</span></div>`).join('')}
        ${poll.status === 'open' ? `<p style="margin-top:16px"><button class="btn ghost" data-action="closepoll" data-id="${poll.id}">Close this vote</button></p>` : ''}</div>` : '<p class="empty">No votes yet.</p>'}
      <h2 class="h3" style="margin:40px 0 12px">Start a Next Artist Vote</h2>
      <form class="form" data-form="poll"><label class="field"><span>Question</span><input class="input" name="title" value="Who should be the next S/CELL artist?" required></label>
        <label class="field"><span>Artists, one per line</span><textarea class="input" name="options" required></textarea></label>
        <p class="form-error"></p><div><button class="btn" type="submit">Start vote</button></div></form>`;
    on('click', 'closepoll', async (b) => { await api(`/api/admin/polls/${b.dataset.id}/close`, { method: 'POST' }); toast('Vote closed.'); reload(); });
    on('submit', 'poll', async (d) => { await api('/api/admin/polls', { method: 'POST', body: { title: d.title, options: d.options.split('\n') } }); toast('Vote started.'); reload(); });
  }

  if (tab === 'season') {
    const r = await api('/api/admin/ranking');
    body.innerHTML = `<div class="stat-grid"><div class="stat"><b>${esc(r.season.name)}</b><span>ends ${date(r.season.ends_at)}</span></div>
        <div class="stat"><b>${taka(r.pool)}</b><span>in the reward pool</span></div><div class="stat"><b>${taka(r.wanted)}</b><span>full tier rewards</span></div>
        <div class="stat"><b>${Math.round(r.scale * 100)}%</b><span>of tier rewards payable</span></div></div>
      <p class="notice" style="margin-top:24px">Rewards are paid as credit and never exceed the pool. Have a lawyer approve the wording before announcing season rewards publicly.</p>
      <table class="table" style="margin-top:20px"><thead><tr><th>Rank</th><th>Collector</th><th class="r">Holding value</th><th class="r">Tier</th><th class="r">Credit if closed now</th></tr></thead><tbody>
        ${r.ranked.map((x) => `<tr><td>${x.rank}</td><td>${esc(x.displayName)}</td><td class="r">${taka(x.value)}</td><td class="r">${x.rewardPct}%</td><td class="r">${taka(x.credit)}</td></tr>`).join('') || '<tr><td colspan="5">No eligible collectors.</td></tr>'}
      </tbody></table>
      <p style="margin-top:24px"><button class="btn" data-action="closeseason">Close the season and pay reward credit</button></p>`;
    on('click', 'closeseason', async () => { if (!confirm('Close the season and pay reward credit now? This cannot be undone.')) return; const x = await api('/api/admin/seasons/close', { method: 'POST' }); toast(`${x.season} closed: ${taka(x.paid)} credit paid to ${x.collectors} collectors.`); reload(); });
  }

  if (tab === 'accounts') {
    const [{ users }, artists, { sponsors }] = await Promise.all([api('/api/admin/collectors'), artistsList(), api('/api/admin/sponsors')]);
    body.innerHTML = `<p class="subtitle">Give artists and sponsors their own logins and dashboards.</p>
      <form class="form wide" data-form="account" style="margin-top:20px">
        <label class="field"><span>Account type</span><select class="input" name="role"><option value="artist">Artist</option><option value="sponsor">Sponsor</option></select></label>
        <label class="field"><span>Artist (for artist accounts)</span><select class="input" name="artistId">${artists.map((a) => `<option value="${a.id}">${esc(a.name)}</option>`).join('')}</select></label>
        <label class="field"><span>Sponsor (for sponsor accounts)</span><select class="input" name="sponsorId">${sponsors.map((s) => `<option value="${s.id}">${esc(s.name)}</option>`).join('') || '<option value="">Add a sponsor first</option>'}</select></label>
        <label class="field"><span>Name</span><input class="input" name="name" required></label>
        <label class="field"><span>Email</span><input class="input" name="email" type="email" required></label>
        <label class="field"><span>Phone</span><input class="input" name="phone"></label>
        <label class="field"><span>Temporary password</span><input class="input" name="password" minlength="8" required><small>Share it privately; they can sign in and accept their terms.</small></label>
        <p class="form-error"></p><div><button class="btn" type="submit">Create account</button></div></form>
      <h2 class="h3" style="margin:40px 0 12px">All accounts</h2>
      <div class="table-scroll"><table class="table"><thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Identity</th><th class="r">Credit</th></tr></thead><tbody>
        ${users.map((u) => `<tr><td>${esc(u.displayName)}<br><span class="fine">${esc(u.name)}</span></td><td>${esc(u.email)}</td><td>${esc(u.role)}${u.artistId ? ` <a class="fine" href="/dashboard/artist?id=${u.artistId}">dashboard</a>` : ''}${u.sponsorId ? ` <a class="fine" href="/dashboard/sponsor?id=${u.sponsorId}">dashboard</a>` : ''}</td><td>${esc(u.kycStatus)}</td><td class="r">${taka(u.walletCredit)}</td></tr>`).join('')}
      </tbody></table></div>`;
    on('submit', 'account', async (d) => { await api('/api/admin/accounts', { method: 'POST', body: d }); toast(`${d.role === 'artist' ? 'Artist' : 'Sponsor'} account created.`); reload(); });
  }

  if (tab === 'policies') {
    const { policies } = await api('/api/admin/policies');
    const editing = new URLSearchParams(location.search).get('edit');
    if (!editing) {
      body.innerHTML = `<p class="subtitle">Edit any policy. Each save creates a new version, and people who must accept it are asked again.</p>
        <table class="table" style="margin-top:20px"><thead><tr><th>Policy</th><th>Version</th><th>Status</th><th></th></tr></thead><tbody>
        ${policies.map((p) => `<tr><td><a href="/policies/${esc(p.slug)}">${esc(p.title)}</a><br><span class="fine">${esc(p.subtitle)}</span></td><td>${p.version}</td><td>${p.edited ? `Edited ${date(p.updatedAt)}` : 'Standard text'}</td>
          <td><div class="btn-row"><a class="btn small ghost" href="/admin?tab=policies&edit=${esc(p.slug)}">Edit</a>${p.edited ? `<button class="btn small danger" data-action="resetpolicy" data-slug="${esc(p.slug)}">Restore standard</button>` : ''}</div></td></tr>`).join('')}
        </tbody></table>`;
      on('click', 'resetpolicy', async (b) => { if (!confirm('Restore the standard text of this policy?')) return; await api(`/api/admin/policies/${b.dataset.slug}/reset`, { method: 'POST' }); toast('Standard text restored.'); reload(); });
    } else {
      const { policy: p } = await api(`/api/policies/${editing}`);
      const toText = (sec) => [...(sec.p || []), ...(sec.items || []).map((x) => `- ${x}`)].join('\n');
      body.innerHTML = `<p class="fine"><a href="/admin?tab=policies">All policies</a></p>
        <form class="form" data-form="policy" style="max-width:860px;margin-top:16px">
          <label class="field"><span>Title</span><input class="input" name="title" value="${esc(p.title)}" required></label>
          <label class="field"><span>Subtitle</span><input class="input" name="subtitle" value="${esc(p.subtitle)}"></label>
          <label class="field"><span>Summary</span><textarea class="input" name="summary">${esc(p.summary)}</textarea></label>
          <p class="fine">In each section, one line is one paragraph. Start a line with "- " to make it a bullet point.</p>
          ${p.sections.map((sec, i) => `<fieldset class="panel"><label class="field"><span>Section ${i + 1} heading</span><input class="input" name="h${i}" value="${esc(sec.h)}"></label>
            <label class="field"><span>Text</span><textarea class="input" name="t${i}" style="min-height:160px">${esc(toText(sec))}</textarea></label></fieldset>`).join('')}
          <fieldset class="panel"><label class="field"><span>New section heading (optional)</span><input class="input" name="h${p.sections.length}"></label>
            <label class="field"><span>Text</span><textarea class="input" name="t${p.sections.length}"></textarea></label></fieldset>
          <p class="form-error"></p><div><button class="btn" type="submit">Save as version ${p.version + 1}</button></div>
        </form>`;
      on('submit', 'policy', async (d) => {
        const sections = [];
        for (let i = 0; i <= p.sections.length; i++) {
          const h = (d[`h${i}`] || '').trim();
          if (!h) continue;
          const lines = (d[`t${i}`] || '').split('\n').map((x) => x.trim()).filter(Boolean);
          sections.push({ h, p: lines.filter((x) => !x.startsWith('- ')), items: lines.filter((x) => x.startsWith('- ')).map((x) => x.slice(2)) });
        }
        const r = await api(`/api/admin/policies/${editing}`, { method: 'POST', body: { title: d.title, subtitle: d.subtitle, summary: d.summary, sections } });
        toast(`Saved as version ${r.version}.`);
        navigate(`/policies/${editing}`);
      });
    }
  }

  if (tab === 'applications') {
    const { applications } = await api('/api/admin/applications');
    body.innerHTML = applications.map((a) => `<div class="panel"><p class="fine">${a.type === 'artist' ? 'Artist application' : 'Sponsor inquiry'}, ${dateTime(a.created_at)}, ${esc(a.status)}</p>
      <dl class="facts" style="margin:10px 0 14px">${Object.entries(a.payload).map(([k, v]) => `<dt>${esc(k)}</dt><dd style="text-align:left">${esc(v)}</dd>`).join('')}</dl>
      ${a.status === 'new' ? `<button class="btn small ghost" data-action="reviewed" data-id="${a.id}">Mark as reviewed</button>` : ''}</div>`).join('') || '<p class="empty">No applications yet.</p>';
    on('click', 'reviewed', async (b) => { await api(`/api/admin/applications/${b.dataset.id}`, { method: 'POST', body: { status: 'reviewed' } }); reload(); });
  }

  if (tab === 'ledger') {
    const { entries, totals } = await api('/api/admin/ledger');
    body.innerHTML = `<div class="split"><div><h2 class="h3">Totals by party</h2><table class="table" style="margin-top:12px"><tbody>${totals.map((t) => `<tr><td>${esc(t.party)}</td><td class="r">${taka(t.total)}</td></tr>`).join('')}</tbody></table></div><div></div></div>
      <h2 class="h3" style="margin:40px 0 12px">Latest entries</h2>
      <div class="table-scroll"><table class="table"><thead><tr><th>Date</th><th>Trade</th><th>Party</th><th>Note</th><th class="r">Amount</th></tr></thead><tbody>
        ${entries.map((e) => `<tr><td>${dateTime(e.created_at)}</td><td>${e.trade_id || ''}</td><td>${esc(e.party)}${e.party_id ? ` #${e.party_id}` : ''}</td><td>${esc(e.note)}</td><td class="r">${taka(e.amount)}</td></tr>`).join('')}
      </tbody></table></div>`;
  }

  if (tab === 'tools') {
    const [artists, { users }] = await Promise.all([artistsList(), api('/api/admin/collectors')]);
    body.innerHTML = `<div class="split">
      <div class="panel"><h2 class="h3">Run housekeeping now</h2><p class="fine">Closes finished auctions, settles verified trades and retires cards whose official price has reached zero. It also runs automatically every 15 minutes.</p>
        <button class="btn" data-action="maint">Run now</button></div>
      <div class="panel"><h2 class="h3">Issue a Reward Edition card</h2><p class="fine">A separate, tradable series that never counts toward the official 15.</p>
        <form class="form" data-form="reward"><label class="field"><span>Artist</span><select class="input" name="artistId">${artists.map((a) => `<option value="${a.id}">${esc(a.name)}</option>`).join('')}</select></label>
          <label class="field"><span>Collector</span><select class="input" name="userId">${users.filter((u) => u.role !== 'admin').map((u) => `<option value="${u.id}">${esc(u.displayName)} (${esc(u.email)})</option>`).join('')}</select></label>
          <label class="field"><span>Title</span><input class="input" name="title" placeholder="Season 1, Round 1 reward"></label>
          <label class="field"><span>Personal message from the artist</span><input class="input" name="body" maxlength="280"></label>
          <p class="form-error"></p><div><button class="btn" type="submit">Issue card</button></div></form></div>
      </div>
      <div class="panel" style="margin-top:20px"><h2 class="h3">Report a card lost or destroyed</h2><p class="fine">The card is never reissued; the registry marks it lost so the count stays honest.</p>
        <form class="lot-form" data-form="lost"><input class="input" name="cardId" type="number" placeholder="Card number in the database (from its page address)" required><button class="btn small danger" type="submit">Mark lost</button></form></div>`;
    on('click', 'maint', async () => { const r = await api('/api/admin/maintenance', { method: 'POST' }); toast(`Done: ${r.settled} trades settled, ${r.retired} cards retired.`); });
    on('submit', 'reward', async (d) => { const r = await api('/api/admin/reward-cards', { method: 'POST', body: d }); toast('Reward Edition card issued.'); navigate(`/cards/${r.cardId}`); });
    on('submit', 'lost', async (d) => { if (!confirm('Mark this card as lost? This cannot be undone.')) return; await api(`/api/admin/cards/${d.cardId}/lost`, { method: 'POST' }); toast('Card marked lost.'); });
  }
}
