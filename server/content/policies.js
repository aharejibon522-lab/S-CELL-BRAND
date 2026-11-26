// S/CELL policy library. Every number is read from config.js when the policy is served, so the
// written rules can never disagree with what the platform actually does.
// These are plain-language drafts for legal review, not final legal documents.

const t = (n) => `৳${Number(n).toLocaleString('en-IN')}`;
export const POLICY_BASE_VERSION = 1;

export function policies(c) {
  const r = c.resale, f = c.firstSale, d = c.decay, m = c.membership;
  const fee = r.transferFeePct
    ? `The buyer pays a secure-transfer charge of ${r.transferFeePct}% of the price, with a minimum of ${t(r.transferFeeMin)}, on top of the price.`
    : 'There is currently no secure-transfer charge for buyers.';
  const cap = r.holdingCap > 0 ? `One person may hold at most ${r.holdingCap} official cards of the same artist.` : 'There is currently no limit on how many cards of one artist a person may hold. S/CELL may introduce a limit with 30 days\' notice.';
  const tiers = c.ranking.tiers.map((x, i, a) => `${i === 0 ? `Top ${x.topPct}%` : `Above ${a[i - 1].topPct}% up to ${x.topPct}%`}: ${x.rewardPct}% of eligible holding value`);
  const cashback = c.cashback.slice().reverse().map((x) => `Owning ${x.minCards} or more cards after a first-sale purchase: ${x.pct}% back as credit`);

  return [
    {
      slug: 'terms', title: 'Terms of Use', audience: ['collectors', 'artists', 'sponsors'],
      subtitle: 'The ground rules, written to be read, not skipped.',
      summary: 'The agreement between you and S/CELL when you use the website and app.',
      sections: [
        { h: 'Who we are', p: ['S/CELL is a cultural collectibles platform based in Bangladesh. S/CELL works with living artists to create collections of exactly 15 engraved steel cards each, sells them at live auctions called S/CELL Night, keeps the official ownership registry, and runs the official marketplace for resales.'] },
        { h: 'Who can use S/CELL', p: ['You must be at least 18 years old to create an account, bid, buy, sell or vote.', 'Anyone may browse collections, card histories and public pages without an account.', 'To bid, buy, sell or vote, you must complete the identity check described in the Identity Verification and Anti-Money-Laundering Policy.'] },
        { h: 'Your account', items: ['One person may hold one account. Each NID can be linked to only one account.', 'Keep your password private. You are responsible for activity on your account.', 'Your display name appears publicly on card histories, rankings and votes. Your full name, phone, email and NID never do.', 'You can close your account at any time by contacting S/CELL. Cards you own stay registered to you until you transfer them.'] },
        { h: 'What S/CELL cards are, and are not', p: ['S/CELL cards are cultural collectibles. They are not shares, deposits, securities, savings products or investments.', 'Prices are set by buyers and sellers. They can rise or fall, and a card may not find a buyer. S/CELL does not promise appreciation, liquidity, resale profit or any return.', 'Rewards such as cashback and season reward credit are loyalty benefits paid as platform credit. They are not interest.'] },
        { h: 'Acceptable use', items: ['No fake accounts, shared accounts or accounts opened for someone else.', 'No bidding or trading designed to fake demand, including bidding on behalf of an artist or trading back and forth with a friend or relative to raise a price or a trade score.', 'No attempts to copy, clone or tamper with a card or its chip.', 'No harassment of artists, collectors or staff.', 'S/CELL may suspend an account, freeze a card in the registry or cancel a transaction that breaks these rules, and may report suspected crime to the authorities.'] },
        { h: 'Changes to these terms', p: ['S/CELL will post changes on this page with a new version number and date, and will notify account holders of material changes at least 14 days before they apply. Changes to fees or payout percentages are announced at least 30 days in advance and never apply to a sale already in progress.'] },
        { h: 'Contact and disputes', p: ['Questions go to the S/CELL support team through the contact page. Disputes about a specific trade follow the Refund, Cancellation and Dispute Policy. These terms are governed by the laws of Bangladesh.'] },
      ],
    },
    {
      slug: 'privacy', title: 'Privacy Policy', audience: ['collectors', 'artists', 'sponsors'],
      subtitle: 'We keep what proves ownership, and protect everything else.',
      summary: 'What personal information S/CELL collects, why, and how it is protected.',
      sections: [
        { h: 'What we collect', items: ['Account details: full name, display name, email, mobile number and password (stored only as a secure hash).', 'Identity check: your NID number is checked once. S/CELL stores only its last 4 digits and a keyed fingerprint that stops the same NID opening a second account. The full number is not kept.', 'Activity: bids, purchases, sales, votes, card verifications and payments.', 'Technical data: your IP address and browser information, used for security and fraud prevention.'] },
        { h: 'Why we use it', items: ['To run auctions, the registry and the marketplace.', 'To meet anti-money-laundering and record-keeping duties.', 'To pay artists, sponsors and sellers correctly.', 'To prevent fraud, fake accounts and manipulation.', 'To send you messages about your bids, trades and account.'] },
        { h: 'What is public', p: ['Your display name, the cards you own, the prices of official trades, your badges and your ranking are public. This public record is what makes S/CELL ownership verifiable. Everything else stays private.'] },
        { h: 'Who we share it with', items: ['The licensed payment partner, to process and hold payments.', 'An identity-check provider, if S/CELL uses one.', 'Authorities, when the law requires it.', 'S/CELL never sells personal information. Sponsors receive only totals and counts, never collectors\' personal details.'] },
        { h: 'How long we keep it', p: ['Transaction and ownership records are kept for as long as the law requires and for the life of each card, because the ownership history is part of the card. Other personal data is deleted or anonymised within 12 months of an account being closed.'] },
        { h: 'Your rights', items: ['See the personal data S/CELL holds about you.', 'Correct details that are wrong.', 'Close your account. Public ownership history stays, shown under your display name.'] },
      ],
    },
    {
      slug: 'fees', title: 'Fees and Payouts Schedule', audience: ['collectors', 'artists', 'sponsors'],
      subtitle: 'Every taka, every share, nothing hidden.',
      summary: 'Every fee, share and payout on S/CELL in one place.',
      sections: [
        { h: 'First sale at S/CELL Night', items: [`Every card starts at ${t(f.defaultReserve)}. Bids rise by at least ${t(f.bidIncrement)}.`, `The artist receives ${f.artistPct}% of the winning bid, or ${f.artistPctWithAdvance}% if the artist took an advance.`, 'S/CELL receives the rest. The winner pays no transfer charge on a first sale.'] },
        { h: `Official resale up to ${t(r.tierBreak)}`, items: [`Seller: ${r.low.seller}%`, `Artist: ${r.low.artist}% (${r.low.artist - r.advanceArtistReduction}% if the artist took an advance)`, `Sponsor: ${r.low.sponsor}% (held by S/CELL if the artist has no sponsor)`, `S/CELL: ${r.low.scell}%`] },
        { h: `Official resale above ${t(r.tierBreak)}`, items: [`Seller: ${r.high.seller}%`, `Artist: ${r.high.artist}% (${r.high.artist - r.advanceArtistReduction}% with an advance)`, `Sponsor: ${r.high.sponsor}%`, `S/CELL: ${r.high.scell}%`] },
        { h: 'Buyer charges', p: [fee] },
        { h: 'Membership', p: [`Membership costs ${t(m.monthlyFee)} for ${m.days} days. Anyone who owns at least one card has membership free.`] },
        { h: 'Season Reward Pool', p: [`${c.ranking.poolPctOfScellIncome}% of S/CELL's income from resales and transfer charges goes into the Season Reward Pool, which funds season reward credit for collectors.`] },
        { h: 'When people are paid', items: ['Sellers, artists and sponsors are paid when a resale settles: after the buyer confirms the chip and the verification period ends.', 'Artist first-sale shares are recorded when S/CELL Night closes and paid with the monthly statement.', 'Artists and sponsors receive a monthly statement and can download their full record at any time from their dashboard.'] },
      ],
    },
    {
      slug: 'auction-rules', title: 'S/CELL Night Auction Rules', audience: ['collectors'],
      subtitle: 'Fifteen cards, one night, fair bidding for everyone.',
      summary: 'How the live first-sale auctions work.',
      sections: [
        { h: 'What is sold', p: ['Each S/CELL Night offers an artist\'s official cards, numbered 01 to 15, one lot per card. Every card has its own chip ID and card ID and is recorded in the registry before the night.'] },
        { h: 'Who can bid', items: ['ID-verified account holders with active membership. Card owners have membership free.', 'S/CELL staff, the artist, the artist\'s management and family, and sponsors of that artist may not bid. Breaking this rule voids the sale.'] },
        { h: 'How bidding works', items: [`Bidding opens and closes at the times shown on the night's page. Each card starts at ${t(f.defaultReserve)} unless a different starting price is announced in advance.`, `Every new bid must be at least ${t(f.bidIncrement)} above the current highest bid.`, 'You cannot outbid yourself. A bid cannot be withdrawn once placed.', 'The page refreshes the current bids automatically. The server time decides when bidding closes.'] },
        { h: 'Winning', items: ['When bidding closes, the highest bidder on each card wins it.', 'The winning amount is charged through the licensed payment partner. The card, its certificate, the chip ID and ownership in the registry go to the winner.', 'A card with no bids returns to the S/CELL vault and may be offered again at a later night or online auction. It keeps its number; it is never duplicated.'] },
        { h: 'If a winner does not pay', p: ['If payment fails and is not completed within 48 hours, S/CELL may cancel the win, offer the card to the next-highest bidder at their last bid, and suspend the account that did not pay.'] },
      ],
    },
    {
      slug: 'marketplace-rules', title: 'Marketplace and Trading Rules', audience: ['collectors'],
      subtitle: 'Where a card changes hands, and its story grows.',
      summary: 'How official resales work, including prices, escrow and verification.',
      sections: [
        { h: 'Who can trade', items: ['Only the registered owner can list a card, and only an ID-verified buyer can buy one.', cap] },
        { h: 'The minimum price', items: [`Every official resale must be at least ${t(r.minStep)} above the card's last official price.`, `If a card goes ${Math.round(d.startAfterDays / 30)} months without an official sale, its minimum price starts to fall by ${d.pctPerYear}% of the last price for each further year.`, 'When the minimum price reaches zero, the card retires from the official market (see the Scarcity and Edition Charter).', 'There is no maximum price. Sellers choose their price at or above the minimum.'] },
        { h: 'How a resale happens', items: ['The seller lists the card from their account.', `A buyer pays the price${r.transferFeePct ? ' plus the secure-transfer charge' : ''}. The money is held by the licensed payment partner, never by S/CELL.`, 'The seller hands over the card in person or by insured courier.', `The buyer confirms the card's chip ID in their account. The verification period lasts ${r.verifyDays} days.`, 'When the chip is confirmed and the period ends, ownership moves in the registry and everyone is paid automatically.'] },
        { h: 'Cancelling a listing', p: ['A seller can cancel a listing at any time before it is bought. Once a buyer has paid, the trade can only be cancelled through the dispute process.'] },
        { h: 'Private trades', p: ['A card can physically change hands outside S/CELL, but only an official transfer changes the registered owner. A card held by someone who is not its registered owner shows as "unverified holder" when it is checked, and it cannot be listed, counted for rankings or used for votes by that person.'] },
        { h: 'Not allowed', items: ['Trading back and forth with yourself, friends or relatives to raise a price or a trade score.', 'Agreeing a side payment to get around the fees.', 'Listing a card you do not have in your possession.', 'Breaking these rules can lead to cancelled trades, frozen cards and a closed account.'] },
      ],
    },
    {
      slug: 'ownership-transfer', title: 'Ownership and Transfer Policy', audience: ['collectors'],
      subtitle: 'The registry is the deed; the card is the proof.',
      summary: 'What it means to own an S/CELL card and how ownership changes.',
      sections: [
        { h: 'The registry decides ownership', p: ['The owner of an S/CELL card is the account recorded in the S/CELL registry. The physical card is the proof that goes with it. Having the card in your hand does not, by itself, make you the owner.'] },
        { h: 'What you own', items: ['The physical engraved card and its certificate.', 'Registered ownership, shown on the card\'s public page and in your portfolio.', 'The perks that come with ownership: free membership, badges and eligibility for rankings and rewards.', 'You do not own the copyright in the artist\'s words or art. You may display, sell and show your card, but not reproduce its design commercially.'] },
        { h: 'How ownership changes', items: ['By winning it at S/CELL Night.', 'By buying it through the official marketplace.', 'By receiving a Reward Edition card issued by S/CELL.', 'By inheritance: S/CELL transfers a deceased owner\'s cards to the legal heir on proof of death and inheritance.'] },
        { h: 'Lost, stolen or destroyed cards', items: ['Report a stolen card immediately. S/CELL freezes it in the registry so it cannot be listed or transferred until it is recovered or the case is closed.', 'A lost or destroyed card is never reissued. The registry marks it as lost, so each artist\'s count stays exactly 15. Insurance is recommended for valuable cards.'] },
      ],
    },
    {
      slug: 'authentication', title: 'Authentication and Card Verification Policy', audience: ['collectors', 'artists', 'sponsors'],
      subtitle: 'A card you can check in seconds, a fake that fails every time.',
      summary: 'How S/CELL proves a card is genuine.',
      sections: [
        { h: 'Every card has an identity', items: ['A card ID engraved on the card, for example SHAY-07-4F2A.', 'An NFC chip (NTAG424 DNA) that produces a fresh cryptographic code on every tap, so a copied chip fails.', 'A record in the S/CELL registry created before the card leaves the workshop, with its number, chip ID, inspection result and photograph.'] },
        { h: 'How to verify', items: ['Tap the card with a phone, or enter its card ID on the Verify page.', 'The result shows whether the card is genuine, its artist and number, its registered owner, its status and its number of official trades.', 'Before paying for a card offered outside S/CELL, always verify it and check that the seller is its registered owner.'] },
        { h: 'The chip ID is private', p: ['Only the registered owner can see a card\'s chip ID. A buyer confirms the chip during an official resale. Owners should never share the chip ID with anyone who has not paid through S/CELL.'] },
        { h: 'Production audit', p: ['Every card is inspected and chip-tested before release. Any card that fails is destroyed and recorded as destroyed. No spare or duplicate cards are kept.'] },
      ],
    },
    {
      slug: 'refunds', title: 'Refund, Cancellation and Dispute Policy', audience: ['collectors'],
      subtitle: 'When something goes wrong, the money waits until it is put right.',
      summary: 'What happens when something goes wrong with a purchase.',
      sections: [
        { h: 'First sales', p: ['Bids at S/CELL Night are binding. A first-sale purchase can be refunded only if the card delivered is not the card won, arrives damaged, or fails chip verification. Report this within 7 days of delivery.'] },
        { h: 'Resales', items: [`During the ${r.verifyDays}-day verification period, the buyer or seller can report a problem from their account. The payment stays held.`, 'S/CELL reviews the report, may ask both sides for photographs or other evidence, and decides within 10 working days.', 'If the card is not delivered, is not the card listed, is damaged beyond its listed condition or fails chip verification, the buyer is refunded in full and the card stays with the seller.', 'If the buyer does not confirm the chip without good reason, S/CELL may complete the trade.'] },
        { h: 'Membership', p: ['Membership fees are not refunded once a membership period has started, except where the law requires it.'] },
        { h: 'How refunds are paid', p: ['Refunds go back through the licensed payment partner to the original payment method. Credit used at checkout is returned as credit.'] },
      ],
    },
    {
      slug: 'membership', title: 'Membership Terms', audience: ['collectors'],
      subtitle: 'Free to look. A little to take part. Free forever for owners.',
      summary: 'What membership includes and what it costs.',
      sections: [
        { h: 'Free account', items: ['Browse every collection, card and price history.', 'Follow S/CELL Nights and see results.', 'Verify any card.'] },
        { h: 'Membership', items: [`${t(m.monthlyFee)} for ${m.days} days.`, 'Bid at S/CELL Night.', 'Vote in the Next Artist Vote.', 'Earn badges and appear in rankings.', 'Early alerts for new collections.', 'Any credit in your account is used first when you pay.'] },
        { h: 'Free membership for owners', p: ['Anyone who owns at least one S/CELL card has membership free, for as long as they own a card.'] },
        { h: 'Renewal', p: ['Membership does not renew automatically. You add 30 days at a time from your account.'] },
      ],
    },
    {
      slug: 'rewards', title: 'Rewards, Badges and Season Ranking Policy', audience: ['collectors'],
      subtitle: 'Loyalty, recognised, and always paid for.',
      summary: 'Cashback, badges, trade scores, Reward Edition cards and season reward credit.',
      sections: [
        { h: 'Rewards are credit, not money', p: ['All S/CELL rewards are paid as platform credit, which can be spent on cards, membership and transfer charges. Credit cannot be withdrawn as cash. Rewards are loyalty benefits, not interest or investment returns, and S/CELL never pays out more than the money set aside for them.'] },
        { h: 'Loyalty cashback', items: [...cashback, 'Paid from S/CELL\'s share of the first sale, never from the artist\'s or sponsor\'s share.'] },
        { h: 'Badges', items: ['Blue: bought a card at S/CELL Night.', 'Resale buyer: bought a card through an official resale.', ...c.rounds.slice().reverse().map((x) => `${x.label}: reached a trade score of ${x.score} in a season.`)] },
        { h: 'Trade score and Reward Edition cards', p: ['Your trade score is the total number of official trades on all the cards you hold. Each round reached in a season can earn a personal Reward Edition card from an artist. Reward Edition cards are a separate, clearly marked series. They can be traded, but they never count toward an artist\'s official 15.', 'Only real trades between unrelated, verified people count. S/CELL may remove scores and badges built through trades designed to raise a score.'] },
        { h: 'Season ranking', items: [`A season lasts ${Math.round(c.ranking.seasonDays / 30)} months. At the end, collectors are ranked by the total last official price of the cards they hold.`, `A card counts only if it has been held for at least ${Math.round(c.ranking.minHoldFraction * 100)}% of the season.`, ...tiers, 'Reward credit is paid from the Season Reward Pool. If the full tier rewards add up to more than the pool holds, every reward is reduced by the same proportion.'] },
        { h: 'Changes', p: ['S/CELL may change reward rules for future seasons with 30 days\' notice. Rewards already earned are not taken away, except where they were earned by breaking the rules.'] },
      ],
    },
    {
      slug: 'identity-aml', title: 'Identity Verification and Anti-Money-Laundering Policy', audience: ['collectors', 'artists', 'sponsors'],
      subtitle: 'Real people, clean money, a market you can trust.',
      summary: 'Why every owner is ID-checked, and how S/CELL keeps dirty money out.',
      sections: [
        { h: 'Every owner is a real, verified person', items: ['Before bidding, buying, selling or voting, every account holder verifies with their NID and mobile number.', 'One NID can be linked to only one account.', 'Artists and sponsors are verified as people or companies before they are paid.'] },
        { h: 'Extra checks', items: ['Trades above ৳5,00,000, or several large trades in a short time, may require proof of where the money came from.', 'S/CELL monitors for repeated trades between the same accounts, sudden price jumps and other unusual patterns.', 'S/CELL may limit how often a single card can be traded.'] },
        { h: 'What happens if something looks wrong', p: ['S/CELL may pause a trade, freeze a card or suspend an account while it reviews activity, and will report suspicious activity to the authorities when the law requires it. S/CELL does not tell the account holder when it makes such a report.'] },
        { h: 'Money handling', p: ['S/CELL never holds buyers\' money in its own account. All payments and escrow are handled by a payment partner licensed by Bangladesh Bank.'] },
      ],
    },
    {
      slug: 'artist-terms', title: 'Artist Partnership Terms', audience: ['artists'],
      subtitle: 'Your story, your approval, your share of every chapter that follows.',
      summary: 'The standard terms for artists who create an S/CELL collection.',
      sections: [
        { h: 'Your collection', items: ['Exactly 15 cards: 5 foundational thoughts, 3 creative philosophies, 2 career reflections and 5 artistic visuals.', 'You approve every word, image and material in writing before production. Nothing is engraved without your approval.', 'Each card is made once. No reprints, second editions or variants of your official 15, ever.'] },
        { h: 'What you earn', items: [`${f.artistPct}% of every first sale at your S/CELL Night.`, `${r.low.artist}% of every official resale up to ${t(r.tierBreak)}, and ${r.high.artist}% above, for as long as your cards are traded.`, `Optional advance: S/CELL pays you an agreed amount upfront. In exchange your first-sale share is ${f.artistPctWithAdvance}% and your resale share is ${r.advanceArtistReduction} point lower.`, 'Reward Edition cards you personalise for top collectors are a separate series; their resale royalties are paid to you at the same rates.'] },
        { h: 'What you give', items: ['A licence for S/CELL to engrave and present your approved words, name and images on your 15 cards, on the website and in promotion of your collection.', 'Promotion: one promo video, three social media posts and an appearance at your S/CELL Night, with an unplugged set where possible.', 'One unplugged session for the S/CELL series, by agreement.', 'Personalising an agreed number of Reward Edition cards each season.'] },
        { h: 'Exclusivity', p: ['For 3 years you agree not to create a similar limited steel or metal collectible with another company. Your music, books, merchandise and other work are not affected.'] },
        { h: 'Your rights stay yours', p: ['You keep the copyright in your words and art. Collectors own their physical cards, not your copyright.'] },
        { h: 'Payments and statements', items: ['Earnings are recorded in your dashboard as they happen, with a monthly statement and a downloadable record.', 'Payment is made monthly through the payment partner, after tax deductions required by law.', 'Resale royalties continue for as long as your cards trade officially. If a card retires under the decay rule, royalties stop with its last resale. What happens to royalties after an artist’s death will be set in the signed artist agreement.'] },
        { h: 'Reputation', p: ['If either side becomes involved in a serious public scandal, the other may pause joint promotion. Royalties already earned and future royalties on resales continue to be paid.'] },
        { h: 'Sponsors', p: ['A sponsor may be linked to your collection only with your written approval. Sponsor marks are small and placed on the back of the card or the packaging.'] },
      ],
    },
    {
      slug: 'sponsor-terms', title: 'Sponsor and Partner Terms', audience: ['sponsors'],
      subtitle: 'Stand beside culture, and share in how it travels.',
      summary: 'The standard terms for brands and partners that support S/CELL collections and events.',
      sections: [
        { h: 'Partnership types', items: ['Card Sponsor: supports one artist\'s collection for a monthly fee, from ৳3,750.', 'S/CELL Night Sponsor: "presented by" naming of a launch night, from ৳50,000.', 'Series Sponsor: naming of the unplugged session series, from ৳25,000 a month.', 'Payment Partner: provides licensed payments and escrow for the platform, by agreement.'] },
        { h: 'What a Card Sponsor receives', items: ['A small mark on the card back or packaging, approved by the artist.', 'Your name on the collection page and on every card page of that artist, and in the app whenever a card of that artist is verified.', `A co-branding fee of ${r.low.sponsor}% of every official resale of that artist's cards up to ${t(r.tierBreak)}, and ${r.high.sponsor}% above.`, 'A dashboard with exposure counts (page views, verifications, bids) and your full earnings record.'] },
        { h: 'The co-branding fee is not a return', p: ['The co-branding fee depends entirely on real resales. It may be zero in a month or a year. It is not interest, a dividend or a guaranteed return, and must never be described that way in your own communications.'] },
        { h: 'Term and exit', items: ['Minimum term: 12 months.', 'After the minimum term, either side can end the partnership with 60 days\' notice.', 'Co-branding fees on resales that settle while the partnership is active are paid; fees stop when it ends.'] },
        { h: 'Exclusivity and approval', items: ['One Card Sponsor per artist, and one partner per category (for example one payment company) on the same collection.', 'The artist approves the sponsor before any agreement is signed.', 'Either side may end the partnership early if the other is involved in a serious public scandal.'] },
        { h: 'Data', p: ['Sponsors receive totals and counts only. Collectors\' personal details are never shared with sponsors.'] },
      ],
    },
    {
      slug: 'community', title: 'Community and Voting Guidelines', audience: ['collectors', 'artists', 'sponsors'],
      subtitle: 'A community that chooses its next artist together.',
      summary: 'How the Next Artist Vote works and how to behave in the S/CELL community.',
      sections: [
        { h: 'The Next Artist Vote', items: ['A vote runs alongside every S/CELL Night to choose who the community wants next.', `Only verified members can vote, once per vote. Weights: verified fan ${c.voteWeights.verified}, Blue badge ${c.voteWeights.blue}, resale buyer ${c.voteWeights.resale}, plus ${c.voteWeights.perRoundMark} for each round mark.`, 'The top three artists go through S/CELL\'s artist review and are approached in order. An artist can always say no, so a vote result is a shortlist, not a promise.'] },
        { h: 'Respect', items: ['Be respectful to artists, collectors and staff, online and at events.', 'No hate speech, threats or harassment.', 'Do not post other people\'s personal information.'] },
        { h: 'Honest dealing', items: ['Do not organise groups to fake demand, inflate prices or raise trade scores.', 'Do not misrepresent a card\'s condition or history.'] },
      ],
    },
    {
      slug: 'scarcity', title: 'Scarcity and Edition Charter', audience: ['collectors', 'artists', 'sponsors'],
      subtitle: 'Fifteen means fifteen. Forever.',
      summary: 'The promise behind "Fifteen. One artist. Forever."',
      sections: [
        { h: 'The promise', items: ['Every artist has exactly 15 official cards, numbered 01/15 to 15/15.', 'Each official card is made once. S/CELL will never reprint, re-issue, re-number or make a variant of an official card.', 'Every official card is recorded in the public registry, so anyone can count them.'] },
        { h: 'What does not count toward the 15', items: ['Reward Edition cards: a separate, clearly marked series (numbered R01, R02 and so on) issued to collectors as rewards. They are tradable but never part of the official 15.', 'Display products such as frames, cases and steel books.'] },
        { h: 'Retired and lost cards', items: [`A card that goes unsold until its minimum official price reaches zero retires from the official market. It stays in the registry as retired and is never replaced.`, 'A lost or destroyed card is marked lost and never replaced.', 'Retired and lost cards still count as part of the artist\'s 15, so the number of official cards never goes up.'] },
        { h: 'Unsold cards', p: ['Cards not sold at S/CELL Night stay in the S/CELL vault, keep their numbers and are offered again at a later auction. They are never duplicated.'] },
      ],
    },
  ];
}
