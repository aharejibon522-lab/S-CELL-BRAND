// Audience guides: everything each group can do on S/CELL, with the numbers read live from config.js.

const t = (n) => `৳${Number(n).toLocaleString('en-IN')}`;

export function guides(c) {
  const r = c.resale, f = c.firstSale, m = c.membership;
  return {
    collectors: {
      audience: 'collectors',
      title: 'For collectors',
      subtitle: 'Own one of fifteen. Keep the story, or pass it on.',
      intro: 'Everything a fan can do on S/CELL: from your first bid to building a collection that ranks among the best in the country.',
      facilities: {
        subtitle: 'What your account gives you',
        items: [
          { name: 'Verified owner account', desc: 'A one-time NID and phone check. Every owner on S/CELL is a real person, which is why a card\'s history can be trusted.' },
          { name: 'Personal portfolio', desc: 'Every card you own, its certificate, chip ID, price history and status, in one place.' },
          { name: 'Live bidding at S/CELL Night', desc: `Bid on all 15 cards of an artist, starting from ${t(f.defaultReserve)}, with a live countdown and automatic updates.` },
          { name: 'Official marketplace', desc: 'Sell to verified buyers at your price, with the buyer\'s money held by a licensed payment partner until the card arrives.' },
          { name: 'Card verification', desc: 'Check any card by tapping its chip or entering its card ID, before you buy it anywhere.' },
          { name: 'Wallet credit', desc: 'Cashback and season rewards land as credit you can spend on cards, membership and transfer charges.' },
          { name: 'Badges, trade score and ranking', desc: 'Public recognition for how you collect and trade, shown on rankings and votes.' },
          { name: 'A vote on the next artist', desc: 'Your vote counts more the more involved you are.' },
          { name: 'Statements', desc: 'Download your complete record of purchases, sales, credit and earnings at any time.' },
        ],
      },
      options: {
        subtitle: 'Three ways to take part',
        rows: [
          ['Free account', 'Free', 'Browse every collection and price history, verify cards, follow S/CELL Nights.'],
          ['Member', `${t(m.monthlyFee)} / ${m.days} days`, 'Bid, vote, earn badges, appear in rankings, get early alerts. Credit is used first.'],
          ['Owner', 'Free while you own a card', 'Everything members get, plus registered ownership, resale, cashback and season rewards.'],
        ],
      },
      trade: {
        subtitle: 'How a card moves, step by step',
        systems: [
          { name: 'First sale: S/CELL Night', steps: ['Verify your identity and start membership.', `Bid on any card. Each bid beats the last by at least ${t(f.bidIncrement)}.`, 'Highest bid when the countdown ends wins.', 'You are charged through the payment partner and receive the card, its certificate and the chip ID.'] },
          { name: 'Selling on the marketplace', steps: [`List at or above the minimum price: the last official price plus ${t(r.minStep)}.`, 'A verified buyer pays into escrow.', 'You hand over the card; the buyer confirms the chip.', `After ${r.verifyDays} days you receive ${r.low.seller}% (${r.high.seller}% above ${t(r.tierBreak)}), automatically.`] },
          { name: 'Buying on the marketplace', steps: ['Choose a card and check its history.', `Pay the price${r.transferFeePct ? ` plus the ${r.transferFeePct}% secure-transfer charge (minimum ${t(r.transferFeeMin)})` : ''}; the money is held, not released.`, 'Receive the card and confirm its chip ID in your account.', 'Ownership moves to you in the registry. Problems? Report them before the period ends and the payment stays held.'] },
        ],
      },
      calculator: 'resale',
      policies: ['auction-rules', 'marketplace-rules', 'ownership-transfer', 'fees', 'refunds', 'membership', 'rewards', 'authentication', 'identity-aml', 'scarcity'],
      faq: [
        ['Is an S/CELL card an investment?', 'No. It is a cultural collectible. Prices can rise or fall and a card may not find a buyer. S/CELL never promises a profit.'],
        ['Why must a resale be priced above the last sale?', `It protects each card's recorded value and the artist's name. If a card goes unsold for ${Math.round(c.decay.startAfterDays / 30)} months, the minimum starts to fall ${c.decay.pctPerYear}% a year so it never gets stuck forever.`],
        ['What happens to my money when I buy a resale?', `A licensed payment partner holds it for ${r.verifyDays} days. The seller is paid only after you confirm the card's chip.`],
        ['Can I sell my card privately?', 'You can hand it to anyone, but only an official transfer changes the registered owner. Privately passed cards show as "unverified holder".'],
        ['What if I lose my card?', 'Report it. It is marked lost in the registry and never reissued, so insure valuable cards.'],
        ['How do season rewards work?', 'Once a year, collectors are ranked by the value of cards they have held long enough. Rewards are paid as credit from the Season Reward Pool, never more than it holds.'],
      ],
    },

    artists: {
      audience: 'artists',
      title: 'For artists',
      subtitle: 'Fifteen pieces of your story, and a share of every chapter after.',
      intro: 'How an S/CELL collection is made, what you control, what you earn, and the tools you get to follow every card.',
      facilities: {
        subtitle: 'What S/CELL does for you',
        items: [
          { name: 'Creative control', desc: 'You choose and approve every word, image and material. Nothing is engraved without your sign-off.' },
          { name: 'Engraving and production', desc: 'Laser-engraved stainless steel, chip-fitted, inspected and registered. Defects are destroyed on record.' },
          { name: 'Your own S/CELL Night', desc: 'A launch event with an unplugged set, a live auction of your 15 cards, streaming and press.' },
          { name: 'Lifetime resale royalties', desc: `${r.low.artist}% of every official resale up to ${t(r.tierBreak)} and ${r.high.artist}% above, for as long as your cards are traded.` },
          { name: 'Artist dashboard', desc: 'See every card, its owner\'s display name, price and trades; your earnings by month; and your audience reach.' },
          { name: 'Statements and records', desc: 'A monthly statement and a downloadable record of every taka you have earned.' },
          { name: 'Sponsor matching', desc: 'S/CELL can bring a sponsor to your collection, only with your written approval.' },
          { name: 'Unplugged series', desc: 'A filmed session for the S/CELL series, building your audience between launches.' },
        ],
      },
      options: {
        subtitle: 'Choose how you are paid',
        rows: [
          ['Standard', 'No upfront payment', `${f.artistPct}% of every first sale, ${r.low.artist}% of every resale up to ${t(r.tierBreak)}, ${r.high.artist}% above.`],
          ['With advance', 'Agreed amount paid upfront', `${f.artistPctWithAdvance}% of every first sale, ${r.low.artist - r.advanceArtistReduction}% of every resale up to ${t(r.tierBreak)}, ${r.high.artist - r.advanceArtistReduction}% above.`],
        ],
      },
      trade: {
        subtitle: 'From first conversation to lifetime royalties',
        systems: [
          { name: 'Creating your collection', steps: ['Apply or meet the S/CELL team.', 'Agree terms in writing: rights, approvals, royalties, promotion.', 'Write your 10 messages and choose your 5 visuals; approve every proof.', 'Cards are engraved, chip-fitted and registered.'] },
          { name: 'Your S/CELL Night', steps: ['Your promo video and posts announce the night.', 'You play a short unplugged set.', 'Your 15 cards are auctioned live.', `You receive ${f.artistPct}% of every winning bid.`] },
          { name: 'Royalties on every resale', steps: ['Every time one of your cards is resold officially, your share is calculated automatically.', 'It appears in your dashboard the moment the trade settles.', 'It is paid with your monthly statement.', 'Royalties continue for as long as a card trades officially. If a card retires under the decay rule, royalties stop with its last resale.'] },
        ],
      },
      calculator: 'artist',
      policies: ['artist-terms', 'fees', 'scarcity', 'authentication', 'community', 'identity-aml'],
      faq: [
        ['Do I keep the copyright in my words and art?', 'Yes. Collectors own the physical card, not your copyright.'],
        ['Can S/CELL make more of my cards later?', 'Never. Your official 15 are made once. Reward Edition cards are a separate, marked series made only with your agreement.'],
        ['How are my royalties calculated?', `Automatically, on every official resale: ${r.low.artist}% up to ${t(r.tierBreak)}, ${r.high.artist}% above. Your dashboard shows each one.`],
        ['What is the advance option?', `S/CELL pays you an agreed sum upfront. In exchange, your first-sale share is ${f.artistPctWithAdvance}% instead of ${f.artistPct}%, and your resale share is ${r.advanceArtistReduction} point lower.`],
        ['What do I have to do for promotion?', 'One promo video, three posts, an appearance at your S/CELL Night with an unplugged set where possible, and one session for the S/CELL series by agreement.'],
        ['Can I refuse a sponsor?', 'Yes. No sponsor is linked to your collection without your written approval.'],
      ],
    },

    sponsors: {
      audience: 'sponsors',
      title: 'For sponsors and investors',
      subtitle: 'Back the culture people keep, and be part of how it travels.',
      intro: 'How brands and partners join S/CELL: the partnership types, what you receive, how the co-branding fee works, and the transparency you get through your dashboard.',
      facilities: {
        subtitle: 'What partners receive',
        items: [
          { name: 'Presence on a cultural collection', desc: 'Your mark on an artist\'s collection, approved by the artist, on the card back or packaging.' },
          { name: 'Reach on every verification', desc: 'Your name appears on the collection and card pages and whenever a card of your artist is checked.' },
          { name: 'Event and series naming', desc: '"S/CELL Night presented by…" and naming of the unplugged session series.' },
          { name: 'Co-branding fee on resales', desc: `${r.low.sponsor}% of every official resale of your artist's cards up to ${t(r.tierBreak)}, ${r.high.sponsor}% above. Depends entirely on real resales.` },
          { name: 'Sponsor dashboard', desc: 'Page views, verifications and bids for your artists; every co-branding fee; fees paid; downloadable statements.' },
          { name: 'Public transparency', desc: 'Platform totals are published, so your marketing team can point to real numbers.' },
        ],
      },
      options: {
        subtitle: 'Partnership types',
        rows: [
          ['Card Sponsor', 'From ৳3,750 / month per artist', `Collection presence, verification reach, ${r.low.sponsor}% co-branding fee on resales.`],
          ['S/CELL Night Sponsor', 'From ৳50,000 / night', 'Event naming, stage and stream branding, press mentions.'],
          ['Series Sponsor', 'From ৳25,000 / month', 'Naming of the unplugged series, a short spot in every episode.'],
          ['Payment Partner', 'By agreement', 'Licensed payments, escrow and payouts for the whole platform.'],
        ],
      },
      trade: {
        subtitle: 'How the co-branding fee works',
        systems: [
          { name: 'Becoming a Card Sponsor', steps: ['Choose an artist, or let S/CELL propose one.', 'The artist approves you in writing.', 'Sign a 12-month minimum agreement.', 'Your mark and name go live on the collection.'] },
          { name: 'Earning the co-branding fee', steps: ['A collector resells one of your artist\'s cards through S/CELL.', `When the trade settles, ${r.low.sponsor}% of the price (${r.high.sponsor}% above ${t(r.tierBreak)}) is recorded for you.`, 'It appears in your dashboard immediately.', 'It is paid with your monthly statement, net of your monthly fee if agreed.'] },
        ],
      },
      calculator: 'sponsor',
      policies: ['sponsor-terms', 'fees', 'identity-aml', 'community', 'scarcity', 'privacy'],
      faq: [
        ['Is the co-branding fee a return on investment?', 'No. It is a share of real resales and may be zero in any month. It is not interest or a guaranteed return, and must not be described that way.'],
        ['How long is the commitment?', 'Twelve months minimum, then 60 days\' notice from either side.'],
        ['Do we receive collectors\' personal data?', 'No. Sponsors receive totals and counts only.'],
        ['Can two payment companies sponsor the same artist?', 'No. There is one Card Sponsor per artist and one partner per category.'],
        ['Can we also be the payment partner?', 'Yes, if you hold the required Bangladesh Bank licence. Many partners combine both.'],
      ],
    },
  };
}
