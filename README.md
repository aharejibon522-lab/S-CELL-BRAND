# S/CELL — Fifteen. One artist. Forever.

The complete S/CELL website: a high-end frontend and a working backend for the business in the
S/CELL Master Business Plan v4.0. That means 15 engraved steel cards per artist, sold at a live
S/CELL Night auction, owned through ID-checked accounts, and resold on an official marketplace
that pays the artist and the sponsor on every trade.

It has **no dependencies**. It runs on Node.js 22.13 or newer, using Node's built-in web server
and SQLite database. There is nothing to install and no build step.

## Run it on your computer

```bash
node --version        # must be 22.13 or newer
npm start             # then open http://localhost:3000
```

On first start the server prints the admin login. Set `ADMIN_PASSWORD` to choose your own.
Demo collectors (fictional) all use the password `demo12345`:

| Login | What you can try |
| --- | --- |
| `collector@scell.local` | Bid at the live S/CELL Night, buy from the marketplace, vote, see your collection |
| `artist@scell.local` | Artist dashboard for the demo poet: earnings, royalties, audience, the 15 cards, statement |
| `sponsor@scell.local` | Sponsor dashboard for the demo sponsor: reach, co-branding fees, fees paid, statement |
| `rafiq@scell.local`, `tahmina@scell.local` | Other collectors, for testing trades between two accounts |
| `admin@scell.local` | Admin panel at `/admin` (password printed in the server log) |

Run the automated tests with `npm test`.

## Deploy to Render

1. Put this folder in a GitHub repository.
2. In Render, choose **New → Blueprint** and select the repository. `render.yaml` sets everything up.
3. Fill in `ADMIN_EMAIL` and `ADMIN_PASSWORD` when Render asks.
4. Before the real launch, set `SEED_DEMO=false` and start with an empty database.

The database lives on a 1 GB persistent disk, which needs Render's Starter plan or higher.
On the free plan the database is erased on every restart.

## What is built

**For fans and collectors**
- Home, collections, artist pages showing all 15 cards in the 5 / 3 / 2 / 5 structure, and card pages with full ownership history
- Accounts, a one-time NID and phone check (only the last 4 digits are stored), and a ৳100 monthly membership (free for card owners)
- S/CELL Night: live bidding with a countdown, a starting price, minimum bid steps and automatic refresh
- Marketplace: owners list cards at or above the minimum official price; buyers pay into escrow and confirm the chip; payouts are automatic
- Card verification by card ID or chip ID
- Collector ranking, trade scores, badges (Blue, Resale buyer, Round 1–3), and the weighted Next Artist Vote
- Wallet credit from loyalty cashback and season rewards, usable for membership and purchases
- Artist application and sponsor inquiry forms

**For every audience: guides, policies and calculators**
- `/guides`: a hub with live public numbers (volume, paid to artists and sponsors, verifications) and the policy library
- `/guides/collectors`, `/guides/artists`, `/guides/sponsors`: for each audience, its facilities, options, how each trade system works step by step, a live calculator, the policies that apply, and FAQs
- `/policies`: 15 plain-language policies built from the live business rules, so the numbers always match the platform:
  Terms of Use, Privacy, Fees and Payouts, Auction Rules, Marketplace and Trading Rules, Ownership and Transfer,
  Authentication, Refunds and Disputes, Membership, Rewards and Ranking, Identity and Anti-Money-Laundering,
  Artist Partnership Terms, Sponsor and Partner Terms, Community and Voting, and the Scarcity and Edition Charter
- Every policy and guide section has its own subtitle
- Versioning and acceptance tracking: collectors accept the Terms and Privacy Policy at sign-up, artists and sponsors accept their own terms before opening their dashboards, and anyone affected is asked again when an admin edits a policy
- Calculators for a resale split, artist earnings and sponsor costs against co-branding fees, each with a clear "illustration only" notice

**For artists and sponsors: their own dashboards**
- Artist dashboard: total earnings, first-sale and royalty income by month, every card with its owner and price, latest royalties, audience reach (views, verifications, bids), S/CELL Night results, agreed terms and promotion duties, and a CSV statement
- Sponsor dashboard: collections sponsored, co-branding fees earned against fees paid, reach per artist, monthly breakdown, and a CSV statement
- Collectors can download their own statement from their account

