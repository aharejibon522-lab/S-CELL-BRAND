import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

const SCHEMA = `
PRAGMA foreign_keys = ON;
PRAGMA journal_mode = WAL;

CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  display_name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  phone TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'collector' CHECK (role IN ('collector','admin','artist','sponsor')),
  kyc_status TEXT NOT NULL DEFAULT 'none' CHECK (kyc_status IN ('none','pending','verified','rejected')),
  nid_last4 TEXT,
  nid_hash TEXT,
  membership_until INTEGER NOT NULL DEFAULT 0,
  wallet_credit INTEGER NOT NULL DEFAULT 0,
  artist_id INTEGER,
  sponsor_id INTEGER,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS sponsors (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'brand',
  monthly_fee INTEGER NOT NULL DEFAULT 3750,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS artists (
  id INTEGER PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  bio TEXT NOT NULL DEFAULT '',
  took_advance INTEGER NOT NULL DEFAULT 0,
  sponsor_id INTEGER REFERENCES sponsors(id),
  status TEXT NOT NULL DEFAULT 'upcoming' CHECK (status IN ('upcoming','live','released')),
  is_demo INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS cards (
  id INTEGER PRIMARY KEY,
  artist_id INTEGER NOT NULL REFERENCES artists(id),
  series TEXT NOT NULL DEFAULT 'official' CHECK (series IN ('official','reward')),
  number INTEGER NOT NULL,
  theme TEXT NOT NULL,
  orientation TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL DEFAULT '',
  chip_uid TEXT NOT NULL UNIQUE,
  code TEXT NOT NULL UNIQUE,
  owner_id INTEGER REFERENCES users(id),
  status TEXT NOT NULL DEFAULT 'vault' CHECK (status IN ('vault','auction','owned','listed','escrow','retired','lost')),
  first_sale_price INTEGER,
  last_price INTEGER,
  last_sale_at INTEGER,
  acquired_at INTEGER,
  trade_count INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  UNIQUE (artist_id, series, number)
);

CREATE TABLE IF NOT EXISTS auctions (
  id INTEGER PRIMARY KEY,
  artist_id INTEGER NOT NULL REFERENCES artists(id),
  title TEXT NOT NULL,
  starts_at INTEGER NOT NULL,
  ends_at INTEGER NOT NULL,
  reserve INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled','live','closed')),
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS lots (
  id INTEGER PRIMARY KEY,
  auction_id INTEGER NOT NULL REFERENCES auctions(id),
  card_id INTEGER NOT NULL REFERENCES cards(id),
  current_bid INTEGER,
  current_bidder_id INTEGER REFERENCES users(id),
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','sold','unsold'))
);

CREATE TABLE IF NOT EXISTS bids (
  id INTEGER PRIMARY KEY,
  lot_id INTEGER NOT NULL REFERENCES lots(id),
  user_id INTEGER NOT NULL REFERENCES users(id),
  amount INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS listings (
  id INTEGER PRIMARY KEY,
  card_id INTEGER NOT NULL REFERENCES cards(id),
  seller_id INTEGER NOT NULL REFERENCES users(id),
  price INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','sold','cancelled')),
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS trades (
  id INTEGER PRIMARY KEY,
  card_id INTEGER NOT NULL REFERENCES cards(id),
  listing_id INTEGER REFERENCES listings(id),
  lot_id INTEGER REFERENCES lots(id),
  kind TEXT NOT NULL CHECK (kind IN ('first_sale','resale','reward')),
  seller_id INTEGER REFERENCES users(id),
  buyer_id INTEGER NOT NULL REFERENCES users(id),
  price INTEGER NOT NULL,
  transfer_fee INTEGER NOT NULL DEFAULT 0,
  payment_ref TEXT,
  status TEXT NOT NULL CHECK (status IN ('escrow','completed','cancelled','disputed')),
  verify_until INTEGER,
  chip_confirmed INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  completed_at INTEGER
);

CREATE TABLE IF NOT EXISTS ledger (
  id INTEGER PRIMARY KEY,
  trade_id INTEGER REFERENCES trades(id),
  party TEXT NOT NULL,
  party_id INTEGER,
  amount INTEGER NOT NULL,
  note TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS badges (
  user_id INTEGER NOT NULL REFERENCES users(id),
  code TEXT NOT NULL,
  season_id INTEGER NOT NULL DEFAULT 0,
  awarded_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, code, season_id)
);

CREATE TABLE IF NOT EXISTS polls (
  id INTEGER PRIMARY KEY,
  title TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','closed')),
  created_at INTEGER NOT NULL,
  closed_at INTEGER
);

CREATE TABLE IF NOT EXISTS poll_options (
  id INTEGER PRIMARY KEY,
  poll_id INTEGER NOT NULL REFERENCES polls(id),
  name TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS votes (
  poll_id INTEGER NOT NULL REFERENCES polls(id),
  user_id INTEGER NOT NULL REFERENCES users(id),
  option_id INTEGER NOT NULL REFERENCES poll_options(id),
  weight INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (poll_id, user_id)
);

CREATE TABLE IF NOT EXISTS seasons (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  starts_at INTEGER NOT NULL,
  ends_at INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','closed')),
  pool_paid INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS season_rewards (
  id INTEGER PRIMARY KEY,
  season_id INTEGER NOT NULL REFERENCES seasons(id),
  user_id INTEGER NOT NULL REFERENCES users(id),
  rank INTEGER NOT NULL,
  reward_pct INTEGER NOT NULL,
  holding_value INTEGER NOT NULL,
  credit INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS applications (
  id INTEGER PRIMARY KEY,
  type TEXT NOT NULL CHECK (type IN ('artist','sponsor')),
  payload TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'new',
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS policy_overrides (
  slug TEXT PRIMARY KEY,
  version INTEGER NOT NULL,
  title TEXT NOT NULL,
  subtitle TEXT NOT NULL DEFAULT '',
  summary TEXT NOT NULL DEFAULT '',
  sections TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS policy_acceptances (
  user_id INTEGER NOT NULL REFERENCES users(id),
  slug TEXT NOT NULL,
  version INTEGER NOT NULL,
  accepted_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, slug, version)
);

CREATE TABLE IF NOT EXISTS events (
  id INTEGER PRIMARY KEY,
  type TEXT NOT NULL,
  artist_id INTEGER,
  card_id INTEGER,
  user_id INTEGER,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_events_artist ON events(artist_id, type);
CREATE INDEX IF NOT EXISTS idx_cards_owner ON cards(owner_id);
CREATE INDEX IF NOT EXISTS idx_cards_artist ON cards(artist_id);
CREATE INDEX IF NOT EXISTS idx_trades_card ON trades(card_id);
CREATE INDEX IF NOT EXISTS idx_ledger_party ON ledger(party, party_id);
`;

