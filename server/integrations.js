// Placeholders for the three outside services S/CELL needs. Each one has the same shape the real
// integration will have, so connecting a provider means replacing one function, not rewriting the app.

import { randomBytes } from 'node:crypto';

// 1. Payments and escrow: a licensed Bangladeshi gateway (bKash, Nagad, SSLCOMMERZ or a bank).
//    S/CELL must never hold buyers' money itself; the gateway's escrow holds it until release.
export const payments = {
  provider: process.env.PAYMENT_PROVIDER || 'sandbox',
  async charge({ amount, purpose, userId }) {
    // Real version: create a payment session with the gateway, redirect the user, confirm by webhook.
    if (amount < 0) throw new Error('Invalid amount');
    return { ok: true, ref: `SBX-${purpose}-${userId}-${randomBytes(4).toString('hex')}` };
  },
  async release({ ref }) {
    // Real version: tell the gateway to release escrowed funds to the payees.
    return { ok: true, ref };
  },
  async refund({ ref }) {
    return { ok: true, ref };
  },
};

// 2. Identity checks (NID + phone). Real version: the payment partner's KYC or an e-KYC provider.
export const kyc = {
  autoApprove: process.env.KYC_AUTO_APPROVE === 'true',
  validNid(nid) {
    return /^(\d{10}|\d{13}|\d{17})$/.test(nid);
  },
};

// 3. NFC chip verification. Real version: NTAG424 DNA "SUN" messages, checked with the chip's secret key
//    so a copied chip fails. Here the buyer types the chip ID printed on the card's certificate.
export const nfc = {
  verify(card, presented) {
    return String(presented || '').trim().toUpperCase() === card.chip_uid;
  },
};
