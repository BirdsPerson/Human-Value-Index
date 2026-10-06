// THE MALL on the page (enterprise.js has the rules, enterpriseClient.js the day's block): the
// BUSINESS card (a storefront tapped in the city, a row of the register), the SMALL BUSINESS
// REGISTER (#enterprise and #city/enterprise), the satisfaction line on a subject's file, and
// the district's shops in its civic record. docs/CITY_SPEC.md "THE MALL".
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Frame, Button } from "../ui/index.js";
import { DISTRICT, clockAt } from "./simApi.js";
import { UNITS, SHOP_TYPES, LOW_SAT, STREAK_DAYS, LOSS_DAYS, MAX_OPEN } from "./enterprise.js";
import { enterpriseOf, bizById, unitView, roleOf, satisfactionLine } from "./enterpriseClient.js";
import { UNIT_IDS } from "./storefrontSim.js";
import { ireneMusic } from "./storefrontDraw.js";
import { proprietorOf } from "./proprietors.js";   // GOODNIGHT IRENE'S: its proprietor on record
import { PLAZA_ID, PLAZA_DAY } from "./shorePlaza.js";
import { injectPrefectStyles } from "./PrefectPanel.jsx";   // the register's rows are the prefects' rows

// Open a card from anywhere: {unit} | {id} (a licence) | {landmark: "sams-pizza" | "goodnight-irenes"}
export function openBusiness(spec) {
  if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent("hvi-business", { detail: spec }));
}
// The toolbar's buttons for a building (CityIso): a storefront's business, a landmark's card.
export function storeButtons(buildingId) {
  if (UNITS[buildingId]) return [{ label: "BUSINESS", aria: "Open the business file for this storefront", spec: { unit: buildingId } }];
  // THE SHORE PLAZA holds both landmarks: Sam's at the street, Irene's upstairs
  if (buildingId === PLAZA_ID) return [{ label: "SAM'S", aria: "Open the landmark file: SAM'S PIZZA PALACE", spec: { landmark: "sams-pizza" } }, { label: "IRENE'S", aria: "Open the landmark file: GOODNIGHT IRENE'S", spec: { landmark: "goodnight-irenes" } }];
  return [];
}

export function useEnterprise() {
  const [, setV] = useState(0);
  useEffect(() => {
    const on = () => setV(x => x + 1);
    window.addEventListener("hvi-plans", on);
    window.addEventListener("hvi-sectors", on);
    const iv = setInterval(() => { if (!document.hidden) on(); }, 15000);
    return () => { window.removeEventListener("hvi-plans", on); window.removeEventListener("hvi-sectors", on); clearInterval(iv); };
  }, []);
  const c = clockAt(Date.now());
  return { block: enterpriseOf(c.day), day: c.day, hour: c.hour, mt: c.mt };
}

const LANDMARKS = {
  "sams-pizza": {
    name: "SAM'S PIZZA PALACE", where: "THE SHORE PLAZA, STREET LEVEL, ON THE BOARDS, THE COAST",
    lines: ["A BOARDWALK PIZZA COUNTER, OPEN TO THE BOARDS, AT THE FOOT OF THE SHORE PLAZA, AS THE REAL ONE IS. A LANDMARK. NOT OWNED BY ANY SUBJECT. NOT FOR SALE. IT NEVER CLOSES.",
      "AFTER THE WILDWOOD BOARDWALK INSTITUTION (SINCE 1957), WHICH LENT THE CITY ITS NAME. THE DEPARTMENT ASSESSES EVERYTHING IN THE SUBSTRATE EXCEPT THIS COUNTER.",
      "STAFFED BY ITS REGULARS: THE COUNTER HANDS ARE DRAFTED FROM THE LABOUR POOL, A FEW AT A TIME. THE QUEUE FORMS ON ITS OWN."],
    hours: "WHENEVER THE BOARDWALK IS OUT", sound: "WATCH THE TRAM CAR, PLEASE.",
  },
  "goodnight-irenes": {
    name: "GOODNIGHT IRENE'S", where: "THE SHORE PLAZA, THE TWO FLOORS OVER SAM'S, THE COAST",
    lines: ["A BREWERY AND BREWPUB: THE BREWHOUSE ON THE FIRST FLOOR (MASH TUN, KETTLE, FERMENTERS, BRIGHT TANKS, THE MALT, THE KEGS), THE TAPROOM OVER IT (THE BAR, THE TAPS, THE BRICK OVEN, THE STAGE). A LANDMARK. NEVER CLOSES.",
      "AN AFFECTIONATE HOMAGE TO THE WILDWOOD BREWPUB. THE DEPARTMENT DOES NOT ASSESS THE TAPS. IT HAS TRIED.",
      "OPEN EVENINGS, LATE. LIVE MUSIC IN THE CORNER ON THURSDAY, FRIDAY AND SATURDAY NIGHTS (MACHINE CALENDAR)."],
    hours: "EVENINGS, LATE", sound: null,
  },
};

