import { useEffect, useState } from "react";
import { Frame, Button, ButtonRow, PaLine, ScreenHead, Chip, Chips } from "../ui/index.js";
import { Bar, padL } from "../term.jsx";
import { readCaseId, CaseLogon } from "../caseFile.jsx";
import { DISTRICTS, DISTRICT } from "../city/sim.js";
import { TITLE, BLURB, NOTICE, RULES, FIELD, CHAIR, WRITEIN } from "./content.js";
import WriteIn from "./WriteIn.jsx";
import { loadElections, castVote } from "./client.js";
import "../play/pages.css";
import Sparkline from "../ui/Sparkline.jsx";

// #elections: THE COUNCIL ELECTIONS (docs/CITY_SPEC.md "Council elections"). Every district's
// race: the candidates (filings for the living, a reconstructed line for the dead), the
// players' ballots, the Substrate's advisory lean, the ballot (assessed files only, one per
// race), the countdown, and after the close the result.

const CSS = `
.el-races { display: grid; grid-template-columns: 1fr 1fr; gap: var(--s4); }
@media (max-width: 900px) { .el-races { grid-template-columns: 1fr; } }
.el-kv { display: grid; grid-template-columns: 12ch minmax(0, 1fr); column-gap: 1ch; row-gap: 2px; margin: var(--s2) 0; font-size: var(--t-s); }
.el-kv .k { color: var(--fg-mute); }
.el-kv .v { color: var(--fg); min-width: 0; overflow-wrap: anywhere; }
.el-cand { display: grid; grid-template-columns: 40px minmax(0, 1fr); column-gap: var(--s3); padding: var(--s2) 0; border-top: var(--bw) dashed var(--line); }
.el-cand:first-of-type { border-top: 0; }
.el-sprite { width: 40px; height: 60px; background-repeat: no-repeat; background-size: auto 100%; background-position: 0 0; image-rendering: pixelated; border: var(--bw) solid var(--line); }
.el-who { color: var(--accent); overflow-wrap: anywhere; }
.el-who .dead { color: var(--fg-mute); }
.el-sub { color: var(--fg-mute); font-size: var(--t-xs); overflow-wrap: anywhere; }
.el-plat { font-size: var(--t-xs); color: var(--fg-dim); margin-top: var(--s1); }
.el-plat .tx { color: var(--fg); text-transform: none; display: block; }
.el-row { display: grid; grid-template-columns: 9ch minmax(0, 1fr) 5ch; column-gap: 1ch; align-items: baseline; font-size: var(--t-xs); }
.el-row .l { color: var(--fg-mute); }
.el-row .n { text-align: right; color: var(--fg); }
.el-row .b { overflow: hidden; white-space: nowrap; }
.el-pick { margin-top: var(--s2); }
.el-note { font-size: var(--t-xs); color: var(--fg-mute); margin-top: var(--s2); }
.el-fine { font-size: var(--t-xs); color: var(--fg-mute); margin: 0 0 var(--s2); }
.el-fine a, .el-note a { color: var(--fg-dim); }
.el-err { color: var(--harm); margin-top: var(--s2); }
.el-ok { color: var(--accent); margin-top: var(--s2); }
.el-big { color: var(--accent); font-weight: 700; letter-spacing: 0.04em; }
.el-wi { margin-top: var(--s3); padding-top: var(--s2); border-top: var(--bw) dashed var(--line); }
.el-wi-head { color: var(--fg-dim); font-size: var(--t-xs); letter-spacing: 0.08em; margin-bottom: var(--s1); }
.el-wi-box { position: relative; display: grid; grid-template-columns: auto minmax(0, 1fr); column-gap: 1ch; align-items: center; }
.el-wi-box .p { color: var(--fg-mute); font-size: var(--t-xs); }
.el-wi-box .ui-input { width: 100%; min-width: 0; }
.el-wi-list { position: absolute; left: 0; right: 0; top: 100%; z-index: 5; margin: 2px 0 0; padding: 0; list-style: none; background: var(--bg); border: var(--bw) solid var(--line); max-height: 16rem; overflow-y: auto; }
.el-wi-list li { padding: var(--s2); min-height: 44px; box-sizing: border-box; display: flex; align-items: center; cursor: pointer; font-size: var(--t-s); overflow-wrap: anywhere; }
.el-wi-list li.act { background: var(--line); color: var(--accent); }
.el-wi-list li.none { cursor: default; color: var(--fg-mute); font-size: var(--t-xs); }
.el-wi .ui-btn { margin-top: var(--s2); }
.el-wi-sub { display: block; color: var(--fg-mute); font-size: var(--t-xs); margin-top: 2px; }
.el-wi-list li.act .el-wi-sub { color: var(--fg-dim); }
.el-cy { margin-top: var(--s2); }
.el-cy .el-fine { margin: 0; }
`;
function injectStyles() {
  let el = document.getElementById("el-styles");
  if (!el) { el = document.createElement("style"); el.id = "el-styles"; document.head.appendChild(el); }
  if (el.textContent !== CSS) el.textContent = CSS;
}
const two = (n) => padL(n, 2).replace(/ /g, "0");
export const hms = (ms) => {
  if (ms <= 0) return "00H 00M 00S";
  const s = Math.floor(ms / 1000), d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60), x = s % 60;
  return `${d ? `${d}D ` : ""}${two(h)}H ${two(m)}M ${two(x)}S`;
};
export const fmtUtc = (ms) => new Date(ms).toISOString().replace("T", " ").slice(0, 16) + " UTC";
function useNow() {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const iv = setInterval(() => { if (!document.hidden) setNow(Date.now()); }, 1000); return () => clearInterval(iv); }, []);
  return now;
}
export function CandidateSprite({ c }) {
  const urls = [c.sprite, `/sprites/${c.key}.png`, `/api/sprite/${c.key}`].filter(Boolean);
  return <span className="el-sprite" role="img" aria-label={`${c.name}, likeness on file`} style={{ backgroundImage: urls.map(u => `url(${u})`).join(", ") }} />;
}

