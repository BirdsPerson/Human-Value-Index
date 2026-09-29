// Production Blobs from a local script (the Mac jobs). Same stores the functions use,
// reached with the Netlify CLI's own login token, so conditional writes (onlyIfNew /
// onlyIfMatch) work here too. The figure index (netlify/lib/figure-index.js) is written
// only from Node: the Python sprite job calls scripts/index-sync.mjs after a card write.
import { getStore } from "@netlify/blobs";
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { figureIndexEntry } from "../../netlify/lib/store.js";
import * as FI from "../../netlify/lib/figure-index.js";

export const SITE_ID = "3ac3fcb8-cab4-489b-8ea9-1e4153b87941";

function token() {
  if (process.env.NETLIFY_AUTH_TOKEN) return process.env.NETLIFY_AUTH_TOKEN;
  const cfg = JSON.parse(readFileSync(`${homedir()}/Library/Preferences/netlify/config.json`, "utf8"));
  const t = Object.values(cfg.users || {})[0]?.auth?.token;
  if (!t) throw new Error("no Netlify token: run `netlify login` or set NETLIFY_AUTH_TOKEN");
  return t;
}

let tok;
export const store = name => getStore({ name, siteID: SITE_ID, token: (tok ??= token()), consistency: "strong" });

export const indexIo = () => ({ figures: store("hvi-figures"), index: store(FI.INDEX_STORE) });

// Every entry (withdrawn ones included, as the legacy blob held them), from all 64 shards
// or the legacy blob before the migration. Throws on any unreadable shard.
export async function figureIndex() {
  return FI.readIndex(indexIo());
}

// Re-derive the index entries of these slugs from their cards: a card that is gone or
// withdrawn drops out. The one way a script outside the functions touches the index.
export async function syncIndex(slugs) {
  const figs = store("hvi-figures");
  const uniq = [...new Set(slugs)].filter(s => s && s !== FI.LEGACY);
  const changes = [];
  for (let i = 0; i < uniq.length; i += 16) {
    changes.push(...(await Promise.all(uniq.slice(i, i + 16).map(async slug => {
      const card = await retry(() => figs.get(slug, { type: "json" }));
      return { slug, entry: card && !card.removed && card.slug === slug ? figureIndexEntry(card) : null };
    }))));
  }
  await retry(() => FI.writeEntries(indexIo(), changes));
  return changes;
}

// Every Wikidata id already on file in production (referrals and earlier engine runs).
export async function prodQids() {
  return new Set((await retry(figureIndex)).map(c => c.wikidata).filter(Boolean));
}

export const getCard = slug => (slug && slug !== "index" ? retry(() => store("hvi-figures").get(slug, { type: "json" })) : null);

// Card first (only if the slug is new), then the index under an etag. Returns false when
// the slug was already taken (the caller picks another or skips).
// Blobs over the public internet drop the odd request ("fetch failed"); conditional
// writes make a retry safe.
export async function retry(fn, tries = 4) {
  for (let i = 1; ; i++) {
    try { return await fn(); } catch (e) {
      if (i >= tries || !/fetch failed|ECONNRESET|ETIMEDOUT|socket/i.test(String(e?.message || e) + String(e?.cause?.code || ""))) throw e;
      await new Promise(r => setTimeout(r, 2000 * i));
    }
  }
}

export async function createCard(card) {
  return retry(() => createCardOnce(card));
}

async function createCardOnce(card) {
  const figs = store("hvi-figures");
  const res = await figs.setJSON(card.slug, card, { onlyIfNew: true });
  // A retry after a dropped response finds its own card already written: carry on to the index.
  if (!res.modified && (await figs.get(card.slug, { type: "json" }))?.run !== card.run) return false;
  await FI.writeEntries(indexIo(), [{ slug: card.slug, entry: figureIndexEntry(card) }]);
  return true;
}
