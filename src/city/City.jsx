import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { pad, padL } from "../term.jsx";
import { Frame, Button, ButtonRow, Disclosure, ListRow } from "../ui/index.js";
import { SubjectCard, injectPenStyles } from "../Pen.jsx";
import { DISTRICTS, DISTRICT, BUILDING, TRAIN, STATIONS, PLACES, GAMES, GAME_VENUE, districtCap, clockAt, whereOf, atDistrict, isOnLoop, setClockOffset, offsetFor, jobLine, loopEvents, roomIn, gameAt, gameEvents } from "./simApi.js";
import { covers } from "./sim.js";
import { crowdAt, summaryCounts } from "./crowd.js";
import { clockLine, paLine } from "./cityKit.js";
import { useRoster } from "./useRoster.js";
import { clearBank } from "./spriteBank.js";
import { injectCityStyles, CityHeader, Breadcrumb, Occupant, MapKey } from "./cityUi.jsx";
import CityMap from "./CityMap.jsx";
import City3D, { ViewToggle, useCityViewMode } from "./City3D.jsx";
import Street from "./Street.jsx";
import CityIso from "./CityIso.jsx";
import DistrictView from "./DistrictView.jsx";
import BuildingView from "./BuildingView.jsx";
import { buildingHref, parseCityRoute } from "./city3d.js";
import { readCaseId } from "../caseFile.jsx";
import CityFind from "./CityFind.jsx";
import { buildIndex, bySlug, findHref } from "./find.js";
import { useQuests, QuestCardPanel } from "../QuestLog.jsx";
import { questsFor } from "../quests.js";
import SocialPanel from "./SocialPanel.jsx";
import { useSocial, ensureSocial } from "./socialClient.js";
import { ensurePlans, knownSubjects, summaryOf, completeAt, checkDay, wantSectors, findBySlug, pinSubject, unpinSubject } from "./planClient.js";
// The districts with a ground (the Arena, the Sprawl's estate pitch), and the PA's sign-off
// under each kind of score.
const GAME_DISTRICTS = new Set(Object.keys(GAMES).map(id => PLACES[id].district));
const SCORE_TAG = {
  ball: "ATTENDANCE COUNTS TOWARDS YOUR FILE.", hoops: "THE SCORE IS UNOFFICIAL. YOURS IS NOT.",
  gridiron: "EVERY YARD IS MEASURED. SO IS THE CROWD.", soccer: "OFFSIDE IS A STATE OF MIND. THE DEPARTMENT HAS A STATE OF RECORD.",
};

// #city: the Substrate (STREET, the default; the 2D MAP; or the STACK of floor planes). #city/<district>: one district from the inside.
// #city/<district>/<building>[?floor=N]: one building in cross-section.
// The census (where everyone is, per the machine clock) is taken once a machine minute,
// which is once a real second, and shared by whichever view is open.

