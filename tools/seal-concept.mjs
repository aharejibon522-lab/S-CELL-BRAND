// Seals the private concept room (card images + text) into one encrypted file that is safe to commit.
// Usage: CONCEPT_KEY=<64 hex chars> node tools/seal-concept.mjs
// Reads server/content/concept.json and server/private/concept/<artist>/*.webp (both git-ignored),
// writes server/private/concept.sealed (AES-256-GCM). The server opens it with the same CONCEPT_KEY.
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { createCipheriv, randomBytes } from 'node:crypto';

const key = Buffer.from(process.env.CONCEPT_KEY || '', 'hex');
if (key.length !== 32) { console.error('Set CONCEPT_KEY to 64 hex characters.'); process.exit(1); }
const root = new URL('../server/', import.meta.url);
const meta = JSON.parse(readFileSync(new URL('content/concept.json', root), 'utf8'));
const files = {};
for (const a of meta) {
  for (const f of readdirSync(new URL(`private/concept/${a.key}/`, root))) {
    files[`${a.key}/${f}`] = readFileSync(new URL(`private/concept/${a.key}/${f}`, root)).toString('base64');
  }
}
const iv = randomBytes(12);
const c = createCipheriv('aes-256-gcm', key, iv);
const body = Buffer.concat([c.update(JSON.stringify({ meta, files })), c.final()]);
writeFileSync(new URL('private/concept.sealed', root), Buffer.concat([iv, c.getAuthTag(), body]));
console.log(`Sealed ${Object.keys(files).length} files for ${meta.length} artists.`);
