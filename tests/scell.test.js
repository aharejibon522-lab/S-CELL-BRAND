import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { openDb } from '../server/db.js';
import { createApp } from '../server/app.js';
import { seed } from '../server/seed.js';
import { DAY } from '../server/security.js';

process.env.ADMIN_PASSWORD = 'admin-pass-123';
process.env.SEED_DEMO = 'false';

async function setup() {
  const db = openDb(':memory:');
  const { handler, svc } = createApp(db);
  await seed(db, svc, { quiet: true });
  const server = createServer(handler);
  await new Promise((r) => server.listen(0, r));
  const base = `http://127.0.0.1:${server.address().port}`;
  const client = () => {
    let cookie = '';
    return async (method, path, body) => {
      const res = await fetch(base + path, {
        method,
        headers: { 'content-type': 'application/json', 'x-scell': '1', cookie },
        body: body ? JSON.stringify(body) : undefined,
      });
      const sc = res.headers.get('set-cookie');
      if (sc) cookie = sc.split(';')[0];
      return { status: res.status, data: await res.json() };
    };
  };
  return { db, svc, server, base, client };
}

async function makeCollector(env, n) {
  const c = env.client();
  const r = await c('POST', '/api/auth/register', { name: `Collector ${n}`, email: `c${n}@test.bd`, phone: `0171100${String(n).padStart(4, '0')}`, password: 'password123', acceptTerms: true });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  const k = await c('POST', '/api/me/kyc', { nid: `12345678${String(n).padStart(2, '0')}` });
  assert.equal(k.data.status, 'pending');
  return { c, id: r.data.user.id };
}