**For S/CELL staff (`/admin`)**
- Overview of money in and out, an identity check queue, and artist creation with all 15 card texts
- Sponsors and assigning them to artists, scheduling and closing S/CELL Nights
- Escrow control (release or refund), votes, season close with reward credit, applications
- A full ledger, Reward Edition cards, reporting lost cards, and housekeeping
- Accounts: create artist and sponsor logins linked to their records, and open any artist's or sponsor's dashboard
- Policies: edit any policy in plain text; each save becomes a new version. Restore the standard text at any time.
- Record sponsorship fee payments, which then show in the sponsor dashboard

## Business rules

Every rule is in **`server/config.js`**, with a comment saying where it comes from:

- First sale: artist 20% (18% with an advance), S/CELL 80%
- Resale up to ৳1 lakh: seller 80%, artist 13%, sponsor 6%, S/CELL 1%
- Resale above ৳1 lakh: seller 85%, artist 10%, sponsor 4%, S/CELL 1%
- With an advance, the artist's resale share is 1 point lower and the point goes to S/CELL. If an artist has no sponsor yet, S/CELL holds the sponsor share.
- Each resale must be at least ৳150 above the last price. After 12 months unsold, the minimum price drops 10% a year. At zero, the card retires.
- 3-day verification with the payment held, plus a chip confirmation by the buyer
- Loyalty cashback: 2nd card 3%, 3rd 5%, 5th 7%, 10th and above 10%, paid as credit from S/CELL's share
- Trade score rounds at 10, 20 and 30
- 12-month Collector Value Ranking, paid as credit from the Season Reward Pool (20% of S/CELL's resale income) and never more than the pool holds

**Open decisions** are set with environment variables (see `.env.example`), so you can change them without touching code:
the secure-transfer charge (`TRANSFER_FEE_PCT`, now 2.5% with a ৳300 minimum), the holding cap (`HOLDING_CAP`, now off),
and the decay details.

## Connecting the real partners

Three outside services run in sandbox mode. Each is one small object in **`server/integrations.js`**,
so connecting a provider means replacing that object, not rewriting the app.

| Service | Sandbox today | Real version |
| --- | --- | --- |
| Payments and escrow | Every charge succeeds instantly | A gateway licensed by Bangladesh Bank (bKash, Nagad, SSLCOMMERZ or a bank) holds buyers' money in escrow and releases it on settlement |
| Identity checks | An admin approves each NID by hand | The payment partner's KYC or an e-KYC provider |
| NFC chip | The buyer types the chip ID from the certificate | NTAG424 DNA "SUN" messages checked with each chip's secret key, so copied chips fail |

## Security built in

- Passwords hashed with scrypt; sessions in HttpOnly, SameSite cookies (Secure in production)
- Every state-changing request needs a custom header (CSRF protection)
- Rate limits on sign-in and sign-up
- A strict content security policy and security headers
- NIDs stored only as a keyed hash plus the last 4 digits; one NID per account
- Chip IDs shown only to the card's owner, never in public pages or the API
- S/CELL staff cannot bid

## Before launch: legal checks

Have a Bangladeshi lawyer review:

1. The escrow arrangement with your licensed payment partner
2. The wording of the rising-price rule, the sponsor resale share and the season rewards, which must never read as an investment or interest
3. The artist and sponsor agreements

The site already says on every relevant page that cards are cultural collectibles and that prices can fall.

## Folder map

```
server/
  index.js         starts the server and runs housekeeping every 15 minutes
  app.js           web server: static files, sessions, security headers
  api.js           every API route
  services.js      the business logic (auctions, escrow, splits, rewards, votes, ranking)
  config.js        all business rules and open decisions
  db.js            database tables
  integrations.js  payments, identity and NFC placeholders
  portal.js        policies, guides, calculators, dashboards, statements, public numbers
  content/         the policy library and audience guides (numbers filled in from config.js)
  seed.js          admin account and fictional demo data
public/            the website (HTML, CSS, JavaScript; no build step)
tests/             automated tests (npm test)
```
