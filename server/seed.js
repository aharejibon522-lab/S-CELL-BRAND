import { randomBytes } from 'node:crypto';
import { hashPassword, now, DAY } from './security.js';

// Creates the first admin account, and (unless SEED_DEMO=false) a set of clearly fictional demo artists and collectors
// so every page of the site has something to show. Real artists are added from the admin panel.

const ARJO = [
  ['Play it like the room is listening', 'Every crowd is a small country. Treat it with respect.'],
  ['Noise has its people', 'A loud song is only a quiet one that found its audience.'],
  ['The borrowed guitar', 'My first chord was on a guitar I had to give back by evening.'],
  ['Silence is part of the song', 'Leave room. The listener finishes the line.'],
  ['Every stage starts on a rooftop', 'We rehearsed above the tea stall until the neighbours sang along.'],
  ['Write fast, edit slow', 'The idea arrives in a minute. The song takes a year.'],
  ['The mistake is the hook', 'Keep the wrong note if it makes you feel something.'],
  ['Tune the guitar, not the truth', 'Change the key. Never change what the song means.'],
  ['The first full house', 'The night the hall filled, I forgot the second verse. Nobody cared.'],
  ['Twenty years, one street', 'Different stages, same people in the front row.'],
  ['The rooftop', ''], ['Monsoon set', ''], ['The borrowed guitar', ''],
  ['Front row', ''], ['Last encore', ''],
];

const MEGHLA = [
  ['Words are rivers', 'They change the land they pass through.'],
  ['Write what you cannot say', 'The page listens when people will not.'],
  ['A poem is a small house', 'Build it so one more person can sit inside.'],
  ['The mother tongue', 'I dream in Bangla, so I write in it.'],
  ['Ink and rain', 'Every season I return to the same window.'],
  ['Cut the first line', 'The real poem usually starts on the second.'],
  ['Read it aloud', 'If the mouth stumbles, the line is not finished.'],
  ['Short is not small', 'Four lines can hold a whole life.'],
  ['The first book', 'Three hundred copies, carried to the fair by hand.'],
  ['The letter from a reader', 'A stranger copied my poem into her wedding card.'],
  ['The window', ''], ['Ink river', ''], ['The fair', ''],
  ['The pen', ''], ['Rain alphabet', ''],
];

const SHOHOR = [
  ['Five friends, one room', 'One rented room, one fan, five opinions about every song.'],
  ['The city is the fifth member', 'Horns, rain and rickshaw bells are on every record.'],
  ['Night bus home', 'Most of our lyrics were written on the last bus.'],
  ['Rent day rehearsal', 'We played harder on the days we could not pay.'],
  ['Songs from the window', 'The street below taught us every rhythm we know.'],
  ['Everyone writes the chorus', 'A song belongs to the band, not the loudest voice.'],
  ['Record it before it is perfect', 'The first take keeps the feeling. Fix the rest later.'],
  ['Turn the street into a drum', 'Every city sound is a beat if you listen long enough.'],
  ['First gig, eleven people', 'Eleven people came. Nine of them were cousins.'],
  ['The song the city sang back', 'One night a whole street sang our chorus before we did.'],
  ['Night rails', ''], ['Six strings', ''], ['The B-side', ''], ['The bass', ''], ['Shohor Lane', ''],
];