// Upgrades databases created by version 1 (collector and admin roles only) to version 2.
function migrate(raw) {
  const row = raw.prepare(`SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'users'`).get();
  if (!row || row.sql.includes("'artist'")) return;
  raw.exec('PRAGMA foreign_keys = OFF');
  raw.exec('BEGIN');
  raw.exec(`CREATE TABLE users_v2 (
    id INTEGER PRIMARY KEY, name TEXT NOT NULL, display_name TEXT NOT NULL, email TEXT NOT NULL UNIQUE, phone TEXT NOT NULL,
    password_hash TEXT NOT NULL, role TEXT NOT NULL DEFAULT 'collector' CHECK (role IN ('collector','admin','artist','sponsor')),
    kyc_status TEXT NOT NULL DEFAULT 'none' CHECK (kyc_status IN ('none','pending','verified','rejected')),
    nid_last4 TEXT, nid_hash TEXT, membership_until INTEGER NOT NULL DEFAULT 0, wallet_credit INTEGER NOT NULL DEFAULT 0,
    artist_id INTEGER, sponsor_id INTEGER, created_at INTEGER NOT NULL)`);
  raw.exec(`INSERT INTO users_v2 (id, name, display_name, email, phone, password_hash, role, kyc_status, nid_last4, nid_hash, membership_until, wallet_credit, created_at)
            SELECT id, name, display_name, email, phone, password_hash, role, kyc_status, nid_last4, nid_hash, membership_until, wallet_credit, created_at FROM users`);
  raw.exec('DROP TABLE users');
  raw.exec('ALTER TABLE users_v2 RENAME TO users');
  raw.exec('COMMIT');
  raw.exec('PRAGMA foreign_keys = ON');
}

export function openDb(path) {
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
  const raw = new DatabaseSync(path);
  migrate(raw);
  raw.exec(SCHEMA);

  const cache = new Map();
  const stmt = (sql) => {
    let s = cache.get(sql);
    if (!s) { s = raw.prepare(sql); cache.set(sql, s); }
    return s;
  };

  let depth = 0;
  const db = {
    raw,
    all: (sql, ...p) => stmt(sql).all(...p),
    get: (sql, ...p) => stmt(sql).get(...p),
    run: (sql, ...p) => stmt(sql).run(...p),
    // Nested-safe transaction helper.
    tx(fn) {
      if (depth > 0) return fn();
      depth++;
      raw.exec('BEGIN IMMEDIATE');
      try {
        const out = fn();
        raw.exec('COMMIT');
        return out;
      } catch (e) {
        raw.exec('ROLLBACK');
        throw e;
      } finally {
        depth--;
      }
    },
  };
  return db;
}