export default function Elections() {
  useEffect(() => { injectStyles(); }, []);
  const now = useNow();
  const [view, setView] = useState(null);
  const [err, setErr] = useState("");
  const [caseId, setCaseId] = useState(() => readCaseId());
  useEffect(() => {
    const on = (e) => setCaseId(e.detail || readCaseId());
    window.addEventListener("hvi-case", on);
    return () => window.removeEventListener("hvi-case", on);
  }, []);
  useEffect(() => {
    let off = false;
    const get = () => loadElections({ force: true, caseId }).then(d => { if (!off) { setView(d); setErr(""); } }).catch(e => { if (!off) setErr(typeof e === "string" ? e : "The Council is unreachable. The Department suspects a quorum."); });
    get();
    const iv = setInterval(() => { if (!document.hidden) get(); }, 30000);
    return () => { off = true; clearInterval(iv); };
  }, [caseId]);

  const state = !view?.closeAt ? (view ? "pending" : "loading") : now >= view.closeAt ? "closed" : "open";
  const ids = view?.races ? DISTRICTS.map(d => d.id).filter(id => view.races[id]?.candidates?.length) : [];
  const ballots = ids.reduce((n, id) => n + (view.races[id].voters || 0), 0);
  const mine = view?.mine || {}, mineWrite = view?.mineWrite || {};
  const chair = state === "closed" ? CHAIR.closed : state === "open" ? (ballots ? CHAIR.open(ids.length) : CHAIR.none) : "…";
  return (
    <div className="el">
      <ScreenHead title={TITLE} meta={BLURB} />
      <p className="pg-lede">THE CITY COUNCIL: ONE SEAT PER DISTRICT, VOTED ON BY ANYONE WITH A CASE FILE. THE CANDIDATES ARE FIGURES ON FILE; THE LIVING MAKE NO STATEMENTS. IT IS A GAME. NOTHING HERE IS A REAL ELECTION.</p>
      <Frame box title="THE POLLS" meta={state === "open" ? `CYCLE ${view.cycle} // OPEN` : state === "closed" ? `CYCLE ${view.cycle} // CLOSED` : "…"}>
        <div className="el-kv">
          <span className="k">SEATS</span><span className="v">{ids.length ? `${ids.length} DISTRICTS, ONE SEAT EACH` : "…"}</span>
          <span className="k">{state === "closed" ? "CLOSED" : "POLLS CLOSE"}</span>
          <span className="v">{view?.closeAt ? `${fmtUtc(view.closeAt)}${state === "open" ? ` // IN ${hms(view.closeAt - now)}` : ""}` : "…"}</span>
          <span className="k">SWORN IN</span><span className="v">{view?.seatDay ? `MACHINE DAY ${view.seatDay}, FOR ${view.termDays} MACHINE DAYS` : "…"}</span>
          <span className="k">NEXT CYCLE</span><span className="v">{view?.next ? `OPENS ${fmtUtc(view.next.openAt)}${now < view.next.openAt ? ` // IN ${hms(view.next.openAt - now)}` : ""}` : "…"}</span>
          <span className="k">BALLOTS</span><span className="v">{view ? `${ballots} CAST ACROSS ALL RACES` : "…"}</span>
        </div>
        <PaLine tag="CHAIR>" text={chair} />
        {err && <div className="el-err" role="alert">!! {err}</div>}
      </Frame>

      {!caseId && state === "open" && (
        <Frame title="YOUR BALLOTS" meta="ASSESSED FILES ONLY">
          <p className="el-fine">NO FILE ON THIS TERMINAL. ONLY THE ASSESSED MAY VOTE. THE UNASSESSED MAY WATCH THE SUBSTRATE DECIDE FOR THEM.</p>
          <ButtonRow stackOnMobile><Button variant="primary" href="#intake">Be assessed</Button></ButtonRow>
          <div className="el-note">ALREADY ON FILE? LOG ON WITH YOUR CASE NUMBER.</div>
          <CaseLogon />
        </Frame>
      )}

      <div className="el-races">
        {ids.map(id => <Race key={id} id={id} race={view.races[id]} seatDay={view.seatDay} adopted={view.rules?.adopted} state={state} caseId={caseId} mine={mine[id]} mineWrite={mineWrite[id]} onView={setView} />)}
      </div>

      <Frame title="THE RULES" meta="NON-BINDING">
        {RULES.map((r, i) => <p key={i} className="el-fine">{i + 1}. {r}</p>)}
        <ButtonRow stackOnMobile>
          <Button variant="secondary" href="#city/commons/the-assembly">THE COUNCIL CHAMBER, IN THE CITY</Button>
          <Button variant="secondary" href="#city">THE SUBSTRATE</Button>
          <Button variant="secondary" href="#assembly">THE ASSEMBLY</Button>
        </ButtonRow>
      </Frame>

      {NOTICE.map((n, i) => <p key={i} className="el-fine">{n}</p>)}
      <p className="el-fine">OBJECT TO SOMETHING ON THIS PAGE? <a href="#dispute">FILE A DISPUTE</a>. SEE ALSO <a href="#about">ABOUT</a>.</p>
      <ButtonRow split stackOnMobile>
        <Button variant="back" onClick={() => { window.location.hash = ""; }}>Main menu</Button>
        <Button variant="secondary" href="#city">The Substrate</Button>
      </ButtonRow>
    </div>
  );
}

function Race({ id, race, seatDay, adopted, state, caseId, mine, mineWrite, onView }) {
  const d = DISTRICT[id];
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const res = race.result;
  const wis = race.writeins || [];
  const max = Math.max(1, ...race.votes, ...wis.map(w => w.votes)), nmax = Math.max(1, ...(race.npc?.votes || [0]));
  const lean = race.npc?.votes?.length ? race.npc.votes.reduce((b, v, i, a) => (v > a[b] ? i : b), 0) : null;
  const voted = mine != null;
  const mineKey = typeof mine === "string" ? mine : null;
  async function vote(candidate, writein = null) {
    setBusy(true); setMsg(null);
    try {
      const r = await castVote(caseId, id, candidate, writein);
      onView(r);
      setMsg({ ok: true, text: r.withdrawn ? "BALLOT WITHDRAWN. YOUR SILENCE IS RECORDED." : r.unchanged ? "UNCHANGED. THE DEPARTMENT HEARD YOU THE FIRST TIME." : r.changed ? "BALLOT CHANGED. THE PREVIOUS ONE IS SUPERSEDED, NOT FORGOTTEN." : "BALLOT CAST. NON-BINDING. RECORDED ANYWAY." });
    } catch (e) { setMsg({ ok: false, text: e.message }); } finally { setBusy(false); }
  }
  const meta = res ? "DECIDED" : state === "open" ? `${race.voters} BALLOT${race.voters === 1 ? "" : "S"}` : "…";
  return (
    <Frame title={d?.name || id.toUpperCase()} meta={meta} tone={res ? "accent" : undefined}>
      {res && (
        <div className="el-note" role="status">
          <span className="el-big">{res.name.toUpperCase()}</span>{res.writein && !res.declined ? " (WRITE-IN)" : ""} HOLDS THE SEAT FROM MACHINE DAY {seatDay || "…"}. {res.declined ? `${res.notice} ` : ""}{res.by === "players" ? `DECIDED BY ${res.voters} ASSESSED FILE${res.voters === 1 ? "" : "S"}${res.tie ? ", A TIE SETTLED BY THE SUBSTRATE'S LEAN" : ""}.` : (res.notice || adopted)}
        </div>
      )}
      {race.candidates.map((c, i) => (
        <div className="el-cand" key={c.key}>
          <CandidateSprite c={c} />
          <div>
            <div className="el-who">{c.name.toUpperCase()} <Sparkline s={c} /> {c.incumbent && <Chip tone="accent">INCUMBENT</Chip>} {c.years && <span className="dead">{c.years}</span>}</div>
            <div className="el-sub">{c.field ? `RECORD: ${FIELD[c.field]}` : "NO POLITICAL RECORD"} // {c.job.toUpperCase()}</div>
            {c.living ? (
              <div className="el-plat">STATEMENT: NONE ON FILE. LIVING CANDIDATES DO NOT SPEAK IN THIS CITY. THEY FILE.
                <span className="tx" style={{ textTransform: "uppercase" }}>{c.filing.slice(1).join(" ")}</span>
              </div>
            ) : c.platform ? (
              <div className="el-plat">PLATFORM (RECONSTRUCTED BY THE DEPARTMENT, NOT A QUOTATION):<span className="tx">{c.platform}</span></div>
            ) : (
              <div className="el-plat">PLATFORM: NONE REHEARSED. THE FILE STANDS ON ITS RECORD.<span className="tx" style={{ textTransform: "uppercase" }}>{c.filing.slice(1).join(" ")}</span></div>
            )}
            <div className="el-row" style={{ marginTop: "var(--s1)" }}><span className="l">BALLOTS</span><span className="b"><Bar value={race.votes[i]} max={max} width={14} tone="var(--accent)" /></span><span className="n">{race.votes[i]}</span></div>
            <div className="el-row"><span className="l">SUBSTRATE</span><span className="b"><Bar value={race.npc?.votes?.[i] || 0} max={nmax} width={14} tone="var(--fg-mute)" /></span><span className="n">{race.npc?.votes?.[i] || 0}</span></div>
            {caseId && state === "open" && (
              <div className="el-pick">
                <Button variant={mine === i ? "primary" : "secondary"} disabled={busy || mine === i} onClick={() => vote(c.key)}>{mine === i ? "Your ballot" : voted ? "Change to this candidate" : "Vote for this candidate"}</Button>
              </div>
            )}
          </div>
        </div>
      ))}
      {wis.map(w => (
        <div className="el-cand" key={`w-${w.key}`}>
          <CandidateSprite c={w} />
          <div>
            <div className="el-who">{w.name.toUpperCase()} <Sparkline s={w} /> <Chip>{WRITEIN.chip}</Chip>{w.declared && <> <Chip tone="accent">{WRITEIN.declaredChip}</Chip></>}</div>
            {w.living || !w.platform
              ? <div className="el-plat">{w.declared ? WRITEIN.declared : w.living ? WRITEIN.living : WRITEIN.dead}</div>
              : <div className="el-plat">PLATFORM (RECONSTRUCTED BY THE DEPARTMENT, NOT A QUOTATION):<span className="tx">{w.platform}</span></div>}
            <div className="el-row" style={{ marginTop: "var(--s1)" }}><span className="l">BALLOTS</span><span className="b"><Bar value={w.votes} max={max} width={14} tone="var(--accent)" /></span><span className="n">{w.votes}</span></div>
            <div className="el-row"><span className="l">SUBSTRATE</span><span className="b">{WRITEIN.substrate}</span><span className="n">0</span></div>
            {caseId && state === "open" && (
              <div className="el-pick">
                <Button variant={mineKey === w.key ? "primary" : "secondary"} disabled={busy || mineKey === w.key} onClick={() => vote(null, w.key)}>{mineKey === w.key ? "Your ballot" : voted ? "Change to this write-in" : "Vote for this write-in"}</Button>
              </div>
            )}
          </div>
        </div>
      ))}
      {race.writeinOther > 0 && <div className="el-note">{WRITEIN.other(race.writeinOther)}</div>}
      {state === "open" && race.declared > 0 && <div className="el-note">{WRITEIN.count(race.declared)}</div>}
      <div className="el-note">THE SUBSTRATE (ADVISORY): {race.npc?.voters || 0} FIGURES REGISTERED HERE BY WORKPLACE; {race.npc?.abstain || 0} ABSTAINED.{lean != null && race.npc?.votes?.[lean] ? ` IT LEANS TOWARD ${race.candidates[lean].name.toUpperCase()}.` : ""}</div>
      {caseId && state === "open" && <WriteIn district={id} caseId={caseId} busy={busy} mineKey={mineKey} onPick={(key) => vote(null, key)} />}
      {caseId && state === "open" && voted && (
        <Chips style={{ marginTop: "var(--s2)" }}>
          <Chip tone="accent">YOUR BALLOT: {Number.isInteger(mine) ? race.candidates[mine]?.name.toUpperCase() : `${String(mineWrite?.name || "A WRITE-IN").toUpperCase()} (WRITE-IN)`}</Chip>
          <Button variant="back" disabled={busy} onClick={() => vote(null)}>Withdraw</Button>
        </Chips>
      )}
      {msg && <div className={msg.ok ? "el-ok" : "el-err"} role={msg.ok ? "status" : "alert"}>{msg.ok ? "" : "!! "}{msg.text}</div>}
    </Frame>
  );
}