test('full S/CELL flow: auction, first sale, resale with escrow, splits, votes, ranking', async (t) => {
  const env = await setup();
  t.after(() => env.server.close());
  const { db, svc } = env;

  // CSRF: a state-changing request without the header is blocked.
  const blocked = await fetch(env.base + '/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
  assert.equal(blocked.status, 403);

  const admin = env.client();
  assert.equal((await admin('POST', '/api/auth/login', { email: 'admin@scell.local', password: 'admin-pass-123' })).status, 200);
  assert.equal((await admin('POST', '/api/auth/login', { email: 'admin@scell.local', password: 'wrong' })).status, 401);

  const a = await makeCollector(env, 1);
  const b = await makeCollector(env, 2);

  // Same NID cannot open a second account.
  const dup = await makeCollector(env, 3).catch(() => null);
  const dupKyc = await dup.c('POST', '/api/me/kyc', { nid: '1234567801' });
  assert.equal(dupKyc.status, 409);

  // Admin approves identity checks.
  const pending = (await admin('GET', '/api/admin/kyc')).data.pending;
  assert.ok(pending.length >= 2);
  for (const u of [a, b]) assert.equal((await admin('POST', `/api/admin/kyc/${u.id}`, { approve: true })).status, 200);

  // Artist with exactly 15 cards in the 5 / 3 / 2 / 5 structure.
  const art = await admin('POST', '/api/admin/artists', { name: 'Test Artist', category: 'Singer', tookAdvance: false });
  const artistId = art.data.id;
  const cards = db.all('SELECT theme, orientation FROM cards WHERE artist_id = ?', artistId);
  assert.equal(cards.length, 15);
  assert.deepEqual(['t1', 't2', 't3', 'portrait'].map((th) => cards.filter((c) => c.theme === th).length), [5, 3, 2, 5]);

  // Public card data never exposes the chip ID.
  const pub = await env.client()('GET', `/api/artists/${art.data.slug}`);
  assert.equal(pub.data.artist.cards[0].chipUid, undefined);

  // Auction: membership needed to bid, reserve enforced, increments enforced, staff blocked.
  const au = await admin('POST', '/api/admin/auctions', { artistId, reserve: 1500, startsAt: new Date(Date.now() - 1000).toISOString(), endsAt: new Date(Date.now() + DAY).toISOString() });
  const auction = (await a.c('GET', `/api/auctions/${au.data.id}`)).data.auction;
  assert.equal(auction.lots.length, 15);
  const lot1 = auction.lots[0].id, lot2 = auction.lots[1].id;
  assert.equal((await a.c('POST', `/api/lots/${lot1}/bid`, { amount: 1500 })).status, 403); // no membership yet
  assert.equal((await a.c('POST', '/api/me/membership')).status, 200);
  assert.equal((await b.c('POST', '/api/me/membership')).status, 200);
  assert.equal((await a.c('POST', `/api/lots/${lot1}/bid`, { amount: 1000 })).status, 400); // below reserve
  assert.equal((await a.c('POST', `/api/lots/${lot1}/bid`, { amount: 1500 })).status, 200);
  assert.equal((await b.c('POST', `/api/lots/${lot1}/bid`, { amount: 1550 })).status, 400); // below increment
  assert.equal((await b.c('POST', `/api/lots/${lot1}/bid`, { amount: 2000 })).status, 200);
  assert.equal((await a.c('POST', `/api/lots/${lot2}/bid`, { amount: 3000 })).status, 200);
  assert.equal((await admin('POST', `/api/lots/${lot2}/bid`, { amount: 9000 })).status, 403);

  // Close: winners own their cards; artist 20%, S/CELL 80%; unsold cards return to the vault.
  const closed = await admin('POST', `/api/admin/auctions/${au.data.id}/close`);
  assert.deepEqual(closed.data, { sold: 2, unsold: 13 });
  const card1 = db.get('SELECT * FROM lots l JOIN cards c ON c.id = l.card_id WHERE l.id = ?', lot1);
  assert.equal(card1.owner_id, b.id);
  assert.equal(card1.last_price, 2000);
  const fs = db.all(`SELECT party, amount FROM ledger WHERE trade_id = (SELECT id FROM trades WHERE lot_id = ?)`, lot1);
  assert.equal(fs.find((l) => l.party === 'artist').amount, 400);
  assert.equal(fs.find((l) => l.party === 'scell').amount, 1600);
  assert.equal(db.get(`SELECT COUNT(*) AS n FROM cards WHERE artist_id = ? AND status = 'vault'`, artistId).n, 13);

  // Resale: minimum price is last price + step; seller lists, buyer pays price + transfer charge into escrow.
  const card1Id = card1.card_id;
  assert.equal((await b.c('POST', `/api/cards/${card1Id}/list`, { price: 2100 })).status, 400);
  const listed = await b.c('POST', `/api/cards/${card1Id}/list`, { price: 10000 });
  assert.equal(listed.status, 200);
  assert.equal((await a.c('POST', `/api/cards/${card1Id}/list`, { price: 20000 })).status, 403); // not the owner
  const bought = await a.c('POST', `/api/listings/${listed.data.listingId}/buy`, {});
  assert.equal(bought.status, 200);
  assert.equal(bought.data.transferFee, 300); // 2.5% of 10,000 = 250, minimum 300
  assert.equal((await admin('GET', '/api/admin/trades')).data.trades.length, 1);

  // Settlement waits for the chip confirmation and the verification period.
  const tradeId = bought.data.tradeId;
  assert.equal((await a.c('POST', `/api/trades/${tradeId}/confirm-chip`, { chip: 'WRONG' })).status, 400);
  await assert.rejects(svc.settleTrade(tradeId), /chip/);
  const chip = (await b.c('GET', `/api/cards/${card1Id}`)).data.card.chipUid; // the owner sees the chip ID
  assert.ok(chip);
  assert.equal((await a.c('POST', `/api/trades/${tradeId}/confirm-chip`, { chip })).status, 200);
  await assert.rejects(svc.settleTrade(tradeId), /verification period/);
  db.run('UPDATE trades SET verify_until = ? WHERE id = ?', Date.now() - 1, tradeId);
  const m = await admin('POST', '/api/admin/maintenance');
  assert.equal(m.data.settled, 1);

  // Split 80 / 13 / 6 (held by S/CELL, no sponsor) / 1, and the card moves to the buyer.
  const rs = db.all('SELECT party, amount, note FROM ledger WHERE trade_id = ?', tradeId);
  const get = (p) => rs.filter((l) => l.party === p).reduce((s, l) => s + l.amount, 0);
  assert.equal(get('seller'), 8000);
  assert.equal(get('artist'), 1300);
  assert.equal(get('scell') + get('reward_pool'), 600 + 100 + 300);
  const after = svc.card(card1Id);
  assert.equal(after.owner_id, a.id);
  assert.equal(after.trade_count, 1);
  assert.ok(svc.badgesOf(a.id).some((x) => x.code === 'resale'));

  // Votes: weighted by badge, one per person.
  const pollId = (await admin('POST', '/api/admin/polls', { title: 'Next artist', options: ['X', 'Y'] })).data.id;
  const opts = (await a.c('GET', '/api/polls/current')).data.poll.options;
  const v = await a.c('POST', `/api/polls/${pollId}/vote`, { optionId: opts[0].id });
  assert.equal(v.data.weight, 3); // resale buyer
  assert.equal((await a.c('POST', `/api/polls/${pollId}/vote`, { optionId: opts[1].id })).status, 409);

  // Ranking pays credit only from the pool, never more than it holds.
  db.run('UPDATE cards SET acquired_at = ? WHERE owner_id IS NOT NULL', Date.now() - 200 * DAY);
  const pool = svc.poolBalance();
  const closedSeason = await admin('POST', '/api/admin/seasons/close');
  assert.ok(closedSeason.data.paid <= pool);
  assert.ok(svc.poolBalance() >= 0);
});

test('splits: advance, sponsor, high tier, decay and retirement', async (t) => {
  const env = await setup();
  t.after(() => env.server.close());
  const { svc } = env;
  const artist = { took_advance: 1, sponsor_id: 7 };
  const low = svc.splitResale(50000, artist);
  assert.deepEqual(low.pct, { seller: 80, artist: 12, sponsor: 6, scell: 2 });
  assert.equal(low.seller + low.artist + low.sponsor + low.scell, 50000);
  const high = svc.splitResale(200000, { took_advance: 0, sponsor_id: 7 });
  assert.deepEqual(high.pct, { seller: 85, artist: 10, sponsor: 4, scell: 1 });
  assert.equal(svc.splitFirstSale(10000, { took_advance: 1 }).artist, 1800);

  const base = { last_price: 10000, last_sale_at: Date.now(), created_at: Date.now() };
  assert.equal(svc.pricing(base).minPrice, 10150);
  assert.equal(svc.pricing({ ...base, last_sale_at: Date.now() - 400 * DAY }).minPrice, 9000);
  assert.equal(svc.pricing({ ...base, last_sale_at: Date.now() - (365 + 9 * 365 + 5) * DAY }).retired, true);

  assert.equal(svc.cashbackPct(1), 0);
  assert.equal(svc.cashbackPct(2), 3);
  assert.equal(svc.cashbackPct(4), 5);
  assert.equal(svc.cashbackPct(12), 10);
});

test('policies, guides, calculators, dashboards and statements', async (t) => {
  process.env.SEED_DEMO = 'true';
  const env = await setup();
  process.env.SEED_DEMO = 'false';
  t.after(() => env.server.close());
  const anon = env.client();

  const list = (await anon('GET', '/api/policies')).data.policies;
  assert.equal(list.length, 15);
  assert.ok(list.every((p) => p.subtitle && p.summary));
  const fees = (await anon('GET', '/api/policies/fees')).data.policy;
  assert.ok(JSON.stringify(fees).includes('13%'));

  for (const a of ['collectors', 'artists', 'sponsors']) {
    const g = (await anon('GET', `/api/guides/${a}`)).data.guide;
    assert.ok(g.facilities.items.length >= 6 && g.faq.length >= 5 && g.policies.length >= 5 && g.subtitle);
  }
  const rc = (await anon('GET', '/api/calc/resale?price=50000')).data;
  assert.equal(rc.seller + rc.artist + rc.sponsor + rc.scell, 50000);
  assert.equal(rc.artist, 6500);
  assert.equal((await anon('GET', '/api/calc/artist?avgFirst=10000&resalesPerYear=10&avgResale=20000&years=5')).data.firstSaleShare, 30000);
  const sc = (await anon('GET', '/api/calc/sponsor?artists=2&monthlyFee=3750&resalesPerArtistPerYear=10&avgResale=10000&months=12')).data;
  assert.equal(sc.feesPaid, 90000);
  assert.equal(sc.coBrandingFees, 12000);
  assert.ok((await anon('GET', '/api/stats')).data.resales >= 4);

  // Registration needs terms acceptance and records it.
  const c = env.client();
  const bad = await c('POST', '/api/auth/register', { name: 'X Y', email: 'xy@test.bd', phone: '01712000000', password: 'password123' });
  assert.equal(bad.status, 400);
  const ok = await c('POST', '/api/auth/register', { name: 'X Y', email: 'xy@test.bd', phone: '01712000000', password: 'password123', acceptTerms: true });
  assert.equal(ok.data.user.pendingPolicies.length, 0);
  const csvRes = await fetch(env.base + '/api/me/statement.csv', { headers: { cookie: '' } });
  assert.equal(csvRes.status, 401);

  // Artist dashboard and statement.
  const artist = env.client();
  await artist('POST', '/api/auth/login', { email: 'artist@scell.local', password: 'demo12345' });
  const me = (await artist('GET', '/api/auth/me')).data.user;
  assert.deepEqual(me.pendingPolicies.map((p) => p.slug), ['artist-terms']);
  await artist('POST', '/api/me/accept', { slug: 'artist-terms' });
  const ad = (await artist('GET', '/api/artist/dashboard')).data;
  assert.equal(ad.cards.filter((x) => x.series === 'official').length, 15);
  assert.ok(ad.totals.firstSale > 0 && ad.totals.resale > 0);
  assert.equal(ad.shares.firstSale, 18); // demo artist took an advance
  assert.ok(ad.exposure.verifications >= 26);
  assert.equal((await artist('GET', '/api/sponsor/dashboard')).status, 403);

  // Sponsor dashboard.
  const sp = env.client();
  await sp('POST', '/api/auth/login', { email: 'sponsor@scell.local', password: 'demo12345' });
  const sd = (await sp('GET', '/api/sponsor/dashboard')).data;
  assert.equal(sd.totals.artists, 1);
  assert.ok(sd.totals.coBranding > 0);
  assert.equal(sd.totals.feesPaid, 3750);

  // Admin edits a policy: version goes up and acceptance is needed again.
  const admin = env.client();
  await admin('POST', '/api/auth/login', { email: 'admin@scell.local', password: 'admin-pass-123' });
  const p = (await admin('GET', '/api/policies/artist-terms')).data.policy;
  const saved = await admin('POST', '/api/admin/policies/artist-terms', { title: p.title, subtitle: p.subtitle, summary: p.summary, sections: p.sections });
  assert.equal(saved.data.version, 2);
  assert.equal((await artist('GET', '/api/auth/me')).data.user.pendingPolicies.length, 1);
});
