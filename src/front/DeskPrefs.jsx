// The desk's two control panels, opened from MORE ROOMS (DISPLAY, WIDGETS) or the desk's own
// ARRANGE line. Windows 3.1's Control Panel / the Mac's Control Panels folder: a modal dialog
// (a native <dialog>: focus stays inside, Escape closes), a list, OK and CANCEL.
//   DISPLAY   the five colour schemes (src/ui/themes.css). Picking one previews it at once;
//             CANCEL puts the old one back; FOLLOW MY DEVICE forgets the pick.
//   WIDGETS   a checkbox per window and ▲ ▼ to order them; RESET is today's four.
// Phones: the dialog is the screen's width, its list scrolls inside it, every control 44px.
import { useEffect, useRef, useState } from "react";
import { Frame, Button, ButtonRow } from "../ui/index.js";
import { THEMES, WIDGETS, DEFAULT_WIDGETS, currentTheme, savedTheme, applyTheme, saveTheme } from "./prefs.js";

export default function DeskPrefs({ which, ids, onIds, onClose }) {
  const ref = useRef(null);
  useEffect(() => {
    const d = ref.current;
    try { d?.showModal(); } catch { d?.setAttribute("open", ""); }
    return () => { try { d?.close(); } catch { /* gone */ } };
  }, []);
  return (
    <dialog ref={ref} className="fr-dlg" aria-labelledby="fr-dlg-t" onCancel={(e) => { e.preventDefault(); ref.current?.dispatchEvent(new Event("hvi-cancel")); }}>
      {which === "display" ? <Display dlg={ref} onClose={onClose} /> : <Widgets dlg={ref} ids={ids} onIds={onIds} onClose={onClose} />}
    </dialog>
  );
}

// Escape (the dialog's cancel) means CANCEL in either panel
function useCancel(dlg, cancel) {
  useEffect(() => {
    const d = dlg.current;
    d?.addEventListener("hvi-cancel", cancel);
    return () => d?.removeEventListener("hvi-cancel", cancel);
  });
}

function Display({ dlg, onClose }) {
  const [was] = useState(currentTheme);
  const [pick, setPick] = useState(was);
  const cancel = () => { applyTheme(was); onClose(); };
  useCancel(dlg, cancel);
  const choose = (id) => { setPick(id); applyTheme(id); };
  return (
    <Frame title="DISPLAY" meta="CONTROL PANEL" className="ui-dialog fr-dlg-w">
      <h2 id="fr-dlg-t" className="fr-dlg-h">COLOR SCHEMES</h2>
      <p className="fr-dlg-p">THE DEPARTMENT ISSUES FIVE. YOUR CHOICE IS KEPT ON THIS DEVICE.{savedTheme() ? "" : " NONE CHOSEN YET: THIS ONE FOLLOWS YOUR DEVICE."}</p>
      <ul className="fr-themes" role="radiogroup" aria-labelledby="fr-dlg-t">
        {THEMES.map(t => (
          <li key={t.id}>
            <button type="button" role="radio" aria-checked={pick === t.id} className="fr-theme" onClick={() => choose(t.id)}>
              <span className="mk" aria-hidden="true">{pick === t.id ? "(•)" : "( )"}</span>
              <span className="sw" aria-hidden="true" style={{ background: t.sw[0] }}>
                <span style={{ background: t.sw[1], borderColor: t.sw[3] }}><i style={{ background: t.sw[3] }} /><b style={{ background: t.sw[2] }} /><b style={{ background: t.sw[4], width: "60%" }} /></span>
              </span>
              <span className="tx"><span className="n">{t.name}</span><span className="s">{t.note}</span></span>
            </button>
          </li>
        ))}
      </ul>
      <ButtonRow className="ui-dialog-btns fr-dlg-btns">
        <Button variant="secondary" onClick={() => { saveTheme(null); onClose(); }}>Follow my device</Button>
        <Button variant="push" tone="sec" onClick={cancel}>CANCEL</Button>
        <Button variant="push" className="ok" onClick={() => { saveTheme(pick); onClose(); }}>OK</Button>
      </ButtonRow>
    </Frame>
  );
}

function Widgets({ dlg, ids, onIds, onClose }) {
  const order = (on) => [...on, ...WIDGETS.map(w => w.id).filter(id => !on.includes(id))];
  const [rows, setRows] = useState(() => order(ids).map(id => ({ id, on: ids.includes(id) })));
  const [said, setSaid] = useState("");
  useCancel(dlg, onClose);
  const name = (id) => WIDGETS.find(w => w.id === id)?.name || id;
  const move = (i, k) => setRows(r => {
    const j = i + k;
    if (j < 0 || j >= r.length) return r;
    const n = r.slice(); [n[i], n[j]] = [n[j], n[i]];
    setSaid(`${name(r[i].id)} MOVED TO ${j + 1} OF ${r.length}.`);
    return n;
  });
  return (
    <Frame title="WIDGETS" meta="CONTROL PANEL" className="ui-dialog fr-dlg-w">
      <h2 id="fr-dlg-t" className="fr-dlg-h">WINDOWS ON THE DESK</h2>
      <p className="fr-dlg-p">TICK WHAT SITS BESIDE THE LOGON. ▲ ▼ SET THE ORDER. KEPT ON THIS DEVICE.</p>
      <ol className="fr-wl">
        {rows.map((r, i) => {
          const w = WIDGETS.find(x => x.id === r.id);
          return (
            <li key={r.id} className={r.on ? "on" : ""}>
              <label className="ck">
                <input type="checkbox" checked={r.on} onChange={(e) => setRows(x => x.map(y => (y.id === r.id ? { ...y, on: e.target.checked } : y)))} />
                <span className="box" aria-hidden="true">{r.on ? "X" : ""}</span>
                <span className="tx"><span className="n">{w.name}</span><span className="s">{w.note}</span></span>
              </label>
              <span className="mv">
                <button type="button" onClick={() => move(i, -1)} disabled={i === 0} aria-label={`Move ${w.name} up`}>▲</button>
                <button type="button" onClick={() => move(i, 1)} disabled={i === rows.length - 1} aria-label={`Move ${w.name} down`}>▼</button>
              </span>
            </li>
          );
        })}
      </ol>
      <p className="sr-only" role="status">{said}</p>
      <ButtonRow className="ui-dialog-btns fr-dlg-btns">
        <Button variant="secondary" onClick={() => setRows(order(DEFAULT_WIDGETS).map(id => ({ id, on: DEFAULT_WIDGETS.includes(id) })))}>Reset</Button>
        <Button variant="push" tone="sec" onClick={onClose}>CANCEL</Button>
        <Button variant="push" className="ok" onClick={() => { onIds(rows.filter(r => r.on).map(r => r.id)); onClose(); }}>OK</Button>
      </ButtonRow>
    </Frame>
  );
}