export default function City({ route }) {
  useEffect(() => { injectCityStyles(); injectPenStyles(); }, []);   // the pen styles carry the SubjectCard overlay
  // Leaving #city drops the painted sprite sheets; they are cheap to paint again.
  useEffect(() => () => clearBank(), []);
  const parsed = useMemo(() => parseCityRoute(route || ""), [route]);
  const districtId = parsed.districtId && DISTRICT[parsed.districtId] ? parsed.districtId : null;
  const b = districtId && parsed.buildingId && BUILDING[parsed.buildingId]?.districtId === districtId ? BUILDING[parsed.buildingId] : null;
  // HQ runs its own simulation (the Holding Pen): it has floors, but no view of them to focus.
  const floor = b && b.id !== "hq" && parsed.floor != null && b.floors[parsed.floor] ? parsed.floor : null;
  // The query minus the floor: what survives moving between views (?at=, ?stress=).
  const query = useMemo(() => {
    const q = new URLSearchParams(parsed.query.replace(/^\?/, ""));
    q.delete("floor"); q.delete("find");
    const s = q.toString();
    return s ? "?" + s : "";
  }, [parsed.query]);
  // Dev only: #city?at=10:00 jumps the machine clock to that hour, to inspect a shift;
  // &wd=6 to that hour on the next machine day with that weekday (a fixture's day).
  const at = useMemo(() => {
    const m = import.meta.env?.DEV && /[?&]at=(\d{1,2}):?(\d{2})?/.exec(query);
    const w = import.meta.env?.DEV && /[?&]wd=([1-7])/.exec(query);
    return m ? `${+m[1] % 24}:${+(m[2] || 0)}:${w ? +w[1] : 0}` : "";
  }, [query]);
  const [offsetV, setOffsetV] = useState(0);
  useEffect(() => {
    const [hh, mm, wd] = at ? at.split(":").map(Number) : [];
    setClockOffset(at ? offsetFor(hh, mm, Date.now(), wd || null) : 0);
    setOffsetV(v => v + 1);
    return () => setClockOffset(0);
  }, [at]);
  const { roster, census, mode: dataMode } = useRoster();
  const sectors = dataMode === "sectors";
  // FIND: the census index is built when the roster changes, never per frame. #city?find=<slug>
  // (a pick, or a shared link) flies the CITY view's camera to that subject and follows them.
  // With the city in sectors (planClient.js) nobody downloads the census: the search and a
  // link's subject come from /api/find, and a followed subject is pinned (its rows fetched
  // window by window as it crosses the city).
  const index = useMemo(() => buildIndex(roster), [roster]);
  const findSlug = useMemo(() => new URLSearchParams(parsed.query.replace(/^\?/, "")).get("find"), [parsed.query]);
  const [remoteFind, setRemoteFind] = useState(null);   // {slug, entry | null}
  useEffect(() => {
    if (!sectors || !findSlug) return;
    const local = bySlug(index, findSlug);
    if (local) { setRemoteFind({ slug: findSlug, entry: local }); return; }
    let off = false;
    findBySlug(findSlug.toLowerCase()).then(e => { if (!off) setRemoteFind({ slug: findSlug, entry: e }); });
    return () => { off = true; };
  }, [sectors, findSlug, index]);
  const findEntry = !findSlug ? null : sectors ? (remoteFind?.slug === findSlug ? remoteFind.entry : null) : bySlug(index, findSlug);
  const findPending = Boolean(findSlug && sectors && remoteFind?.slug !== findSlug);
  useEffect(() => { if (!findEntry?.s) return; pinSubject(findEntry.s); return () => { if (!findEntry.s.you) unpinSubject(findEntry.s); }; }, [findEntry]);
  const selfEntry = useMemo(() => index.find(e => e.s.you) || null, [index]);
  // A district or building page shows everyone in its district: load its window.
  useEffect(() => { wantSectors("page", districtId ? [districtId] : []); return () => wantSectors("page", []); }, [districtId]);
  const [findN, setFindN] = useState(0);
  const censusRef = useRef({ v: 0, t: 0, mt: null, list: [], districtCounts: {}, transit: 0 });
  const [stats, setStats] = useState(() => ({ districts: [], transit: 0, riders: [], waiting: 0, self: null, sig: "", buildings: {}, bsig: "" }));
  const statsRef = useRef(stats);
  const [card, setCard] = useState(null);
  const [k, setK] = useState(0);
  const [pa, setPa] = useState("");
  const hereRef = useRef(districtId); hereRef.current = districtId;

  useEffect(() => {
    function take() {
      const c = clockAt(Date.now());
      const counts = {}, bcounts = {}, waitAt = {};
      let transit = 0, waiting = 0, self = null, list, pop = roster.length;
      const riders = [];
      const count = (s, w) => {
        const at = atDistrict(w);
        if (isOnLoop(at)) { transit++; riders.push({ s, t: w.trainId, c: w.car }); }
        else counts[at] = (counts[at] || 0) + 1;
        if (w.sub === "waiting") { waiting++; waitAt[w.stationId] = (waitAt[w.stationId] || 0) + 1; }
        const r = roomIn(w, s);
        if (r) bcounts[r.buildingId] = (bcounts[r.buildingId] || 0) + 1;
        if (s.you) self = { s, at, w };
      };
      if (sectors && checkDay(c.mt) === "sectors") {
        // Everyone this browser holds, where the plan covers them (your own file even when
        // the plan does not hold it yet: the sim places it, as it always did), then the
        // summary's crowds in every district whose window is not loaded.
        const d0 = Math.floor(c.mt / 24), h = c.mt - d0 * 24, sum = summaryOf(d0 + 1), next = h > 23.5 ? summaryOf(d0 + 2) : null;
        const complete = completeAt(c.mt);
        list = [];
        for (const s of knownSubjects()) {
          if (!covers(s, c.mt) && !(s.you && !s.cj)) continue;
          const w = whereOf(s, c.mt);
          list.push({ s, w });
          count(s, w);
        }
        // Counts the page prints: the loaded districts exactly, the rest from the summary.
        if (sum) {
          const sc = summaryCounts(sum, h, next);
          pop = sum.n;
          for (const d of DISTRICTS) if (!complete.has(d.id)) counts[d.id] = sc.districts[d.id] || 0;
          for (const id of Object.keys(bcounts)) if (!complete.has(BUILDING[id]?.districtId)) delete bcounts[id];
          for (const [id, n] of Object.entries(sc.buildings)) if (!complete.has(BUILDING[id]?.districtId) && n) bcounts[id] = n;
          if (complete.size < DISTRICTS.length) {
            transit = sc.loop;
            waiting = DISTRICTS.reduce((n, d) => n + (complete.has(d.id) ? waitAt[d.id] || 0 : sc.waiting[d.id] || 0), 0);
          }
          list = list.concat(crowdAt(sum, h, complete, list, next));
        }
      } else {
        list = new Array(roster.length);
        for (let i = 0; i < roster.length; i++) {
          const s = roster[i], w = whereOf(s, c.mt);
          list[i] = { s, w };
          count(s, w);
        }
      }
      riders.sort((a, b) => (a.t < b.t ? -1 : a.t > b.t ? 1 : a.c - b.c));
      const prev = censusRef.current;
      censusRef.current = { v: prev.v + 1, t: performance.now(), mt: c.mt, list, districtCounts: counts, transit };
      // Inside a district, its own station's arrivals and departures are announced the
      // machine minute they happen; the rotation picks up again after.
      const here = hereRef.current;
      if (here && prev.mt != null && c.mt > prev.mt && c.mt - prev.mt < 0.5) {
        const ev = loopEvents(prev.mt, c.mt).filter(e => e.stationId === here).pop();
        if (ev) setPa(ev.text);
      }
      // Every ground's kickoff, scores and final whistle, on the map and in its own district.
      if ((!here || GAME_DISTRICTS.has(here)) && prev.mt != null && c.mt > prev.mt && c.mt - prev.mt < 0.5) {
        const gev = gameEvents(prev.mt, c.mt).filter(e => !here || PLACES[e.placeId]?.district === here).pop();
        if (gev) setPa(gev.text);
      }
      // Only what the page shows goes into React state: the counts and riders, and only when
      // they actually change (the clock ticks in its own component). The views read the
      // census from the ref.
      const sig = `${DISTRICTS.map(d => counts[d.id] || 0).join(",")}|${riders.map(r => r.s.name + r.t + r.c).join("\u0001")}|${transit}|${waiting}|${pop}|${self ? self.s.name + "@" + self.at + (self.w.buildingId || "") : ""}`;
      const bsig = Object.keys(bcounts).sort().map(id => id + bcounts[id]).join(",");
      const old = statsRef.current;
      let next = old.sig === sig ? old : { transit, riders, waiting, self, pop, sig, buildings: old.buildings, bsig: old.bsig, districts: DISTRICTS.map(d => ({ id: d.id, name: d.name, count: counts[d.id] || 0, cap: districtCap(d.id) })) };
      if (bsig !== old.bsig) next = { ...next, buildings: bcounts, bsig };
      if (next !== old) { statsRef.current = next; setStats(next); }
    }
    // The first census waits (briefly) for the social ledger and the day's published plan:
    // the ledger moves where friends spend their leisure, and the plan is the whole day
    // already built, so the first census costs a lookup instead of the roster's day build
    // on the main thread. Cached after the first visit, so this is instant from then on.
    let iv = 0, dead = false;
    const start = () => {
      if (dead || iv) return;
      take();
      iv = setInterval(() => { if (!document.hidden) take(); }, 1000);
    };
    // A district's window landing re-takes the census at once (its people replace its crowd).
    const now = () => { if (iv && !document.hidden) take(); };
    window.addEventListener("hvi-sectors", now);
    Promise.allSettled([ensureSocial(), ensurePlans()]).finally(start);
    const late = setTimeout(start, 1500);
    return () => { dead = true; clearTimeout(late); clearInterval(iv); window.removeEventListener("hvi-sectors", now); };
  }, [roster, offsetV, sectors]);

  // The PA rotates every eight seconds: every other line is the Loop's own announcement
  // (the latest at this district's station inside one, anywhere on the map).
  const social = useSocial();
  const socialRef = useRef(null);
  socialRef.current = social;
  useEffect(() => { const iv = setInterval(() => setK(x => x + 1), 8000); return () => clearInterval(iv); }, []);
  useEffect(() => {
    const clock = clockAt(Date.now()), st = { ...statsRef.current, clock }, mt = clock.mt, here = hereRef.current;
    const evs = loopEvents(mt - 8 / 60, mt + 1e-6).filter(e => !here || e.stationId === here);
    // Every third line is gossip from the social ledger, when there is any.
    const gossip = socialRef.current?.events || [];
    // While a fixture is on, every fourth line is the score (on the map and in its district).
    const games = Object.keys(GAMES).filter(id => !here || PLACES[id].district === here).map(id => gameAt(id, mt)).filter(Boolean);
    if (games.length && k % 4 === 1) { const g = games[Math.floor(k / 4) % games.length]; setPa(`${GAME_VENUE[g.placeId]}, ${g.name}: ${g.status}. ${SCORE_TAG[g.kind]}`); }
    else if (!here && gossip.length && k % 3 === 2) setPa(gossip[Math.floor(k / 3) % Math.min(gossip.length, 12)].text);
    else setPa(paLine(st, k, evs.length ? evs[evs.length - 1].text : null));
    // a new district re-reads its own station's line at once
  }, [k, roster, districtId]);

  // A new district or building starts at the top of the page (a focused floor then
  // scrolls itself into view: this runs first, as a layout effect).
  useLayoutEffect(() => { window.scrollTo(0, 0); }, [districtId, b?.id]);
  // Moving through the hierarchy unmounts whatever had focus (a list row, a breadcrumb, the
  // 3D floor list). When focus has fallen back to the page, put it on the breadcrumb's
  // "you are here", so keyboard and screen-reader users land on the new location. Not on
  // the first visit, and never away from a control that still holds focus.
  const placeKey = `${districtId}|${b?.id}|${floor}`;
  const lastPlace = useRef(placeKey);
  useEffect(() => {
    if (lastPlace.current === placeKey) return;
    lastPlace.current = placeKey;
    const a = document.activeElement;
    if (a && a !== document.body && a.isConnected) return;
    document.getElementById("hvi-city-here")?.focus({ preventScroll: true });
  }, [placeKey]);

  const go = useCallback((id) => { window.location.hash = (id ? `#city/${id}` : "#city") + query; }, [query]);
  const goBuilding = useCallback((d, bid, fl = null) => { window.location.hash = buildingHref(d, bid, fl, query); }, [query]);
  const onBuilding = useCallback((bid) => goBuilding(districtId, bid), [goBuilding, districtId]);
  const onFloor = useCallback((fl) => { if (b) window.location.replace(buildingHref(b.districtId, b.id, fl, query)); }, [b, query]);
  const open = useCallback((s) => setCard({ ...s }), []);
  const close = useCallback(() => setCard(null), []);
  const [mode, setMode] = useCityViewMode();
  // A find is shown in the CITY view: a pick (or a link) from MAP, STACK or STREET switches to it.
  useEffect(() => { if (findSlug && !districtId && mode !== "city") setMode("city"); }, [findSlug, districtId, mode, setMode]);
  const onPick = useCallback((e) => {
    const href = findHref(e.key, query);
    if (window.location.hash === href) setFindN(n => n + 1); else window.location.hash = href;
  }, [query]);
  const endFind = useCallback(() => { window.location.replace((window.location.href.split("#")[0]) + "#city" + query); }, [query]);
  const findKey = findEntry?.key;
  const find = useMemo(() => (findEntry ? { s: findEntry.s, key: findEntry.key, n: findN } : null), [findKey, findN]);   // eslint-disable-line react-hooks/exhaustive-deps
  const caseId = readCaseId();
  // Directives: a quest-giver's file carries its offer, or REPORT CONTACT inside its building.
  const quests = useQuests(readCaseId());
  // The open file does not re-render with the census clock.
  const cardEl = useMemo(() => card && (
    <SubjectCard subject={card} onClose={close} where="THE SUBSTRATE" back="Return subject to the Substrate" assignment={`ASSIGNMENT: ${jobLine(card)}`}
      extra={card.kind === "figure" && questsFor(card.slug).map(q => (
        <QuestCardPanel key={q.id} quests={quests} q={q} slug={card.slug} buildingId={b?.id || null} />
      ))} />
  ), [card, close, quests, b]);
  const d = districtId && DISTRICT[districtId];
  const here = d && stats.districts.find(x => x.id === d.id);
  const bn = b ? stats.buildings[b.id] || 0 : 0;
  const right = b
    ? b.id === "hq" ? `${b.addr} // 6F // CENSUS CLASSIFIED` : `${b.addr} // ${b.floors.length}F // ${bn} INSIDE`
    : d
      ? d.id === "hq" ? `${d.addr} // HOLDING PEN B // CENSUS CLASSIFIED` : `${d.addr} // ${here?.count ?? 0} ON SITE // CAP ${districtCap(d.id)}`
      : `POP ${stats.pop ?? roster.length} // ABOARD ${stats.transit} // ON PLATFORMS ${stats.waiting}${census === "down" ? " // CENSUS OFFLINE" : ""}`;

  const crumbs = [{ label: "CITY", go: () => go(null) }];
  if (d) crumbs.push({ label: d.name, go: () => go(d.id) });
  if (b) crumbs.push({ label: b.name, go: () => goBuilding(d.id, b.id) });
  if (b && floor != null) { const f = b.floors[floor]; crumbs.push({ label: `${f.code} ${f.name}` }); }
  const three = !d && mode === "stack";
  const street = !d && mode === "street";
  const iso = !d && mode === "city";

  const directory = (
    <div className="hvi-city-list" role="list" aria-label="District directory">
      {stats.districts.map(x => (
        <div key={x.id} role="listitem">
          <ListRow lead={pad(DISTRICT[x.id].addr, 7)} label={x.name} value={<span className={x.count > x.cap ? "over" : undefined}>{padL(x.count, 3)}/{x.cap}</span>}
            aria-current={x.id === districtId ? "true" : undefined} onClick={() => go(x.id)}
            aria-label={`${x.name}, ${x.count} present, capacity ${x.cap}. Enter district.`} />
        </div>
      ))}
    </div>
  );

  return (
    <div>
      <CityHeader clockText={<LiveClock />} right={right} pa={pa}
        find={<CityFind index={index} remote={sectors} onPick={onPick} self={selfEntry} caseId={caseId} />} />
      <div className="hvi-city-bar">
        <Breadcrumb crumbs={crumbs} />
        {!d && <ViewToggle mode={mode} onChange={setMode} />}
      </div>
      {findSlug && !findEntry && !findPending && census !== "pending" && (
        <div className="hvi-city-note" role="status">NO SUBJECT ON FILE AS "{findSlug.toUpperCase()}". THE DEPARTMENT HAS CHECKED. TWICE.</div>
      )}
      <Frame box title={b ? b.name : d ? d.name : iso ? "THE SUBSTRATE" : street ? "THE SUBSTRATE // STREET LEVEL" : three ? "THE SUBSTRATE // IN DEPTH" : "THE SUBSTRATE"}
        meta={b ? "CROSS-SECTION" : d ? "INTERIOR" : iso ? "DRAG // PINCH // TURN // TAP A BUILDING" : street ? "WALK // TURN // ENTER A DOOR" : three ? "DRAG TO TURN // TAP A BUILDING" : "DRAG // PINCH // TAP A DISTRICT"} flush>
        {b
          ? <BuildingView key={b.id} buildingId={b.id} floor={floor} censusRef={censusRef} onOpen={open} onFloor={onFloor} />
          : d
            ? <DistrictView key={d.id} districtId={d.id} censusRef={censusRef} onOpen={open} onBuilding={onBuilding} counts={stats.buildings} />
            : iso
              ? <CityIso censusRef={censusRef} onOpen={open} onEnter={goBuilding} find={find} onFindEnd={endFind} />
            : street
              ? <Street censusRef={censusRef} onOpen={open} onEnter={goBuilding} />
              : three
              ? <City3D censusRef={censusRef} onDistrict={go} onOpen={open} onFloor={goBuilding} query={query} />
              : <CityMap censusRef={censusRef} onDistrict={go} onOpen={open} />}
      </Frame>
      {!d && <MapKey />}
      {!d && !b && <SocialPanel />}
      <div className="hvi-city-help">
        {b
          ? b.id === "hq" ? "HEADQUARTERS RUNS ITS OWN SIMULATION. THE DEPARTMENT TRUSTS ONLY ITSELF." : "TAP A FLOOR TO FOCUS IT. HOVER A SUBJECT FOR ITS ASSIGNMENT; CLICK TO READ THE FILE. ON A PHONE: TAP TWICE."
          : d
            ? d.id === "hq" ? "HEADQUARTERS RUNS ITS OWN SIMULATION. THE DEPARTMENT TRUSTS ONLY ITSELF." : "ENTER A BUILDING ABOVE. HOVER A SUBJECT FOR ITS ASSIGNMENT; CLICK TO READ THE FILE. ON A PHONE: TAP TWICE. THE SUBJECT WILL NOT NOTICE. IT HAS NO SAY."
            : iso
              ? <>THE SUBSTRATE, FROM ABOVE. DRAG TO PAN, PINCH TO ZOOM<span className="hvi-desk-only"> (OR CLICK IT, THEN WHEEL)</span>, TURN IT WITH THE TURN KEYS<span className="hvi-desk-only"> OR Q AND E</span>. TAP A BUILDING TO OPEN IT: EVERY FLOOR, EVERY ROOM, EVERYONE INSIDE. LIT WINDOWS ARE OCCUPIED. EVERYONE HERE IS ON FILE. NOBODY IS TRYING TO LEAVE.</>
            : street
              ? <>THE SUBSTRATE AT STREET LEVEL. IT GIVES ITSELF A TOUR WHEN LEFT ALONE.<span className="hvi-desk-only"> CLICK THE VIEW, THEN W A S D OR THE ARROWS TO WALK; DRAG TO TURN; ENTER GOES INTO THE BUILDING AHEAD.</span> WALK INTO A DOOR TO GO IN. LIT WINDOWS ARE OCCUPIED. EVERYONE HERE IS ON FILE. NOBODY IS TRYING TO LEAVE.</>
              : three
              ? <>DRAG TO TURN THE CITY. PINCH OR WHEEL TO ZOOM. TAP A BUILDING TO OPEN IT, A FLOOR TO GO IN.<span className="hvi-desk-only"> BY KEYBOARD: [ AND ] OPEN THE NEXT BUILDING, ENTER CHOOSES A FLOOR.</span> A LIT PLATFORM HAS A TRAIN STANDING AT IT.</>
              : "EVERYONE HAS BEEN UPLOADED. EVERYONE HAS A JOB. THE LOOP RUNS ON TIME. ZOOM IN TO SEE FACES."}
      </div>
      {!d && <LoopPanel riders={stats.riders} aboard={stats.transit} waiting={stats.waiting} self={stats.self} onOpen={open} onDistrict={go} />}
      {d
        ? <Disclosure className="hvi-city-dir" title="DISTRICT DIRECTORY" meta={`${stats.districts.length} DISTRICTS`}>{directory}</Disclosure>
        : <Frame title="DISTRICT DIRECTORY" meta={`${stats.districts.length} ON RECORD`} className="hvi-city-dir">{directory}</Frame>}
      <ButtonRow split stackOnMobile>
        {b ? <Button variant="back" onClick={() => go(d.id)}>{d.name}</Button>
          : d ? <Button variant="back" onClick={() => go(null)}>The Substrate</Button>
            : <Button variant="back" className="hvi-city-menu-back" onClick={() => { window.location.hash = ""; }}>Main menu</Button>}
        <Button variant="secondary" href="#pen">Holding pen</Button>
      </ButtonRow>
      {cardEl}
    </div>
  );
}

