// #mail: DEPARTMENT MAIL (docs/design/COMMS.md, layer 1). An Outlook Express / Eudora homage in our
// own Win98 chrome: the folder pane, the message list (from, subject, received), the reading pane, one
// action button per letter. Phone: one column (folders as tabs, the list, then the letter).
//   #mail                       from MY FILE: the client
//   #mail?at=home[&pc=rig|rack] the BEIGE PC in your flat (or what it was upgraded into): a desktop first
//   #mail?at=terminal           a public PC at THE TERMINAL on the east boardwalk: a desktop first
// No pop-ups: the unread count is the only notice (the folder pane, the title bar, the desktop icon).
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { readCaseId, CaseLogon } from "../caseFile.jsx";
import { loadShops, lastView } from "../shops/client.js";
import { FOLDERS, FOLDER_NAME, folderOf } from "./mail.js";
import { loadMail, mailOp } from "./client.js";
import "./mail.css";

export function parseMail(route) {
  const p = new URLSearchParams(String(route || "").split("?")[1] || "");
  const at = ["home", "terminal"].includes(p.get("at")) ? p.get("at") : null;
  const pc = ["rig", "rack"].includes(p.get("pc")) ? p.get("pc") : "beige";
  return { at, pc };
}
const fmtWhen = (at) => {
  if (!at) return "";
  const d = new Date(at);
  return `${d.toLocaleDateString("en-US", { month: "short", day: "numeric" }).toUpperCase()} ${d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false })}`;
};
function useNarrow() {
  const q = "(max-width: 759px)";
  const [n, setN] = useState(() => typeof window !== "undefined" && window.matchMedia?.(q).matches);
  useEffect(() => { const m = window.matchMedia?.(q); if (!m) return undefined; const f = () => setN(m.matches); m.addEventListener("change", f); return () => m.removeEventListener("change", f); }, []);
  return n;
}

// ---- the pixel icons (our own: 16x16 grids, drawn as SVG rects) ------------------------------------------
const ICONS = {
  mail: ["................", "................", ".############...", ".#..........##..", ".##........#.#..", ".#.#......#..#..", ".#..#....#...#..", ".#...#..#....#..", ".#....##.....#..", ".#...........#..", ".############...", "................"],
  paper: ["..##########....", "..#........#....", "..#.######.#....", "..#........#....", "..#.###.##.#....", "..#.###.##.#....", "..#.###....#....", "..#.###.##.#....", "..#........#....", "..#.######.#....", "..##########....", "................"],
  market: ["................", "..............#.", ".............##.", "..#.........#.#.", "..##.......#....", "..#.#..#..#.....", "..#..##.##......", "..#.............", "..#.............", "..############..", "................", "................"],
  cards: ["...######.......", "...#....#.......", "...#.##.####....", "...#.##.#..#....", "...#....#.##....", "...#..#.#.##....", "...####.#..#....", "......#.#..#....", "......#######...", "................", "................", "................"],
  off: ["................", ".......#........", "...#...#...#....", "..#....#....#...", ".#.....#.....#..", ".#...........#..", ".#...........#..", "..#.........#...", "...#.......#....", "....#######.....", "................", "................"],
  folder: ["................", ".####...........", ".#..#######.....", ".#.........#....", ".#.........#....", ".#.........#....", ".#.........#....", ".###########....", "................"],
};
const ICON_COL = { mail: ["#ffffff", "#000080"], paper: ["#ffffff", "#202020"], market: ["#ffffff", "#006000"], cards: ["#ffffff", "#a00000"], off: ["#e0e0e0", "#c00000"], folder: ["#ffd860", "#806000"] };
// the paper under the ink: [x, y, w, h] in the 16-grid (y as drawn, the rows start at 2)
const ICON_FILL = { mail: [[2, 5, 11, 8]], paper: [[3, 3, 8, 9]], market: [[1, 2, 14, 13]], cards: [[4, 3, 4, 6], [7, 5, 4, 6]], off: [[2, 3, 12, 11]], folder: [[2, 4, 10, 5]] };
function Px({ name, size = 32 }) {
  const g = ICONS[name], [fill, ink] = ICON_COL[name];
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" shapeRendering="crispEdges" aria-hidden="true" focusable="false">
      {(ICON_FILL[name] || []).map(([x, y, w, h], i) => <rect key={`f${i}`} x={x} y={y} width={w} height={h} fill={fill} />)}
      {g.map((row, y) => [...row].map((ch, x) => (ch === "#" ? <rect key={`${x}.${y}`} x={x} y={y + 2} width="1" height="1" fill={ink} /> : null)))}
    </svg>
  );
}

