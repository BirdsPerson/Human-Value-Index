// Which funnel converts: the city's click counts (netlify/lib/funnels.js), per building.
//   open  an overlay opened (a cabinet, the shop, EBTV)
//   play  a game or the stream loaded in it
//   out   a link out followed (itch.io, the EB Shop, electricbasement.tv, the game's own site)
// Anonymous totals only. The nightly loop (scripts/hvi_nightly.sh) puts the --line summary in
// MORNING_REPORT.md's "## Funnels".
//   node scripts/funnel-clicks.mjs [--days 7] [--line] [--base https://humanvalueindex.com]
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const days = Number(arg("--days", 7)) || 7;
const base = arg("--base", "https://humanvalueindex.com");
const r = await fetch(`${base}/api/funnel?stats=1&days=${days}`).catch(e => ({ ok: false, statusText: e.message }));
if (!r.ok) { console.log(`funnel-clicks: the counter did not answer (${r.status || ""} ${r.statusText})`); process.exit(1); }
const { totals = {}, days: byDay = {} } = await r.json();
const rows = Object.entries(totals).map(([c, t]) => ({ c, open: t.open || 0, play: t.play || 0, out: t.out || 0 }))
  .sort((a, b) => b.out - a.out || b.open - a.open);
if (process.argv.includes("--line")) {
  const txt = rows.length ? rows.map(x => `${x.c} ${x.open} opened, ${x.out} out`).join("; ") : "no clicks yet";
  console.log(`Funnels, last ${days} days: ${txt}.`);
  process.exit(0);
}
console.log(`funnel clicks, last ${days} days (${Object.keys(byDay).length} days with any)`);
console.log("building            open  play   out  out/open");
for (const x of rows) console.log(`${x.c.padEnd(18)} ${String(x.open).padStart(5)} ${String(x.play).padStart(5)} ${String(x.out).padStart(5)}  ${x.open ? (x.out / x.open * 100).toFixed(0) + "%" : "-"}`);
const hosts = {};
for (const d of Object.values(byDay)) for (const [k, n] of Object.entries(d)) { const [, kind, to] = k.split("|"); if (kind === "out") hosts[to] = (hosts[to] || 0) + n; }
if (Object.keys(hosts).length) { console.log("\nout, by destination"); for (const [h, n] of Object.entries(hosts).sort((a, b) => b[1] - a[1])) console.log(`  ${h.padEnd(32)} ${n}`); }