// The machine clock, ticking on its own so the rest of the page does not re-render with it.
function LiveClock() {
  const [c, setC] = useState(() => clockAt(Date.now()));
  useEffect(() => {
    const iv = setInterval(() => { if (!document.hidden) setC(clockAt(Date.now())); }, 1000);
    return () => clearInterval(iv);
  }, []);
  return clockLine(c);
}

// The map's keyboard route to the people it cannot list by district: whoever is aboard
// the Loop right now, train by train, and your own file wherever it is.
// Memoized: its props only change identity when the census signature does.
// With the city in sectors (planClient.js) the page holds only the districts it has loaded:
// the count is the whole Loop's (the summary), the names are the riders it holds.
const LoopPanel = memo(function LoopPanel({ riders, aboard = riders.length, waiting, self, onOpen, onDistrict }) {
  const byTrain = [];
  for (const r of riders) { const last = byTrain[byTrain.length - 1]; if (last && last.t === r.t) last.list.push(r); else byTrain.push({ t: r.t, list: [r] }); }
  const unnamed = Math.max(0, aboard - riders.length);
  return (
    <Disclosure className="hvi-city-disc" title={`ABOARD THE LOOP (${aboard})${self ? " // YOUR FILE" : ""}`} meta={`${waiting} WAITING`}>
      {self && (
        <>
          <div className="hvi-city-room-h">YOUR FILE // {isOnLoop(self.at) ? `ABOARD ${TRAIN[self.w.trainId]?.name || "THE LOOP"}` : DISTRICT[self.at]?.name || "UNLOCATED"}</div>
          <Occupant s={self.s} onOpen={onOpen} />
          {!isOnLoop(self.at) && DISTRICT[self.at] && (
            <ListRow label={`ENTER ${DISTRICT[self.at].name}`} tag="YOU ARE EXPECTED" onClick={() => onDistrict(self.at)}
              aria-label={`Enter ${DISTRICT[self.at].name}, where your file is.`} />
          )}
        </>
      )}
      <div className="hvi-city-room-h">THE LOOP // {aboard} ABOARD // {waiting} ON PLATFORMS</div>
      {aboard === 0
        ? <div className="hvi-city-note">NOBODY ABOARD. THE LOOP RUNS ANYWAY. IT IS NOT FOR YOU.</div>
        : byTrain.map(g => (
          <div key={g.t}>
            <div className="hvi-city-room-h">{TRAIN[g.t]?.name || g.t} // {g.list.length} ABOARD // {TRAIN[g.t]?.cars} CARS</div>
            {g.list.map(r => <Occupant key={r.s.name} s={r.s} onOpen={onOpen} note={`CAR ${r.c + 1}`} />)}
          </div>
        ))}
      {unnamed > 0 && <div className="hvi-city-note">{riders.length ? `AND ${unnamed} MORE` : `${unnamed} ABOARD`}, BOARDED IN DISTRICTS YOU ARE NOT WATCHING. ZOOM IN ON A DISTRICT TO READ ITS PASSENGERS. THEY ARE ON FILE EITHER WAY.</div>}
      <div className="hvi-city-note" style={{ marginTop: "var(--s3)" }}>{Object.keys(STATIONS).length} STATIONS. ONE PER DISTRICT. ENTER A DISTRICT TO STAND ON ITS PLATFORM.</div>
    </Disclosure>
  );
});
