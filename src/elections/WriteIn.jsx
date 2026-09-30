import { useEffect, useId, useRef, useState } from "react";
import { Button } from "../ui/index.js";
import { WRITEIN } from "./content.js";
import { searchWriteIns } from "./client.js";

// WRITE IN (docs/CITY_SPEC.md "Council elections"): a type-ahead over the district's residents
// and workforce on file who may be written in (the server's pool: /api/elections?writein=),
// and the viewer's own citizen. A name is picked from the census, never typed in: the only
// thing sent is the key of a subject the server listed. onPick(key) casts the ballot.
export default function WriteIn({ district, caseId, busy, mineKey, onPick }) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [act, setAct] = useState(0);
  const [found, setFound] = useState({ q: "", hits: [], self: null, err: "" });
  const id = useId().replace(/:/g, "");
  const inputRef = useRef(null);
  // who you are here (the "yourself" line) is asked once, with an empty query
  useEffect(() => {
    let off = false;
    searchWriteIns(district, "", caseId).then(d => { if (!off) setFound(f => ({ ...f, self: d.self || null })); }).catch(() => {});
    return () => { off = true; };
  }, [district, caseId]);
  useEffect(() => {
    if (!q.trim()) return;
    let off = false;
    const t = setTimeout(() => {
      searchWriteIns(district, q, caseId)
        .then(d => { if (!off) setFound(f => ({ ...f, q, hits: d.hits || [], err: "" })); })
        .catch(e => { if (!off) setFound(f => ({ ...f, q, hits: [], err: e.message })); });
    }, 160);
    return () => { off = true; clearTimeout(t); };
  }, [district, q, caseId]);
  const shown = open && q.trim() !== "";
  const searching = shown && found.q !== q;
  const rows = shown ? found.hits : [];
  const pick = (h) => { if (!h || busy) return; setOpen(false); setQ(""); inputRef.current?.blur(); onPick(h.key); };
  const onKey = (ev) => {
    if (ev.key === "ArrowDown") { ev.preventDefault(); setOpen(true); setAct(a => Math.min(a + 1, Math.max(0, rows.length - 1))); }
    else if (ev.key === "ArrowUp") { ev.preventDefault(); setAct(a => Math.max(0, a - 1)); }
    else if (ev.key === "Enter") { ev.preventDefault(); if (!searching) pick(rows[act] || rows[0]); }
    else if (ev.key === "Escape") { if (q || open) { ev.preventDefault(); ev.stopPropagation(); setQ(""); setOpen(false); } }
  };
  const status = shown ? (searching ? "SEARCHING THE CENSUS." : rows.length ? `${rows.length} MATCH${rows.length === 1 ? "" : "ES"}. ARROWS TO CHOOSE, ENTER TO WRITE IN.` : WRITEIN.none) : "";
  return (
    <div className="el-wi">
      <div className="el-wi-head">{WRITEIN.head}</div>
      <div className="el-wi-box">
        <label htmlFor={`${id}-in`} className="p">NAME &gt;</label>
        <input ref={inputRef} id={`${id}-in`} className="ui-input" type="search" value={q} placeholder="SEARCH THE DISTRICT'S FILES" autoComplete="off" spellCheck={false}
          enterKeyHint="search" role="combobox" aria-expanded={shown && rows.length > 0} aria-controls={`${id}-lb`} aria-autocomplete="list"
          aria-activedescendant={shown && rows[act] ? `${id}-o${act}` : undefined} disabled={busy}
          onChange={(ev) => { setQ(ev.target.value.slice(0, 80)); setOpen(true); setAct(0); }}
          onFocus={() => setOpen(true)} onBlur={() => setTimeout(() => setOpen(false), 150)} onKeyDown={onKey} />
        {shown && (
          <ul id={`${id}-lb`} role="listbox" className="el-wi-list" aria-label="Subjects who may be written in">
            {rows.length === 0 && <li className="none" role="presentation">{searching ? "SEARCHING THE CENSUS." : found.err || WRITEIN.none}</li>}
            {rows.map((h, i) => (
              <li key={h.key} id={`${id}-o${i}`} role="option" aria-selected={i === act} className={i === act ? "act" : undefined}
                onPointerDown={(ev) => ev.preventDefault()} onClick={() => pick(h)} onPointerEnter={() => setAct(i)}>
                {h.name.toUpperCase()}{h.self ? " (YOU)" : ""}{h.key === mineKey ? " // YOUR BALLOT" : ""}
              </li>
            ))}
          </ul>
        )}
      </div>
      <div className="el-fine" style={{ marginTop: "var(--s1)" }}>{WRITEIN.hint}</div>
      {found.self && (
        <Button variant={mineKey === found.self.key ? "primary" : "secondary"} disabled={busy || mineKey === found.self.key} onClick={() => onPick(found.self.key)}>
          {mineKey === found.self.key ? "Your ballot: yourself" : WRITEIN.self(found.self.name)}
        </Button>
      )}
      <span className="sr-only" role="status">{status}</span>
    </div>
  );
}
