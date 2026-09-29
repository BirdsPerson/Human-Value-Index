import { memo, useId, useMemo, useRef, useState } from "react";
import { clockAt } from "./simApi.js";
import { searchIndex, findTarget, whereShort } from "./find.js";
import { SpriteThumb } from "./cityUi.jsx";

// FIND > [name........] [FIND ME]. A combobox over the census index (find.js): type, arrow
// through the top eight (each with where they are now), Enter or tap to pick. Escape
// clears. FIND ME is the viewer's own file, or what to do about not having one.
export default memo(function CityFind({ index, onPick, self, caseId }) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [act, setAct] = useState(0);
  const inputRef = useRef(null);
  const id = useId().replace(/:/g, "");
  const list = useMemo(() => (open ? searchIndex(index, q, 8) : []), [index, q, open]);
  // Where each match is, read once per keystroke (8 lookups), not per frame.
  const mt = useMemo(() => clockAt(Date.now()).mt, [list]);   // eslint-disable-line react-hooks/exhaustive-deps
  const rows = useMemo(() => list.map(e => ({ e, where: whereShort(findTarget(e.s, mt), mt) })), [list, mt]);
  const shown = open && q.trim() !== "";
  const pick = (e) => { if (!e) return; setOpen(false); setQ(""); inputRef.current?.blur(); onPick(e); };
  const onKey = (ev) => {
    if (ev.key === "ArrowDown") { ev.preventDefault(); setOpen(true); setAct(a => Math.min(a + 1, Math.max(0, rows.length - 1))); }
    else if (ev.key === "ArrowUp") { ev.preventDefault(); setAct(a => Math.max(0, a - 1)); }
    else if (ev.key === "Enter") { ev.preventDefault(); pick(rows[act]?.e || rows[0]?.e); }
    else if (ev.key === "Escape") { if (q || open) { ev.preventDefault(); ev.stopPropagation(); setQ(""); setOpen(false); } }
  };
  const status = shown ? (rows.length ? `${rows.length} MATCH${rows.length === 1 ? "" : "ES"}. ARROWS TO CHOOSE, ENTER TO FIND.` : "NO SUBJECT ON FILE BY THAT NAME.") : "";
  return (
    <div className="hvi-city-find" role="search">
      <div className="hvi-city-find-box">
        <label htmlFor={`${id}-in`} className="p">FIND &gt;</label>
        <input ref={inputRef} id={`${id}-in`} className="ui-input" type="search" value={q} placeholder="A NAME IN THE CENSUS" autoComplete="off" spellCheck={false}
          enterKeyHint="search" role="combobox" aria-expanded={shown && rows.length > 0} aria-controls={`${id}-lb`} aria-autocomplete="list"
          aria-activedescendant={shown && rows[act] ? `${id}-o${act}` : undefined}
          onChange={(ev) => { setQ(ev.target.value); setOpen(true); setAct(0); }}
          onFocus={() => setOpen(true)} onBlur={() => setTimeout(() => setOpen(false), 150)} onKeyDown={onKey} />
        {shown && (
          <ul id={`${id}-lb`} role="listbox" className="hvi-city-find-list" aria-label="Matches">
            {rows.length === 0 && <li className="none" role="presentation">NO SUBJECT ON FILE BY THAT NAME. THE DEPARTMENT HAS CHECKED.</li>}
            {rows.map((r, i) => (
              <li key={r.e.key} id={`${id}-o${i}`} role="option" aria-selected={i === act} className={i === act ? "act" : undefined}
                onPointerDown={(ev) => ev.preventDefault()} onClick={() => pick(r.e)} onPointerEnter={() => setAct(i)}>
                <span className="lead"><SpriteThumb s={r.e.s} /></span>
                <span className="txt"><span className="n">{r.e.name}{r.e.s.you ? " (YOU)" : ""}</span><span className="w">{r.where}</span></span>
              </li>
            ))}
          </ul>
        )}
      </div>
      {self
        ? <button type="button" className="hvi-city-zb txt hvi-city-findme" onClick={() => pick(self)} aria-label="Find me: fly to your own file in the city">FIND ME</button>
        : caseId
          ? <button type="button" className="hvi-city-zb txt hvi-city-findme" disabled>FILE NOT IN THE CENSUS YET</button>
          : <a className="hvi-city-zb txt hvi-city-findme" href="#intake">NO FILE. SIT FOR INTAKE.</a>}
      <span className="sr-only" role="status">{status}</span>
    </div>
  );
});