const BARS = "▁▂▃▄▅▆▇█";
const spark = (xs) => { if (!xs?.length) return "—"; const m = Math.max(1, ...xs.map(Math.abs)); return xs.map(x => BARS[Math.max(0, Math.min(7, Math.round((Math.max(0, x) / m) * 7)))]).join(""); };
const hoursOf = (type) => (SHOP_TYPES[type]?.shift === "evening" ? "12:00 TO MIDNIGHT" : "09:00 TO 19:00");
const where = (u) => `${UNITS[u]?.name}, ${DISTRICT[UNITS[u]?.district]?.name}`;
const findHref = (key) => `#city?find=${encodeURIComponent(key)}`;
const STATUS_LINE = {
  NEW: "NEW. THE PAINT IS WET. SO IS THE OWNER.", TRADING: "TRADING. THE DEPARTMENT IS WATCHING THE BOOKS.",
  THRIVING: "THRIVING. THE DEPARTMENT WILL BE IN TOUCH ABOUT THE TAX.", STRUGGLING: "STRUGGLING. THE SHUTTERS HAVE BEEN MEASURED.",
  CLOSED: "CLOSED. THE DEPARTMENT EXPECTED THIS.",
};

function useDialog(onClose) {
  const closeRef = useRef(null);
  useEffect(() => {
    const prev = document.activeElement, root = document.getElementById("root");
    if (root) root.inert = true;
    closeRef.current?.focus();
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => { window.removeEventListener("keydown", onKey); if (root) root.inert = false; if (prev?.focus) prev.focus(); };
  }, [onClose]);
  return closeRef;
}

