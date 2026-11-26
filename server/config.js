// S/CELL business rules. Every number here comes from the S/CELL Master Business Plan v4.0.
// Values marked OPEN are decisions the founder has not settled yet; change them with environment variables.

const num = (name, fallback) => {
  const v = process.env[name];
  if (v === undefined || v === '') return fallback;
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
};

export const config = {
  port: num('PORT', 3000),
  production: process.env.NODE_ENV === 'production',
  dbPath: process.env.DB_PATH || './data/scell.db',
  sessionDays: num('SESSION_DAYS', 30),
  // Access code for the private concept room (/concept). Empty means only admins can open it.
  pitchCode: process.env.PITCH_CODE || '',
  secret: process.env.NID_HASH_KEY || 'dev-only-secret',

  // Collection structure: exactly 15 official cards per artist.
  collection: [
    { theme: 't1', label: 'Foundational thoughts', count: 5, orientation: 'landscape' },
    { theme: 't2', label: 'Creative philosophies', count: 3, orientation: 'landscape' },
    { theme: 't3', label: 'Career reflections', count: 2, orientation: 'landscape' },
    { theme: 'portrait', label: 'Artistic visuals', count: 5, orientation: 'portrait' },
  ],

  // First sale (settled): artist 20%, or 18% when the artist took an advance. S/CELL keeps the rest.
  firstSale: {
    artistPct: 20,
    artistPctWithAdvance: 18,
    defaultReserve: num('AUCTION_RESERVE', 1500), // settled: low start, about ৳1,500–2,000
    bidIncrement: num('BID_INCREMENT', 100),
  },

  // Resale split (settled): 20% fee up to ৳1 lakh, 15% above. Deducted from the seller.
  resale: {
    tierBreak: 100000,
    low: { seller: 80, artist: 13, sponsor: 6, scell: 1 },
    high: { seller: 85, artist: 10, sponsor: 4, scell: 1 },
    // Settled: with an advance the artist's resale share drops by 1 point (13 → 12). The point goes to S/CELL.
    advanceArtistReduction: 1,
    // If an artist has no sponsor yet, the sponsor share is held by S/CELL.
    minStep: num('MIN_PRICE_STEP', 150), // settled: at least ৳100–150 above the last price
    verifyDays: num('VERIFY_DAYS', 3), // settled: 3–5 day verification
    // OPEN: secure-transfer charge paid by the buyer. Recommended 2.5%, minimum ৳300. Set TRANSFER_FEE_PCT=0 to switch off.
    transferFeePct: num('TRANSFER_FEE_PCT', 2.5),
    transferFeeMin: num('TRANSFER_FEE_MIN', 300),
    // OPEN: holding cap per person per artist. 0 = no cap.
    holdingCap: num('HOLDING_CAP', 0),
  },

  // Decay (settled in principle, details OPEN): an unsold card's official price drops 10% a year to zero, then retires.
  decay: {
    startAfterDays: num('DECAY_START_DAYS', 365),
    pctPerYear: num('DECAY_PCT_PER_YEAR', 10),
  },

  // Membership (settled): free app, about ৳100 a month for bidding, voting, badges, early access. Card owners free.
  membership: { monthlyFee: num('MEMBERSHIP_FEE', 100), days: 30 },

  // Loyalty cashback on first-sale purchases (settled), paid as credit from S/CELL's share.
  cashback: [
    { minCards: 10, pct: 10 },
    { minCards: 5, pct: 7 },
    { minCards: 3, pct: 5 },
    { minCards: 2, pct: 3 },
  ],

  // Trade score rounds (settled): total official trades on cards held.
  rounds: [
    { code: 'round3', label: 'Round 3', score: 30 },
    { code: 'round2', label: 'Round 2', score: 20 },
    { code: 'round1', label: 'Round 1', score: 10 },
  ],

  // Next Artist Vote weights (recommended).
  voteWeights: { verified: 1, blue: 2, resale: 3, perRoundMark: 1 },

  // Collector Value Ranking (settled idea, 12-month season). Paid as reward credit from the Season Reward Pool.
  // Legal check pending: wording is always "reward credit", never interest or return.
  ranking: {
    seasonDays: 365,
    minHoldFraction: 0.25, // card must be held at least a quarter of the season
    tiers: [
      { topPct: 10, rewardPct: 15 },
      { topPct: 20, rewardPct: 10 },
      { topPct: 30, rewardPct: 8 },
      { topPct: 40, rewardPct: 6 },
      { topPct: 50, rewardPct: 4 },
      { topPct: 75, rewardPct: 2 },
      { topPct: 100, rewardPct: 1 },
    ],
    // Share of S/CELL's resale and transfer income that funds the Season Reward Pool.
    poolPctOfScellIncome: num('REWARD_POOL_PCT', 20),
  },
};

import { readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
// Artists whose cards have finished illustrated artwork in public/img/cards/<slug>/NN.webp.
export const cardArt = (() => {
  try { return readdirSync(fileURLToPath(new URL('../public/img/cards/', import.meta.url)), { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name); }
  catch { return []; }
})();

export const publicConfig = () => ({
  cardArt,
  collection: config.collection,
  firstSale: config.firstSale,
  resale: {
    tierBreak: config.resale.tierBreak,
    low: config.resale.low,
    high: config.resale.high,
    minStep: config.resale.minStep,
    advanceArtistReduction: config.resale.advanceArtistReduction,
    verifyDays: config.resale.verifyDays,
    transferFeePct: config.resale.transferFeePct,
    transferFeeMin: config.resale.transferFeeMin,
    holdingCap: config.resale.holdingCap,
  },
  decay: config.decay,
  membership: config.membership,
  cashback: config.cashback,
  rounds: config.rounds,
  voteWeights: config.voteWeights,
  ranking: { seasonDays: config.ranking.seasonDays, tiers: config.ranking.tiers, minHoldFraction: config.ranking.minHoldFraction },
});
