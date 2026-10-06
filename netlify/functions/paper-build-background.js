// THE DAILY COMPLIANCE's press (a Background Function, 15 minutes), called by paper-tick.js and by
// /api/paper when today's edition is missing, with the internal secret; anyone else gets nothing.
// Gathers from the site's own public endpoints, builds the edition, asks for at most one leader
// from the model (inside HVI_ANTHROPIC_DAILY_CAP, cut by the guard, else the template) and
// publishes write-once (netlify/lib/paper.js publishEdition).
import { tickAuthorized } from "../lib/social-store.js";
import { publishEdition, httpIo, paperDate, editionKey } from "../lib/paper.js";
import { paperStore } from "../lib/paper-store.js";
import { chargeGlobal } from "../lib/http.js";
import { claudeText } from "../lib/score.js";

export default async (req, context) => {
  if (!tickAuthorized(req)) { console.warn("paper worker: unauthorized call ignored"); return; }
  const base = context?.site?.url || process.env.URL || "https://humanvalueindex.com";
  const store = paperStore();
  try {
    if (await store.get(editionKey(paperDate(Date.now())))) return;   // printed: nothing to do
    const r = await publishEdition(store, httpIo(base), Date.now(), {
      charge: () => chargeGlobal(1),
      call: ({ system, user }) => claudeText({ system, messages: [{ role: "user", content: user }], maxTokens: 500 }),
    });
    console.log("paper", JSON.stringify(r));
  } catch (err) {
    console.error("paper press failed", err?.name, err?.message);
  }
};