export async function seed(db, svc, { quiet = false } = {}) {
  const log = (...a) => { if (!quiet) console.log(...a); };

  if (!db.get(`SELECT id FROM users WHERE role = 'admin'`)) {
    const email = (process.env.ADMIN_EMAIL || 'admin@scell.local').toLowerCase();
    const password = process.env.ADMIN_PASSWORD || randomBytes(9).toString('base64url');
    db.run(`INSERT INTO users (name, display_name, email, phone, password_hash, role, kyc_status, created_at)
            VALUES (?,?,?,?,?,?,?,?)`, 'S/CELL Admin', 'S/CELL', email, '01700000000', hashPassword(password), 'admin', 'verified', now());
    log(`Admin account: ${email}${process.env.ADMIN_PASSWORD ? '' : ` / password: ${password}  (set ADMIN_PASSWORD to choose your own)`}`);
  }

  if (process.env.SEED_DEMO === 'false' || db.get('SELECT id FROM artists LIMIT 1')) return;

  // Demo collectors (fictional). All share one demo password so the flows can be tried.
  const demoPass = hashPassword('demo12345');
  const people = [
    ['Nusrat Jahan', 'Nusrat', 'collector@scell.local', '01711000001'],
    ['Rafiq Hasan', 'Rafiq', 'rafiq@scell.local', '01711000002'],
    ['Tahmina Akter', 'Tahmina', 'tahmina@scell.local', '01711000003'],
    ['Imran Chowdhury', 'Imran', 'imran@scell.local', '01711000004'],
    ['Sadia Rahman', 'Sadia', 'sadia@scell.local', '01711000005'],
  ];
  const ids = people.map(([name, dn, email, phone], i) => Number(db.run(
    `INSERT INTO users (name, display_name, email, phone, password_hash, kyc_status, nid_last4, membership_until, created_at)
     VALUES (?,?,?,?,?,?,?,?,?)`, name, dn, email, phone, demoPass, 'verified', String(4100 + i), now() + 30 * DAY, now() - 120 * DAY).lastInsertRowid));

  const sponsor = Number(db.run('INSERT INTO sponsors (name, category, monthly_fee, created_at) VALUES (?,?,?,?)',
    'Demo Pay (sample sponsor)', 'payments', 3750, now()).lastInsertRowid);

  // Artist 1: live S/CELL Night with bids.
  const arjo = svc.createArtist({
    name: 'Arjo Rahman', category: 'Rock vocalist', isDemo: true, cards: ARJO.map(([title, body]) => ({ title, body })),
    bio: 'Fictional demo artist. Two decades of rooftop rehearsals, monsoon concerts and a front row that never changed.',
  });
  const auctionId = svc.createAuction({ artistId: arjo, startsAt: now() - 60 * 60 * 1000, endsAt: now() + 3 * DAY, reserve: 1500 });
  const lots = db.all('SELECT id FROM lots WHERE auction_id = ? ORDER BY id', auctionId);
  const bidPlan = [[0, 1, 1500], [0, 2, 2200], [1, 3, 1800], [2, 0, 1500], [2, 4, 3100], [4, 1, 2600], [10, 2, 4000]];
  for (const [lot, who, amt] of bidPlan) svc.placeBid(ids[who], lots[lot].id, amt);

  // Artist 2: released collection with first sales, resales and live listings.
  const meghla = svc.createArtist({
    name: 'Meghla Sultana', category: 'Poet', isDemo: true, tookAdvance: true, cards: MEGHLA.map(([title, body]) => ({ title, body })),
    bio: 'Fictional demo poet. Four books, one window, and a habit of writing in the rain.',
  });
  db.run('UPDATE artists SET sponsor_id = ?, status = ? WHERE id = ?', sponsor, 'released', meghla);
  const mCards = db.all(`SELECT id FROM cards WHERE artist_id = ? ORDER BY number`, meghla);
  const firstPrices = [6500, 4200, 3800, 5100, 2900, 3300, 2600, 2400, 7800, 5600, 4400, 3900, 3600, 3100, 4800];
  for (let i = 0; i < mCards.length; i++) {
    await svc.completeFirstSale({ cardId: mCards[i].id, buyerId: ids[i % ids.length], price: firstPrices[i] });
  }
  // Backdate ownership so the collector ranking has eligible holdings.
  db.run('UPDATE cards SET acquired_at = ?, last_sale_at = ? WHERE artist_id = ?', now() - 100 * DAY, now() - 100 * DAY, meghla);

  // A few completed resales.
  const resales = [[0, 9200, 3], [8, 11500, 2], [3, 6400, 4], [0, 12800, 1]];
  for (const [idx, price, buyer] of resales) {
    const c = svc.card(mCards[idx].id);
    const listingId = svc.listCard(c.owner_id, c.id, price);
    const { tradeId } = await svc.buyListing(ids[buyer], listingId);
    svc.confirmChip(ids[buyer], tradeId, c.chip_uid);
    await svc.settleTrade(tradeId, { force: true });
  }
  db.run('UPDATE cards SET acquired_at = ? WHERE artist_id = ?', now() - 95 * DAY, meghla);

  // Live listings on the marketplace.
  for (const [idx, price] of [[1, 5200], [4, 3600], [9, 7400], [13, 4100]]) {
    const c = svc.card(mCards[idx].id);
    svc.listCard(c.owner_id, c.id, price);
  }

  // Artist 3: announced, not yet on sale.
  svc.createArtist({ name: 'Shohor Lane', category: 'Band', isDemo: true, cards: SHOHOR.map(([title, body]) => ({ title, body })), bio: 'Fictional demo band. Five friends, one rented practice room, songs about the city at night.' });

  // Demo artist and sponsor logins linked to their records, so both dashboards can be tried.
  db.run(`INSERT INTO users (name, display_name, email, phone, password_hash, role, kyc_status, artist_id, created_at) VALUES (?,?,?,?,?,?,?,?,?)`,
    'Meghla Sultana', 'Meghla', 'artist@scell.local', '01711000010', demoPass, 'artist', 'verified', meghla, now());
  db.run(`INSERT INTO users (name, display_name, email, phone, password_hash, role, kyc_status, sponsor_id, created_at) VALUES (?,?,?,?,?,?,?,?,?)`,
    'Demo Pay partnerships team', 'Demo Pay', 'sponsor@scell.local', '01711000011', demoPass, 'sponsor', 'verified', sponsor, now());
  db.run('INSERT INTO ledger (party, party_id, amount, note, created_at) VALUES (?,?,?,?,?)', 'sponsor_fee', sponsor, 3750, 'Sponsorship fee received (demo)', now() - 20 * DAY);
  for (const u of db.all('SELECT id FROM users')) {
    for (const slug of ['terms', 'privacy']) db.run('INSERT OR IGNORE INTO policy_acceptances (user_id, slug, version, accepted_at) VALUES (?,?,?,?)', u.id, slug, 1, now());
  }
  const evIns = 'INSERT INTO events (type, artist_id, card_id, created_at) VALUES (?,?,?,?)';
  for (let i = 0; i < 140; i++) db.run(evIns, i % 4 === 0 ? 'artist_view' : 'card_view', meghla, mCards[i % 15].id, now() - (i % 30) * DAY);
  for (let i = 0; i < 26; i++) db.run(evIns, 'verify', meghla, mCards[i % 15].id, now() - (i % 30) * DAY);

  svc.createPoll('Who should be the next S/CELL artist?', ['Nodi Kahini (demo)', 'Tanvir Ahsan (demo)', 'Ruposhi Collective (demo)']);
  const poll = db.get('SELECT id FROM polls ORDER BY id DESC LIMIT 1').id;
  const opts = db.all('SELECT id FROM poll_options WHERE poll_id = ? ORDER BY id', poll);
  svc.vote(ids[1], poll, opts[0].id);
  svc.vote(ids[2], poll, opts[1].id);
  svc.vote(ids[3], poll, opts[0].id);

  log('Demo data loaded. Demo logins (password demo12345): collector@scell.local, artist@scell.local, sponsor@scell.local');
}
