import { config } from './config.js';
import { now, DAY, chipUid, cardCode, hashNid } from './security.js';
import { payments, kyc, nfc } from './integrations.js';

export class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
const fail = (status, message) => { throw new HttpError(status, message); };

const pct = (amount, p) => Math.round((amount * p) / 100);
const slugify = (s) => s.toLowerCase().normalize('NFKD').replace(/[^\w\s-]/g, '').trim().replace(/[\s_]+/g, '-').slice(0, 60);

export function createServices(db) {
  const user = (id) => db.get('SELECT * FROM users WHERE id = ?', id);
  const card = (id) => db.get('SELECT * FROM cards WHERE id = ?', id);
  const artist = (id) => db.get('SELECT * FROM artists WHERE id = ?', id);

  const ledger = (tradeId, party, partyId, amount, note) => {
    if (!amount) return;
    db.run('INSERT INTO ledger (trade_id, party, party_id, amount, note, created_at) VALUES (?,?,?,?,?,?)',
      tradeId ?? null, party, partyId ?? null, amount, note, now());
  };

  // ---------- People ----------
  const cardsOwned = (userId) =>
    db.get(`SELECT COUNT(*) AS n FROM cards WHERE owner_id = ? AND status IN ('owned','listed','escrow')`, userId).n;

  const membershipActive = (u) => !!u && (u.membership_until > now() || cardsOwned(u.id) > 0);

  function requireVerified(u, action) {
    if (!u) fail(401, 'Sign in first.');
    if (u.kyc_status !== 'verified') fail(403, `Verify your identity (NID and phone) to ${action}.`);
  }
  function requireMember(u, action) {
    if (!membershipActive(u)) fail(403, `Membership is needed to ${action}. Card owners get it free.`);
  }

  function submitKyc(userId, nid) {
    const clean = String(nid || '').replace(/\D/g, '');
    if (!kyc.validNid(clean)) fail(400, 'Enter a valid NID number: 10, 13 or 17 digits.');
    const h = hashNid(clean);
    const other = db.get('SELECT id FROM users WHERE nid_hash = ? AND id != ?', h, userId);
    if (other) fail(409, 'This NID is already linked to another account.');
    const status = kyc.autoApprove ? 'verified' : 'pending';
    db.run('UPDATE users SET nid_hash = ?, nid_last4 = ?, kyc_status = ? WHERE id = ?', h, clean.slice(-4), status, userId);
    return status;
  }

  function reviewKyc(userId, approve) {
    const u = user(userId);
    if (!u) fail(404, 'User not found.');
    if (u.kyc_status !== 'pending') fail(409, 'This check is not waiting for review.');
    db.run('UPDATE users SET kyc_status = ? WHERE id = ?', approve ? 'verified' : 'rejected', userId);
  }

  async function buyMembership(userId) {
    const u = user(userId);
    const fee = config.membership.monthlyFee;
    const fromCredit = Math.min(u.wallet_credit, fee);
    const charged = fee - fromCredit;
    const pay = charged > 0 ? await payments.charge({ amount: charged, purpose: 'membership', userId }) : { ref: 'credit' };
    db.tx(() => {
      const base = Math.max(now(), u.membership_until);
      db.run('UPDATE users SET membership_until = ?, wallet_credit = wallet_credit - ? WHERE id = ?',
        base + config.membership.days * DAY, fromCredit, userId);
      ledger(null, 'membership', userId, fee, `Membership, ${pay.ref}`);
    });
    return { charged, fromCredit };
  }

  // ---------- Badges, scores, weights ----------
  const awardBadge = (userId, code, seasonId = 0) =>
    db.run('INSERT OR IGNORE INTO badges (user_id, code, season_id, awarded_at) VALUES (?,?,?,?)', userId, code, seasonId, now());

  const tradeScore = (userId) =>
    db.get(`SELECT COALESCE(SUM(trade_count),0) AS s FROM cards WHERE owner_id = ? AND status IN ('owned','listed','escrow')`, userId).s;

  function checkRounds(userId) {
    const season = activeSeason();
    const score = tradeScore(userId);
    for (const r of config.rounds) if (score >= r.score) awardBadge(userId, r.code, season.id);
  }

  function badgesOf(userId) {
    return db.all('SELECT code, season_id, awarded_at FROM badges WHERE user_id = ? ORDER BY awarded_at', userId);
  }

  function voteWeight(u) {
    const codes = new Set(badgesOf(u.id).map((b) => b.code));
    const w = config.voteWeights;
    let weight = codes.has('resale') ? w.resale : codes.has('blue') ? w.blue : w.verified;
    const rounds = db.get(`SELECT COUNT(*) AS n FROM badges WHERE user_id = ? AND code LIKE 'round%'`, u.id).n;
    return weight + rounds * w.perRoundMark;
  }

  function cashbackPct(totalCards) {
    for (const t of config.cashback) if (totalCards >= t.minCards) return t.pct;
    return 0;
  }

  // ---------- Artists and cards ----------
  function createArtist({ name, category, bio = '', tookAdvance = false, isDemo = false, cards = [] }) {
    if (!name || !category) fail(400, 'Artist name and category are required.');
    let slug = slugify(name) || `artist-${Date.now()}`;
    if (db.get('SELECT id FROM artists WHERE slug = ?', slug)) slug = `${slug}-${Date.now().toString(36)}`;
    const prefix = slug.replace(/-/g, '').slice(0, 4).toUpperCase().padEnd(4, 'X');
    return db.tx(() => {
      const res = db.run('INSERT INTO artists (slug, name, category, bio, took_advance, is_demo, created_at) VALUES (?,?,?,?,?,?,?)',
        slug, name, category, bio, tookAdvance ? 1 : 0, isDemo ? 1 : 0, now());
      const artistId = Number(res.lastInsertRowid);
      let n = 0;
      for (const group of config.collection) {
        for (let i = 0; i < group.count; i++) {
          n++;
          const given = cards[n - 1] || {};
          db.run(`INSERT INTO cards (artist_id, series, number, theme, orientation, title, body, chip_uid, code, created_at)
                  VALUES (?,?,?,?,?,?,?,?,?,?)`,
            artistId, 'official', n, group.theme, group.orientation,
            given.title || `${group.label} ${i + 1}`, given.body || '', chipUid(), cardCode(prefix, n, 'official'), now());
        }
      }
      return artistId;
    });
  }

  function issueRewardCard({ artistId, userId, title, body = '' }) {
    const a = artist(artistId);
    if (!a) fail(404, 'Artist not found.');
    if (!user(userId)) fail(404, 'Collector not found.');
    const next = db.get(`SELECT COALESCE(MAX(number),0)+1 AS n FROM cards WHERE artist_id = ? AND series = 'reward'`, artistId).n;
    const prefix = a.slug.replace(/-/g, '').slice(0, 4).toUpperCase().padEnd(4, 'X');
    return db.tx(() => {
      const res = db.run(`INSERT INTO cards (artist_id, series, number, theme, orientation, title, body, chip_uid, code, owner_id, status, last_price, acquired_at, created_at)
                          VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        artistId, 'reward', next, 'reward', 'landscape', title || `Reward Edition ${next}`, body, chipUid(),
        cardCode(prefix, next, 'reward'), userId, 'owned', 0, now(), now());
      const cardId = Number(res.lastInsertRowid);
      db.run(`INSERT INTO trades (card_id, kind, buyer_id, price, status, created_at, completed_at) VALUES (?,?,?,?,?,?,?)`,
        cardId, 'reward', userId, 0, 'completed', now(), now());
      return cardId;
    });
  }

  // Minimum official price for the next resale: last price + step, or the decayed price once a card has gone unsold.
  function pricing(c, at = now()) {
    const base = c.last_price ?? 0;
    const since = c.last_sale_at ?? c.acquired_at ?? c.created_at;
    const elapsedDays = (at - since) / DAY;
    if (elapsedDays < config.decay.startAfterDays) {
      return { minPrice: base + config.resale.minStep, decaying: false, decayPct: 0, retired: false };
    }
    const years = Math.floor((elapsedDays - config.decay.startAfterDays) / 365) + 1;
    const left = 100 - config.decay.pctPerYear * years;
    if (left <= 0) return { minPrice: 0, decaying: true, decayPct: 100, retired: true };
    return { minPrice: Math.max(1, Math.round((base * left) / 100)), decaying: true, decayPct: 100 - left, retired: false };
  }

  function splitFirstSale(price, a) {
    const artistPct = a.took_advance ? config.firstSale.artistPctWithAdvance : config.firstSale.artistPct;
    const artistAmt = pct(price, artistPct);
    return { artistPct, artist: artistAmt, scell: price - artistAmt };
  }

  function splitResale(price, a) {
    const tier = price > config.resale.tierBreak ? config.resale.high : config.resale.low;
    const reduction = a.took_advance ? config.resale.advanceArtistReduction : 0;
    const p = { seller: tier.seller, artist: tier.artist - reduction, sponsor: tier.sponsor, scell: tier.scell + reduction };
    const seller = pct(price, p.seller);
    const artistAmt = pct(price, p.artist);
    const sponsor = pct(price, p.sponsor);
    const scell = price - seller - artistAmt - sponsor;
    return { pct: p, seller, artist: artistAmt, sponsor, scell, sponsorHeldByScell: !a.sponsor_id };
  }

  function transferFee(price) {
    if (!config.resale.transferFeePct) return 0;
    return Math.max(config.resale.transferFeeMin, pct(price, config.resale.transferFeePct));
  }

  // ---------- First sale ----------
  async function completeFirstSale({ cardId, buyerId, price, lotId = null }) {
    const c = card(cardId);
    const a = artist(c.artist_id);
    const pay = await payments.charge({ amount: price, purpose: 'first-sale', userId: buyerId });
    return db.tx(() => {
      const t = db.run(`INSERT INTO trades (card_id, lot_id, kind, buyer_id, price, payment_ref, status, created_at, completed_at)
                        VALUES (?,?,?,?,?,?,?,?,?)`, cardId, lotId, 'first_sale', buyerId, price, pay.ref, 'completed', now(), now());
      const tradeId = Number(t.lastInsertRowid);
      db.run(`UPDATE cards SET owner_id = ?, status = 'owned', first_sale_price = ?, last_price = ?, last_sale_at = ?, acquired_at = ? WHERE id = ?`,
        buyerId, price, price, now(), now(), cardId);
      const split = splitFirstSale(price, a);
      const total = cardsOwned(buyerId);
      const cbPct = cashbackPct(total);
      const cashback = Math.min(pct(price, cbPct), split.scell);
      ledger(tradeId, 'artist', a.id, split.artist, `First sale ${split.artistPct}%`);
      ledger(tradeId, 'scell', null, split.scell - cashback, 'First sale, S/CELL share');
      if (cashback) {
        ledger(tradeId, 'cashback', buyerId, cashback, `Loyalty cashback ${cbPct}% (card ${total})`);
        db.run('UPDATE users SET wallet_credit = wallet_credit + ? WHERE id = ?', cashback, buyerId);
      }
      awardBadge(buyerId, 'blue');
      return { tradeId, cashback, cashbackPct: cbPct };
    });
  }

  // ---------- Auctions (S/CELL Night) ----------
  function createAuction({ artistId, title, startsAt, endsAt, reserve }) {
    const a = artist(artistId);
    if (!a) fail(404, 'Artist not found.');
    if (!(endsAt > startsAt)) fail(400, 'The auction must end after it starts.');
    const vault = db.all(`SELECT id FROM cards WHERE artist_id = ? AND series = 'official' AND status = 'vault' ORDER BY number`, artistId);
    if (!vault.length) fail(409, 'This artist has no unsold cards to auction.');
    return db.tx(() => {
      const r = db.run('INSERT INTO auctions (artist_id, title, starts_at, ends_at, reserve, status, created_at) VALUES (?,?,?,?,?,?,?)',
        artistId, title || `S/CELL Night: ${a.name}`, startsAt, endsAt, reserve ?? config.firstSale.defaultReserve,
        startsAt <= now() ? 'live' : 'scheduled', now());
      const auctionId = Number(r.lastInsertRowid);
      for (const v of vault) {
        db.run('INSERT INTO lots (auction_id, card_id) VALUES (?,?)', auctionId, v.id);
        db.run(`UPDATE cards SET status = 'auction' WHERE id = ?`, v.id);
      }
      db.run(`UPDATE artists SET status = 'live' WHERE id = ?`, artistId);
      return auctionId;
    });
  }

  async function refreshAuction(auctionId) {
    const au = db.get('SELECT * FROM auctions WHERE id = ?', auctionId);
    if (!au) return null;
    if (au.status === 'scheduled' && now() >= au.starts_at) db.run(`UPDATE auctions SET status = 'live' WHERE id = ?`, au.id);
    if (au.status !== 'closed' && now() >= au.ends_at) await closeAuction(au.id);
    return db.get('SELECT * FROM auctions WHERE id = ?', auctionId);
  }

  async function refreshAllAuctions() {
    for (const a of db.all(`SELECT id FROM auctions WHERE status != 'closed'`)) await refreshAuction(a.id);
  }

  function placeBid(userId, lotId, amount) {
    const u = user(userId);
    requireVerified(u, 'bid');
    requireMember(u, 'bid');
    if (u.role === 'admin') fail(403, 'S/CELL staff cannot bid.');
    const lot = db.get('SELECT * FROM lots WHERE id = ?', lotId);
    if (!lot) fail(404, 'Lot not found.');
    const au = db.get('SELECT * FROM auctions WHERE id = ?', lot.auction_id);
    if (now() < au.starts_at) fail(409, 'Bidding has not opened yet.');
    if (now() >= au.ends_at || au.status === 'closed' || lot.status !== 'open') fail(409, 'Bidding has closed for this card.');
    const amt = Math.floor(Number(amount));
    const min = lot.current_bid ? lot.current_bid + config.firstSale.bidIncrement : au.reserve;
    if (!Number.isFinite(amt) || amt < min) fail(400, `Bid at least ৳${min.toLocaleString('en-IN')}.`);
    if (lot.current_bidder_id === userId) fail(409, 'You already hold the highest bid on this card.');
    return db.tx(() => {
      db.run('INSERT INTO bids (lot_id, user_id, amount, created_at) VALUES (?,?,?,?)', lotId, userId, amt, now());
      db.run('UPDATE lots SET current_bid = ?, current_bidder_id = ? WHERE id = ?', amt, userId, lotId);
      return { amount: amt, nextMin: amt + config.firstSale.bidIncrement };
    });
  }

  async function closeAuction(auctionId) {
    const au = db.get('SELECT * FROM auctions WHERE id = ?', auctionId);
    if (!au) fail(404, 'Auction not found.');
    if (au.status === 'closed') return { sold: 0, unsold: 0 };
    db.run(`UPDATE auctions SET status = 'closed', ends_at = MIN(ends_at, ?) WHERE id = ?`, now(), auctionId);
    let sold = 0, unsold = 0;
    for (const lot of db.all(`SELECT * FROM lots WHERE auction_id = ? AND status = 'open'`, auctionId)) {
      if (lot.current_bidder_id) {
        await completeFirstSale({ cardId: lot.card_id, buyerId: lot.current_bidder_id, price: lot.current_bid, lotId: lot.id });
        db.run(`UPDATE lots SET status = 'sold' WHERE id = ?`, lot.id);
        sold++;
      } else {
        db.run(`UPDATE lots SET status = 'unsold' WHERE id = ?`, lot.id);
        db.run(`UPDATE cards SET status = 'vault' WHERE id = ?`, lot.card_id);
        unsold++;
      }
    }
    const left = db.get(`SELECT COUNT(*) AS n FROM cards WHERE artist_id = ? AND series='official' AND status IN ('vault','auction')`, au.artist_id).n;
    db.run('UPDATE artists SET status = ? WHERE id = ?', left ? 'upcoming' : 'released', au.artist_id);
    return { sold, unsold };
  }

  // ---------- Marketplace ----------
  function listCard(userId, cardId, price) {
    const u = user(userId);
    requireVerified(u, 'sell');
    const c = card(cardId);
    if (!c || c.owner_id !== userId) fail(403, 'Only the registered owner can list this card.');
    if (c.status !== 'owned') fail(409, 'This card is not available to list right now.');
    const p = pricing(c);
    if (p.retired) { retireCard(c.id); fail(409, 'This card has retired from the official market.'); }
    const amt = Math.floor(Number(price));
    if (!Number.isFinite(amt) || amt < p.minPrice) fail(400, `The minimum official price for this card is ৳${p.minPrice.toLocaleString('en-IN')}.`);
    return db.tx(() => {
      const r = db.run('INSERT INTO listings (card_id, seller_id, price, created_at) VALUES (?,?,?,?)', cardId, userId, amt, now());
      db.run(`UPDATE cards SET status = 'listed' WHERE id = ?`, cardId);
      return Number(r.lastInsertRowid);
    });
  }

  function cancelListing(userId, listingId, asAdmin = false) {
    const l = db.get('SELECT * FROM listings WHERE id = ?', listingId);
    if (!l || l.status !== 'active') fail(404, 'Active listing not found.');
    if (!asAdmin && l.seller_id !== userId) fail(403, 'Only the seller can cancel this listing.');
    db.tx(() => {
      db.run(`UPDATE listings SET status = 'cancelled' WHERE id = ?`, listingId);
      db.run(`UPDATE cards SET status = 'owned' WHERE id = ? AND status = 'listed'`, l.card_id);
    });
  }

  async function buyListing(userId, listingId, { useCredit = false } = {}) {
    const u = user(userId);
    requireVerified(u, 'buy');
    const l = db.get('SELECT * FROM listings WHERE id = ?', listingId);
    if (!l || l.status !== 'active') fail(404, 'This listing is no longer available.');
    if (l.seller_id === userId) fail(409, 'You cannot buy your own card.');
    const c = card(l.card_id);
    if (config.resale.holdingCap > 0 && c.series === 'official') {
      const held = db.get(`SELECT COUNT(*) AS n FROM cards WHERE owner_id = ? AND artist_id = ? AND series='official' AND status IN ('owned','listed','escrow')`, userId, c.artist_id).n;
      if (held >= config.resale.holdingCap) fail(409, `You already hold the maximum of ${config.resale.holdingCap} cards of this artist.`);
    }
    const fee = transferFee(l.price);
    const total = l.price + fee;
    const credit = useCredit ? Math.min(u.wallet_credit, total) : 0;
    const pay = await payments.charge({ amount: total - credit, purpose: 'resale-escrow', userId });
    return db.tx(() => {
      const fresh = db.get('SELECT status FROM listings WHERE id = ?', listingId);
      if (fresh.status !== 'active') fail(409, 'This listing was just sold.');
      const r = db.run(`INSERT INTO trades (card_id, listing_id, kind, seller_id, buyer_id, price, transfer_fee, payment_ref, status, verify_until, created_at)
                        VALUES (?,?,?,?,?,?,?,?,?,?,?)`, c.id, l.id, 'resale', l.seller_id, userId, l.price, fee, pay.ref, 'escrow',
        now() + config.resale.verifyDays * DAY, now());
      db.run(`UPDATE listings SET status = 'sold' WHERE id = ?`, l.id);
      db.run(`UPDATE cards SET status = 'escrow' WHERE id = ?`, c.id);
      if (credit) {
        db.run('UPDATE users SET wallet_credit = wallet_credit - ? WHERE id = ?', credit, userId);
        ledger(Number(r.lastInsertRowid), 'credit_used', userId, credit, 'Wallet credit applied at checkout');
      }
      return { tradeId: Number(r.lastInsertRowid), price: l.price, transferFee: fee, charged: total - credit, verifyDays: config.resale.verifyDays };
    });
  }

  function confirmChip(userId, tradeId, presented) {
    const t = db.get('SELECT * FROM trades WHERE id = ?', tradeId);
    if (!t || t.buyer_id !== userId) fail(404, 'Purchase not found.');
    if (t.status !== 'escrow') fail(409, 'This purchase is not waiting for confirmation.');
    if (!nfc.verify(card(t.card_id), presented)) fail(400, 'That chip ID does not match this card. Check the card and try again.');
    db.run('UPDATE trades SET chip_confirmed = 1 WHERE id = ?', tradeId);
    return { verifyUntil: t.verify_until };
  }

  function disputeTrade(userId, tradeId) {
    const t = db.get('SELECT * FROM trades WHERE id = ?', tradeId);
    if (!t || (t.buyer_id !== userId && t.seller_id !== userId)) fail(404, 'Trade not found.');
    if (t.status !== 'escrow') fail(409, 'Only trades in verification can be disputed.');
    db.run(`UPDATE trades SET status = 'disputed' WHERE id = ?`, tradeId);
  }

  async function settleTrade(tradeId, { force = false } = {}) {
    const t = db.get('SELECT * FROM trades WHERE id = ?', tradeId);
    if (!t) fail(404, 'Trade not found.');
    if (!['escrow', 'disputed'].includes(t.status)) fail(409, 'This trade is already finished.');
    if (!force) {
      if (t.status !== 'escrow') fail(409, 'A disputed trade needs an admin decision.');
      if (!t.chip_confirmed) fail(409, 'The buyer has not confirmed the chip yet.');
      if (now() < t.verify_until) fail(409, 'The verification period has not ended yet.');
    }
    await payments.release({ ref: t.payment_ref });
    const c = card(t.card_id);
    const a = artist(c.artist_id);
    return db.tx(() => {
      const s = splitResale(t.price, a);
      const scellIncome = s.scell + t.transfer_fee + (s.sponsorHeldByScell ? s.sponsor : 0);
      const pool = pct(s.scell + t.transfer_fee, config.ranking.poolPctOfScellIncome);
      ledger(t.id, 'seller', t.seller_id, s.seller, `Resale, seller ${s.pct.seller}%`);
      ledger(t.id, 'artist', a.id, s.artist, `Resale, artist ${s.pct.artist}%`);
      if (s.sponsorHeldByScell) ledger(t.id, 'scell', null, s.sponsor, `Sponsor share ${s.pct.sponsor}% held (no sponsor yet)`);
      else ledger(t.id, 'sponsor', a.sponsor_id, s.sponsor, `Resale, sponsor ${s.pct.sponsor}%`);
      ledger(t.id, 'scell', null, s.scell + t.transfer_fee - pool, `Resale ${s.pct.scell}% + transfer charge`);
      ledger(t.id, 'reward_pool', null, pool, `Season Reward Pool, ${config.ranking.poolPctOfScellIncome}% of S/CELL income`);
      db.run(`UPDATE cards SET owner_id = ?, status = 'owned', last_price = ?, last_sale_at = ?, acquired_at = ?, trade_count = trade_count + 1 WHERE id = ?`,
        t.buyer_id, t.price, now(), now(), c.id);
      db.run(`UPDATE trades SET status = 'completed', completed_at = ? WHERE id = ?`, now(), t.id);
      awardBadge(t.buyer_id, 'resale');
      checkRounds(t.buyer_id);
      return { split: s, scellIncome, pool };
    });
  }

  async function cancelTrade(tradeId) {
    const t = db.get('SELECT * FROM trades WHERE id = ?', tradeId);
    if (!t || !['escrow', 'disputed'].includes(t.status)) fail(409, 'Only open trades can be cancelled.');
    await payments.refund({ ref: t.payment_ref });
    db.tx(() => {
      db.run(`UPDATE trades SET status = 'cancelled', completed_at = ? WHERE id = ?`, now(), tradeId);
      db.run(`UPDATE cards SET status = 'owned' WHERE id = ?`, t.card_id);
      ledger(t.id, 'refund', t.buyer_id, t.price + t.transfer_fee, 'Buyer refunded from escrow');
    });
  }

  function retireCard(cardId) {
    db.tx(() => {
      db.run(`UPDATE listings SET status = 'cancelled' WHERE card_id = ? AND status = 'active'`, cardId);
      db.run(`UPDATE cards SET status = 'retired' WHERE id = ?`, cardId);
    });
  }

  // Daily housekeeping: settle finished verifications, retire cards whose official price reached zero.
  async function maintenance() {
    await refreshAllAuctions();
    let settled = 0, retired = 0;
    for (const t of db.all(`SELECT id FROM trades WHERE status = 'escrow' AND chip_confirmed = 1 AND verify_until <= ?`, now())) {
      await settleTrade(t.id); settled++;
    }
    for (const c of db.all(`SELECT * FROM cards WHERE status IN ('owned','listed')`)) {
      if (pricing(c).retired) { retireCard(c.id); retired++; }
    }
    return { settled, retired };
  }

  // ---------- Next Artist Vote ----------
  function createPoll(title, options) {
    const opts = (options || []).map((o) => String(o).trim()).filter(Boolean);
    if (!title || opts.length < 2) fail(400, 'A vote needs a title and at least two artists.');
    return db.tx(() => {
      const r = db.run('INSERT INTO polls (title, created_at) VALUES (?,?)', title, now());
      const id = Number(r.lastInsertRowid);
      for (const o of opts) db.run('INSERT INTO poll_options (poll_id, name) VALUES (?,?)', id, o);
      return id;
    });
  }

  function vote(userId, pollId, optionId) {
    const u = user(userId);
    requireVerified(u, 'vote');
    requireMember(u, 'vote');
    const poll = db.get('SELECT * FROM polls WHERE id = ?', pollId);
    if (!poll || poll.status !== 'open') fail(409, 'This vote is closed.');
    if (!db.get('SELECT id FROM poll_options WHERE id = ? AND poll_id = ?', optionId, pollId)) fail(400, 'Choose one of the listed artists.');
    if (db.get('SELECT 1 AS x FROM votes WHERE poll_id = ? AND user_id = ?', pollId, userId)) fail(409, 'You have already voted in this round.');
    const weight = voteWeight(u);
    db.run('INSERT INTO votes (poll_id, user_id, option_id, weight, created_at) VALUES (?,?,?,?,?)', pollId, userId, optionId, weight, now());
    return { weight };
  }

  function pollResults(pollId) {
    return db.all(`SELECT o.id, o.name, COALESCE(SUM(v.weight),0) AS points, COUNT(v.user_id) AS voters
                   FROM poll_options o LEFT JOIN votes v ON v.option_id = o.id WHERE o.poll_id = ? GROUP BY o.id ORDER BY points DESC, o.id`, pollId);
  }

  // ---------- Collector Value Ranking ----------
  function activeSeason() {
    let s = db.get(`SELECT * FROM seasons WHERE status = 'open' ORDER BY id DESC LIMIT 1`);
    if (!s) {
      const n = db.get('SELECT COUNT(*) AS n FROM seasons').n + 1;
      db.run('INSERT INTO seasons (name, starts_at, ends_at) VALUES (?,?,?)', `Season ${n}`, now(), now() + config.ranking.seasonDays * DAY);
      s = db.get(`SELECT * FROM seasons WHERE status = 'open' ORDER BY id DESC LIMIT 1`);
    }
    return s;
  }

  const poolBalance = () => db.get(`SELECT COALESCE(SUM(amount),0) AS b FROM ledger WHERE party = 'reward_pool'`).b;

  function ranking(at = now()) {
    const season = activeSeason();
    const holdCutoff = at - config.ranking.seasonDays * DAY * config.ranking.minHoldFraction;
    const rows = db.all(`SELECT u.id, u.display_name, COALESCE(SUM(c.last_price),0) AS value, COUNT(c.id) AS cards
                         FROM users u JOIN cards c ON c.owner_id = u.id
                         WHERE c.status IN ('owned','listed','escrow') AND c.acquired_at <= ?
                         GROUP BY u.id HAVING value > 0 ORDER BY value DESC, u.id`, holdCutoff);
    const total = rows.length;
    const ranked = rows.map((r, i) => {
      const percentile = ((i + 1) / total) * 100;
      const tier = config.ranking.tiers.find((t) => percentile <= t.topPct) || config.ranking.tiers.at(-1);
      return { rank: i + 1, userId: r.id, displayName: r.display_name, value: r.value, cards: r.cards, rewardPct: tier.rewardPct, reward: pct(r.value, tier.rewardPct) };
    });
    const wanted = ranked.reduce((s, r) => s + r.reward, 0);
    const pool = poolBalance();
    const scale = wanted > pool ? (wanted ? pool / wanted : 0) : 1;
    for (const r of ranked) r.credit = Math.floor(r.reward * scale);
    return { season, pool, wanted, scale, ranked, holdCutoff };
  }

  function closeSeason() {
    const { season, ranked } = ranking();
    return db.tx(() => {
      let paid = 0;
      for (const r of ranked) {
        db.run('INSERT INTO season_rewards (season_id, user_id, rank, reward_pct, holding_value, credit) VALUES (?,?,?,?,?,?)',
          season.id, r.userId, r.rank, r.rewardPct, r.value, r.credit);
        if (r.credit) {
          db.run('UPDATE users SET wallet_credit = wallet_credit + ? WHERE id = ?', r.credit, r.userId);
          ledger(null, 'reward_pool', null, -r.credit, `${season.name} reward credit, rank ${r.rank}`);
          ledger(null, 'season_reward', r.userId, r.credit, `${season.name} reward credit ${r.rewardPct}% tier`);
          paid += r.credit;
        }
      }
      db.run(`UPDATE seasons SET status = 'closed', pool_paid = ?, ends_at = ? WHERE id = ?`, paid, now(), season.id);
      activeSeason();
      return { season: season.name, collectors: ranked.length, paid };
    });
  }

  return {
    user, card, artist, cardsOwned, membershipActive, submitKyc, reviewKyc, buyMembership,
    awardBadge, badgesOf, tradeScore, voteWeight, cashbackPct, checkRounds,
    createArtist, issueRewardCard, pricing, splitFirstSale, splitResale, transferFee,
    completeFirstSale, createAuction, refreshAuction, refreshAllAuctions, placeBid, closeAuction,
    listCard, cancelListing, buyListing, confirmChip, disputeTrade, settleTrade, cancelTrade, retireCard, maintenance,
    createPoll, vote, pollResults, activeSeason, poolBalance, ranking, closeSeason,
  };
}