// ---- the client ---------------------------------------------------------------------------------------
export function MailClient({ caseId, onClose = null, closeLabel = "CLOSE" }) {
  const [v, setV] = useState(null);
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false);
  const [folder, setFolder] = useState("inbox");
  const [sel, setSel] = useState(null);           // the letter selected (desktop) / open (phone)
  const [line, setLine] = useState(null);         // the status bar's last word: {text, undo}
  const narrow = useNarrow();
  const listRef = useRef(null), readRef = useRef(null);

  const refresh = useCallback(() => {
    setBusy(true); setErr(null);
    return loadMail(caseId).then(setV).catch(e => setErr(e.message)).finally(() => setBusy(false));
  }, [caseId]);
  useEffect(() => { refresh(); }, [refresh]);

  const list = useMemo(() => (v?.mail || []).filter(m => folderOf(m) === folder), [v, folder]);
  const cur = list.find(m => m.id === sel) || null;
  useEffect(() => { if (!narrow && !cur && list.length) setSel(list[0].id); }, [narrow, cur, list]);

  const op = async (o, id, say = null) => {
    try { const nv = await mailOp(caseId, o, id); setV(nv); if (say) setLine(say); return nv; } catch (e) { setLine({ text: e.message }); return null; }
  };
  const open = (m, focus = false) => {
    setSel(m.id);
    if (!m.read) op("read", m.id);
    if (focus || narrow) setTimeout(() => readRef.current?.focus(), 0);
  };
  const del = async (m) => {
    const i = list.findIndex(x => x.id === m.id), next = list[i + 1] || list[i - 1] || null;
    await op("delete", m.id, { text: "LETTER SHREDDED. THE DEPARTMENT KEEPS THE PIECES FOR 30 DAYS.", undo: m.id });
    setSel(narrow ? null : next?.id || null);
  };
  const arch = async (m) => {
    const i = list.findIndex(x => x.id === m.id), next = list[i + 1] || list[i - 1] || null;
    await op(m.archived ? "unarchive" : "archive", m.id, { text: m.archived ? "RETURNED TO ITS FOLDER." : "FILED IN THE ARCHIVE. FILED IS NOT FORGOTTEN." });
    setSel(narrow ? null : next?.id || null);
  };
  const onListKey = (e) => {
    const i = list.findIndex(m => m.id === sel);
    const go = (j) => { const m = list[Math.max(0, Math.min(list.length - 1, j))]; if (!m) return; e.preventDefault(); setSel(m.id); if (!m.read && !narrow) op("read", m.id); listRef.current?.querySelector(`[data-id="${CSS.escape(m.id)}"]`)?.focus(); };
    if (e.key === "ArrowDown") go(i + 1);
    else if (e.key === "ArrowUp") go(i - 1);
    else if (e.key === "Home") go(0);
    else if (e.key === "End") go(list.length - 1);
    else if ((e.key === "Delete" || e.key === "Backspace") && cur) { e.preventDefault(); del(cur); }
  };

  const unread = v?.unread || 0;
  const title = `DEPARTMENT MAIL - ${FOLDER_NAME[folder]}${unread ? ` (${unread} UNREAD)` : ""}`;
  const folders = (
    <nav className="dm-folders" aria-label="Folders">
      {!narrow && <div className="dm-tree-root"><Px name="folder" size={16} /> SUBJECT {String(caseId).slice(-4)}</div>}
      <ul role="list">
        {FOLDERS.map(f => {
          const c = v?.counts?.[f] || { n: 0, unread: 0 };
          return (
            <li key={f}>
              <button type="button" className={`dm-folder${folder === f ? " on" : ""}${c.unread ? " has" : ""}`} aria-current={folder === f ? "true" : undefined}
                onClick={() => { setFolder(f); setSel(null); }} aria-label={`${FOLDER_NAME[f]}, ${c.n} letter${c.n === 1 ? "" : "s"}${c.unread ? `, ${c.unread} unread` : ""}`}>
                <Px name="folder" size={16} /> <span>{FOLDER_NAME[f]}</span>{c.unread ? <b className="dm-n">({c.unread})</b> : null}
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
  const messages = (
    <div className="dm-list" role="region" aria-label={`${FOLDER_NAME[folder]}: letters`}>
      <div className="dm-cols" aria-hidden="true"><span>FROM</span><span>SUBJECT</span><span>RECEIVED</span></div>
      {!v && busy && <p className="dm-empty" role="status">DIALLING THE MAIL ROOM...</p>}
      {v && !list.length && <p className="dm-empty">{folder === "archive" ? "NOTHING FILED. THE ARCHIVE IS PATIENT." : "NO LETTERS HERE. THE DEPARTMENT WRITES A FEW TIMES A DAY, NEVER MORE."}</p>}
      <ul ref={listRef} role="list" onKeyDown={onListKey}>
        {list.map(m => (
          <li key={m.id}>
            <button type="button" data-id={m.id} className={`dm-row${m.read ? "" : " unread"}${m.id === sel ? " on" : ""}`} aria-current={m.id === sel ? "true" : undefined}
              tabIndex={m.id === sel || (!sel && m === list[0]) ? 0 : -1} onClick={() => open(m, false)} onDoubleClick={() => open(m, true)}
              aria-label={`${m.read ? "" : "Unread. "}From ${m.from.name}. ${m.subject}. ${fmtWhen(m.at)}.`}>
              <span className="dm-from"><span className="dm-dot" aria-hidden="true">{m.read ? "" : "●"}</span>{m.from.name}</span>
              <span className="dm-subj">{m.subject}</span>
              <span className="dm-when">{fmtWhen(m.at)}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
  const reading = cur ? (
    <article className="dm-read" ref={readRef} tabIndex={-1} aria-label={`Letter: ${cur.subject}`}>
      <dl className="dm-head">
        <dt>FROM:</dt><dd>{cur.from.name}{cur.from.addr ? <span className="dm-addr"> &lt;{cur.from.addr}&gt;</span> : null}</dd>
        <dt>TO:</dt><dd>SUBJECT {String(caseId).slice(-4)} &lt;{String(caseId).toLowerCase()}@citizens.dept.hvi&gt;</dd>
        <dt>DATE:</dt><dd>{fmtWhen(cur.at)}</dd>
        <dt>SUBJECT:</dt><dd><h2 className="dm-subject">{cur.subject}</h2></dd>
      </dl>
      <div className="dm-body">{cur.body.map((p, i) => <p key={i}>{p}</p>)}</div>
      {cur.action && <p className="dm-act"><a className="dm-btn dm-btn-go" href={cur.action.href}>{cur.action.label}</a></p>}
    </article>
  ) : (!narrow && <div className="dm-read dm-read-empty"><p>SELECT A LETTER. THE DEPARTMENT HAS ALREADY READ IT.</p></div>);

  const toolbar = (
    <div className="dm-tools" role="toolbar" aria-label="Mail">
      {narrow && cur && <button type="button" className="dm-btn" onClick={() => { setSel(null); setTimeout(() => listRef.current?.querySelector("button")?.focus(), 0); }}>&lt; BACK</button>}
      <button type="button" className="dm-btn" onClick={refresh} disabled={busy}>CHECK MAIL</button>
      {cur && <button type="button" className="dm-btn" onClick={() => op(cur.read ? "unread" : "read", cur.id)}>{cur.read ? "MARK UNREAD" : "MARK READ"}</button>}
      {cur && <button type="button" className="dm-btn" onClick={() => arch(cur)}>{cur.archived ? "UNARCHIVE" : "ARCHIVE"}</button>}
      {cur && <button type="button" className="dm-btn" onClick={() => del(cur)} aria-keyshortcuts="Delete">DELETE</button>}
      {!cur && folder !== "archive" && (v?.counts?.[folder]?.unread || 0) > 0 && <button type="button" className="dm-btn" onClick={() => op("readall", folder, { text: "ALL MARKED READ. THE DEPARTMENT ASSUMES YOU AGREE." })}>MARK ALL READ</button>}
      {onClose && <button type="button" className="dm-btn dm-close-btn" onClick={onClose}>{closeLabel}</button>}
    </div>
  );

  return (
    <section className={`dm-win${narrow ? " narrow" : ""}`} aria-label="Department Mail">
      <div className="dm-title"><Px name="mail" size={16} /><h1 className="dm-title-t">{title}</h1>{onClose && <button type="button" className="dm-x" onClick={onClose} aria-label={closeLabel}>×</button>}</div>
      {toolbar}
      {err && <p className="dm-err" role="alert">{err}</p>}
      {narrow ? (
        cur ? reading : <>{folders}{messages}</>
      ) : (
        <div className="dm-panes">{folders}<div className="dm-right">{messages}{reading}</div></div>
      )}
      <div className="dm-status" role="status" aria-live="polite">
        <span>{line?.text || (v ? `${(v.mail || []).length} LETTERS ON FILE, ${unread} UNREAD. NEW POST ARRIVES WITH THE DAY'S PAPER.` : "CONNECTING")}</span>
        {line?.undo && <button type="button" className="dm-link" onClick={() => op("restore", line.undo, { text: "RESTORED. THE SHREDDER WAS PATIENT." })}>UNDO</button>}
      </div>
    </section>
  );
}

// ---- the desktop (the flat's PC, THE TERMINAL's public PCs) -------------------------------------------
function useDeck(caseId, on) {
  const [deck, setDeck] = useState(() => { const lv = caseId ? lastView(caseId) : null; return Boolean(lv?.items?.some(i => i?.kind === "furn" && /^(deck|deck-eb|card-table|poker-table)$/.test(i.ref))); });
  useEffect(() => {
    if (!on || !caseId) return undefined;
    let off = false;
    loadShops(caseId).then(v => { if (!off) setDeck(Boolean(v?.items?.some(i => i?.kind === "furn" && /^(deck|deck-eb|card-table|poker-table)$/.test(i.ref)))); }).catch(() => {});
    return () => { off = true; };
  }, [caseId, on]);
  return deck;
}
const PC_NAME = { beige: "BEIGE PC", rig: "GAMING RIG", rack: "SERVER RACK" };
function Desktop({ caseId, at, pc }) {
  const [win, setWin] = useState(null);           // "mail" when the client is open
  const [unread, setUnread] = useState(null);
  const [startOpen, setStartOpen] = useState(false);
  const [now, setNow] = useState(() => new Date());
  const deck = useDeck(caseId, at === "home");
  useEffect(() => { const t = setInterval(() => setNow(new Date()), 20_000); return () => clearInterval(t); }, []);
  useEffect(() => { if (!caseId) return undefined; let off = false; loadMail(caseId).then(v => { if (!off) setUnread(v.unread); }).catch(() => {}); return () => { off = true; }; }, [caseId, win]);
  const icons = [
    { id: "mail", label: `DEPARTMENT MAIL${unread ? ` (${unread})` : ""}`, aria: `Department Mail${unread ? `, ${unread} unread` : ""}`, open: () => setWin("mail") },
    { id: "paper", label: "THE PAPER", aria: "The Daily Compliance", href: "#paper" },
    { id: "market", label: "THE MARKET", aria: "The Market", href: "#market" },
    ...(at === "home" && deck ? [{ id: "cards", label: "SOLITAIRE", aria: "Solitaire", href: "#cards/solitaire" }] : []),
    { id: "off", label: at === "terminal" ? "LOG OFF" : "SHUT DOWN", aria: at === "terminal" ? "Log off and leave the Terminal" : "Shut down and go back to your flat", href: at === "terminal" ? "#city/coast/sams-pizza" : "#city" },
  ];
  const where = at === "terminal" ? "PUBLIC TERMINAL 03 // THE TERMINAL, BOARDWALK EAST // SESSIONS LOGGED" : `${PC_NAME[pc]} // ISSUED BY THE DEPARTMENT // YOUR FLAT`;
  return (
    <div className={`dm-crt pc-${at === "terminal" ? "public" : pc}`}>
      <div className="dm-screen">
        <div className="dm-desk" role="region" aria-label={at === "terminal" ? "Public PC desktop" : `${PC_NAME[pc]} desktop`}>
          <ul className="dm-icons" role="list">
            {icons.map(ic => (
              <li key={ic.id}>
                {ic.href
                  ? <a className="dm-icon" href={ic.href} aria-label={ic.aria}><Px name={ic.id} /><span>{ic.label}</span></a>
                  : <button type="button" className="dm-icon" onClick={ic.open} onDoubleClick={ic.open} aria-label={ic.aria}><Px name={ic.id} /><span>{ic.label}</span></button>}
              </li>
            ))}
          </ul>
          {!caseId && <div className="dm-logon dm-win"><div className="dm-title"><h1 className="dm-title-t">LOG ON TO THE DEPARTMENT</h1></div><div className="dm-pad"><p>ENTER YOUR CASE NUMBER. THIS PC FORGETS NOTHING, BUT IT HAS NOT MET YOU.</p><CaseLogon autoFocus /></div></div>}
          {caseId && win === "mail" && <div className="dm-float"><MailClient caseId={caseId} onClose={() => setWin(null)} /></div>}
        </div>
        <div className="dm-task">
          <button type="button" className="dm-start" aria-expanded={startOpen} onClick={() => setStartOpen(o => !o)}><b>START</b></button>
          {win === "mail" && <button type="button" className="dm-taskbtn on" onClick={() => setWin(null)}>DEPARTMENT MAIL</button>}
          <span className="dm-clock" aria-label="Clock">{now.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false })}</span>
          {startOpen && (
            <ul className="dm-startmenu" role="list">
              <li className="dm-side" aria-hidden="true">DEPARTMENT 98</li>
              {icons.map(ic => <li key={ic.id}>{ic.href ? <a href={ic.href} onClick={() => setStartOpen(false)}><Px name={ic.id} size={16} /> {ic.label}</a> : <button type="button" onClick={() => { setStartOpen(false); ic.open(); }}><Px name={ic.id} size={16} /> {ic.label}</button>}</li>)}
            </ul>
          )}
        </div>
      </div>
      <div className="dm-bezel-label" aria-hidden="true">{where}</div>
    </div>
  );
}

export default function Mail({ route }) {
  const { at, pc } = parseMail(route);
  const [caseId, setCaseId] = useState(() => readCaseId());
  useEffect(() => { const on = (e) => setCaseId(e.detail || readCaseId()); window.addEventListener("hvi-case", on); return () => window.removeEventListener("hvi-case", on); }, []);
  if (at) return <Desktop caseId={caseId} at={at} pc={pc} />;
  if (!caseId) return (
    <section className="dm-win dm-logon-page" aria-label="Department Mail">
      <div className="dm-title"><Px name="mail" size={16} /><h1 className="dm-title-t">DEPARTMENT MAIL</h1></div>
      <div className="dm-pad"><p>THE MAIL ROOM HOLDS POST FOR FILES ONLY. ENTER YOUR CASE NUMBER, OR <a href="#intake">GET EVALUATED</a> AND RECEIVE A FILE, AND THEN POST.</p><CaseLogon onRestored={(id) => setCaseId(id)} autoFocus /></div>
    </section>
  );
  return <MailClient caseId={caseId} onClose={() => { window.location.hash = "#file"; }} closeLabel="BACK TO MY FILE" />;
}
