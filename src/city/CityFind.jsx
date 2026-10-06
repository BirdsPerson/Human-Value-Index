import { memo, useEffect, useId, useMemo, useRef, useState } from "react";
import { clockAt } from "./simApi.js";
import { searchIndex, findTarget, whereShort } from "./find.js";
import { searchCensus } from "./planClient.js";
import { SpriteThumb } from "./cityUi.jsx";
import Sparkline from "../ui/Sparkline.jsx";
import { note } from "../firstDay.js";
import { findFunnel } from "./funnels.js";   // YOUR FIRST DAY: FIND YOURSELF IN THE CITY

// FIND > [name........] [FIND ME]. A combobox over the census index (find.js): type, arrow
// through the top eight (each with where they are now), Enter or tap to pick. Escape
// clears. FIND ME is the viewer's own file, or what to do about not having one.
// remote: the city holds only what it looks at (planClient.js), so the search is the
// server's (/api/find, the same ranking), a beat after the last keystroke.
export default memo(function CityFind({ index, remote = false, onPick, onPlace, self, caseId }) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [act, setAct] = useState(0);
  const inputRef = useRef(null);
  const id = useId().replace(/:/g, "");
  const [found, setFound] = useState({ q: "", list: [] });
  useEffect(() => {
    if (!remote || !open || !q.trim()) return;
    let off = false;
    const t = setTimeout(() => {
      searchCensus(q, 8).then(list => { if (!off) setFound({ q, list: list || searchIndex(index, q, 8) }); });
    }, 120);
    return () => { off = true; clearTimeout(t); };
  }, [remote, open, q, index]);
  const list = useMemo(() => (!open ? [] : remote ? (found.q === q ? found.list : found.list) : searchIndex(index, q, 8)), [index, q, open, remote, found]);
  const searching = remote && open && q.trim() !== "" && found.q !== q;
  // Where each match is, read once per keystroke (8 lookups), not per frame.
  const mt = useMemo(() => clockAt(Date.now()).mt, [list]);   // eslint-disable-line react-hooks/exhaustive-deps
  // the funnel buildings by name first (the EB SHOP, THE ARCADE, EBTV), then the people
  const rows = useMemo(() => [
    ...(open && onPlace ? findFunnel(q) : []).map(p => ({ place: p, key: `pl:${p.id}`, where: p.line })),
    ...list.map(e => ({ e, key: e.key, where: whereShort(findTarget(e.s, mt), mt) })),
  ], [list, mt, q, open, onPlace]);
  const shown = open && q.trim() !== "";
  const pick = (r) => { if (!r) return; setOpen(false); setQ(""); inputRef.current?.blur(); if (r.place) onPlace(r.place); else onPick(r.e); };
  const onKey = (ev) => {
    if (ev.key === "ArrowDown") { ev.preventDefault(); setOpen(true); setAct(a => Math.min(a + 1, Math.max(0, rows.length - 1))); }
    else if (ev.key === "ArrowUp") { ev.preventDefault(); setAct(a => Math.max(0, a - 1)); }
    else if (ev.key === "Enter") { ev.preventDefault(); pick(rows[act] || rows[0]); }
    else if (ev.key === "Escape") { if (q || open) { ev.preventDefault(); ev.stopPropagation(); setQ(""); setOpen(false); } }
  };
  const status = shown ? (rows.length ? `${rows.length} MATCH${rows.length === 1 ? "" : "ES"}. ARROWS TO CHOOSE, ENTER TO FIND.` : searching ? "SEARCHING THE CENSUS." : "NO SUBJECT ON FILE BY THAT NAME.") : "";
  return (
    <div className="hvi-city-find" role="search">
      <div className="hvi-city-find-box">
        <label htmlFor={`${id}-in`} className="p">FIND &gt;</label>
        <input ref={inputRef} id={`${id}-in`} className="ui-input" type="search" value={q} placeholder="ANY NAME" autoComplete="off" spellCheck={false}
          enterKeyHint="search" role="combobox" aria-expanded={shown && rows.length > 0} aria-controls={`${id}-lb`} aria-autocomplete="list"
          aria-activedescendant={shown && rows[act] ? `${id}-o${act}` : undefined}
          onChange={(ev) => { setQ(ev.target.value); setOpen(true); setAct(0); }}
          onFocus={() => setOpen(true)} onBlur={() => setTimeout(() => setOpen(false), 150)} onKeyDown={onKey} />
        {shown && (
          <ul id={`${id}-lb`} role="listbox" className="hvi-city-find-list" aria-label="Matches">
            {rows.length === 0 && <li className="none" role="presentation">{searching ? "SEARCHING THE CENSUS. EVERYONE IS IN IT." : "NO SUBJECT ON FILE BY THAT NAME. THE DEPARTMENT HAS CHECKED."}</li>}
            {rows.map((r, i) => (
              <li key={r.key} id={`${id}-o${i}`} role="option" aria-selected={i === act} className={i === act ? "act" : undefined}
                onPointerDown={(ev) => ev.preventDefault()} onClick={() => pick(r)} onPointerEnter={() => setAct(i)}>
                <span className="lead">{r.place ? <span aria-hidden="true">▣</span> : <SpriteThumb s={r.e.s} />}</span>
                <span className="txt"><span className="n">{r.place ? r.place.name : r.e.name}{r.e?.s.you ? " (YOU)" : ""}</span><span className="w">{r.where}</span></span>
                {r.e && <Sparkline s={r.e.s} />}
              </li>
            ))}
          </ul>
        )}
      </div>
      {self
        ? <button type="button" className="hvi-city-zb txt hvi-city-findme" onClick={() => { note(caseId, "city"); pick({ e: self }); }} aria-label="Find me: fly to your own file in the city">FIND ME</button>
        : caseId
          ? <button type="button" className="hvi-city-zb txt hvi-city-findme" disabled>FILE NOT IN THE CENSUS YET</button>
          : <a className="hvi-city-zb txt hvi-city-findme" href="#intake" aria-label="You have no file. Get evaluated to join the city.">GET EVALUATED</a>}
      <span className="sr-only" role="status">{status}</span>
    </div>
  );
});