export function BusinessCard({ spec, onClose }) {
  const { block, day, hour, mt } = useEnterprise();
  const closeRef = useDialog(onClose);
  let kind, title, body;
  const lm = spec.landmark && LANDMARKS[spec.landmark];
  if (lm) {
    kind = `LANDMARK FILE // ${lm.where}`; title = lm.name;
    const music = spec.landmark === "goodnight-irenes" && ireneMusic(mt);
    body = <>
      {lm.lines.map(l => <div key={l} className="hvi-civic-line">{l}</div>)}
      <div className="hvi-civic-kv" style={{ margin: "var(--s3) 0", gridTemplateColumns: "12ch minmax(0, 1fr)" }}>
        <span className="k">HOURS</span><span className="v">{lm.hours}</span>
        <span className="k">STATUS</span><span className="v"><b>OPEN.</b> A LANDMARK DOES NOT CLOSE.{music ? " LIVE MUSIC TONIGHT. THE CROWD IS CHEERING. THE CHEERING IS LOGGED." : ""}</span>
        {proprietorOf(spec.landmark) && <><span className="k">PROPRIETOR</span><span className="v"><a href={findHref(proprietorOf(spec.landmark).id)} onClick={onClose}>{proprietorOf(spec.landmark).name}</a>. ON RECORD. NO TAKINGS ARE COUNTED YET; WHEN THE LADDER OPENS, THE RECORD CARRIES OVER.</span></>}
        {day < PLAZA_DAY && <><span className="k">MOVING</span><span className="v">INTO THE SHORE PLAZA ON MACHINE DAY {PLAZA_DAY}. UNTIL THEN AT ITS OLD LOT ON THE BOARDS.</span></>}
        {lm.sound && <><span className="k">HEARD</span><span className="v">"{lm.sound}"</span></>}
      </div>
    </>;
  } else {
    const v = spec.unit ? unitView(spec.unit, block, hour) : null;
    const b = spec.id ? bizById(block, spec.id) : v?.biz;
    if (!b) {
      const u = UNITS[spec.unit];
      kind = `STOREFRONT // ${u ? where(spec.unit) : "UNKNOWN UNIT"}`; title = u ? `${u.name}: TO LET` : "UNIT NOT ON FILE";
      body = <>
        <div className="hvi-civic-line">VACANT. A SUBJECT WITH A HEAD FOR TRADE WHO HAS BEEN UNHAPPY AT AN ASSIGNED POST FOR {STREAK_DAYS} WORKING DAYS MAY QUIT AND OPEN HERE. AT MOST {MAX_OPEN} LICENCES ARE ISSUED A DAY.</div>
        <div className="hvi-city-note" style={{ margin: "var(--s3) 0" }}>{block ? "APPLY: DISSATISFACTION. THE DEPARTMENT WILL KNOW." : "THE REGISTER FOR TODAY IS STILL BEING COUNTED."}</div>
      </>;
    } else {
      const closed = b.status === "CLOSED", t = SHOP_TYPES[b.type], open = !closed && (v ? v.open : true);
      kind = `BUSINESS FILE // DEPT LICENSE ${b.id} // ${DISTRICT[UNITS[b.units[0]]?.district]?.name}`; title = b.title;
      body = <>
        <div className="hvi-civic-line"><b>{STATUS_LINE[b.status] || b.status}</b>{!closed ? ` ${open ? "OPEN NOW." : `CLOSED NOW. OPEN ${hoursOf(b.type)}.`}` : ""}</div>
        <div className="hvi-civic-kv" style={{ margin: "var(--s3) 0", gridTemplateColumns: "10ch minmax(0, 1fr)" }}>
          <span className="k">OWNER</span><span className="v"><a href={findHref(b.owner)} onClick={onClose}>{String(b.who).toUpperCase()}</a>{b.quit ? `, WHO QUIT AS ${String(b.quit).toUpperCase()}` : ""}.</span>
          <span className="k">TRADE</span><span className="v">{t?.label}. {b.why ? `PROFILE ON FILE: ${b.why}.` : ""}</span>
          <span className="k">LICENCE</span><span className="v">{b.grant ? `${b.grant}: A ONE-TIME GRANT OF THE DEPARTMENT.` : `ISSUED ON MACHINE DAY ${b.opened}, BY THE RULES.`}</span>
          <span className="k">OPENED</span><span className="v">MACHINE DAY {b.opened}{closed ? `. CLOSED DAY ${b.closed} (${b.reason}).` : ` (${Math.max(0, day - b.opened)} DAYS TRADING).`}</span>
          <span className="k">PREMISES</span><span className="v">{(b.units || []).map(where).join(" // ")}{b.units?.length > 1 ? ". A SECOND LOCATION. GROWTH IS PERMITTED. FOR NOW." : ""}</span>
          {!closed && <><span className="k">STAFF</span><span className="v">{b.staff?.length ? b.staff.map(([k, n], i) => <span key={k}>{i ? ", " : ""}<a href={findHref(k)} onClick={onClose}>{String(n).toUpperCase()}</a></span>) : "THE OWNER, ALONE BEHIND THE COUNTER."}</span></>}
          {!closed && <><span className="k">TAKINGS</span><span className="v"><span aria-hidden="true">{spark(b.takings)}</span> {b.takings?.length ? `${b.takings[b.takings.length - 1]} CR YESTERDAY, ${b.takings.reduce((a, x) => a + x, 0)} CR THIS WEEK` : "NONE YET. THE FIRST DAY IS COUNTED TOMORROW."}</span></>}
          {!closed && b.profit?.length > 0 && <><span className="k">PROFIT</span><span className="v">{b.profit.map(p => (p >= 0 ? `+${p}` : p)).join(" ")} CR. {b.profit.filter(p => p < 0).length} LOSING DAY{b.profit.filter(p => p < 0).length === 1 ? "" : "S"} OF THE LAST {b.profit.length}; {LOSS_DAYS} OF 7 AND IT CLOSES.</span></>}
          {!closed && b.visits?.length > 0 && <><span className="k">FOOT TRAFFIC</span><span className="v">{b.visits[b.visits.length - 1]} VISITS YESTERDAY. EVERY VISIT IS LOGGED.</span></>}
          {closed && <><span className="k">TOTAL</span><span className="v">{b.total} CR TAKEN OVER ITS LIFE. THE OWNER RETURNS TO THEIR ASSIGNED POST.</span></>}
        </div>
      </>;
    }
  }
  return createPortal(
    <div className="hvi-card-overlay" onClick={onClose}>
      <div className="hvi-card-panel" role="dialog" aria-modal="true" aria-labelledby="hvi-biz-name" onClick={e => e.stopPropagation()}>
        <div className="hvi-card-body">
          <div className="hvi-card-top">
            <span className="hvi-card-kind"><span className="where">{kind}</span>THE SMALL BUSINESS REGISTER // {block ? `MACHINE DAY ${block.day}` : "BEING COUNTED"}</span>
            <Button ref={closeRef} variant="back" onClick={onClose} aria-label="Close the business file">Close</Button>
          </div>
          <h2 className="hvi-card-name" id="hvi-biz-name">{title}</h2>
          {body}
          <div className="hvi-city-note" style={{ margin: "var(--s3) 0 var(--s5)" }}><a href="#enterprise" onClick={onClose}>THE SMALL BUSINESS REGISTER</a>: EVERY LICENCE, EVERY CLOSURE.</div>
        </div>
      </div>
    </div>,
    document.body,
  );
}

