// THE NOTICE BOARD's pure half (FrontDesk.jsx draws it): what is posted in the city today, read off THE DAILY
// COMPLIANCE's edition (/api/paper): the council polls, the Assembly's session, the prefects' orders, the docket,
// the most restless district and the shops. Each notice is { tag, text, href }, plain words, every href a room
// the app answers. No edition, no notices: the window says so rather than printing a slogan.
// Pure (no React, no DOM): scripts/check-desk.mjs runs it.

const hrs = (ms) => Math.max(0, Math.round(ms / 3600000));
const inH = (at, now) => { const h = hrs(at - now); return h >= 48 ? `IN ${Math.round(h / 24)} DAYS` : h >= 1 ? `IN ${h}H` : "WITHIN THE HOUR"; };

export function noticeItems(ed, now = Date.now()) {
  if (!ed) return [];
  const out = [], P = ed.politics || {}, C = ed.city || {};
  const E = P.elections;
  if (E) {
    if (E.state === "OPEN" && E.closeAt > now) out.push({ tag: "POLLS", text: `COUNCIL POLLS OPEN, CYCLE ${E.cycle}. CLOSE ${inH(E.closeAt, now)}.`, href: E.href || "#elections" });
    else if (E.results?.length) out.push({ tag: "POLLS", text: `CYCLE ${E.cycle} RESULTS: ${String(E.results[0]).replace(/\.$/, "")}${E.results.length > 1 ? `, AND ${E.results.length - 1} MORE SEATS` : ""}.`, href: E.href || "#elections" });
    else if (E.next?.openAt > now) out.push({ tag: "POLLS", text: `NEXT COUNCIL POLLS, CYCLE ${E.next.cycle}, OPEN ${inH(E.next.openAt, now)}.`, href: E.href || "#elections" });
  }
  const A = P.assembly;
  if (A) {
    const open = A.state === "OPEN" && A.closeAt > now;
    const lead = A.lead ? ` MOST VOTES: ${A.lead}.` : "";
    out.push({ tag: "ASSEMBLY", text: open ? `SESSION ${A.id} IS SITTING, ${A.motions?.length || 0} MOTIONS.${lead} CLOSES ${inH(A.closeAt, now)}.`
      : `SESSION ${A.id} CLOSED.${lead} ${A.voters || 0} VOTER${A.voters === 1 ? "" : "S"}.`, href: A.href || "#assembly" });
  }
  for (const p of (P.prefects || []).slice(0, 3)) out.push({ tag: "ORDER", text: `${p.district}: ${p.directive}, BY ${p.prefect}.`, href: "#prefects" });
  const D = P.docket;
  if (D?.open?.length) out.push({ tag: "DOCKET", text: `${D.open.length} PETITION${D.open.length > 1 ? "S" : ""} OPEN. ${D.open[0]}`, href: D.href || "#docket" });
  const worst = (C.districts || []).slice().sort((a, b) => a.mood - b.mood)[0];
  if (worst && worst.mood < 0) out.push({ tag: "MOOD", text: `${worst.name} IS ${worst.word} (MOOD ${String(worst.mood).replace("-", "−")}).`, href: "#city" });
  if (C.opened?.[0]?.text) out.push({ tag: "SHOPS", text: `NEW: ${C.opened[0].text}${C.trading != null ? ` ${C.trading} SHOPS TRADING.` : ""}`, href: "#enterprise" });
  if (C.closed?.[0]?.text) out.push({ tag: "SHOPS", text: C.closed[0].text, href: "#enterprise" });
  return out.filter(n => n.text && n.text.length <= 140);
}
