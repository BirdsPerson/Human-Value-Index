// /api/hunt from the browser: the permit, the filing, the day's board (netlify/functions/hunt.js).
// The cabinet plays without it; only a filed (verified) score needs the network.
async function call(method, body) {
  const r = await fetch("/api/hunt", method === "GET" ? { cache: "no-store" } : { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  let j = null;
  try { j = await r.json(); } catch { j = null; }
  if (!r.ok) throw Object.assign(new Error(j?.error || `THE BOARD DID NOT ANSWER (${r.status}).`), { status: r.status });
  return j;
}
export const loadBoard = () => call("GET");
export const getPermit = (trip) => call("POST", { action: "permit", trip });
export const fileHunt = (permit, inputLog, score, tag) => call("POST", { action: "file", permit, inputLog, claim: { score }, tag });
