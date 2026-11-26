import { config, publicConfig } from './config.js';
import { now, DAY, hashPassword, verifyPassword, sha256, newToken, rateLimit } from './security.js';
import { HttpError } from './services.js';

const fail = (status, message) => { throw new HttpError(status, message); };
const str = (v, max = 200) => String(v ?? '').trim().slice(0, max);
const int = (v) => { const n = Math.floor(Number(v)); return Number.isFinite(n) ? n : NaN; };

export function createApi(db, svc, portal) {
  const routes = [];
  const add = (method, pattern, handler, opts = {}) => {
    const keys = [];
    const re = new RegExp('^' + pattern.replace(/:(\w+)/g, (_, k) => { keys.push(k); return '([^/]+)'; }) + '$');
    routes.push({ method, re, keys, handler, ...opts });
  };

  // ---------- Serializers (never expose chip IDs, NID data or password hashes) ----------
  const publicUser = (u) => u && ({
    id: u.id, name: u.name, displayName: u.display_name, email: u.email, phone: u.phone, role: u.role,
    kycStatus: u.kyc_status, nidLast4: u.nid_last4, membershipUntil: u.membership_until,
    membershipActive: svc.membershipActive(u), walletCredit: u.wallet_credit,
    cardsOwned: svc.cardsOwned(u.id), tradeScore: svc.tradeScore(u.id),
    badges: svc.badgesOf(u.id), voteWeight: u.kyc_status === 'verified' ? svc.voteWeight(u) : 0,
    artistId: u.artist_id || null, sponsorId: u.sponsor_id || null,
    pendingPolicies: portal.acceptances(u).pending,
  });

  function cardView(c, viewer) {
    const a = svc.artist(c.artist_id);
    const owner = c.owner_id ? db.get('SELECT id, display_name FROM users WHERE id = ?', c.owner_id) : null;
    const listing = db.get(`SELECT id, price, seller_id FROM listings WHERE card_id = ? AND status = 'active'`, c.id);
    const p = c.owner_id ? svc.pricing(c) : null;
    const isOwner = viewer && viewer.id === c.owner_id;
    return {
      id: c.id, code: c.code, series: c.series, number: c.number, theme: c.theme, orientation: c.orientation,
      title: c.title, body: c.body, status: c.status,
      artist: { id: a.id, slug: a.slug, name: a.name, category: a.category },
      owner: owner ? { id: owner.id, displayName: owner.display_name } : null,
      firstSalePrice: c.first_sale_price, lastPrice: c.last_price, lastSaleAt: c.last_sale_at,
      tradeCount: c.trade_count, acquiredAt: c.acquired_at,
      pricing: p,
      listing: listing ? { id: listing.id, price: listing.price, transferFee: svc.transferFee(listing.price) } : null,
      chipUid: isOwner ? c.chip_uid : undefined,
      isOwner: !!isOwner,
    };
  }

  const history = (cardId) => db.all(`SELECT t.id, t.kind, t.price, t.status, t.created_at AS createdAt, t.completed_at AS completedAt,
      s.display_name AS seller, b.display_name AS buyer
      FROM trades t LEFT JOIN users s ON s.id = t.seller_id JOIN users b ON b.id = t.buyer_id
      WHERE t.card_id = ? AND t.status IN ('completed','escrow') ORDER BY t.id DESC`, cardId);

  function artistView(a, withCards, viewer) {
    const sponsor = a.sponsor_id ? db.get('SELECT id, name, category FROM sponsors WHERE id = ?', a.sponsor_id) : null;
    const counts = db.get(`SELECT COUNT(*) AS total, SUM(CASE WHEN owner_id IS NOT NULL THEN 1 ELSE 0 END) AS owned
                           FROM cards WHERE artist_id = ? AND series = 'official'`, a.id);
    const out = {
      id: a.id, slug: a.slug, name: a.name, category: a.category, bio: a.bio, status: a.status, isDemo: !!a.is_demo,
      sponsor, cardsTotal: counts.total, cardsOwned: counts.owned || 0, tookAdvance: !!a.took_advance,
    };
    if (withCards) {
      out.cards = db.all(`SELECT * FROM cards WHERE artist_id = ? ORDER BY series, number`, a.id).map((c) => cardView(c, viewer));
      out.auction = db.get(`SELECT id, title, starts_at AS startsAt, ends_at AS endsAt, status FROM auctions WHERE artist_id = ? ORDER BY id DESC LIMIT 1`, a.id) || null;
    }
    return out;
  }

  function auctionView(au, viewer) {
    const a = svc.artist(au.artist_id);
    const lots = db.all(`SELECT l.*, c.number, c.title, c.theme, c.orientation, c.body, c.code
                         FROM lots l JOIN cards c ON c.id = l.card_id WHERE l.auction_id = ? ORDER BY c.number`, au.id).map((l) => ({
      id: l.id, cardId: l.card_id, number: l.number, title: l.title, theme: l.theme, orientation: l.orientation, body: l.body, code: l.code,
      currentBid: l.current_bid, status: l.status,
      bids: db.get('SELECT COUNT(*) AS n FROM bids WHERE lot_id = ?', l.id).n,
      leading: viewer ? l.current_bidder_id === viewer.id : false,
      nextMin: l.current_bid ? l.current_bid + config.firstSale.bidIncrement : au.reserve,
    }));
    return {
      id: au.id, title: au.title, startsAt: au.starts_at, endsAt: au.ends_at, reserve: au.reserve, status: au.status,
      artist: { id: a.id, slug: a.slug, name: a.name, category: a.category }, lots, serverTime: now(),
    };
  }

  // ---------- Health and config ----------
  add('GET', '/api/health', () => ({ ok: true, time: now() }));
  add('GET', '/api/config', () => publicConfig());

  // ---------- Auth ----------
  add('POST', '/api/auth/register', ({ body, ip, setSession }) => {
    if (!rateLimit(`reg:${ip}`, 10, 60 * 60 * 1000)) fail(429, 'Too many sign-ups from this connection. Try again later.');
    const name = str(body.name, 80), email = str(body.email, 120).toLowerCase(), phone = str(body.phone, 20);
    const displayName = str(body.displayName, 40) || name.split(' ')[0];
    const password = String(body.password || '');
    if (!name) fail(400, 'Enter your full name.');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) fail(400, 'Enter a valid email address.');
    if (!/^(\+?88)?01[3-9]\d{8}$/.test(phone.replace(/[\s-]/g, ''))) fail(400, 'Enter a Bangladeshi mobile number, for example 01712345678.');
    if (password.length < 8) fail(400, 'Use a password of at least 8 characters.');
    if (body.acceptTerms !== true) fail(400, 'Read and accept the Terms of Use and Privacy Policy to create an account.');
    if (db.get('SELECT id FROM users WHERE email = ?', email)) fail(409, 'An account with this email already exists. Sign in instead.');
    const r = db.run('INSERT INTO users (name, display_name, email, phone, password_hash, created_at) VALUES (?,?,?,?,?,?)',
      name, displayName, email, phone.replace(/[\s-]/g, ''), hashPassword(password), now());
    const id = Number(r.lastInsertRowid);
    portal.acceptPolicy(id, 'terms');
    portal.acceptPolicy(id, 'privacy');
    setSession(id);
    return { user: publicUser(svc.user(id)) };
  });

  add('POST', '/api/auth/login', ({ body, ip, setSession }) => {
    if (!rateLimit(`login:${ip}`, 20, 15 * 60 * 1000)) fail(429, 'Too many sign-in attempts. Wait 15 minutes and try again.');
    const u = db.get('SELECT * FROM users WHERE email = ?', str(body.email, 120).toLowerCase());
    if (!u || !verifyPassword(String(body.password || ''), u.password_hash)) fail(401, 'The email or password is incorrect.');
    setSession(u.id);
    return { user: publicUser(u) };
  });

  add('POST', '/api/auth/logout', ({ clearSession }) => { clearSession(); return { ok: true }; });
  add('GET', '/api/auth/me', ({ user }) => ({ user: user ? publicUser(user) : null }));

  // ---------- My account ----------
  add('POST', '/api/me/kyc', ({ user, body }) => ({ status: svc.submitKyc(user.id, body.nid) }), { auth: true });
  add('POST', '/api/me/membership', async ({ user }) => ({ ...(await svc.buyMembership(user.id)), user: publicUser(svc.user(user.id)) }), { auth: true });

  add('GET', '/api/me/collection', ({ user }) => ({
    cards: db.all(`SELECT * FROM cards WHERE owner_id = ? AND status IN ('owned','listed','escrow') ORDER BY artist_id, series, number`, user.id).map((c) => cardView(c, user)),
  }), { auth: true });

  add('GET', '/api/me/trades', ({ user }) => ({
    trades: db.all(`SELECT t.*, c.code, c.number, c.title, c.series, a.name AS artist_name, a.slug AS artist_slug
                    FROM trades t JOIN cards c ON c.id = t.card_id JOIN artists a ON a.id = c.artist_id
                    WHERE t.buyer_id = ? OR t.seller_id = ? ORDER BY t.id DESC LIMIT 100`, user.id, user.id).map((t) => ({
      id: t.id, kind: t.kind, role: t.buyer_id === user.id ? 'buyer' : 'seller', price: t.price, transferFee: t.transfer_fee,
      status: t.status, verifyUntil: t.verify_until, chipConfirmed: !!t.chip_confirmed, createdAt: t.created_at, completedAt: t.completed_at,
      card: { id: t.card_id, code: t.code, number: t.number, title: t.title, series: t.series }, artist: { name: t.artist_name, slug: t.artist_slug },
    })),
    earnings: db.all(`SELECT party, SUM(amount) AS total FROM ledger WHERE party_id = ? AND party IN ('seller','cashback','season_reward') GROUP BY party`, user.id),
  }), { auth: true });

  add('GET', '/api/me/bids', ({ user }) => ({
    bids: db.all(`SELECT b.amount, b.created_at AS createdAt, l.id AS lotId, l.current_bid AS currentBid, l.current_bidder_id = ? AS leading, l.status,
                  c.number, c.title, a.name AS artist, au.id AS auctionId
                  FROM bids b JOIN lots l ON l.id = b.lot_id JOIN cards c ON c.id = l.card_id JOIN artists a ON a.id = c.artist_id
                  JOIN auctions au ON au.id = l.auction_id WHERE b.user_id = ? ORDER BY b.id DESC LIMIT 100`, user.id, user.id),
  }), { auth: true });

  // ---------- Artists and cards ----------
  add('GET', '/api/artists', ({ user }) => ({
    artists: db.all('SELECT * FROM artists ORDER BY CASE status WHEN \'live\' THEN 0 WHEN \'upcoming\' THEN 1 ELSE 2 END, id DESC').map((a) => artistView(a, false, user)),
  }));
  add('GET', '/api/artists/:slug', async ({ params, user }) => {
    const a = db.get('SELECT * FROM artists WHERE slug = ?', params.slug);
    if (!a) fail(404, 'Artist not found.');
    await svc.refreshAllAuctions();
    portal.recordEvent('artist_view', { artistId: a.id, userId: user?.id });
    return { artist: artistView(svc.artist(a.id), true, user) };
  });

  add('GET', '/api/cards/:id', ({ params, user }) => {
    const c = svc.card(int(params.id));
    if (!c) fail(404, 'Card not found.');
    portal.recordEvent('card_view', { artistId: c.artist_id, cardId: c.id, userId: user?.id });
    const a = svc.artist(c.artist_id);
    const sponsor = a.sponsor_id ? db.get('SELECT name FROM sponsors WHERE id = ?', a.sponsor_id) : null;
    return { card: cardView(c, user), history: history(c.id), sponsor: sponsor?.name || null };
  });

  add('GET', '/api/verify/:code', ({ params }) => {
    const q = str(decodeURIComponent(params.code), 40).toUpperCase();
    const c = db.get('SELECT * FROM cards WHERE upper(code) = ? OR chip_uid = ?', q, q);
    if (!c) return { found: false };
    const a = svc.artist(c.artist_id);
    portal.recordEvent('verify', { artistId: a.id, cardId: c.id });
    const sponsorRow = a.sponsor_id ? db.get('SELECT name FROM sponsors WHERE id = ?', a.sponsor_id) : null;
    const owner = c.owner_id ? db.get('SELECT display_name FROM users WHERE id = ?', c.owner_id) : null;
    const viaChip = c.chip_uid === q;
    return {
      found: true, authentic: true, viaChip,
      card: { id: c.id, code: c.code, number: c.number, series: c.series, title: c.title, status: c.status, tradeCount: c.trade_count },
      artist: { name: a.name, slug: a.slug },
      owner: owner ? owner.display_name : null,
      transferInProgress: c.status === 'escrow',
      sponsor: sponsorRow?.name || null,
    };
  });

  // ---------- S/CELL Night auctions ----------
  add('GET', '/api/auctions', async ({ user }) => {
    await svc.refreshAllAuctions();
    return { auctions: db.all('SELECT * FROM auctions ORDER BY CASE status WHEN \'live\' THEN 0 WHEN \'scheduled\' THEN 1 ELSE 2 END, starts_at DESC').map((a) => auctionView(a, user)) };
  });
  add('GET', '/api/auctions/:id', async ({ params, user }) => {
    const au = await svc.refreshAuction(int(params.id));
    if (!au) fail(404, 'Auction not found.');
    return { auction: auctionView(au, user) };
  });
  add('POST', '/api/lots/:id/bid', async ({ params, body, user }) => {
    const lot = db.get('SELECT auction_id FROM lots WHERE id = ?', int(params.id));
    if (lot) await svc.refreshAuction(lot.auction_id);
    return svc.placeBid(user.id, int(params.id), body.amount);
  }, { auth: true });

  // ---------- Marketplace ----------
  add('GET', '/api/market', ({ user, query }) => {
    const artistSlug = str(query.get('artist'), 80);
    const rows = db.all(`SELECT c.* FROM listings l JOIN cards c ON c.id = l.card_id JOIN artists a ON a.id = c.artist_id
                         WHERE l.status = 'active' ${artistSlug ? 'AND a.slug = ?' : ''} ORDER BY l.id DESC`, ...(artistSlug ? [artistSlug] : []));
    const recent = db.all(`SELECT t.price, t.completed_at AS at, c.id AS cardId, c.number, c.series, a.name AS artist
                           FROM trades t JOIN cards c ON c.id = t.card_id JOIN artists a ON a.id = c.artist_id
                           WHERE t.kind = 'resale' AND t.status = 'completed' ORDER BY t.completed_at DESC LIMIT 8`);
    return { listings: rows.map((c) => cardView(c, user)), recent };
  });
  add('POST', '/api/cards/:id/list', ({ params, body, user }) => ({ listingId: svc.listCard(user.id, int(params.id), body.price) }), { auth: true });
  add('POST', '/api/listings/:id/cancel', ({ params, user }) => { svc.cancelListing(user.id, int(params.id)); return { ok: true }; }, { auth: true });
  add('POST', '/api/listings/:id/buy', async ({ params, body, user }) => svc.buyListing(user.id, int(params.id), { useCredit: !!body.useCredit }), { auth: true });
  add('POST', '/api/trades/:id/confirm-chip', ({ params, body, user }) => svc.confirmChip(user.id, int(params.id), body.chip), { auth: true });
  add('POST', '/api/trades/:id/dispute', ({ params, user }) => { svc.disputeTrade(user.id, int(params.id)); return { ok: true }; }, { auth: true });

  // ---------- Collectors, ranking, votes ----------
  add('GET', '/api/collectors', () => {
    const r = svc.ranking();
    const scores = db.all(`SELECT u.display_name AS displayName, u.id, COALESCE(SUM(c.trade_count),0) AS score, COUNT(c.id) AS cards
                           FROM users u JOIN cards c ON c.owner_id = u.id WHERE c.status IN ('owned','listed','escrow')
                           GROUP BY u.id ORDER BY score DESC, cards DESC LIMIT 20`);
    const badgeRows = db.all('SELECT user_id, code FROM badges');
    const badgeMap = {};
    for (const b of badgeRows) (badgeMap[b.user_id] ||= new Set()).add(b.code);
    const withBadges = (id) => [...(badgeMap[id] || [])];
    return {
      season: { name: r.season.name, startsAt: r.season.starts_at, endsAt: r.season.ends_at },
      pool: r.pool,
      ranking: r.ranked.slice(0, 50).map((x) => ({ ...x, badges: withBadges(x.userId) })),
      tradeScores: scores.map((s) => ({ ...s, badges: withBadges(s.id) })),
    };
  });

  add('GET', '/api/polls/current', ({ user }) => {
    const poll = db.get(`SELECT * FROM polls WHERE status = 'open' ORDER BY id DESC LIMIT 1`)
      || db.get(`SELECT * FROM polls ORDER BY id DESC LIMIT 1`);
    if (!poll) return { poll: null };
    const mine = user ? db.get('SELECT option_id, weight FROM votes WHERE poll_id = ? AND user_id = ?', poll.id, user.id) : null;
    return {
      poll: { id: poll.id, title: poll.title, status: poll.status, options: svc.pollResults(poll.id) },
      myVote: mine ? { optionId: mine.option_id, weight: mine.weight } : null,
      myWeight: user && user.kyc_status === 'verified' ? svc.voteWeight(user) : 0,
    };
  });
  add('POST', '/api/polls/:id/vote', ({ params, body, user }) => svc.vote(user.id, int(params.id), int(body.optionId)), { auth: true });

  // ---------- Partnership forms ----------
  const application = (type, required) => ({ body }) => {
    const payload = {};
    for (const [k, v] of Object.entries(body || {})) payload[k] = str(v, 2000);
    for (const k of required) if (!payload[k]) fail(400, 'Fill in all required fields.');
    db.run('INSERT INTO applications (type, payload, created_at) VALUES (?,?,?)', type, JSON.stringify(payload), now());
    return { ok: true };
  };
  add('POST', '/api/applications/artist', application('artist', ['fullName', 'stageName', 'email', 'phone', 'category']));
  add('POST', '/api/applications/sponsor', application('sponsor', ['company', 'contact', 'email', 'phone', 'partnershipType']));

  // ---------- Admin ----------
  const A = { admin: true };
  add('GET', '/api/admin/overview', () => {
    const sum = (sql, ...p) => db.get(sql, ...p).v || 0;
    return {
      users: sum('SELECT COUNT(*) AS v FROM users'),
      verified: sum(`SELECT COUNT(*) AS v FROM users WHERE kyc_status = 'verified'`),
      pendingKyc: sum(`SELECT COUNT(*) AS v FROM users WHERE kyc_status = 'pending'`),
      artists: sum('SELECT COUNT(*) AS v FROM artists'),
      cardsOwned: sum('SELECT COUNT(*) AS v FROM cards WHERE owner_id IS NOT NULL'),
      activeListings: sum(`SELECT COUNT(*) AS v FROM listings WHERE status = 'active'`),
      escrow: sum(`SELECT COUNT(*) AS v FROM trades WHERE status IN ('escrow','disputed')`),
      firstSaleVolume: sum(`SELECT SUM(price) AS v FROM trades WHERE kind = 'first_sale' AND status = 'completed'`),
      resaleVolume: sum(`SELECT SUM(price) AS v FROM trades WHERE kind = 'resale' AND status = 'completed'`),
      scellIncome: sum(`SELECT SUM(amount) AS v FROM ledger WHERE party = 'scell'`),
      artistPaid: sum(`SELECT SUM(amount) AS v FROM ledger WHERE party = 'artist'`),
      sponsorPaid: sum(`SELECT SUM(amount) AS v FROM ledger WHERE party = 'sponsor'`),
      membershipIncome: sum(`SELECT SUM(amount) AS v FROM ledger WHERE party = 'membership'`),
      rewardPool: svc.poolBalance(),
      applications: sum(`SELECT COUNT(*) AS v FROM applications WHERE status = 'new'`),
    };
  }, A);

  add('GET', '/api/admin/kyc', () => ({
    pending: db.all(`SELECT id, name, email, phone, nid_last4 AS nidLast4, created_at AS createdAt FROM users WHERE kyc_status = 'pending' ORDER BY id`),
  }), A);
  add('POST', '/api/admin/kyc/:id', ({ params, body }) => { svc.reviewKyc(int(params.id), !!body.approve); return { ok: true }; }, A);

  add('GET', '/api/admin/sponsors', () => ({ sponsors: db.all('SELECT * FROM sponsors ORDER BY id DESC') }), A);
  add('POST', '/api/admin/sponsors', ({ body }) => {
    const name = str(body.name, 80);
    if (!name) fail(400, 'Enter the sponsor name.');
    const r = db.run('INSERT INTO sponsors (name, category, monthly_fee, created_at) VALUES (?,?,?,?)', name, str(body.category, 40) || 'brand', int(body.monthlyFee) || 3750, now());
    return { id: Number(r.lastInsertRowid) };
  }, A);

  add('POST', '/api/admin/artists', ({ body }) => {
    const cards = Array.isArray(body.cards) ? body.cards.map((c) => ({ title: str(c.title, 80), body: str(c.body, 280) })) : [];
    const id = svc.createArtist({ name: str(body.name, 80), category: str(body.category, 60), bio: str(body.bio, 1500), tookAdvance: !!body.tookAdvance, cards });
    return { id, slug: svc.artist(id).slug };
  }, A);
  add('POST', '/api/admin/artists/:id/sponsor', ({ params, body }) => {
    const sponsorId = body.sponsorId ? int(body.sponsorId) : null;
    if (sponsorId && !db.get('SELECT id FROM sponsors WHERE id = ?', sponsorId)) fail(404, 'Sponsor not found.');
    db.run('UPDATE artists SET sponsor_id = ? WHERE id = ?', sponsorId, int(params.id));
    return { ok: true };
  }, A);
  add('POST', '/api/admin/artists/:id/card/:number', ({ params, body }) => {
    db.run(`UPDATE cards SET title = ?, body = ? WHERE artist_id = ? AND series = 'official' AND number = ? AND owner_id IS NULL`,
      str(body.title, 80), str(body.body, 280), int(params.id), int(params.number));
    return { ok: true };
  }, A);

  add('POST', '/api/admin/auctions', ({ body }) => {
    const startsAt = body.startsAt ? Date.parse(body.startsAt) : now();
    const endsAt = body.endsAt ? Date.parse(body.endsAt) : startsAt + 2 * 60 * 60 * 1000;
    if (!Number.isFinite(startsAt) || !Number.isFinite(endsAt)) fail(400, 'Enter valid start and end times.');
    const reserve = body.reserve ? int(body.reserve) : config.firstSale.defaultReserve;
    return { id: svc.createAuction({ artistId: int(body.artistId), title: str(body.title, 100), startsAt, endsAt, reserve }) };
  }, A);
  add('POST', '/api/admin/auctions/:id/close', async ({ params }) => svc.closeAuction(int(params.id)), A);

  add('GET', '/api/admin/trades', () => ({
    trades: db.all(`SELECT t.id, t.kind, t.price, t.transfer_fee AS transferFee, t.status, t.verify_until AS verifyUntil, t.chip_confirmed AS chipConfirmed,
                    c.code, a.name AS artist, s.display_name AS seller, b.display_name AS buyer
                    FROM trades t JOIN cards c ON c.id = t.card_id JOIN artists a ON a.id = c.artist_id
                    LEFT JOIN users s ON s.id = t.seller_id JOIN users b ON b.id = t.buyer_id
                    WHERE t.status IN ('escrow','disputed') ORDER BY t.id`),
  }), A);
  add('POST', '/api/admin/trades/:id/release', async ({ params }) => svc.settleTrade(int(params.id), { force: true }), A);
  add('POST', '/api/admin/trades/:id/cancel', async ({ params }) => { await svc.cancelTrade(int(params.id)); return { ok: true }; }, A);

  add('POST', '/api/admin/reward-cards', ({ body }) => ({
    cardId: svc.issueRewardCard({ artistId: int(body.artistId), userId: int(body.userId), title: str(body.title, 80), body: str(body.body, 280) }),
  }), A);
  add('POST', '/api/admin/cards/:id/lost', ({ params }) => { db.run(`UPDATE cards SET status = 'lost' WHERE id = ?`, int(params.id)); return { ok: true }; }, A);

  add('GET', '/api/admin/collectors', () => ({
    users: db.all(`SELECT id, name, display_name AS displayName, email, kyc_status AS kycStatus, role, artist_id AS artistId, sponsor_id AS sponsorId, wallet_credit AS walletCredit FROM users ORDER BY id DESC LIMIT 200`),
  }), A);

  add('GET', '/api/admin/applications', () => ({
    applications: db.all('SELECT * FROM applications ORDER BY id DESC LIMIT 200').map((a) => ({ ...a, payload: JSON.parse(a.payload) })),
  }), A);
  add('POST', '/api/admin/applications/:id', ({ params, body }) => {
    db.run('UPDATE applications SET status = ? WHERE id = ?', str(body.status, 20) || 'reviewed', int(params.id));
    return { ok: true };
  }, A);

  add('POST', '/api/admin/polls', ({ body }) => ({ id: svc.createPoll(str(body.title, 120), body.options) }), A);
  add('POST', '/api/admin/polls/:id/close', ({ params }) => {
    db.run(`UPDATE polls SET status = 'closed', closed_at = ? WHERE id = ?`, now(), int(params.id));
    return { results: svc.pollResults(int(params.id)) };
  }, A);

  add('GET', '/api/admin/ranking', () => svc.ranking(), A);
  add('POST', '/api/admin/seasons/close', () => svc.closeSeason(), A);
  add('POST', '/api/admin/maintenance', async () => svc.maintenance(), A);
  add('GET', '/api/admin/ledger', () => ({
    entries: db.all('SELECT * FROM ledger ORDER BY id DESC LIMIT 300'),
    totals: db.all('SELECT party, SUM(amount) AS total FROM ledger GROUP BY party ORDER BY total DESC'),
  }), A);

  // ---------- Policies, guides, calculators, public numbers ----------
  add('GET', '/api/policies', () => ({ policies: portal.policyList() }));
  add('GET', '/api/policies/:slug', ({ params, user }) => {
    const p = portal.policy(params.slug);
    if (!p) fail(404, 'Policy not found.');
    const accepted = user ? !!db.get('SELECT 1 AS x FROM policy_acceptances WHERE user_id = ? AND slug = ? AND version = ?', user.id, p.slug, p.version) : false;
    return { policy: p, accepted };
  });
  add('POST', '/api/me/accept', ({ user, body }) => portal.acceptPolicy(user.id, str(body.slug, 60)), { auth: true });
  add('GET', '/api/me/policies', ({ user }) => portal.acceptances(user), { auth: true });
  add('GET', '/api/guides/:audience', ({ params }) => ({ guide: portal.guide(params.audience) }));
  add('GET', '/api/calc/resale', ({ query }) => portal.calcResale(Object.fromEntries(query)));
  add('GET', '/api/calc/artist', ({ query }) => portal.calcArtist(Object.fromEntries(query)));
  add('GET', '/api/calc/sponsor', ({ query }) => portal.calcSponsor(Object.fromEntries(query)));
  add('GET', '/api/stats', () => portal.publicStats());

  // ---------- Statements ----------
  const csv = (body, filename) => ({ __raw: { type: 'text/csv; charset=utf-8', body, filename } });
  add('GET', '/api/me/statement.csv', ({ user }) => csv(portal.collectorStatement(user.id), 'scell-statement.csv'), { auth: true });

  // ---------- Artist and sponsor dashboards ----------
  const artistOf = (user) => {
    if (user.role === 'artist' && user.artist_id) return user.artist_id;
    fail(403, 'This dashboard is for S/CELL artists.');
  };
  const sponsorOf = (user) => {
    if (user.role === 'sponsor' && user.sponsor_id) return user.sponsor_id;
    fail(403, 'This dashboard is for S/CELL sponsors.');
  };
  add('GET', '/api/artist/dashboard', ({ user }) => portal.artistDashboard(artistOf(user)), { auth: true });
  add('GET', '/api/artist/statement.csv', ({ user }) => csv(portal.partyStatement('artist', artistOf(user)), 'scell-artist-statement.csv'), { auth: true });
  add('GET', '/api/sponsor/dashboard', ({ user }) => portal.sponsorDashboard(sponsorOf(user)), { auth: true });
  add('GET', '/api/sponsor/statement.csv', ({ user }) => csv(portal.partyStatement('sponsor', sponsorOf(user)), 'scell-sponsor-statement.csv'), { auth: true });

  // Admins can open any artist's or sponsor's dashboard.
  add('GET', '/api/admin/artist-dashboard/:id', ({ params }) => portal.artistDashboard(int(params.id)), A);
  add('GET', '/api/admin/sponsor-dashboard/:id', ({ params }) => portal.sponsorDashboard(int(params.id)), A);
  add('POST', '/api/admin/accounts', ({ body }) => ({
    id: portal.createLinkedAccount({ role: str(body.role, 10), name: str(body.name, 80), email: str(body.email, 120), phone: str(body.phone, 20), password: String(body.password || ''), artistId: int(body.artistId), sponsorId: int(body.sponsorId) }),
  }), A);
  add('POST', '/api/admin/sponsors/:id/payment', ({ params, body }) => portal.recordSponsorPayment(int(params.id), body.amount, str(body.note, 200)), A);
  add('GET', '/api/admin/policies', () => ({ policies: portal.policyList() }), A);
  add('POST', '/api/admin/policies/:slug', ({ params, body }) => portal.savePolicy(params.slug, body), A);
  add('POST', '/api/admin/policies/:slug/reset', ({ params }) => portal.resetPolicy(params.slug), A);

  // ---------- Dispatcher ----------
  async function handle(ctx) {
    for (const r of routes) {
      if (r.method !== ctx.method) continue;
      const m = r.re.exec(ctx.path);
      if (!m) continue;
      ctx.params = Object.fromEntries(r.keys.map((k, i) => [k, m[i + 1]]));
      if ((r.auth || r.admin) && !ctx.user) fail(401, 'Sign in first.');
      if (r.admin && ctx.user.role !== 'admin') fail(403, 'Admins only.');
      return await r.handler(ctx);
    }
    fail(404, 'Not found.');
  }

  return { handle, sessionDays: config.sessionDays, DAY, newToken, sha256 };
}
