// DEPARTMENT MAIL on file (Blobs store "hvi-mail"; docs/design/COMMS.md, layer 1):
//   c:<caseId>   the file's inbox (src/mail/mail.js newInbox: {v, first, days, mail})
// Deleted with the file (netlify/functions/purge.js, the retention sweep in netlify/lib/prune.js).
import { getStore } from "@netlify/blobs";
import { newInbox } from "../../src/mail/mail.js";

export const MAIL_STORE = "hvi-mail";
const ml = () => getStore({ name: MAIL_STORE, consistency: "strong" });
export const mailKey = (caseId) => `c:${caseId}`;

export class Busy extends Error {}
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
export const getInbox = async (caseId) => (await ml().get(mailKey(caseId), { type: "json" })) || null;
// fn(inbox) -> {data, out} to write, or {out} to write nothing. Etag-conditional, retried.
export async function updateInbox(caseId, fn, tries = 8) {
  const store = ml(), key = mailKey(caseId);
  for (let attempt = 0; attempt < tries; attempt++) {
    const cur = await store.getWithMetadata(key, { type: "json" });
    const r = await fn(cur?.data ? structuredClone(cur.data) : null);
    if (!r.data) return { data: cur?.data || null, out: r.out };
    const res = await store.setJSON(key, r.data, cur ? { onlyIfMatch: cur.etag } : { onlyIfNew: true });
    if (res.modified) return { data: r.data, out: r.out };
    await sleep(Math.floor(Math.random() * (8 + attempt * 12)));
  }
  throw new Busy(`${key} busy`);
}
export async function deleteMail(caseId) { await ml().delete(mailKey(caseId)); }
export { newInbox };