// Listens for openBusiness anywhere on the city page (mounted once by City.jsx).
export function BusinessHost() {
  const [spec, setSpec] = useState(null);
  useEffect(() => {
    const on = (e) => { if (e.detail) setSpec(e.detail); };
    window.addEventListener("hvi-business", on);
    if (import.meta.env?.DEV) window.__hviBusiness = openBusiness;
    return () => window.removeEventListener("hvi-business", on);
  }, []);
  return spec ? <BusinessCard spec={spec} onClose={() => setSpec(null)} /> : null;
}

// #enterprise: THE SMALL BUSINESS REGISTER
export function EnterprisePage() {
  const { block } = useEnterprise();
  useEffect(() => { injectPrefectStyles(); injectEnterpriseStyles(); }, []);
  if (!block) {
    return (
      <Frame title="THE SMALL BUSINESS REGISTER" meta="BEING COUNTED" className="hvi-civic">
        <div className="hvi-civic-line">THE REGISTER IS KEPT WITH EACH MACHINE DAY'S PLAN. TODAY'S HAS NOT BEEN POSTED. THE STOREFRONTS ARE STANDING; THE DEPARTMENT IS COUNTING WHO IS UNHAPPY ENOUGH TO TRADE IN THEM.</div>
        <Rules />
      </Frame>
    );
  }
  const open = block.biz.slice().sort((a, b) => a.id < b.id ? -1 : 1);
  const newest = block.biz.slice().sort((a, b) => b.opened - a.opened || (a.id < b.id ? 1 : -1)).slice(0, 5);
  const toLet = UNIT_IDS.filter(u => block.units[u]?.s === "TO LET");
  const row = (b, note) => (
    <button key={b.id + note} type="button" role="listitem" className="hvi-pf-row" onClick={() => openBusiness({ id: b.id })} aria-label={`${b.title} Licence ${b.id}. ${note}. Open the business file.`}>
      <span className="hvi-ent-lic" style={{ borderColor: SHOP_TYPES[b.type]?.awning }}>{b.id}</span>
      <span className="hvi-pf-txt">
        <b style={{ color: SHOP_TYPES[b.type]?.awning ? undefined : undefined }}>{b.title}</b>
        <span className="dim">{String(b.who).toUpperCase()} // {SHOP_TYPES[b.type]?.label} // {(b.units || []).map(where).join(" + ")}</span>
        <span>{note}</span>
      </span>
    </button>
  );
  return (
    <Frame title="THE SMALL BUSINESS REGISTER" meta={`MACHINE DAY ${block.day} // ${block.biz.length} OPEN // ${block.licences} LICENCES ISSUED // ${block.closures} CLOSED`} className="hvi-civic">
      <div className="hvi-civic-line">WHEN A SUBJECT IS UNHAPPY AT ITS ASSIGNED POST LONG ENOUGH, AND HAS THE HEAD FOR IT, IT QUITS AND OPENS A SHOP. THE DEPARTMENT ISSUES THE LICENCE. THE STREET DECIDES THE REST. {block.counting} SUBJECT{block.counting === 1 ? " IS" : "S ARE"} COUNTING THE DAYS RIGHT NOW.</div>
      {(block.events || []).length > 0 && <div className="hvi-civic-line"><b>AT TODAY'S BOUNDARY:</b> {block.events.map(e => { const b = bizById(block, e.id); return b ? `${e.k === "open" ? "OPENED" : e.k === "close" ? "CLOSED" : e.k === "hire" ? "HIRED AT" : "EXPANDED"} ${b.sign}` : null; }).filter(Boolean).join(" // ")}.</div>}
      <div className="hvi-city-room-h">OPEN FOR BUSINESS ({open.length})</div>
      {open.length ? <div className="hvi-pf-list" role="list">{open.map(b => row(b, `${b.status} // OPENED DAY ${b.opened} // ${b.staff.length} STAFF // ${b.takings.length ? `${b.takings[b.takings.length - 1]} CR YESTERDAY` : "FIRST DAY"}`))}</div>
        : <div className="hvi-city-note">NOTHING TRADING. THE DISSATISFIED ARE STILL COUNTING.</div>}
      <div className="hvi-city-room-h">NEWEST OPENINGS</div>
      {newest.length ? <div className="hvi-pf-list" role="list">{newest.map(b => row(b, `OPENED MACHINE DAY ${b.opened}${b.grant ? ` // ${b.grant}` : ""} // QUIT AS ${String(b.quit).toUpperCase()}`))}</div> : <div className="hvi-city-note">NONE YET.</div>}
      <div className="hvi-city-room-h">CLOSURES</div>
      {block.closed.length ? <div className="hvi-pf-list" role="list">{block.closed.slice().reverse().map(c => row({ ...c }, `CLOSED MACHINE DAY ${c.closed} (${c.reason}) // TRADED ${c.closed - c.opened} DAYS // ${c.total} CR. THE DEPARTMENT EXPECTED THIS.`))}</div>
        : <div className="hvi-city-note">NO CLOSURES ON RECORD. THE DEPARTMENT IS PATIENT.</div>}
      <div className="hvi-city-room-h">TO LET ({toLet.length} OF {UNIT_IDS.length} UNITS)</div>
      <div className="hvi-civic-line">{toLet.length ? toLet.map(where).join(" // ") : "EVERY STOREFRONT IS LET. THE NEXT SUBJECT WILL HAVE TO WAIT FOR A CLOSURE."}</div>
      <div className="hvi-city-room-h">LANDMARKS</div>
      <div className="hvi-pf-list" role="list">
        {Object.entries(LANDMARKS).map(([id, l]) => (
          <button key={id} type="button" role="listitem" className="hvi-pf-row" onClick={() => openBusiness({ landmark: id })} aria-label={`${l.name}, a landmark. Open its file.`}>
            <span className="hvi-ent-lic">★</span>
            <span className="hvi-pf-txt"><b>{l.name}</b><span className="dim">{l.where}</span><span>A LANDMARK. NEVER CLOSES. NOT ON THE REGISTER'S BOOKS.{proprietorOf(id) ? ` ${proprietorOf(id).label}.` : ""}</span></span>
          </button>
        ))}
      </div>
      <Rules />
    </Frame>
  );
}
function Rules() {
  return <>
    <div className="hvi-city-room-h">THE RULES (THE DEPARTMENT'S, NOT YOURS)</div>
    <div className="hvi-civic-fx">SATISFACTION, 0 TO 100, EVERY WORKING DAY: FIT (THE POST AGAINST THE RECORD), PAY (THE RUNG), THE COMMUTE, THE DISTRICT'S MOOD, FRIENDS AT WORK.</div>
    <div className="hvi-civic-fx">UNDER {LOW_SAT} ON {STREAK_DAYS} WORKING DAYS, WITH A HEAD FOR TRADE (BUSINESS, FINANCE OR MANAGEMENT ON THE RECORD; COMPETENT, CONNECTED AND ADAPTABLE; OR A RECORD THAT FITS A TRADE): THE SUBJECT QUITS AND OPENS A SHOP OF ITS KIND, IN A VACANT UNIT OF A DISTRICT THAT SUITS IT. ONLY THE LIVING OPEN SHOPS.</div>
    <div className="hvi-civic-fx">STAFF ARE HIRED FROM THE DISSATISFIED. TAKINGS ARE FOOT TRAFFIC TIMES FIT. {LOSS_DAYS} LOSING DAYS OF 7 AND IT CLOSES; THE OWNER RETURNS TO THE ASSIGNED POST. A THRIVING SHOP HIRES, AND MAY OPEN A SECOND LOCATION.</div>
    <div className="hvi-civic-fx">ALL OF IT TAKES EFFECT AT A DAY BOUNDARY. A PUBLISHED DAY NEVER CHANGES.</div>
  </>;
}

// On a subject's file: SATISFACTION: 34 // MISFILED. THE DEPARTMENT IS AWARE.; and their shop, if any.
export function EnterpriseLine({ subject }) {
  const { block } = useEnterprise();
  const sat = satisfactionLine(subject), role = roleOf(subject, block);
  if (!sat && !role) return null;
  const F = sat?.row;
  return (
    <div className="hvi-civic-line" style={{ marginTop: "var(--s2)" }}>
      {sat && <div><b>SATISFACTION: {sat.score}</b> // {sat.word}</div>}
      {F && <div className="dim" style={{ fontSize: "var(--t-xs)" }}>FIT {F[1]} // PAY {F[2]} // COMMUTE {F[3]} // MOOD {F[4]} // FRIENDS AT WORK {F[5]}{F[6] & 1 ? " // A REST DAY: NOT COUNTED" : ""}</div>}
      {role && <div>{role.role === "owner" ? "PROPRIETOR" : "SHOP HAND"}, <a href="#enterprise" onClick={(e) => { e.preventDefault(); openBusiness({ id: role.biz.id }); }}>{role.biz.sign} ({role.biz.label})</a>{role.role === "owner" && role.biz.quit ? `. QUIT AS ${String(role.biz.quit).toUpperCase()}.` : "."}</div>}
    </div>
  );
}

let styled = false;
export function injectEnterpriseStyles() {
  if (styled || typeof document === "undefined") return;
  styled = true;
  const el = document.createElement("style");
  el.textContent = `
  .hvi-ent-lic { flex: none; min-width: 5ch; text-align: center; border: 1px solid var(--line-hi, #2f6a42); border-left-width: 3px; padding: 2px 4px; color: var(--accent); }
  `;
  document.head.appendChild(el);
}
