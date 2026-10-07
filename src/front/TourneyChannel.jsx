// THE SET's CH 3, THE TOURNAMENT (Scott, 2026-10-06): while a golf tournament is open the channel re-plays the
// verified official cards of its leaders (netlify tournament.js ?log=1 serves the stored input log by PLACE, never
// by case number; the pure sim re-plays it, golfcast.js), drawn by the game's own renderer on a small canvas, with a
// score bug ("ON THE 17TH · −2") and the leaderboard over it. Between events: the last champion's round. Cheap on
// purpose: eight pictures a second, dead air run fast, the golf renderer is a lazy chunk fetched only when the
// channel is tuned, and nothing runs while the page is hidden. No stored card yet (a card played before the logs
// were kept) is a leaderboard card, not a blank screen.
import { useEffect, useRef, useState } from "react";
import { pickEvent, leadersOf, scoreText, holder, whenText } from "./board.js";

const getJSON = (u) => fetch(u).then(r => (r.ok ? r.json() : null)).catch(() => null);
const reduced = () => { try { return window.matchMedia("(prefers-reduced-motion: reduce)").matches; } catch { return false; } };
export const FRAME_MS = 125, TICKS = 8, HOLD_MS = 4500, LEADERS = 3;

export default function TourneyChannel() {
  const [pick, setPick] = useState(undefined);   // { ev, live } | null
  const [pos, setPos] = useState(1);
  const [rec, setRec] = useState(undefined);     // a card | null (none stored) | undefined (asking)
  const [bugText, setBug] = useState("");
  const [board, setBoard] = useState(true);       // the leaderboard overlay comes and goes, like a broadcast's
  const cv = useRef(null);
  useEffect(() => {
    let off = false;
    getJSON("/api/tournament").then(j => { if (!off) setPick(j?.events ? pickEvent(j.events, Date.now(), "golf") || pickEvent(j.events) : null); });
    return () => { off = true; };
  }, []);
  const golf = pick?.ev.game === "golf";
  useEffect(() => {
    if (!golf) { setRec(null); return undefined; }
    let off = false;
    setRec(undefined);
    getJSON(`/api/tournament?id=${encodeURIComponent(pick.ev.id)}&log=1&div=open&pos=${pos}`).then(j => { if (!off) setRec(j && !j.none && j.inputLog ? j : null); });
    return () => { off = true; };
  }, [golf, pick, pos]);

  // the broadcast: lazy renderer + player, one interval
  useEffect(() => {
    if (!rec || !cv.current) return undefined;
    let off = false, iv = null, held = null;
    const still = reduced();
    Promise.all([import("../play/golf/render.js"), import("./golfcast.js")]).then(([R, G]) => {
      if (off || !cv.current) return;
      const ctx = cv.current.getContext("2d"), cast = G.makeCast(rec);
      let frame = 0;
      const looks = [];
      const lb = () => setBoard(frame % 100 < 36 || still);
      const draw = () => { try { R.draw(ctx, cast.st, frame++, false, looks, { still }); } catch { /* a frame that will not draw is skipped */ } };
      iv = setInterval(() => {
        if (document.hidden) return;
        if (cast.info().done) {
          if (held == null) held = Date.now();
          draw(); setBug(cast.info().text); lb();
          if (Date.now() - held > HOLD_MS) { clearInterval(iv); if (pick.live) setPos(p => (p % LEADERS) + 1); else setRec(r => ({ ...r })); }   // the next leader's card, or the champion again
          return;
        }
        cast.advance(still ? 60 : TICKS * (pick.live ? 1 : 2));
        draw(); setBug(cast.info().text); lb();
      }, still ? 1500 : FRAME_MS);
    }).catch(() => { if (!off) setRec(null); });
    return () => { off = true; clearInterval(iv); };
  }, [rec, pick]);

  if (pick === undefined) return <div className="tv-card"><p className="big">TUNING…</p></div>;
  if (!pick) return <div className="tv-card"><p className="big">OFF AIR</p><p>NO TOURNAMENT HAS BEEN HELD. THE DEPARTMENT IS PREPARING ONE.</p></div>;
  const { ev, live } = pick, rows = leadersOf(ev).slice(0, 5);
  return (
    <div className="tv-tour">
      {rec ? <canvas ref={cv} width="320" height="224" aria-label={`${ev.name}: ${holder(rec)}'s card, re-played`} /> : (
        <div className="tv-tour-card"><p className="big">{golf && rec === undefined ? "TUNING…" : ev.name}</p><p>{golf ? "THE CARDS ON FILE ARE NOT ON THE AIR YET. THE BOARD:" : `NO GOLF ON. ${ev.venue || ""}`}</p></div>
      )}
      <span className="tag">{live ? "LIVE" : "REPLAY"} · {ev.name}</span>
      {rec && <span className="bug"><b>{rec.pos === 1 ? (live ? "LEADER" : "CHAMPION") : `${rec.pos}${rec.pos === 2 ? "ND" : "RD"}`}</b> {holder(rec)} · {bugText || "TEEING OFF"}</span>}
      <ol className={`lb${board ? "" : " off"}`} aria-label="Leaderboard">
        {rows.map((r, i) => <li key={i} className={rec && r.holder === rec.holder ? "on" : ""}><span>{r.pos}</span><span className="n">{holder(r)}</span><span>{scoreText(ev, r)}</span></li>)}
        <li className="when"><span>{whenText(ev, live)}</span></li>
      </ol>
    </div>
  );
}
