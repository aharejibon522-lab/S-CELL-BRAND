// Everything that presents S/CELL to its three audiences: policies, guides, calculators,
// public statistics, artist and sponsor dashboards, and downloadable statements.

import { config, publicConfig } from './config.js';
import { policies, POLICY_BASE_VERSION } from './content/policies.js';
import { guides } from './content/guides.js';
import { now, hashPassword } from './security.js';
import { HttpError } from './services.js';

const fail = (status, message) => { throw new HttpError(status, message); };
const MONTH = `strftime('%Y-%m', created_at / 1000, 'unixepoch')`;
const csvCell = (v) => {
  const s = String(v ?? '');
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const toCsv = (header, rows) => [header, ...rows].map((r) => r.map(csvCell).join(',')).join('\n') + '\n';
const iso = (ms) => (ms ? new Date(ms).toISOString().slice(0, 10) : '');

export const REQUIRED_POLICIES = {
  collector: ['terms', 'privacy'],
  admin: [],
  artist: ['terms', 'privacy', 'artist-terms'],
  sponsor: ['terms', 'privacy', 'sponsor-terms'],
};

export const DISCLAIMER = 'Illustration only, using the numbers you entered. S/CELL cards are cultural collectibles, not investments: real prices and resale activity can be higher, lower or zero, and nothing here is a promise of earnings.';

export function createPortal(db, svc) {
  // ---------- Policies ----------
  function policy(slug) {
    const base = policies(config).find((p) => p.slug === slug);
    if (!base) return null;
    const o = db.get('SELECT * FROM policy_overrides WHERE slug = ?', slug);
    if (!o) return { ...base, version: POLICY_BASE_VERSION, updatedAt: null, edited: false };
    return { ...base, title: o.title, subtitle: o.subtitle || base.subtitle, summary: o.summary || base.summary, sections: JSON.parse(o.sections), version: o.version, updatedAt: o.updated_at, edited: true };
  }
  const policyList = () => policies(config).map((p) => {
    const full = policy(p.slug);
    return { slug: full.slug, title: full.title, subtitle: full.subtitle, summary: full.summary, audience: full.audience, version: full.version, updatedAt: full.updatedAt, edited: full.edited };
  });
  const currentVersion = (slug) => policy(slug)?.version;

  function savePolicy(slug, { title, subtitle, summary, sections }) {
    const cur = policy(slug);
    if (!cur) fail(404, 'Policy not found.');
    if (!Array.isArray(sections) || !sections.length) fail(400, 'A policy needs at least one section.');
    const clean = sections.map((s) => ({
      h: String(s.h || '').slice(0, 120),
      p: Array.isArray(s.p) ? s.p.map((x) => String(x).slice(0, 2000)).filter(Boolean) : undefined,
      items: Array.isArray(s.items) ? s.items.map((x) => String(x).slice(0, 600)).filter(Boolean) : undefined,
    })).filter((s) => s.h);
    const version = cur.version + 1;
    db.run(`INSERT INTO policy_overrides (slug, version, title, subtitle, summary, sections, updated_at) VALUES (?,?,?,?,?,?,?)
            ON CONFLICT(slug) DO UPDATE SET version = excluded.version, title = excluded.title, subtitle = excluded.subtitle,
            summary = excluded.summary, sections = excluded.sections, updated_at = excluded.updated_at`,
      slug, version, String(title || cur.title).slice(0, 120), String(subtitle ?? cur.subtitle).slice(0, 200), String(summary ?? cur.summary).slice(0, 400), JSON.stringify(clean), now());
    return { version };
  }

  function resetPolicy(slug) {
    const cur = policy(slug);
    if (!cur) fail(404, 'Policy not found.');
    // Keep the version moving forward so acceptances stay meaningful.
    db.run('DELETE FROM policy_overrides WHERE slug = ?', slug);
    return { version: POLICY_BASE_VERSION };
  }

  function acceptPolicy(userId, slug) {
    const v = currentVersion(slug);
    if (!v) fail(404, 'Policy not found.');
    db.run('INSERT OR IGNORE INTO policy_acceptances (user_id, slug, version, accepted_at) VALUES (?,?,?,?)', userId, slug, v, now());
    return { slug, version: v };
  }

  function acceptances(user) {
    const rows = db.all('SELECT slug, version, accepted_at FROM policy_acceptances WHERE user_id = ? ORDER BY accepted_at', user.id);
    const required = REQUIRED_POLICIES[user.role] || [];
    const pending = required.filter((slug) => !rows.some((r) => r.slug === slug && r.version === currentVersion(slug)))
      .map((slug) => { const p = policy(slug); return { slug, title: p.title, version: p.version }; });
    return { accepted: rows.map((r) => ({ slug: r.slug, version: r.version, acceptedAt: r.accepted_at, current: r.version === currentVersion(r.slug) })), pending };
  }

  // ---------- Guides ----------
  function guide(audience) {
    const g = guides(config)[audience];
    if (!g) fail(404, 'Guide not found.');
    return { ...g, policies: g.policies.map((slug) => { const p = policy(slug); return { slug, title: p.title, subtitle: p.subtitle }; }) };
  }

  // ---------- Calculators ----------
  const num = (v, d, min = 0, max = 1e9) => { const n = Number(v); return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : d; };

  function calcResale(q) {
    const price = Math.round(num(q.price, 10000, 1));
    const advance = q.advance === 'true' || q.advance === true;
    const sponsored = !(q.sponsored === 'false' || q.sponsored === false);
    const s = svc.splitResale(price, { took_advance: advance ? 1 : 0, sponsor_id: sponsored ? 1 : null });
    const fee = svc.transferFee(price);
    const breakEven = Math.ceil(price / (config.resale.low.seller / 100));
    return {
      price, transferFee: fee, buyerPays: price + fee,
      seller: s.seller, artist: s.artist, sponsor: s.sponsor, scell: s.scell, pct: s.pct, sponsorHeldByScell: !sponsored,
      tier: price > config.resale.tierBreak ? 'high' : 'low',
      nextMinimum: price + config.resale.minStep,
      breakEvenIfBoughtAtThisPrice: breakEven,
      disclaimer: DISCLAIMER,
    };
  }

  function calcArtist(q) {
    const avgFirst = Math.round(num(q.avgFirst, 5000, 1));
    const resalesPerYear = num(q.resalesPerYear, 10, 0, 1000);
    const avgResale = Math.round(num(q.avgResale, 10000, 1));
    const years = num(q.years, 5, 1, 30);
    const advance = q.advance === 'true' || q.advance === true;
    const fs = svc.splitFirstSale(15 * avgFirst, { took_advance: advance ? 1 : 0 });
    const perResale = svc.splitResale(avgResale, { took_advance: advance ? 1 : 0, sponsor_id: 1 });
    const resaleYear = Math.round(perResale.artist * resalesPerYear);
    return {
      inputs: { avgFirst, resalesPerYear, avgResale, years, advance },
      firstSaleTotal: 15 * avgFirst, firstSaleShare: fs.artist, firstSalePct: fs.artistPct,
      royaltyPerResale: perResale.artist, royaltyPct: perResale.pct.artist,
      royaltiesPerYear: resaleYear, royaltiesOverPeriod: Math.round(resaleYear * years),
      totalOverPeriod: fs.artist + Math.round(resaleYear * years),
      disclaimer: DISCLAIMER,
    };
  }

  function calcSponsor(q) {
    const artists = Math.round(num(q.artists, 1, 1, 200));
    const monthlyFee = Math.round(num(q.monthlyFee, 3750, 0));
    const resalesPerArtistPerYear = num(q.resalesPerArtistPerYear, 10, 0, 1000);
    const avgResale = Math.round(num(q.avgResale, 10000, 1));
    const months = Math.round(num(q.months, 12, 1, 120));
    const per = svc.splitResale(avgResale, { took_advance: 0, sponsor_id: 1 });
    const resales = artists * resalesPerArtistPerYear * (months / 12);
    const coBranding = Math.round(per.sponsor * resales);
    const fees = artists * monthlyFee * months;
    return {
      inputs: { artists, monthlyFee, resalesPerArtistPerYear, avgResale, months },
      feesPaid: fees, resales: Math.round(resales), feePerResale: per.sponsor, feePct: per.pct.sponsor,
      coBrandingFees: coBranding, netCost: fees - coBranding,
      disclaimer: DISCLAIMER,
    };
  }

  // ---------- Public numbers ----------
  function publicStats() {
    const v = (sql, ...p) => db.get(sql, ...p).v || 0;
    return {
      artists: v('SELECT COUNT(*) AS v FROM artists'),
      cardsIssued: v(`SELECT COUNT(*) AS v FROM cards WHERE series = 'official'`),
      cardsOwned: v(`SELECT COUNT(*) AS v FROM cards WHERE owner_id IS NOT NULL`),
      verifiedCollectors: v(`SELECT COUNT(*) AS v FROM users WHERE kyc_status = 'verified' AND role = 'collector'`),
      firstSaleVolume: v(`SELECT SUM(price) AS v FROM trades WHERE kind = 'first_sale' AND status = 'completed'`),
      resaleVolume: v(`SELECT SUM(price) AS v FROM trades WHERE kind = 'resale' AND status = 'completed'`),
      resales: v(`SELECT COUNT(*) AS v FROM trades WHERE kind = 'resale' AND status = 'completed'`),
      paidToArtists: v(`SELECT SUM(amount) AS v FROM ledger WHERE party = 'artist'`),
      paidToSponsors: v(`SELECT SUM(amount) AS v FROM ledger WHERE party = 'sponsor'`),
      rewardCreditPaid: v(`SELECT SUM(amount) AS v FROM ledger WHERE party IN ('cashback','season_reward')`),
      verifications: v(`SELECT COUNT(*) AS v FROM events WHERE type = 'verify'`),
      highestResale: v(`SELECT MAX(price) AS v FROM trades WHERE kind = 'resale' AND status = 'completed'`),
    };
  }

  function recordEvent(type, { artistId = null, cardId = null, userId = null } = {}) {
    db.run('INSERT INTO events (type, artist_id, card_id, user_id, created_at) VALUES (?,?,?,?,?)', type, artistId, cardId, userId, now());
  }

  const exposure = (artistIds) => {
    if (!artistIds.length) return { views: 0, cardViews: 0, verifications: 0, bids: 0 };
    const ph = artistIds.map(() => '?').join(',');
    const count = (type) => db.get(`SELECT COUNT(*) AS v FROM events WHERE type = ? AND artist_id IN (${ph})`, type, ...artistIds).v;
    return {
      views: count('artist_view'), cardViews: count('card_view'), verifications: count('verify'),
      bids: db.get(`SELECT COUNT(*) AS v FROM bids b JOIN lots l ON l.id = b.lot_id JOIN cards c ON c.id = l.card_id WHERE c.artist_id IN (${ph})`, ...artistIds).v,
    };
  };

  // ---------- Artist dashboard ----------
  function artistDashboard(artistId) {
    const a = svc.artist(artistId);
    if (!a) fail(404, 'Artist not found.');
    const sponsor = a.sponsor_id ? db.get('SELECT id, name, category FROM sponsors WHERE id = ?', a.sponsor_id) : null;
    const cards = db.all(`SELECT c.*, u.display_name AS owner FROM cards c LEFT JOIN users u ON u.id = c.owner_id WHERE c.artist_id = ? ORDER BY c.series, c.number`, artistId)
      .map((c) => ({ id: c.id, code: c.code, number: c.number, series: c.series, theme: c.theme, orientation: c.orientation, title: c.title, status: c.status, owner: c.owner, firstSalePrice: c.first_sale_price, lastPrice: c.last_price, tradeCount: c.trade_count }));
    const earned = (like) => db.get(`SELECT COALESCE(SUM(amount),0) AS v FROM ledger WHERE party = 'artist' AND party_id = ? AND note LIKE ?`, artistId, like).v;
    const monthly = db.all(`SELECT ${MONTH} AS month,
        SUM(CASE WHEN note LIKE 'First sale%' THEN amount ELSE 0 END) AS firstSale,
        SUM(CASE WHEN note LIKE 'Resale%' THEN amount ELSE 0 END) AS resale
        FROM ledger WHERE party = 'artist' AND party_id = ? GROUP BY month ORDER BY month DESC LIMIT 24`, artistId);
    const recent = db.all(`SELECT l.amount, l.note, l.created_at AS at, t.price, t.kind, c.id AS cardId, c.number, c.series
        FROM ledger l JOIN trades t ON t.id = l.trade_id JOIN cards c ON c.id = t.card_id
        WHERE l.party = 'artist' AND l.party_id = ? ORDER BY l.id DESC LIMIT 30`, artistId);
    const auctions = db.all(`SELECT a.id, a.title, a.status, a.starts_at AS startsAt, a.ends_at AS endsAt,
        SUM(CASE WHEN l.status = 'sold' THEN 1 ELSE 0 END) AS sold, COUNT(l.id) AS lots, COALESCE(SUM(CASE WHEN l.status = 'sold' THEN l.current_bid END),0) AS total
        FROM auctions a LEFT JOIN lots l ON l.auction_id = a.id WHERE a.artist_id = ? GROUP BY a.id ORDER BY a.id DESC`, artistId);
    const official = cards.filter((c) => c.series === 'official');
    return {
      artist: { id: a.id, slug: a.slug, name: a.name, category: a.category, status: a.status, tookAdvance: !!a.took_advance },
      sponsor,
      shares: {
        firstSale: a.took_advance ? config.firstSale.artistPctWithAdvance : config.firstSale.artistPct,
        resaleLow: config.resale.low.artist - (a.took_advance ? config.resale.advanceArtistReduction : 0),
        resaleHigh: config.resale.high.artist - (a.took_advance ? config.resale.advanceArtistReduction : 0),
        tierBreak: config.resale.tierBreak,
      },
      totals: {
        firstSale: earned('First sale%'), resale: earned('Resale%'),
        cardsOwned: official.filter((c) => c.owner).length,
        resales: official.reduce((s, c) => s + c.tradeCount, 0) + cards.filter((c) => c.series === 'reward').reduce((s, c) => s + c.tradeCount, 0),
        highestPrice: Math.max(0, ...cards.map((c) => c.lastPrice || 0)),
        collectionValue: official.reduce((s, c) => s + (c.lastPrice || 0), 0),
      },
      exposure: exposure([artistId]),
      monthly, recent, auctions, cards,
      obligations: ['One promo video before your S/CELL Night', 'Three social media posts', 'An appearance at your S/CELL Night, with an unplugged set where possible', 'One session for the S/CELL unplugged series, by agreement'],
    };
  }

  // ---------- Sponsor dashboard ----------
  function sponsorDashboard(sponsorId) {
    const s = db.get('SELECT * FROM sponsors WHERE id = ?', sponsorId);
    if (!s) fail(404, 'Sponsor not found.');
    const artists = db.all('SELECT id, slug, name, category, status FROM artists WHERE sponsor_id = ? ORDER BY name', sponsorId);
    const ids = artists.map((a) => a.id);
    const earned = db.get(`SELECT COALESCE(SUM(amount),0) AS v FROM ledger WHERE party = 'sponsor' AND party_id = ?`, sponsorId).v;
    const feesPaid = db.get(`SELECT COALESCE(SUM(amount),0) AS v FROM ledger WHERE party = 'sponsor_fee' AND party_id = ?`, sponsorId).v;
    const monthly = db.all(`SELECT ${MONTH} AS month,
        SUM(CASE WHEN party = 'sponsor' THEN amount ELSE 0 END) AS coBranding,
        SUM(CASE WHEN party = 'sponsor_fee' THEN amount ELSE 0 END) AS feesPaid
        FROM ledger WHERE party IN ('sponsor','sponsor_fee') AND party_id = ? GROUP BY month ORDER BY month DESC LIMIT 24`, sponsorId);
    const recent = db.all(`SELECT l.amount, l.note, l.created_at AS at, t.price, c.id AS cardId, c.number, c.series, a.name AS artist
        FROM ledger l JOIN trades t ON t.id = l.trade_id JOIN cards c ON c.id = t.card_id JOIN artists a ON a.id = c.artist_id
        WHERE l.party = 'sponsor' AND l.party_id = ? ORDER BY l.id DESC LIMIT 30`, sponsorId);
    const perArtist = artists.map((a) => {
      const st = db.get(`SELECT COUNT(*) AS cards, SUM(CASE WHEN owner_id IS NOT NULL THEN 1 ELSE 0 END) AS owned, COALESCE(SUM(trade_count),0) AS trades, COALESCE(SUM(last_price),0) AS value
                         FROM cards WHERE artist_id = ? AND series = 'official'`, a.id);
      return { ...a, ...st, exposure: exposure([a.id]) };
    });
    return {
      sponsor: { id: s.id, name: s.name, category: s.category, monthlyFee: s.monthly_fee, since: s.created_at },
      shares: { low: config.resale.low.sponsor, high: config.resale.high.sponsor, tierBreak: config.resale.tierBreak },
      totals: { coBranding: earned, feesPaid, net: earned - feesPaid, artists: artists.length },
      exposure: exposure(ids), perArtist, monthly, recent,
    };
  }

  // ---------- Statements (CSV) ----------
  function collectorStatement(userId) {
    const trades = db.all(`SELECT t.*, c.code, a.name AS artist FROM trades t JOIN cards c ON c.id = t.card_id JOIN artists a ON a.id = c.artist_id
                           WHERE t.buyer_id = ? OR t.seller_id = ? ORDER BY t.id`, userId, userId);
    const credits = db.all(`SELECT * FROM ledger WHERE party_id = ? AND party IN ('cashback','season_reward','credit_used','membership','seller','refund') ORDER BY id`, userId);
    const rows = [
      ...trades.map((t) => [iso(t.completed_at || t.created_at), t.kind === 'first_sale' ? 'S/CELL Night purchase' : t.kind === 'reward' ? 'Reward card received' : t.buyer_id === userId ? 'Resale purchase' : 'Resale sale', t.artist, t.code, t.status, t.buyer_id === userId ? -(t.price + t.transfer_fee) : t.price]),
      ...credits.map((l) => [iso(l.created_at), l.party, '', '', l.note, l.party === 'credit_used' || l.party === 'membership' ? -l.amount : l.amount]),
    ].sort((a, b) => a[0].localeCompare(b[0]));
    return toCsv(['Date', 'Type', 'Artist', 'Card', 'Detail', 'Amount (BDT)'], rows);
  }

  function partyStatement(party, partyId) {
    const rows = db.all(`SELECT l.created_at, l.party, l.amount, l.note, t.price, c.code, a.name AS artist FROM ledger l
                         LEFT JOIN trades t ON t.id = l.trade_id LEFT JOIN cards c ON c.id = t.card_id LEFT JOIN artists a ON a.id = c.artist_id
                         WHERE l.party_id = ? AND l.party IN (${party === 'artist' ? "'artist'" : "'sponsor','sponsor_fee'"}) ORDER BY l.id`, partyId)
      .map((l) => [iso(l.created_at), l.note, l.artist || '', l.code || '', l.price ?? '', l.party === 'sponsor_fee' ? -l.amount : l.amount]);
    return toCsv(['Date', 'Detail', 'Artist', 'Card', 'Trade price (BDT)', 'Amount (BDT)'], rows);
  }

  // ---------- Admin: linked accounts and sponsor payments ----------
  function createLinkedAccount({ role, name, email, phone, password, artistId, sponsorId }) {
    if (!['artist', 'sponsor'].includes(role)) fail(400, 'Choose artist or sponsor.');
    if (!name || !email || !password || password.length < 8) fail(400, 'Name, email and a password of at least 8 characters are required.');
    const mail = String(email).toLowerCase().trim();
    if (db.get('SELECT id FROM users WHERE email = ?', mail)) fail(409, 'An account with this email already exists.');
    if (role === 'artist' && !svc.artist(artistId)) fail(404, 'Artist not found.');
    if (role === 'sponsor' && !db.get('SELECT id FROM sponsors WHERE id = ?', sponsorId)) fail(404, 'Sponsor not found.');
    const r = db.run(`INSERT INTO users (name, display_name, email, phone, password_hash, role, kyc_status, artist_id, sponsor_id, created_at)
                      VALUES (?,?,?,?,?,?,?,?,?,?)`, name, name, mail, phone || '', hashPassword(password), role, 'pending',
      role === 'artist' ? artistId : null, role === 'sponsor' ? sponsorId : null, now());
    return Number(r.lastInsertRowid);
  }

  function recordSponsorPayment(sponsorId, amount, note) {
    const amt = Math.round(Number(amount));
    if (!db.get('SELECT id FROM sponsors WHERE id = ?', sponsorId)) fail(404, 'Sponsor not found.');
    if (!(amt > 0)) fail(400, 'Enter the amount received.');
    db.run('INSERT INTO ledger (party, party_id, amount, note, created_at) VALUES (?,?,?,?,?)', 'sponsor_fee', sponsorId, amt, String(note || 'Sponsorship fee received').slice(0, 200), now());
    return { ok: true };
  }

  return {
    policy, policyList, savePolicy, resetPolicy, acceptPolicy, acceptances, currentVersion,
    guide, calcResale, calcArtist, calcSponsor, publicStats, recordEvent,
    artistDashboard, sponsorDashboard, collectorStatement, partyStatement, createLinkedAccount, recordSponsorPayment,
    publicConfig,
  };
}
