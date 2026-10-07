import { memo, useEffect, useRef, useState } from "react";
import TouchGate from "../ui/TouchGate.jsx";
import { SPRITE_W, SPRITE_H, statureOf } from "../sprites.js";
import { DISTRICTS, BUILDINGS, BUILDING, PLACES, LOOP_LINE, STOPS, LINE, OPEN_LOTS, clockAt, whereOf, lineTrainsAt, roomIn, gameAt } from "./simApi.js";
import { SPURS as SPURS_BY_ID, jobOf } from "./sim.js";
import { FAMILY_COLOR, familyOf } from "./cityKit.js";
import { sheetFor, miniFor } from "./spriteBank.js";
import { FONT } from "./cityUi.jsx";
import { rot, rotRect, project, screenToMap, cityExtent, depthOrder, slotForBox, boxHull, inPoly, lodFor, STOREY, DECK, mod4, LOD_NEAR, LOD_MID, BOUNDS, gridStep, viewCells, hiddenByTerrain } from "./iso.js";
import { wantSectors, summaryOf } from "./planClient.js";
import { patrolsAt } from "./prefects.js";   // THE PREFECTS: the Overlord's own, on patrol
import { drawPrefectIso, drawPrefectTops, openPrefect } from "./prefectDraw.js";
import { loopPieces, carCorners, carBox, CORNER_R, DECK_HW, CAR_HL, CAR_HW, PLAT_IN, PLAT_OUT, PLAT_HL, STAIR_W, STAIR_L } from "./loopGeo.js";
// THE LINES (PHASE 2, lineGeo.js): the Shore and Alpine Lines' viaducts, stops and trains
import { linePieces, linePoses, stopGeo, lineCarBox, HW as LINE_HW, BOGIE } from "./lineGeo.js";
import { drawRoom, roomPlan, typeOf, assignAnchors, roleOf, actAt, ORDERED_TYPES } from "./props.js";
import { casinoHits } from "../casino/cityRooms.js";
import { drawPose, phaseOf, fitStature } from "./poses.js";
import { greet } from "./rigReact.js";
import { PARK_LOTS, PARK_PLACES, fieldRole } from "./parkGeo.js";
import { drawParkLot } from "./parkDraw.js";
import { CIVIC_LOTS, CIVIC_PLACES } from "./civicGeo.js";
import { drawCivicLot, civicLabel, civicLine } from "./civicDraw.js";
import { isoItems, towerItems } from "./archGeo.js";
import { drawBody, drawYardProp, drawArchGround, doorAt } from "./archDraw.js";
import { billboardItems, drawBillboard } from "./billboardDraw.js";   // THE BILLBOARDS: the reserved sites, in Scott's real brands
import { findTarget, findLine } from "./find.js";
// DRIVE YOURSELF (controlIso.js, ControlLayer.jsx): the viewer's own citizen, steered
import { makeIsoControl } from "./controlIso.js";
import ControlLayer, { TakeControlButton, PadHint, NoFileNote } from "./ControlLayer.jsx";
import { makePadBrowse, drawReticle, drawFocus } from "./padBrowse.js";   // GAMEPAD BROWSE: the controller, not driving
import { funnelRoomHits } from "./funnelProps.js";
import { funnelButtons } from "./funnels.js";
import { storeLabel, tramAt, drawTram } from "./storefrontDraw.js";   // THE MALL: the storefronts' names, THE TRAM CAR
import { nightLine } from "./nightlife.js";   // THE NIGHTLIFE QUARTERS: hours, tonight's bill, the rope
import { storeButtons, openBusiness } from "./EnterprisePanel.jsx";
import { openFunnel, ShopWallLinks } from "./FunnelOverlay.jsx";
import NpcShopLinks from "./NpcShopLinks.jsx";
import { UNIT_SET } from "./storefrontSim.js";
import { takeTvBoxes, watchHref, ebtvLabel } from "./ebtvFrame.js";
import { COAST_LOTS, COAST_PLACES, terrainH, onTerrain, TERRAIN } from "./coastGeo.js";
import { drawCoastLot, drawCoastGround, drawPod, coastLabel, coastLine } from "./coastDraw.js";
import { drawEastLot, drawSky, EAST_LOT_FILL } from "./eastDraw.js";
import { airNow } from "./emergeClient.js";
import { drawAir } from "./emergeDraw.js";
import { padsOn, DEPOT } from "./emergence.js";
import { drawFarmLot, FARM_LOT_FILL } from "./farmDraw.js";   // THE FARMLAND's fields and orchards   // THE SUBURBS' parks, THE AIRPORT's airfield and its aircraft
// THE MOUNTAIN (mountainGeo.js): everyone on it placed once a frame, the bands' labels where they belong
import { skiersIn, SKI_PLACES, LABEL_AT, PEAKS } from "./mountainGeo.js";
import { raceAt, lastRace } from "./race.js";   // THE WEEKEND RACE: the racer on THE GAUNTLET, the board
// THE MASTER PLAN's venues (venueGeo.js, venueDraw.js): THE PIT, the tennis club; the estate gardens' trees
import { VENUE_LOTS, VENUE_PLACES, GARDEN_TREES } from "./venueGeo.js";
import { drawVenueLot, venueLabel, venueLine } from "./venueDraw.js";
import { drawChessTables } from "../chess/tableDraw.js";   // PARK CHESS: the stone tables on the Green and in the estate gardens
// THE ATTRITION (river.js, riverDraw.js): the river from its day; its name on hover or a tap
import { riverShown, railBridgeAt, forceRiver } from "./river.js";
import { drawRiverGround, drawRiverFlow, lotRiver, mountainRiver, drawGirders, drawSpots, REACH_NAME, REACH_LINE, spotName } from "./riverDraw.js";

// THE SUBSTRATE, SimCity-style: every building drawn in its own architecture (archGeo.js
// massing, archDraw.js drawing: the projects, brownstones, the glass tower, the monolith...),
// windows lit by occupancy, the Loop on its deck with trains, subjects on the streets.
// Drag to pan, pinch or wheel to zoom, Q/E or the buttons to turn it a quarter. Select a
// building and it lifts out into a Fallout Shelter / SimTower cutaway: every floor, every
// room furnished, every occupant at a seat or a station, walking in and out through the
// door, working at it while they are there. Deselect and it closes.
//
// Painter's order: the ground, then buildings and track segments back to front, with
// anything that moves (people, train cars, platform strips) slotted in between by depth.
// Labels go on top of the finished scene, nearest first, never over each other. A tap asks
// the same order front to back, so what you see on top is what you get.

const GROUND = { arts: "#141224", campus: "#0f1c14", finance: "#0e1820", strip: "#1c0e14", arena: "#141c10", hq: "#10221a", archive: "#16160f", commons: "#121a0f", works: "#1c0e0a", sprawl: "#131316", coast: "#3a3322", heights: "#2a3440", port: "#1a1c20", oldtown: "#1d1913", uptown: "#1c1a16", downtown: "#18141a", suburbs: "#16201a", airport: "#1a1d1f", farmland: "#1c2214", engine: "#121a20" };
const LOT_FILL = { "the-green": "#123a18", "the-allotment": "#1a2e12", "the-street": "#20241f", "the-plaza": "#24261f", "estate-gardens": "#15401c", "port-park": "#15401c", "cathedral-square": "#3a3630", "bowling-green": "#1d4a22", "the-close": "#173f1c", ...EAST_LOT_FILL, ...FARM_LOT_FILL };
const OUTDOOR_PLACES = new Set(["park", "the-street", "the-plaza", "allotment", "estate-gardens", "port-park", "cathedral-square", "bowling-green", "the-close", "north-park", "central-green", "south-park", "airfield", "school-field", "market-green", "the-orchards", "the-fields", "community-farm", "the-quad"]);
const PANEL_BG = "#060a06";
// a label whose anchor the mountain hides at this turn is not written over the mountain (cached: the ground never moves)
const HIDDEN = new Map();
const behindMountain = (id, x, y, h, r) => { const k = `${id}|${r}`; let v = HIDDEN.get(k); if (v === undefined) { v = hiddenByTerrain(x, y, h, r); HIDDEN.set(k, v); } return v; };
// a subject's post on the mountain (the patrol skis; the lift crews stand at the lifts)
const MJOB = new Map();
const mountainJob = (s) => { const k = s.slug || s.name; let j = MJOB.get(k); if (j === undefined) { try { j = jobOf(s)?.jobId || null; } catch { j = null; } MJOB.set(k, j); } return j; };
// yard props that still read from afar (the Port's cranes and ships among them)
const FAR_PROPS = new Set(["tree", "watchtower", "containers", "ambulance", "conveyor", "gantry", "ship", "hull", "tcrane", "car", "tug"]);
const clampN = (v, a, b) => (v < a ? a : v > b ? b : v);
const shade = (hex, f) => {
  const n = parseInt(hex.slice(1), 16);
  const c = (s) => clampN(Math.round(((n >> s) & 255) * f), 0, 255);
  return `rgb(${c(16)},${c(8)},${c(0)})`;
};
const BID = new Map();
const bidOf = (id) => { let v = BID.get(id); if (v == null) { v = 0; let h = 2166136261; for (let i = 0; i < id.length; i++) { h ^= id.charCodeAt(i); h = Math.imul(h, 16777619); } v = h >>> 0; BID.set(id, v); } return v; };
const nightAt = (hour) => hour >= 19 || hour < 6.5;
function h01(str) { let h = 2166136261; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); } return ((h >>> 0) % 100000) / 100000; }
const who = (s) => s.slug || s.name;

const CAP = Object.fromEntries(BUILDINGS.map(b => [b.id, Math.max(1, b.floors.reduce((n, f) => n + (f.cap || 0), 0))]));

// The Loop's palette: poured concrete in the city's greens, steel cars, the line's cyan
// as a thin accent (the legend's THE LOOP), warm windows after dark.
const LOOP = {
  deck: "#343f39", pier: "#2e3833", parapet: "#48554e", rail: "#a3b8ae", sleeper: "#221c16", cyan: "#22d3ee", cyanHi: "#67e8f9",
  body: "#a9bab1", roof: "#cfdcd5", stripe: "#22d3ee", door: "#5d6b64", glassDay: "#3f6f78", glassNight: "#fcd34d", sil: "#0c1512",
  plat: "#4a5650", platLit: "#5b6c63", edge: "#fbbf24", canopy: "#2a3a32", stair: "#4a554f",
};
const DECK_T = 0.16;          // deck slab thickness, storeys
const CAR_H = 0.62;           // car body height, storeys
const CAR_Z = DECK + 0.05;    // the car's floor, on the rails
const CANOPY = DECK + 1.1;    // the station canopy's underside
// every stop's platform and stairs (the Loop's stations and every line's stops)
const SGEO = new Proxy({}, { get: (_, id) => (STOPS[id] ? stopGeo(STOPS[id]) : undefined) });

// Where the view was when it unmounted (ENTER a building, then Back): the camera, the
// quarter turn and the open cutaway come back as they were. One per page load.
let SAVED = null;

export default memo(CityIso);
// The overview's four landmarks, named in plain words: [id, label, map x, map y, height in storeys].
const LANDMARKS = [
  ["hq", "DEPARTMENT HQ", 54.5, 29.5, 15],
  ["coast", "THE BOARDWALK", 36.25, 89.5, 2],
  ["heights", "THE MOUNTAIN", PEAKS[0].x, PEAKS[0].y, PEAKS[0].h + 3],
  ["strip", "THE STRIP", 102.25, 4.5, 6],
];
// The unbuilt Substrate's grid: [cells past the city's bounds, total line alpha]. The last band is
// the city itself, at the street grid's old 0.05; the first is everything else the view reaches.
const GRID_BANDS = [[1e9, 0.02], [64, 0.032], [24, 0.042], [0, 0.05]];
const HINT_KEY = "hvi-city-hint-seen";
// LABELS: every name on the map, the old way. Off unless the viewer turned it on.
const LABELS_KEY = "hvi-city-labels";
function labelsOn() { try { return localStorage.getItem(LABELS_KEY) === "1"; } catch { return false; } }
function CityIso({ censusRef, onOpen, onEnter, find = null, onFindEnd, self = null, welcome = null, onWelcomeEnd }) {
  const wrapRef = useRef(null);
  const canvasRef = useRef(null);
  const tvLinkRef = useRef(null);   // the TVs, for the keyboard: the real channel, labelled with what is on
  const apiRef = useRef({});
  const [sel, setSel] = useState(null);
  const [peek, setPeek] = useState(null);   // { id, line }: tapped once on a touch screen
  const [labels, setLabels] = useState(labelsOn);
  const toggleLabels = () => { const on = !labels; setLabels(on); apiRef.current.labels?.(on); try { localStorage.setItem(LABELS_KEY, on ? "1" : "0"); } catch { /* private window: off next visit */ } };
  // FIND: { line, following } for the status strip; the camera work is in the loop (V.find).
  const [found, setFound] = useState(null);
  // First visit: one line on what this is and the one thing to do. Gone for good once read.
  const [hint, setHint] = useState(() => { try { return !localStorage.getItem(HINT_KEY); } catch { return true; } });
  const dropHintRef = useRef(null);
  const dropHint = () => { setHint(false); try { localStorage.setItem(HINT_KEY, "1"); } catch { /* private window: it comes back next visit */ } };
  const onOpenRef = useRef(onOpen); onOpenRef.current = onOpen;
  const onEnterRef = useRef(onEnter); onEnterRef.current = onEnter;
  const setSelRef = useRef(setSel); setSelRef.current = setSel;
  const setPeekRef = useRef(setPeek); setPeekRef.current = setPeek;
  const setFoundRef = useRef(setFound); setFoundRef.current = setFound;
  const onFindEndRef = useRef(onFindEnd); onFindEndRef.current = onFindEnd;
  const selfRef = useRef(self); selfRef.current = self;
  // GAMEPAD BROWSE (padBrowse.js): the hint strip's state, and what the cursor is on (said aloud)
  const [padUi, setPadUi] = useState(null);
  const [padSay, setPadSay] = useState(null);
  const setPadUiRef = useRef(setPadUi); setPadUiRef.current = setPadUi;
  const setPadSayRef = useRef(setPadSay); setPadSayRef.current = setPadSay;
  const toggleLabelsRef = useRef(null); toggleLabelsRef.current = toggleLabels;

  useEffect(() => {
    const canvas = canvasRef.current, wrap = wrapRef.current;
    const ctx = canvas.getContext("2d");
    const mq = window.matchMedia ? window.matchMedia("(prefers-reduced-motion: reduce)") : null;
    // dev only: #city?river=1 shows THE ATTRITION before its day (river=0 hides it), to inspect it
    if (import.meta.env?.DEV) { const m = /[?&]river=([01])/.exec(window.location.hash); forceRiver(m ? m[1] === "1" : null); }
    const V = {
      cssW: 0, cssH: 0, dpr: 1, cam: { z: 6, ox: 0, oy: 0, r: 0 }, camTo: null, fitZ: 6, reduced: !!mq?.matches, need: true,
      sel: null, shown: null, lift: 0, geo: null, censusV: -1, inside: new Map(), occ: {}, outdoors: [], hits: [], labels: [], panel: null,
      seats: new Map(), plans: new Map(), wheelHint: 0, riders: new Map(), park: new Map(), parkSeats: new Map(),
      find: null,
      // LABELS: off by default, only what is hovered (hover: an id) or selected is named; peek: a
      // building tapped once on a touch screen (outlined, named, its chip up; a second tap opens it)
      hover: null, peek: null, allLabels: labelsOn(),
      // THE ATTRITION: shown (from its day), its hit areas (the ground layer's), a reach or spot picked
      river: false, riverHits: [], riverSel: null, ptr: null,
    };

    // ---- geometry for the current quarter turn ----------------------------------------
    function buildGeo(r) {
      // Each building's body (its massing box: archGeo.js; a field or open ground is its lot
      // less the inset) and every yard prop (a tree, the hoop, a fence panel) as boxes of their
      // own, so a walker between the tower and the chain-link is painted between them. An open
      // lot is ground: whoever walks across it is drawn after it (iso.slotForBox's deck rule).
      const items = isoItems(r);
      // the viaduct: straight deck pieces, curved corners, a station at every district
      items.push(...loopPieces(r));
      // THE LINES: a piece over open ground (the foothills) is slotted after that ground like a
      // walker on it (iso.slotForBox's deck rule); a piece on the mountain is painted by the
      // mountain, cell by cell (coastDraw.js G.extra); the rest are boxes like the Loop's
      const lp = linePieces(r), ground = items.filter(i => i.deck && i.top === 0);
      const overlaps = (a, b) => a.x0 < b.x1 - 1e-9 && b.x0 < a.x1 - 1e-9 && a.y0 < b.y1 - 1e-9 && b.y0 < a.y1 - 1e-9;
      const onGround = lp.filter(it => !it.mtn && ground.some(g => overlaps(g, it)));
      items.push(...lp.filter(it => !it.mtn && !onGround.includes(it)));
      const order = depthOrder(items);
      const lateSlots = new Map();
      for (const it of onGround.sort((a, b) => (a.x0 + a.x1 + a.y0 + a.y1) - (b.x0 + b.x1 + b.y0 + b.y1))) { const k = slotForBox(it, it.top, items, order); (lateSlots.get(k) || lateSlots.set(k, []).get(k)).push(it); }
      const districts = DISTRICTS.map(d => ({ d, R: rotRect(d.rect, r) }));
      // the monolith's tower over the track: after every deck and car under it, drawn after the
      // movers of its slot (the trains run through the portal beneath it)
      const topSlots = new Map();
      for (const it of towerItems(r)) { const k = slotForBox(it, it.top, items, order); (topSlots.get(k) || topSlots.set(k, []).get(k)).push(it); }
      // the billboards: drawn with the tops, a rooftop one after its own building
      for (const it of billboardItems(r)) {
        let k = slotForBox(it, it.top, items, order);
        if (it.host) { const hk = order.findIndex(i => items[i].id === it.host); if (hk > k) k = hk; }
        (topSlots.get(k) || topSlots.set(k, []).get(k)).push(it);
      }
      return { r, items, order, districts, lateSlots, topSlots, mtn: lp.filter(it => it.mtn) };
    }

    // ---- census -> occupancy, outdoor subjects, who is in which room -------------------
    // One rule with the header, the district list and the building view (simApi.roomIn):
    // a building counts whoever is on one of its floors, walking in, or walking out.
    function readCensus() {
      const c = censusRef.current;
      if (!c || c.v === V.censusV) return;
      V.censusV = c.v;
      const occ = {}, inside = new Map(), outdoors = [], riders = new Map(), park = new Map([...PARK_PLACES, ...CIVIC_PLACES, ...COAST_PLACES, ...SKI_PLACES, ...VENUE_PLACES].map(id => [id, []])), doors = new Map();
      for (const { s, w } of c.list || []) {
        if (!w) continue;
        if (ctl.skipSelf(s)) continue;   // DRIVE YOURSELF: the scheduled self steps out while you drive it
        if (w.sub === "riding" && w.trainId) { const k = `${w.trainId}|${w.car}`; riders.set(k, (riders.get(k) || 0) + 1); }
        const r = roomIn(w, s);
        if (r) {
          occ[r.buildingId] = (occ[r.buildingId] || 0) + 1;
          // a stand-in (crowd.js) lights a window and fills a street, never a room list
          const rk = `${r.buildingId}|${r.floor}|${r.placeId}`;
          if (!s.crowd) (inside.get(rk) || inside.set(rk, []).get(rk)).push({ s, w, mode: r.mode });
          if (r.mode === "here" && OUTDOOR_PLACES.has(w.placeId)) outdoors.push({ s, open: w.placeId });
          if (r.mode === "here" && park.has(w.placeId)) park.get(w.placeId).push({ s, w });
          if (r.mode !== "here" && !s.crowd) (doors.get(r.buildingId) || doors.set(r.buildingId, []).get(r.buildingId)).push(s);
        }
        if (w.activity === "commute" && w.sub !== "riding") outdoors.push({ s });
      }
      V.occ = occ; V.inside = inside; V.outdoors = outdoors; V.riders = riders; V.park = park; V.doors = doors;
      // who is held, by slug: the Pit's fighters and the club's finalists are drawn from their own records
      const bySlug = new Map();
      for (const { s } of c.list || []) if (s && !s.crowd && s.slug) bySlug.set(s.slug, s);
      V.bySlug = bySlug;
      V.need = true;
    }

    // ---- camera -------------------------------------------------------------------------
    // Moves ease (camTo) unless reduced motion; any hand on the controls cancels the ease.
    function setCam(z, ox, oy, now = false) {
      if (now || V.reduced) { V.cam.z = z; V.cam.ox = ox; V.cam.oy = oy; V.camTo = null; } else V.camTo = { z, ox, oy };
      V.need = true;
    }
    function easeCam() {
      const t = V.camTo;
      if (!t) return;
      const k = 0.2, c = V.cam;
      c.z += (t.z - c.z) * k; c.ox += (t.ox - c.ox) * k; c.oy += (t.oy - c.oy) * k;
      if (Math.abs(t.z - c.z) < 0.01 && Math.abs(t.ox - c.ox) < 0.5 && Math.abs(t.oy - c.oy) < 0.5) { c.z = t.z; c.ox = t.ox; c.oy = t.oy; V.camTo = null; }
      V.need = true;
    }
    const hands = () => { if (V.camTo) { V.camTo = null; } };
    function fitCam() {
      const e = cityExtent(V.cam.r);
      const z = Math.min(V.cssW / (e.x1 - e.x0), V.cssH / (e.y1 - e.y0)) * 0.96;
      V.fitZ = z;
      return { z, ox: V.cssW / 2 - z * (e.x0 + e.x1) / 2, oy: V.cssH / 2 - z * (e.y0 + e.y1) / 2 };
    }
    function fit(now = false) { const f = fitCam(); setCam(f.z, f.ox, f.oy, now); }
    function centreOn(x, y, z = V.cam.z, side = false) {
      const [u, v] = rot(x, y, V.cam.r);
      // with the cutaway open, the building sits in the visible part of the view
      const cx = side ? (V.cssW < 640 ? V.cssW / 2 : V.cssW * 0.24) : V.cssW / 2;
      const cy = side && V.cssW < 640 ? V.cssH * 0.16 : V.cssH / 2;
      setCam(z, cx - (u - v) * z, cy - (u + v) * z * 0.5 + 2 * STOREY * z);
    }
    function zoomAt(sx, sy, f) {
      hands();
      if (V.find) V.find.fly = false;
      const z0 = V.cam.z, z1 = clampN(z0 * f, V.fitZ * 0.7, 42);
      V.cam.ox = sx - (sx - V.cam.ox) * (z1 / z0);
      V.cam.oy = sy - (sy - V.cam.oy) * (z1 / z0);
      V.cam.z = z1; V.need = true;
    }
    // A quarter turn about a screen point (the view's centre, or the pinch): the map point
    // under it stays under it.
    function turn(dir, sx = V.cssW / 2, sy = V.cssH / 2) {
      hands();
      const [mx, my] = screenToMap(sx, sy, V.cam);
      V.cam.r = mod4(V.cam.r + dir);
      V.geo = buildGeo(V.cam.r);
      const [u, v] = rot(mx, my, V.cam.r);
      V.cam.ox = sx - (u - v) * V.cam.z;
      V.cam.oy = sy - (u + v) * V.cam.z * 0.5;
      V.need = true;
    }
    function select(id) {
      if (V.peek) setPeekState(null);
      if (id === V.sel) return;
      const wasOpen = !!V.sel;
      V.sel = id;
      setSelRef.current(id);
      if (id) {
        V.shown = id;
        if (!wasOpen) V.lift = 0;   // switching buildings keeps the panel up; only a fresh open lifts
        if (V.shown !== V.seatsFor) { V.seats.clear(); V.seatsFor = V.shown; }
        const b = BUILDING[id];
        centreOn(b.pos.x, b.pos.y, Math.max(V.cam.z, V.fitZ * 1.6), true);
      }
      V.need = true;
    }
    // A touch screen's first tap on a building: outline it, name it, put its chip up.
    function setPeekState(id) {
      V.peek = id; V.need = true;
      const b = id && BUILDING[id];
      setPeekRef.current(b ? { id, line: `${b.name} // ${V.occ[id] || 0} INSIDE` } : null);
    }
    // ---- find: fly to a subject, mark them, follow them -----------------------------------
    // V.find = { s, who, follow, fly, bId, t (findTarget), pos: map {x, y, h}, room, box }.
    // Following, the camera eases onto them every frame (the train car included); inside a
    // building their cutaway is open with their room and sprite marked. Any hand on the map
    // (a drag, the arrows, a tap on a building, CLOSE, FIT) stops following; FOLLOW resumes.
    function publishFind(force = false) {
      const F = V.find;
      if (!F || !F.t) return;
      const line = findLine(F.s, F.t, V.mt);
      if (force || line !== F.line || F.follow !== F.shownFollow) { F.line = line; F.shownFollow = F.follow; setFoundRef.current({ line, following: F.follow }); }
    }
    function unfollow() {
      if (!V.find || !V.find.follow) return;
      V.find.follow = false; V.find.fly = false;
      publishFind();
    }
    function startFind(f) {
      const prev = V.find;
      if (!f) {
        V.find = null;
        if (prev && prev.bId && V.sel === prev.bId) select(null);
        setFoundRef.current(null);
        V.need = true;
        return;
      }
      // a new find starts from the open city: whatever cutaway was up closes (theirs reopens)
      if (V.sel) select(null);
      if (V.peek) setPeekState(null);
      V.find = { s: f.s, who: who(f.s), follow: true, fly: true, bId: undefined, t: null, pos: null, room: null, box: null, line: "", shownFollow: null, lineAt: 0 };
      V.need = true;
    }
    function refollow() {
      if (!V.find) return;
      V.find.follow = true; V.find.fly = true; V.find.bId = undefined;
      V.need = true;
    }
    // Where the subject is drawn, in map cells and storeys: the car they ride, the platform,
    // the stairs, the pavement, or the roof of the building they are inside.
    function findStep(mt, trains) {
      const F = V.find;
      const t = findTarget(F.s, mt);
      F.t = t;
      let x = t.x, y = t.y, h = 0;
      if (t.mode === "riding") {
        const car = trains.find(tr => tr.id === t.trainId)?.cars[t.car];
        if (car) { x = car.pose.x; y = car.pose.y; }
        h = CAR_Z + CAR_H;
      } else if (t.mode === "platform" || t.mode === "street") {
        const q = streetSpot(t.w);
        if (q) [x, y, h] = q;
      } else {
        const it = V.geo.items.find(i => i.kind === "b" && i.b.id === t.buildingId);
        h = it ? it.h : 1;
      }
      F.pos = { x, y, h };
      if (performance.now() - F.lineAt > 400) { F.lineAt = performance.now(); publishFind(); }
      if (!F.follow) return;
      const want = t.mode === "inside" ? t.buildingId : null;
      if (want !== F.bId) {
        const was = F.bId;
        F.bId = want;
        if (want) {
          select(want);
          const b = BUILDING[want];
          centreOn(b.pos.x, b.pos.y, clampN(Math.max(V.cam.z, V.fitZ * 1.6, 6), 0, 42), true);
          F.fly = false;
          return;
        }
        if (was && V.sel === was) select(null);
        F.fly = true;
      }
      if (want) return;
      // a moving subject: keep them at the centre (a little high on a phone, clear of the thumb)
      const z = F.fly ? Math.max(V.cam.z, LOD_NEAR + 2) : V.cam.z;
      const [u, v] = rot(x, y, V.cam.r);
      const ox = V.cssW / 2 - (u - v) * z, oy = V.cssH * 0.5 - ((u + v) * z * 0.5 - h * STOREY * z);
      if (F.fly && Math.abs(V.cam.z - z) < 0.05) F.fly = false;
      setCam(z, ox, oy);
    }
    // DRIVE YOURSELF: the kit it draws and moves with (controlIso.js)
    const ctl = makeIsoControl({
      V, ctx, P: (u, v, h) => project(u, v, h, V.cam), Q: (x, y, h) => { const [u, v] = rot(x, y, V.cam.r); return project(u, v, h, V.cam); },
      select, setCam, turn, unfollowFind: unfollow, hit: (h) => V.hits.push(h), onOpen: (s) => onOpenRef.current?.(s), getSelf: () => selfRef.current, census: () => censusRef.current,
    });
    apiRef.current = {
      takeControl: () => { if (ctl.start(selfRef.current || V.find?.s)) onFindEndRef.current?.(); }, release: () => ctl.release(),
      zoom: (f) => zoomAt(V.cssW / 2, V.cssH / 2, f), fit: () => { unfollow(); select(null); fit(); }, turn: (d) => turn(d), close: () => { unfollow(); select(null); },
      enter: () => { const b = V.sel && BUILDING[V.sel]; if (b) onEnterRef.current?.(b.district, b.id); },
      open: () => { if (V.peek) { unfollow(); select(V.peek); } },
      labels: (on) => { V.allLabels = on; V.need = true; },
      visit: (id) => { if (BUILDING[id]) { unfollow(); select(id); } },
      find: startFind, follow: refollow, endFind: () => onFindEndRef.current?.(),
    };
    if (import.meta.env?.DEV) window.__hviIsoQ = (x, y, h) => { const [u, v] = rot(x, y, V.cam.r); return project(u, v, h, V.cam); };   // dev: where a map point is on screen

    // Only a real change of size resets the canvas (assigning width/height clears it): the
    // toolbar's hint changing under a phone's canvas must not blank the picture.
    function resize() {
      const cssW = Math.max(280, Math.floor(wrap.clientWidth));
      const dpr = Math.min(3, window.devicePixelRatio || 1);
      // a phone is taller than it is wide: give the city most of the screen, not a letterbox
      const cssH = Math.round(cssW < 640
        ? clampN(cssW * 0.95, 340, Math.max(340, window.innerHeight * 0.6))
        : clampN(cssW * 0.62, 360, Math.min(780, window.innerHeight * 0.74)));
      const first = V.cssW === 0;
      if (!first && cssW === V.cssW && cssH === V.cssH && dpr === V.dpr) return;
      const was = first ? 1 : V.cam.z / V.fitZ;
      V.cssW = cssW; V.cssH = cssH; V.dpr = dpr;
      canvas.width = Math.round(cssW * dpr); canvas.height = Math.round(cssH * dpr);
      canvas.style.height = cssH + "px";
      if (first || Math.abs(was - 1) < 1e-3) fit(true); else { fitCam(); V.need = true; }
      draw();
    }

    // ---- drawing --------------------------------------------------------------------------
    const P = (u, v, h) => project(u, v, h, V.cam);
    function poly(pts, fill, stroke) {
      ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]);
      for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
      ctx.closePath();
      if (fill) { ctx.fillStyle = fill; ctx.fill(); }
      if (stroke) { ctx.strokeStyle = stroke; ctx.stroke(); }
    }
    function onScreen(pts, pad = 20) {
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      for (const [x, y] of pts) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
      return x1 > -pad && x0 < V.cssW + pad && y1 > -pad && y0 < V.cssH + pad;
    }

    function drawGround() {
      const g = V.geo;
      for (const { d, R } of g.districts) {
        const pts = [P(R.x0, R.y0, 0), P(R.x1, R.y0, 0), P(R.x1, R.y1, 0), P(R.x0, R.y1, 0)];
        if (!onScreen(pts)) continue;
        poly(pts, GROUND[d.id] || "#101410", "rgba(74,222,128,0.18)");
      }
      // the Coast's sea (the district's southern rows) and the spurs' rails
      const hr = ((V.mt % 24) + 24) % 24;
      drawCoastGround(coastG(), lodFor(V.cam.z), V.reduced ? 0 : performance.now() / 1000, nightAt(hr));
      // the buildings' flat ground: the court slab, the quad, the monolith's plaza
      const hour = ((V.mt % 24) + 24) % 24, env = { lod: lodFor(V.cam.z), night: nightAt(hour) };
      for (const it of g.items) if (it.kind === "b" && it.m && it.m.ground.length) {
        const L = it.b.rect, R = rotRect(L, g.r);
        if (!onScreen([P(R.x0, R.y0, 0), P(R.x1, R.y0, 0), P(R.x1, R.y1, 0), P(R.x0, R.y1, 0)])) continue;
        drawArchGround(archG(), it.m, env);
      }
      drawSubstrateGrid();
    }
    // THE UNBUILT SUBSTRATE: the faint street grid, every 4 cells on the city's own lines, out to
    // the edge of the view in every direction, so the city sits on a plane it can still grow
    // across. Only the lines the view crosses are drawn. Full strength over the city's bounds,
    // stepping down through two bands to a floor further out, so it reads as going on, not as a
    // frame: each band is one solid pass over the lines inside it, adding to the passes under it
    // (a gradient stroke cost a 1440 px view a third of its frame).
    // The lines only move with the camera: drawn once into a layer of their own and laid down
    // whole on every frame the camera holds still (most of them: the city moves, the ground not).
    let gridLayer = null, gridKey = "";
    // THE ATTRITION's water, banks, bridges and parks are drawn into the same layer, under the lines.
    function drawSubstrateGrid() {
      const night = nightAt(((V.mt % 24) + 24) % 24), lod = lodFor(V.cam.z);
      const key = `${V.cam.z}|${V.cam.ox}|${V.cam.oy}|${V.cam.r}|${V.cssW}|${V.cssH}|${V.dpr}|${V.river ? `${night}|${lod}` : "-"}`;
      if (key !== gridKey) {
        gridKey = key;
        gridLayer ||= document.createElement("canvas");
        const w = Math.round(V.cssW * V.dpr), h = Math.round(V.cssH * V.dpr);
        if (gridLayer.width !== w || gridLayer.height !== h) { gridLayer.width = w; gridLayer.height = h; } else gridLayer.getContext("2d").clearRect(0, 0, w, h);
        const g = gridLayer.getContext("2d");
        g.setTransform(V.dpr, 0, 0, V.dpr, 0, 0);
        V.riverHits = V.river ? drawRiverGround({ ctx: g, Q, z: V.cam.z, r: V.cam.r, w: V.cssW, h: V.cssH }, lod, night) : [];
        strokeGrid(g);
      }
      ctx.drawImage(gridLayer, 0, 0, V.cssW, V.cssH);
    }
    function strokeGrid(ctx) {
      const step = gridStep(V.cam.z), e = viewCells(V.cam, V.cssW, V.cssH, step);
      ctx.lineWidth = 1;
      let below = 0;
      for (const [pad, want] of GRID_BANDS) {
        const x0 = Math.max(e.x0, Math.floor((BOUNDS.x0 - pad) / step) * step), x1 = Math.min(e.x1, Math.ceil((BOUNDS.x1 + pad) / step) * step);
        const y0 = Math.max(e.y0, Math.floor((BOUNDS.y0 - pad) / step) * step), y1 = Math.min(e.y1, Math.ceil((BOUNDS.y1 + pad) / step) * step);
        const add = 1 - (1 - want) / (1 - below);
        below = want;
        if (x0 > x1 || y0 > y1) continue;
        ctx.strokeStyle = `rgba(74,222,128,${add.toFixed(4)})`;
        // the two directions are stroked apart so a crossing is as bright as it always was
        ctx.beginPath();
        for (let x = x0; x <= x1; x += step) { const a = Q(x, y0, 0), b = Q(x, y1, 0); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); }
        ctx.stroke();
        ctx.beginPath();
        for (let y = y0; y <= y1; y += step) { const a = Q(x0, y, 0), b = Q(x1, y, 0); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); }
        ctx.stroke();
      }
    }

    // The kit archDraw draws with: map cells in, turned and projected by the camera.
    let AG = null;
    // ...and the one the Coast and the Heights draw with (coastDraw.js)
    const coastG = () => ({ ctx, Q, poly, prism, wall, facing, z: V.cam.z, r: V.cam.r, cam: V.cam, t: V.reduced ? 0 : performance.now() / 1000, hits: V.hits, w: V.cssW, h: V.cssH });
    const archG = () => { AG ||= { ctx, Q, poly, facing, z: 0, r: 0 }; AG.z = V.cam.z; AG.r = V.cam.r; return AG; };
    const riverK = () => ({ ctx, Q, z: V.cam.z, r: V.cam.r, w: V.cssW, h: V.cssH, hits: V.hits });
    function drawYard(it, lod) {
      if (it.p.k === "pylon") { const hour = ((V.mt % 24) + 24) % 24; drawBody(archG(), it.b, it.m, { lod, night: nightAt(hour), hour, t: 0, lit: 0.45, bid: bidOf(it.b.id), name: it.b.name, style: it.m.style }, new Set([it.p.part])); return; }
      const [x, y] = Q(it.p.x, it.p.y, 0);
      const pad = V.cam.z * 8;
      if (x < -pad || x > V.cssW + pad || y < -pad || y > V.cssH + pad * 1.5) return;
      if (lod === "far" && !FAR_PROPS.has(it.p.k)) return;
      const hour = ((V.mt % 24) + 24) % 24;
      drawYardProp(archG(), it.p, { lod, night: nightAt(hour), hour, t: V.reduced ? 0 : performance.now() / 1000 });
    }

    // top: redrawn over the veil for the open cutaway (no hit, no queued label).
    function drawBuilding(it, lod, rank, top = false) {
      const { b, R } = it, h = it.h;
      const hull = boxHull(R, h, V.cam);
      if (!onScreen(hull)) return;
      if (!top) V.hits.push({ kind: "b", id: b.id, hull });
      const selected = V.sel === b.id || V.peek === b.id, named = selected || V.hover === b.id;
      const label = () => {
        if ((lod === "far" || !V.allLabels) && !named) return;
        // a playing field keeps its label off the play: over its back corner
        const [x, y] = PARK_LOTS[b.id] ? P(R.x0 + 0.6, R.y0 + 0.6, 0.4) : P((R.x0 + R.x1) / 2, (R.y0 + R.y1) / 2, h + 0.5);
        // the grounds' labels carry the fixture: "THE DIAMOND // BOT 5 3-2", "THE BOWL // Q3 14-10"
        const g = PARK_LOTS[b.id] && gameAt(PARK_LOTS[b.id], V.mt);
        const text = CIVIC_LOTS[b.id] ? civicLabel(b.id, V.mt) : g ? `${b.name} // ${g.label}` : storeLabel(b.id) || b.name;
        // an empty unit says TO LET on its own glass: its label only comes up close, and last
        const minor = / \/\/ TO LET$/.test(text);
        const L = { id: b.id, text: text.length > 34 ? text.slice(0, 33) + "…" : text, x, y, selected, rank: minor ? rank - 1e7 : rank, minor };
        if (top) drawLabel(L, 1); else if (selected || !behindMountain(b.id, b.pos.x, b.pos.y, h + 0.5, V.cam.r)) V.labels.push(L);
      };
      if (COAST_LOTS[b.id]) {
        // THE COAST and THE HEIGHTS (coastDraw.js): the beach, the boardwalk, the pier, the break,
        // the mountain and the resort parcels, with whoever is on them
        const pid = COAST_LOTS[b.id];
        const G = { ...coastG(), hits: top ? [] : V.hits, extra: mountainExtras(b.id, lod), crowd: V.crowd, lookup: (slug) => V.bySlug?.get(slug) || null };
        V.parkSeats.set(pid, drawCoastLot(G, b.id, lod, V.mt, V.park.get(pid) || [], V.parkSeats.get(pid) || null));
        if (selected) poly([P(R.x0, R.y0, 0.02), P(R.x1, R.y0, 0.02), P(R.x1, R.y1, 0.02), P(R.x0, R.y1, 0.02)], null, "#4ade80");
        if ((lod !== "far" && V.allLabels) || named) {
          const la = LABEL_AT[b.id], tall = it.h > 2, [x, y] = la ? Q(la[0], la[1], la[2]) : tall ? P((R.x0 + R.x1) / 2, (R.y0 + R.y1) / 2, it.h * 0.9) : P(R.x0 + 0.6, R.y0 + 0.6, 0.6);
          const text = coastLabel(b.id, V.mt) || b.name;
          const L = { id: b.id, text: text.length > 34 ? text.slice(0, 33) + "…" : text, x, y, selected, rank };
          if (top) drawLabel(L, 1); else if (selected || !behindMountain(b.id, la ? la[0] : b.pos.x, la ? la[1] : b.pos.y, la ? la[2] : 0.6, V.cam.r)) V.labels.push(L);
        }
        return;
      }
      if (VENUE_LOTS[b.id]) {
        // THE PIT and THE TENNIS CLUB (venueDraw.js): the bout or the fixture on now, whoever is there
        const pid = VENUE_LOTS[b.id];
        const G = { ctx, Q, poly, prism, wall, facing, z: V.cam.z, r: V.cam.r, t: V.reduced ? 0 : performance.now() / 1000, hits: top ? [] : V.hits, w: V.cssW, h: V.cssH, lookup: (slug) => V.bySlug?.get(slug) || null };
        const res = drawVenueLot(G, b.id, lod, V.mt, V.park.get(pid) || [], V.parkSeats.get(pid) || null);
        V.parkSeats.set(pid, res.at);
        if (selected) poly([P(R.x0, R.y0, 0.02), P(R.x1, R.y0, 0.02), P(R.x1, R.y1, 0.02), P(R.x0, R.y1, 0.02)], null, "#4ade80");
        if ((lod !== "far" && V.allLabels) || named) {
          const [x, y] = P(R.x0 + 0.6, R.y0 + 0.6, 0.6), text = venueLabel(b.id, V.mt);
          const L = { id: b.id, text: text.length > 34 ? text.slice(0, 33) + "…" : text, x, y, selected, rank };
          if (top) drawLabel(L, 1); else V.labels.push(L);
        }
        return;
      }
      if (CIVIC_LOTS[b.id]) {
        // THE ASSEMBLY and its lot (civicDraw.js): the lot's face follows the recorded vote
        const pid = CIVIC_LOTS[b.id];
        const G = { ctx, Q, poly, prism, wall, facing, z: V.cam.z, r: V.cam.r, t: V.reduced ? 0 : performance.now() / 1000, hits: top ? [] : V.hits, w: V.cssW, h: V.cssH };
        const prevSeats = V.parkSeats.get(pid);
        const res = drawCivicLot(G, b.id, lod, V.mt, V.park.get(pid) || [], prevSeats || null);
        V.parkSeats.set(pid, res);
        if (selected) poly([P(R.x0, R.y0, 0.02), P(R.x1, R.y0, 0.02), P(R.x1, R.y1, 0.02), P(R.x0, R.y1, 0.02)], null, "#4ade80");
        label();
        return;
      }
      if (PARK_LOTS[b.id]) {
        const pid = PARK_LOTS[b.id];
        const G = { ctx, Q, poly, prism, wall, facing, z: V.cam.z, r: V.cam.r, t: V.reduced ? 0 : performance.now() / 1000, hits: top ? [] : V.hits, w: V.cssW, h: V.cssH , lookup: (slug) => V.bySlug?.get(slug) || null };
        const res = drawParkLot(G, b.id, lod, V.mt, V.park.get(pid) || [], V.parkSeats.get(pid) || null);
        V.parkSeats.set(pid, res.at);
        if (selected) poly([P(R.x0, R.y0, 0.02), P(R.x1, R.y0, 0.02), P(R.x1, R.y1, 0.02), P(R.x0, R.y1, 0.02)], null, "#4ade80");
        label();
        return;
      }
      if (OPEN_LOTS.has(b.id)) {
        const pts = [P(R.x0, R.y0, 0), P(R.x1, R.y0, 0), P(R.x1, R.y1, 0), P(R.x0, R.y1, 0)];
        poly(pts, LOT_FILL[b.id] || "#20241f", selected ? "#4ade80" : "rgba(74,222,128,0.3)");
        // the Suburbs' parks and the Airport's airfield (eastDraw.js): paths, trees, the pond, the runway, parked aircraft
        if (EAST_LOT_FILL[b.id]) drawEastLot(archG(), b, lod, V.mt, nightAt(((V.mt % 24) + 24) % 24));
        if (FARM_LOT_FILL[b.id]) drawFarmLot(archG(), b, lod, V.mt, nightAt(((V.mt % 24) + 24) % 24));
        if (lod !== "far" && b.id === "estate-gardens") {
          // the estate gardens (the master plan): a path down the middle, trees either side
          const r = b.rect, my = r.y + r.h / 2, [a0, a1] = rot(r.x + 0.4, my, V.geo.r), [b0, b1] = rot(r.x + r.w - 0.4, my, V.geo.r);
          const A = P(a0, a1, 0.01), B = P(b0, b1, 0.01);
          ctx.strokeStyle = "#8a7a5a"; ctx.lineWidth = Math.max(2, V.cam.z * 0.45); ctx.beginPath(); ctx.moveTo(A[0], A[1]); ctx.lineTo(B[0], B[1]); ctx.stroke();
          for (const [tx, ty] of GARDEN_TREES) {
            const [u, v] = rot(tx, ty, V.geo.r), [x, y] = P(u, v, 0.7), [gx, gy] = P(u, v, 0);
            ctx.strokeStyle = "#4a3222"; ctx.lineWidth = Math.max(1, V.cam.z * 0.08); ctx.beginPath(); ctx.moveTo(gx, gy); ctx.lineTo(x, y); ctx.stroke();
            ctx.fillStyle = "#22763a"; ctx.beginPath(); ctx.arc(x, y, Math.max(2, V.cam.z * 0.45), 0, Math.PI * 2); ctx.fill();
          }
        }
        if (lod !== "far" && (b.id === "the-green" || b.id === "the-allotment")) {
          for (let i = 0; i < 9; i++) {
            const u = R.x0 + (R.x1 - R.x0) * (0.15 + 0.7 * h01(b.id + i)), v = R.y0 + (R.y1 - R.y0) * (0.15 + 0.7 * h01(b.id + "v" + i));
            const [x, y] = P(u, v, 0.7);
            ctx.fillStyle = i % 2 ? "#22c55e" : "#15803d"; ctx.beginPath(); ctx.arc(x, y, Math.max(2, V.cam.z * (b.id === "the-green" ? 0.6 : 0.3)), 0, Math.PI * 2); ctx.fill();
          }
        }
        // PARK CHESS (src/chess/): the stone tables, their games and kibitzers
        if (b.id === "the-green" || b.id === "estate-gardens") drawChessTables({ ctx, Q, poly, prism, wall, facing, z: V.cam.z, r: V.cam.r, t: V.reduced ? 0 : performance.now() / 1000, hits: top ? [] : V.hits, w: V.cssW, h: V.cssH, lookup: (slug) => V.bySlug?.get(slug) || null }, b.id, lod, V.mt);
        label();
        return;
      }
      if (!it.m) { label(); return; }
      // HQ's census is classified: its windows keep office hours, not a head count.
      const lit = b.id === "hq" ? 0.45 : Math.min(1, (V.occ[b.id] || 0) / (CAP[b.id] * 0.55));
      if (!it.m.parts.length) { label(); return; }
      const hour = ((V.mt % 24) + 24) % 24;
      // the monolith on the line: here only its concourse (its pylons and its tower take their own
      // places in the painter's order), the whole of it when it is lifted out over the veil
      drawBody(archG(), b, it.m, { lod, night: nightAt(hour), hour, t: V.reduced ? 0 : performance.now() / 1000, lit, bid: bidOf(b.id), name: b.name, style: it.m.style }, it.m.solid && !top ? new Set(["base"]) : null);
      for (const box of takeTvBoxes()) if (!top) V.hits.push({ kind: "ebtv", box });   // the station's screen: the real channel
      if (selected) poly(hull, null, "#4ade80");
      // up close: whoever is walking in or out, at the front door (when it faces us)
      if (lod === "near" && !top) {
        const folk = V.doors?.get(b.id);
        const d = folk && folk.length && doorAt(archG(), it.m);
        if (d) folk.slice(0, 3).forEach((s, i) => {
          const k = (i - (Math.min(3, folk.length) - 1) / 2) * 0.45;
          const [u, v] = rot(d.x + d.along[0] * k, d.y + d.along[1] * k, V.cam.r);
          drawPerson({ s, u, v, h: 0 }, lod);
        });
      }
      label();
    }

    // ---- the Loop: viaduct, stations, trains --------------------------------------------
    // Everything here is built in map cells (loopGeo.js) and turned to the current quarter
    // on the way to the screen. A face is drawn when it faces the viewer (its turned normal
    // points to +u+v) and shaded like the buildings: +u faces 0.72, +v faces 1.0, tops 1.4.
    const Q = (x, y, h) => { const [u, v] = rot(x, y, V.cam.r); return P(u, v, h); };
    const lerp2 = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
    const add = (a, d, k) => [a[0] + d[0] * k, a[1] + d[1] * k];
    // Turned normal of the map edge a->b, pointing away from `inside`; -> shade factor, or 0 if hidden.
    function facing(a, b, inside) {
      const [au, av] = rot(a[0], a[1], V.cam.r), [bu, bv] = rot(b[0], b[1], V.cam.r), [iu, iv] = rot(inside[0], inside[1], V.cam.r);
      let nu = bv - av, nv = -(bu - au);
      if (nu * (iu - au) + nv * (iv - av) > 0) { nu = -nu; nv = -nv; }
      const n = Math.hypot(nu, nv) || 1;
      nu /= n; nv /= n;
      return nu + nv > 1e-6 ? 0.86 + 0.14 * (nv - nu) : 0;
    }
    function wall(a, b, inside, h0, h1, base) {
      const f = facing(a, b, inside);
      if (f) poly([Q(a[0], a[1], h1), Q(b[0], b[1], h1), Q(b[0], b[1], h0), Q(a[0], a[1], h0)], shade(base, f));
      return f;
    }
    // A convex prism on a map footprint: its visible walls, then its top.
    function prism(foot, h0, h1, base, topF = 1.4, alpha = 1) {
      let cx = 0, cy = 0;
      for (const p of foot) { cx += p[0]; cy += p[1]; }
      const c = [cx / foot.length, cy / foot.length];
      if (alpha < 1) ctx.globalAlpha = alpha;
      for (let i = 0; i < foot.length; i++) wall(foot[i], foot[(i + 1) % foot.length], c, h0, h1, base);
      poly(foot.map(p => Q(p[0], p[1], h1)), shade(base, topF));
      if (alpha < 1) ctx.globalAlpha = 1;
    }
    function line(a, b, h, color, w) {
      const A = Q(a[0], a[1], h), B = Q(b[0], b[1], h);
      ctx.strokeStyle = color; ctx.lineWidth = w;
      ctx.beginPath(); ctx.moveTo(A[0], A[1]); ctx.lineTo(B[0], B[1]); ctx.stroke();
    }
    function polyline(pts, h, color, w) {
      ctx.strokeStyle = color; ctx.lineWidth = w; ctx.beginPath();
      pts.forEach((p, i) => { const S = Q(p[0], p[1], h); if (i) ctx.lineTo(S[0], S[1]); else ctx.moveTo(S[0], S[1]); });
      ctx.stroke();
    }
    const px1 = () => Math.max(1, V.cam.z * 0.07);
    // A pier: a square column to the ground and a cap across the deck's width.
    function pier(m, d, lod) {
      if (V.river && railBridgeAt(m[0], m[1], 0.3)) return;   // THE ATTRITION: the span carries it
      const p = [-d[1], d[0]], top = DECK - DECK_T;
      const sq = (a, b, la, lb) => [add(add(m, d, a), p, la), add(add(m, d, b), p, la), add(add(m, d, b), p, lb), add(add(m, d, a), p, lb)];
      prism(sq(-0.19, 0.19, 0.19, -0.19), 0, top - (lod === "far" ? 0 : 0.14), LOOP.pier, 1.1);
      if (lod !== "far") prism(sq(-0.26, 0.26, DECK_HW * 0.85, -DECK_HW * 0.85), top - 0.14, top, LOOP.pier, 1.1);
    }
    // Deck edge details along a centreline polyline (map points, with its unit normals):
    // parapets, rails, sleepers, the cyan fascia; the far parapet first, the near one last.
    function deckDressing(pts, nrm, lod, len) {
      const off = (k) => pts.map((p, i) => add(p, nrm[i], k));
      const mid = Math.floor(pts.length / 2);
      // which lateral side faces the viewer: the one whose outward normal turns towards +u+v
      const [nu, nv] = (() => { const [a, b] = rot(0, 0, V.cam.r), [e, f] = rot(nrm[mid][0], nrm[mid][1], V.cam.r); return [e - a, f - b]; })();
      const near = nu + nv > 0 ? 1 : -1;
      const fascia = (sgn) => polyline(off(sgn * DECK_HW), DECK - 0.03, "rgba(34,211,238,0.6)", Math.max(1, V.cam.z * 0.06));
      fascia(near);
      if (lod === "far") return;
      const parapet = (sgn) => {
        const e = off(sgn * (DECK_HW - 0.04));
        for (let i = 0; i + 1 < e.length; i++) poly([Q(e[i][0], e[i][1], DECK), Q(e[i + 1][0], e[i + 1][1], DECK), Q(e[i + 1][0], e[i + 1][1], DECK + 0.13), Q(e[i][0], e[i][1], DECK + 0.13)], LOOP.parapet);
        polyline(e, DECK + 0.13, "#65756c", 1);
      };
      parapet(-near);
      if (lod === "near") {
        // sleepers across the two tracks' bed
        ctx.strokeStyle = LOOP.sleeper; ctx.lineWidth = Math.max(1, V.cam.z * 0.1);
        ctx.beginPath();
        const n = Math.max(1, Math.round(len / 0.55));
        for (let k = 0; k < n; k++) {
          const t = (k + 0.5) / n * (pts.length - 1), i = Math.min(pts.length - 2, Math.floor(t)), f = t - i;
          const m = lerp2(pts[i], pts[i + 1], f), nn = nrm[i];
          const A = Q(...add(m, nn, 0.4), DECK + 0.01), B = Q(...add(m, nn, -0.4), DECK + 0.01);
          ctx.moveTo(A[0], A[1]); ctx.lineTo(B[0], B[1]);
        }
        ctx.stroke();
      }
      polyline(off(0.26), DECK + 0.03, LOOP.rail, px1());
      polyline(off(-0.26), DECK + 0.03, LOOP.rail, px1());
      parapet(near);
    }

    function drawDeckPiece(it, lod) {
      const { a, b, d, len } = it.map, p = [-d[1], d[0]];
      const slab = [add(a, p, DECK_HW), add(b, p, DECK_HW), add(b, p, -DECK_HW), add(a, p, -DECK_HW)];
      const m = lerp2(a, b, 0.5);
      if (!onScreen([Q(...slab[0], DECK), Q(...slab[1], DECK), Q(...slab[2], DECK), Q(...slab[3], DECK), Q(m[0], m[1], 0)])) return;
      if (it.pillar) pier(m, d, lod);
      prism(slab, DECK - DECK_T, DECK, LOOP.deck, 1.12);
      deckDressing([a, b], [p, p], lod, len);
      if (V.river) drawGirders(riverK(), [a, b], DECK_HW, DECK, lod, nightAt(((V.mt % 24) + 24) % 24));
    }
    function drawCorner(it, lod) {
      const c = it.corner, N = lod === "far" ? 4 : 10;
      const at = (th, rad) => [c.cx + rad * (-c.dout[0] * Math.cos(th) + c.din[0] * Math.sin(th)), c.cy + rad * (-c.dout[1] * Math.cos(th) + c.din[1] * Math.sin(th))];
      const th = Array.from({ length: N + 1 }, (_, k) => (k / N) * Math.PI / 2);
      const Ro = CORNER_R + DECK_HW, Ri = CORNER_R - DECK_HW;
      if (!onScreen([Q(...at(0, Ro), DECK), Q(...at(Math.PI / 2, Ro), DECK), Q(...at(Math.PI / 4, Ri), 0)])) return;
      const midT = Math.PI / 4, cm = at(midT, CORNER_R);
      pier(cm, [(c.dout[0] + c.din[0]) * Math.SQRT1_2, (c.dout[1] + c.din[1]) * Math.SQRT1_2], lod);
      for (let k = 0; k < N; k++) {
        wall(at(th[k], Ro), at(th[k + 1], Ro), [c.cx, c.cy], DECK - DECK_T, DECK, LOOP.deck);
        wall(at(th[k], Ri), at(th[k + 1], Ri), at((th[k] + th[k + 1]) / 2, CORNER_R), DECK - DECK_T, DECK, LOOP.deck);
      }
      poly([...th.map(t => Q(...at(t, Ro), DECK)), ...th.slice().reverse().map(t => Q(...at(t, Ri), DECK))], shade(LOOP.deck, 1.12));
      // outward normal at each sample: from the arc's centre
      const pts = th.map(t => at(t, CORNER_R));
      const nrm = th.map(t => [-c.dout[0] * Math.cos(t) + c.din[0] * Math.sin(t), -c.dout[1] * Math.cos(t) + c.din[1] * Math.sin(t)]);
      deckDressing(pts, nrm, lod, CORNER_R * Math.PI / 2);
    }

    // A station: the platform on the district side, a glass-roofed canopy on posts, the name
    // board on the roof, stairs down beside the platform. Lit (TRAIN IN) while a train stands.
    // Every line's stops too (lineGeo.stopGeo): their platforms are shorter (3-car trains), their
    // fascia in the line's colour, and up the mountain the deck (z) and the stairs' foot are
    // the ground's.
    function drawStation(it, lod, rank) {
      const g = it.geo, st = g.st, at = g.at;
      const HL = g.hl || PLAT_HL, PIN = g.pin ?? PLAT_IN, POUT = g.pout ?? PLAT_OUT, Z = g.z || 0, F0 = g.foot || 0;
      const D = DECK + Z, CAN = CANOPY + Z, accent = g.color || LOOP.cyan;
      const lit = V.trainIn?.has(st.id);
      if (!onScreen([Q(...at(-HL, POUT), CAN + 0.4), Q(...at(HL, PIN), D), Q(...at(0, POUT + STAIR_W), F0)])) return;
      const [a0, b0] = rot(0, 0, V.cam.r), [a1, b1] = rot(g.n[0], g.n[1], V.cam.r);
      const outFront = (a1 - a0) + (b1 - b0) > 0;   // the district side faces the viewer
      const rect = (al0, al1, la0, la1) => [at(al0, la0), at(al1, la0), at(al1, la1), at(al0, la1)];
      const stairs = () => {
        if (lod === "far") return;
        const [s0, s1, s2, s3] = g.stairs;   // s0,s3 at the top (platform end), s1,s2 at the street
        // the stringer under the visible long side, a triangle to the ground
        const side = outFront ? [s3, s2] : [s0, s1];
        poly([Q(...side[0], D), Q(...side[1], F0), Q(...side[0], F0)], shade(LOOP.stair, 0.62));
        poly([Q(...s0, D), Q(...s1, F0), Q(...s2, F0), Q(...s3, D)], shade(LOOP.stair, 1.25));
        ctx.strokeStyle = "rgba(8,14,10,0.7)"; ctx.lineWidth = 1; ctx.beginPath();
        const n = lod === "near" ? 12 : 6;
        for (let k = 1; k < n; k++) { const t = k / n, A = Q(...lerp2(s0, s1, t), D + (F0 - D) * t), B = Q(...lerp2(s3, s2, t), D + (F0 - D) * t); ctx.moveTo(A[0], A[1]); ctx.lineTo(B[0], B[1]); }
        ctx.stroke();
        // handrail on the open side
        const hs = outFront ? [s3, s2] : [s0, s1];
        const A = Q(...hs[0], D + 0.4), B = Q(...hs[1], F0 + 0.4);
        ctx.strokeStyle = "rgba(160,190,175,0.7)"; ctx.lineWidth = px1(); ctx.beginPath(); ctx.moveTo(A[0], A[1]); ctx.lineTo(B[0], B[1]); ctx.stroke();
      };
      if (!outFront) stairs();
      // supports under the outer edge
      for (const al of [-HL + 1, HL - 1]) {
        const m = at(al, (PIN + POUT) / 2), gz = Z ? (onTerrain(m[0], m[1]) ? terrainH(m[0], m[1]) : 0) : 0;
        prism([add(add(m, g.d, -0.15), g.n, 0.15), add(add(m, g.d, 0.15), g.n, 0.15), add(add(m, g.d, 0.15), g.n, -0.15), add(add(m, g.d, -0.15), g.n, -0.15)], gz, D - DECK_T, LOOP.pier, 1.1);
      }
      prism(rect(-HL, HL, PIN, POUT), D - DECK_T, D + 0.03, lit ? LOOP.platLit : LOOP.plat, 1.3);
      // the yellow edge strip on the track side
      poly([Q(...at(-HL, PIN), D + 0.031), Q(...at(HL, PIN), D + 0.031), Q(...at(HL, PIN + 0.1), D + 0.031), Q(...at(-HL, PIN + 0.1), D + 0.031)], LOOP.edge);
      if (lit) poly(rect(-HL + 0.2, HL - 0.2, PIN + 0.12, POUT - 0.05).map(p => Q(p[0], p[1], D + 0.032)), "rgba(103,232,249,0.16)");
      // canopy: posts on the outer edge, a glazed roof, a lit fascia on the track side
      const posts = lod === "far" ? [] : [-HL + 1.2, -HL / 3, HL / 3, HL - 1.2];
      ctx.strokeStyle = "#6f7f77"; ctx.lineWidth = Math.max(1, V.cam.z * 0.09);
      ctx.beginPath();
      for (const al of posts) { const A = Q(...at(al, POUT - 0.14), D + 0.03), B = Q(...at(al, POUT - 0.14), CAN); ctx.moveTo(A[0], A[1]); ctx.lineTo(B[0], B[1]); }
      ctx.stroke();
      prism(rect(-HL + 0.6, HL - 0.6, PIN + 0.18, POUT + 0.06), CAN, CAN + 0.07, LOOP.canopy, 1.6, lod === "far" ? 1 : 0.8);
      line(at(-HL + 0.6, PIN + 0.18), at(HL - 0.6, PIN + 0.18), CAN, lit ? (g.color ? accent : LOOP.cyanHi) : g.color ? accent : "rgba(34,211,238,0.6)", Math.max(1, V.cam.z * (lit ? 0.12 : 0.07)));
      // the name board over the roof: drawn in the label pass (legible, never overlapped). A
      // line's station has a platform per track: one board per station, on its outbound side.
      if (V.allLabels && lod !== "far" && (!g.line || st.dir === "out")) {
        const [x, y] = Q(...at(0, (PIN + POUT) / 2), CAN + 0.35);
        const sm = at(0, (PIN + POUT) / 2);
        if (!behindMountain(`st:${st.id}`, sm[0], sm[1], (g.z || 0) + CAN, V.cam.r)) V.labels.push({ id: `st:${st.id}`, station: true, lit, text: lit ? `${st.name} // TRAIN IN` : st.name, x, y, rank: 1e5 + rank });
      }
      if (outFront) stairs();
    }

    // ---- THE LINES (PHASE 2): each shuttle's double-track viaduct ------------------------------
    // The same concrete, piers and rails as the Loop, two tracks wide (closing to one over each
    // terminal's stub), the line's colour on the fascia. A deck along map points with the deck's
    // half-width, each track's offset and the ground under it at every point.
    function pierAt(m, d, lod, z, hw) {
      if (V.river && railBridgeAt(m[0], m[1], 0.3)) return;
      const p = [-d[1], d[0]], top = DECK + z - DECK_T, g0 = z > 0 && onTerrain(m[0], m[1]) ? terrainH(m[0], m[1]) : 0;
      const sq = (a, b, la, lb) => [add(add(m, d, a), p, la), add(add(m, d, b), p, la), add(add(m, d, b), p, lb), add(add(m, d, a), p, lb)];
      prism(sq(-0.22, 0.22, 0.24, -0.24), g0, top - (lod === "far" ? 0 : 0.14), LOOP.pier, 1.1);
      if (lod !== "far") prism(sq(-0.26, 0.26, hw * 0.88, -hw * 0.88), top - 0.14, top, LOOP.pier, 1.1);
    }
    function lineDeck(pts, nrm, hws, lats, zs, lod, len, color, ends = [false, false]) {
      const n = pts.length, at = (i, k) => add(pts[i], nrm[i], k), H = (i) => DECK + zs[i];
      // the slab: its two long sides where they face the viewer, the stub ends, the top
      for (const sg of [1, -1]) for (let i = 0; i + 1 < n; i++) {
        const A = at(i, sg * hws[i]), B = at(i + 1, sg * hws[i + 1]), f = facing(A, B, pts[i]);
        if (f) poly([Q(...A, H(i)), Q(...B, H(i + 1)), Q(...B, H(i + 1) - DECK_T), Q(...A, H(i) - DECK_T)], shade(LOOP.deck, f));
      }
      ends.forEach((e, j) => {
        if (!e) return;
        const i = j ? n - 1 : 0, A = at(i, hws[i]), B = at(i, -hws[i]), inside = pts[j ? n - 2 : 1], f = facing(A, B, inside);
        if (f) poly([Q(...A, H(i)), Q(...B, H(i)), Q(...B, H(i) - DECK_T), Q(...A, H(i) - DECK_T)], shade(LOOP.deck, f));
      });
      poly([...pts.map((_, i) => Q(...at(i, hws[i]), H(i))), ...pts.map((_, i) => Q(...at(n - 1 - i, -hws[n - 1 - i]), H(n - 1 - i)))], shade(LOOP.deck, 1.12));
      // dressing: which side faces the viewer
      const mid = Math.floor(n / 2);
      const [nu, nv] = (() => { const [a, b] = rot(0, 0, V.cam.r), [e, f] = rot(nrm[mid][0], nrm[mid][1], V.cam.r); return [e - a, f - b]; })();
      const near = nu + nv > 0 ? 1 : -1;
      const edge = (sg, k, dz) => pts.map((_, i) => { const q = at(i, sg * (hws[i] - k)); return Q(q[0], q[1], H(i) + dz); });
      const stroke = (S, col, w) => { ctx.strokeStyle = col; ctx.lineWidth = w; ctx.beginPath(); S.forEach((q, i) => (i ? ctx.lineTo(q[0], q[1]) : ctx.moveTo(q[0], q[1]))); ctx.stroke(); };
      stroke(edge(near, 0, -0.03), color, Math.max(1, V.cam.z * 0.07));
      if (lod === "far") return;
      const parapet = (sg) => {
        const e = pts.map((_, i) => at(i, sg * (hws[i] - 0.04)));
        for (let i = 0; i + 1 < n; i++) poly([Q(...e[i], H(i)), Q(...e[i + 1], H(i + 1)), Q(...e[i + 1], H(i + 1) + 0.13), Q(...e[i], H(i) + 0.13)], LOOP.parapet);
        stroke(e.map((q, i) => Q(q[0], q[1], H(i) + 0.13)), "#65756c", 1);
      };
      parapet(-near);
      for (const sg of [1, -1]) {
        if (lod === "near") {
          ctx.strokeStyle = LOOP.sleeper; ctx.lineWidth = Math.max(1, V.cam.z * 0.1); ctx.beginPath();
          const m = Math.max(1, Math.round(len / 0.55));
          for (let k = 0; k < m; k++) {
            const t = (k + 0.5) / m * (n - 1), i = Math.min(n - 2, Math.floor(t)), f = t - i;
            const c = lerp2(pts[i], pts[i + 1], f), nn = nrm[i], la = sg * (lats[i] + (lats[i + 1] - lats[i]) * f), h = H(i) + (H(i + 1) - H(i)) * f;
            const A = Q(...add(c, nn, la + 0.4), h + 0.01), B = Q(...add(c, nn, la - 0.4), h + 0.01);
            ctx.moveTo(A[0], A[1]); ctx.lineTo(B[0], B[1]);
          }
          ctx.stroke();
        }
        for (const r of [0.26, -0.26]) stroke(pts.map((_, i) => { const q = at(i, sg * lats[i] + r); return Q(q[0], q[1], H(i) + 0.03); }), LOOP.rail, px1());
      }
      parapet(near);
    }
    function drawLinePiece(it, lod, sub = null) {
      const p = it.map, d = p.d, nrm = [-d[1], d[0]];
      const [k0, k1] = sub || [0, 1];
      const lerpN = (x, y, k) => x + (y - x) * k;
      const a = lerp2(p.a, p.b, k0), b = lerp2(p.a, p.b, k1);
      const hwA = lerpN(p.hwA, p.hwB, k0), hwB = lerpN(p.hwA, p.hwB, k1), zA = lerpN(p.zA, p.zB, k0), zB = lerpN(p.zA, p.zB, k1);
      const m = lerp2(a, b, 0.5);
      if (!onScreen([Q(...add(a, nrm, hwA), DECK + zA), Q(...add(b, nrm, -hwB), DECK + zB), Q(...add(a, nrm, -hwA), DECK + zA), Q(...add(b, nrm, hwB), DECK + zB), Q(m[0], m[1], 0)])) return;
      if (p.pillar && k0 <= 0.5 && k1 > 0.5) pierAt(lerp2(p.a, p.b, 0.5), d, lod, (p.zA + p.zB) / 2, Math.max(p.hwA, p.hwB));
      const line = it.line, L = line.L;
      lineDeck([a, b], [nrm, nrm], [hwA, hwB], [lerpN(p.latA, p.latB, k0), lerpN(p.latA, p.latB, k1)], [zA, zB], lod, Math.hypot(b[0] - a[0], b[1] - a[1]), line.color, [k0 === 0 && p.ua < 1e-6, k1 === 1 && p.ub > L - 1e-6]);
      if (V.river && zA === 0 && zB === 0) drawGirders(riverK(), [a, b], Math.max(hwA, hwB), DECK, lod, nightAt(((V.mt % 24) + 24) % 24));
    }
    function drawLineCorner(it, lod) {
      const c = it.corner, N = lod === "far" ? 4 : 10, R = c.R;
      const at = (th, rad) => [c.cx + rad * (-c.dout[0] * Math.cos(th) + c.din[0] * Math.sin(th)), c.cy + rad * (-c.dout[1] * Math.cos(th) + c.din[1] * Math.sin(th))];
      const th = Array.from({ length: N + 1 }, (_, k) => (k / N) * Math.PI / 2);
      if (!onScreen([Q(...at(0, R + LINE_HW), DECK), Q(...at(Math.PI / 2, R + LINE_HW), DECK), Q(...at(Math.PI / 4, R - LINE_HW), 0)])) return;
      pierAt(at(Math.PI / 4, R), [(c.dout[0] + c.din[0]) * Math.SQRT1_2, (c.dout[1] + c.din[1]) * Math.SQRT1_2], lod, 0, LINE_HW);
      const pts = th.map(t => at(t, R)), nrm = th.map(t => [-c.dout[0] * Math.cos(t) + c.din[0] * Math.sin(t), -c.dout[1] * Math.cos(t) + c.din[1] * Math.sin(t)]);
      lineDeck(pts, nrm, pts.map(() => LINE_HW), pts.map(() => LINE_HW - 0.65), pts.map(() => 0), lod, R * Math.PI / 2, it.line.color);
      if (V.river) drawGirders(riverK(), pts, LINE_HW, DECK, lod, nightAt(((V.mt % 24) + 24) % 24));
    }
    // The mountain's share (coastDraw.js paints it with the terrain, back to front): the Alpine
    // Line's deck in short lengths, its Summit platforms, and the cars on it.
    function mountainExtras(lotId, lod) {
      const out = [], R = BUILDING[lotId]?.rect;
      if (!R || !V.geo?.mtn) return out;
      const inLot = (x, y) => x >= R.x && x <= R.x + R.w && y >= R.y && y <= R.y + R.h;
      for (const it of V.geo.mtn) {
        if (it.kind === "lt") {
          const p = it.map;
          if (!inLot((p.a[0] + p.b[0]) / 2, (p.a[1] + p.b[1]) / 2)) continue;
          const n = Math.max(1, Math.ceil(p.len / 0.65));
          for (let i = 0; i < n; i++) { const m = lerp2(p.a, p.b, (i + 0.5) / n); out.push({ x: m[0], y: m[1], bias: 0.05, draw: () => drawLinePiece(it, lod, [i / n, (i + 1) / n]) }); }
        } else if (it.kind === "ls") {
          const [x, y] = it.geo.at(0, (PLAT_IN + PLAT_OUT) / 2);
          if (inLot(x, y)) out.push({ x, y, bias: 0.08, draw: () => drawStation(it, lod, 0) });
        }
      }
      for (const m of V.mtnCars || []) { const p = m.c.pose; if (inLot(p.x, p.y)) out.push({ x: p.x, y: p.y, bias: 0.1, draw: () => drawCar(m, lod) }); }
      // THE ATTRITION's reach on this lot: the foothills' and the beach's first among their things, the
      // mountain's piece by piece after the ground under each
      if (V.river) {
        const tr = V.reduced ? 0 : performance.now() / 1000, night = nightAt(((V.mt % 24) + 24) % 24);
        if (lotId === "the-foothills" || lotId === "the-beach") out.push({ x: R.x, y: R.y, bias: -1e6, draw: () => lotRiver(riverK(), lotId === "the-beach" ? "beach" : "foothills", lod, tr, night) });
        else if (R.y + R.h <= -40.5 + 1e-6) {
          const [u0, v0] = rot(0, 0, V.cam.r);
          for (const it of mountainRiver(riverK(), R, lod, tr, night)) out.push({ x: 0, y: 0, bias: it.k - (u0 + v0), draw: it.draw });
        }
      }
      return out;
    }

    // Everything that moves on or under the deck, as boxes to slot into the painter's order:
    // train cars, and subjects outdoors (streets, lots, the stairs, the platforms).
    function movers(mt, trains) {
      const out = [], r = V.cam.r;
      const night = (() => { const h = ((mt % 24) + 24) % 24; return h >= 19 || h < 6.5; })();
      for (const t of trains) t.cars.forEach((c, i) => {
        const m = { kind: "car", t, c, prev: i ? t.cars[i - 1].pose : null, night, riders: V.riders.get(`${t.id}|${c.index}`) || 0, box: t.line === "loop" ? carBox(c.pose, r, c.lead && night ? 1.4 : 0) : lineCarBox(c.pose, r, CAR_HL, CAR_HW, c.lead && night ? 1.4 : 0), h: CAR_Z + (c.pose.z || 0), color: LINE[t.line]?.color };
        // a car on the mountain is painted by the mountain (with the deck under it)
        if (t.line !== "loop" && onTerrain(c.pose.x, c.pose.y) && c.pose.y < TERRAIN.y1) V.mtnCars.push(m);
        else out.push(m);
      });
      for (const o of V.outdoors) {
        let x, y, h = 0;
        if (o.open) {
          const p = PLACES[o.open], k = who(o.s);
          const wob = V.reduced ? 0 : Math.sin(mt * 6 + h01(k) * 10) * 0.4;
          x = p.rect.x + p.rect.w * (0.12 + 0.76 * h01(k + "x")) + wob;
          y = p.rect.y + p.rect.h * (0.2 + 0.6 * h01(k + "y"));
        } else {
          const w = whereOf(o.s, mt);
          if (!w || w.activity !== "commute" || w.sub === "riding") continue;
          if (w.leg === "pod") {
            // a spur's pod (sim SPURS): one subject, one pod, heading along the track
            const [u, v] = rot(w.x, w.y, r);
            out.push({ kind: "pod", s: o.s, x: w.x, y: w.y, spur: w.spur, d: podHeading(w), u, v, h: 0, box: { x0: u - 0.4, y0: v - 0.4, x1: u + 0.4, y1: v + 0.4 } });
            continue;
          }
          [x, y, h] = streetSpot(w);
          if (onTerrain(x, y)) h = terrainH(x, y);   // on the mountain's snow, not under it
        }
        const [u, v] = rot(x, y, r);
        out.push({ kind: "p", s: o.s, u, v, h, box: { x0: u, y0: v, x1: u, y1: v } });
      }
      // THE PREFECTS (prefects.js): one per district, walking the clock's patrol from the day's summary
      const sum = summaryOf(Math.floor(mt / 24) + 1);
      for (const pf of patrolsAt(mt, sum, sum?.civic)) {
        const h = onTerrain(pf.x, pf.y) ? terrainH(pf.x, pf.y) : 0, [u, v] = rot(pf.x, pf.y, r);
        out.push({ kind: "prefect", pf, u, v, h, civic: sum?.civic?.districts?.[pf.id] || null, box: { x0: u, y0: v, x1: u, y1: v } });
      }
      // THE TRAM CAR (storefrontDraw.js): the old boardwalk, end to end and back
      { const tm = tramAt(V.reduced ? 0 : performance.now() / 1000), [u, v] = rot(tm.x, tm.y, r); out.push({ kind: "tram", tm, u, v, h: 0, box: { x0: u - 0.4, y0: v - 0.4, x1: u + 0.4, y1: v + 0.4 } }); }
      ctl.movers(out, r);   // DRIVE YOURSELF: who is within reach, and the avatar itself
      return out;
    }

    // A commuter on foot or on a platform -> [x, y, h]: up on the deck waiting or stepping
    // off; on the stairs (climb 0..1, gate to platform): across the pavement to the foot of
    // the flight, up it, along the platform; otherwise the pavement.
    function streetSpot(w) {
      if (w.sub === "waiting" || w.sub === "alighting") return [w.x, w.y, DECK + (STOPS[w.stationId]?.base || 0)];
      if (w.climb > 0 && SGEO[w.stationId]) {
        const g = SGEO[w.stationId], c = Math.min(1, w.climb), mid = g.pout + STAIR_W / 2;
        const sd = g.sd || 1, foot = g.at(sd * (0.2 + STAIR_L), mid), head = g.at(sd * 0.2, mid), plat = g.at(0, LOOP_LINE.platformOffset);
        const top = DECK + g.z, f0 = g.foot;
        if (c < 0.25) return [...lerp2([g.st.gate.x, g.st.gate.y], foot, c / 0.25), f0];
        if (c < 0.9) return [...lerp2(foot, head, (c - 0.25) / 0.65), f0 + (top - f0) * (c - 0.25) / 0.65];
        return [...lerp2(head, plat, (c - 0.9) / 0.1), top];
      }
      return [w.x, w.y, 0];
    }

    // One car: a steel box on the rails, turned to the track. Far: body, roof, the cyan
    // stripe. Mid: a window band and the doors, the gangway to the car ahead. Near: each
    // window, riders in them, the cab's windscreen and lamps, roof units.
    function drawCar(m, lod) {
      const { c, t, night } = m, p = c.pose, Z = p.z || 0, stripe = m.color || LOOP.stripe;
      const [x, y] = Q(p.x, p.y, CAR_Z + Z);
      const pad = V.cam.z * 3;
      if (x < -pad || x > V.cssW + pad || y < -pad || y > V.cssH + pad) return;
      const h0 = CAR_Z + Z, h1 = CAR_Z + Z + CAR_H, H = (k) => h0 + k * CAR_H;
      const [FL, FR, BR, BL] = carCorners(p), ctr = [p.x, p.y], dir = [p.dx, p.dy];
      const glass = night ? LOOP.glassNight : LOOP.glassDay;
      // headlight pool on the deck ahead, at night
      if (c.lead && night) {
        const [gx, gy] = Q(...add(ctr, dir, CAR_HL + 0.9), DECK + Z);
        const r = V.cam.z * 1.3, gr = ctx.createRadialGradient(gx, gy, 0, gx, gy, r);
        gr.addColorStop(0, "rgba(255,244,200,0.32)"); gr.addColorStop(1, "rgba(255,244,200,0)");
        ctx.fillStyle = gr; ctx.beginPath(); ctx.ellipse(gx, gy, r, r * 0.55, 0, 0, Math.PI * 2); ctx.fill();
      }
      // gangway to the car ahead (narrower than the body, so the coupling reads)
      if (m.prev && lod !== "far") {
        const q = m.prev, pp = [-p.dy, p.dx], qp = [-q.dy, q.dx];
        const f = add(ctr, dir, CAR_HL), bk = add([q.x, q.y], [q.dx, q.dy], -CAR_HL);
        prism([add(f, pp, 0.22), add(bk, qp, 0.22), add(bk, qp, -0.22), add(f, pp, -0.22)], h0 + 0.08, h1 - 0.1, "#262e2a", 1.1);
      }
      // underframe
      if (lod !== "far") prism(carCorners(p, CAR_HL - 0.3, CAR_HW - 0.1), DECK + Z + 0.02, h0 + 0.04, "#1a201d", 1);
      const faces = [
        { a: FL, b: FR, kind: c.lead ? "cab" : "end" },
        { a: BR, b: FR, kind: "side" },
        { a: BR, b: BL, kind: c.tail ? "tail" : "end" },
        { a: BL, b: FL, kind: "side" },
      ];
      const quad = (F, t0, t1, k0, k1, fill, stroke) => poly([F(t0, k1), F(t1, k1), F(t1, k0), F(t0, k0)], fill, stroke);
      for (const fc of faces) {
        const f = facing(fc.a, fc.b, ctr);
        if (!f) continue;
        const F = (t, k) => { const q = lerp2(fc.a, fc.b, t); return Q(q[0], q[1], H(k)); };
        quad(F, 0, 1, 0, 1, shade(LOOP.body, f));
        quad(F, 0, 1, 0, 0.13, shade(LOOP.body, f * 0.45));                    // skirt
        if (fc.kind === "side") {
          quad(F, 0, 1, 0.24, 0.32, stripe);                                     // the line's stripe
          if (lod === "far") { if (night) quad(F, 0.08, 0.92, 0.48, 0.72, glass); continue; }
          const doors = [0.27, 0.73];
          if (lod === "mid") {
            quad(F, 0.05, 0.95, 0.44, 0.78, glass);
            for (const dc of doors) { quad(F, dc - 0.055, dc + 0.055, 0.14, 0.86, shade(LOOP.door, f)); quad(F, dc - 0.035, dc + 0.035, 0.46, 0.76, glass); }
            continue;
          }
          // near: each window, and riders standing or seated in them
          const WIN = [[0.05, 0.19], [0.35, 0.44], [0.455, 0.545], [0.56, 0.65], [0.81, 0.95]];
          const n = m.riders ? Math.max(1, Math.min(WIN.length, Math.round(m.riders / 12 * WIN.length))) : 0;
          WIN.forEach(([t0, t1], i) => {
            quad(F, t0, t1, 0.42, 0.8, glass, "rgba(20,28,24,0.9)");
            const seat = Math.floor(h01(`${t.id}${c.index}${i}`) * 97) % WIN.length;
            if ((i + seat) % WIN.length < n) {
              const B = F((t0 + t1) / 2, 0.42), T = F((t0 + t1) / 2, 0.8), hh = B[1] - T[1];
              if (hh >= 5) {
                ctx.fillStyle = night ? "rgba(40,26,6,0.85)" : LOOP.sil;
                ctx.beginPath(); ctx.arc(B[0], B[1] - hh * 0.6, hh * 0.15, 0, Math.PI * 2); ctx.fill();
                ctx.beginPath(); ctx.ellipse(B[0], B[1], hh * 0.26, hh * 0.3, 0, Math.PI, 0); ctx.fill();
              }
            }
          });
          for (const dc of doors) {
            quad(F, dc - 0.055, dc + 0.055, 0.14, 0.86, shade(LOOP.door, f), "rgba(20,28,24,0.9)");
            quad(F, dc - 0.04, dc - 0.006, 0.46, 0.76, glass); quad(F, dc + 0.006, dc + 0.04, 0.46, 0.76, glass);
          }
          continue;
        }
        if (lod === "far") continue;
        if (fc.kind === "cab") {
          quad(F, 0.1, 0.9, 0.46, 0.86, night ? "#1d2a22" : "#10262b", "rgba(160,220,230,0.5)");
          quad(F, 0.12, 0.26, 0.17, 0.27, "#fff4c2"); quad(F, 0.74, 0.88, 0.17, 0.27, "#fff4c2");
        } else if (fc.kind === "tail") {
          quad(F, 0.14, 0.86, 0.46, 0.8, glass);
          quad(F, 0.12, 0.24, 0.17, 0.26, "#f87171"); quad(F, 0.76, 0.88, 0.17, 0.26, "#f87171");
        } else {
          quad(F, 0.32, 0.68, 0.14, 0.84, "#262e2a");
        }
      }
      // roof, and at street zoom its units
      poly([FL, FR, BR, BL].map(q => Q(q[0], q[1], h1)), LOOP.roof, lod === "far" ? null : "rgba(40,52,46,0.8)");
      if (lod === "near") for (const al of [-0.7, 0.7]) {
        const m0 = add(ctr, dir, al), pp = [-p.dy, p.dx];
        prism([add(add(m0, dir, -0.32), pp, 0.2), add(add(m0, dir, 0.32), pp, 0.2), add(add(m0, dir, 0.32), pp, -0.2), add(add(m0, dir, -0.32), pp, -0.2)], h1, h1 + 0.07, "#7f8f87", 1.25);
      }
      // tail lamps glow at night
      if (c.tail && night) {
        const [gx, gy] = Q(...add(ctr, dir, -CAR_HL - 0.1), h0 + CAR_H * 0.22);
        ctx.fillStyle = "rgba(248,113,113,0.35)"; ctx.beginPath(); ctx.arc(gx, gy, Math.max(2, V.cam.z * 0.35), 0, Math.PI * 2); ctx.fill();
      }
    }
    function drawPerson(p, lod) {
      const [x, y] = P(p.u, p.v, p.h);
      if (x < -20 || x > V.cssW + 20 || y < -40 || y > V.cssH + 20) return;
      if (lod === "far") {
        ctx.fillStyle = FAMILY_COLOR[familyOf(p.s).family] || "#6b9a7c";
        ctx.fillRect(Math.round(x) - 1, Math.round(y) - 2, 2, 2);
        return;
      }
      const hpx = V.cam.z * STOREY * 0.95 * statureOf(p.s);   // to scale, feet on the ground
      if (lod === "mid" || hpx < 18) {
        const m = miniFor(p.s);
        const s = hpx / (SPRITE_H / 2);
        try { ctx.drawImage(m, Math.round(x - (SPRITE_W / 4) * s), Math.round(y - hpx), Math.round((SPRITE_W / 2) * s), Math.round(hpx)); } catch { /* not ready */ }
      } else {
        const e = sheetFor(p.s);
        const s = hpx / SPRITE_H;
        try { ctx.drawImage(e.img, 0, 0, SPRITE_W, SPRITE_H, Math.round(x - (SPRITE_W / 2) * s), Math.round(y - hpx), Math.round(SPRITE_W * s), Math.round(hpx)); } catch { /* not ready */ }
      }
      if (!p.s.crowd) V.hits.push({ kind: "p", s: p.s, box: [x - hpx * 0.3, y - hpx, x + hpx * 0.3, y] });   // a stand-in (crowd.js) never opens
    }
    function drawMover(m, lod) {
      if (m.kind === "p") drawPerson(m, lod);
      else if (m.kind === "prefect") {
        const [x, y] = P(m.u, m.v, m.h);
        if (x < -60 || x > V.cssW + 60 || y < -80 || y > V.cssH + 120) return;
        const [ax] = Q(m.pf.x + m.pf.dx, m.pf.y + m.pf.dy, m.h);
        drawPrefectIso({ ctx, z: V.cam.z, storey: STOREY, lod, t: V.reduced ? 0 : performance.now() / 1000, night: nightAt(((V.mt % 24) + 24) % 24), hits: V.hits, font: FONT, tops: V.pfTops || (V.pfTops = []) }, { pf: m.pf, x, y, face: ax > x + 0.01 ? 1 : 0 }, m.civic);
      }
      else if (m.kind === "ctl") ctl.drawMover(m, lod);
      else if (m.kind === "tram") drawTram(coastG(), m.tm, lod, nightAt(((V.mt % 24) + 24) % 24));
      else if (m.kind === "pod") drawPod(coastG(), m.s, m.x, m.y, m.d, m.spur, lod, nightAt(((V.mt % 24) + 24) % 24), V.hits);
      else drawCar(m, lod);
    }
    // Which way a pod faces: along the spur's track at its position, the way it is going.
    function podHeading(w) {
      const sp = Object.values(SPURS_BY_ID).find(x => x.id === w.spur);
      if (!sp) return [1, 0];
      let best = null, bd = Infinity;
      for (let i = 1; i < sp.pts.length; i++) {
        const [ax, ay] = sp.pts[i - 1], [bx, by] = sp.pts[i], vx = bx - ax, vy = by - ay, t = Math.max(0, Math.min(1, ((w.x - ax) * vx + (w.y - ay) * vy) / (vx * vx + vy * vy)));
        const d = Math.hypot(w.x - ax - vx * t, w.y - ay - vy * t);
        if (d < bd) { bd = d; best = [vx, vy]; }
      }
      const n = Math.hypot(best[0], best[1]) || 1, k = w.podDir === "in" ? 1 : -1;
      return [k * best[0] / n, k * best[1] / n];
    }

    // ---- labels: one pass on top, nearest first, none over another --------------------------
    // They fade in over a zoom range instead of all switching on at once.
    // A landmark is the other way about: up at the overview, gone once the streets have names.
    function labelAlpha(L) {
      // the landmarks only at the whole-city overview: gone as soon as a zoom starts
      if (L.landmark) return clampN((V.fitZ * 1.3 - V.cam.z) / (V.fitZ * 0.25), 0, 1);
      if (L.selected || L.id === V.hover) return 1;
      if (L.minor && !L.selected) return clampN((V.cam.z - 16) / 2, 0, 1);
      return L.selected || lodFor(V.cam.z) === "near" ? 1 : clampN((V.cam.z - 5.8) / 1.2, 0, 1);
    }
    // never under 10px: a label nobody can read is clutter
    function labelBox(L) {
      const fs = L.landmark ? 12 : clampN(Math.round(V.cam.z * 0.95), 10, 13);
      ctx.font = `${fs}px ${FONT}`;
      const w = ctx.measureText(L.text).width + 6;
      return { fs, x0: Math.round(L.x - w / 2), y0: Math.round(L.y - fs - 3), w: Math.round(w), h: fs + 4 };
    }
    function drawLabel(L, a, box = labelBox(L)) {
      ctx.globalAlpha = a;
      ctx.font = `${box.fs}px ${FONT}`; ctx.textAlign = "center"; ctx.textBaseline = "bottom";
      ctx.fillStyle = "rgba(6,10,6,0.86)"; ctx.fillRect(box.x0, box.y0, box.w, box.h);
      if (L.station) { ctx.fillStyle = L.lit ? "#67e8f9" : "rgba(34,211,238,0.55)"; ctx.fillRect(box.x0, box.y0 + box.h - 1, box.w, 1); }
      if (L.landmark) { ctx.strokeStyle = "rgba(74,222,128,0.7)"; ctx.lineWidth = 1; ctx.strokeRect(box.x0 + 0.5, box.y0 + 0.5, box.w - 1, box.h - 1); }
      ctx.fillStyle = L.station ? (L.lit ? "#e0fbff" : "#67e8f9") : L.selected || L.landmark ? "#4ade80" : "#a7d7b5"; ctx.fillText(L.text, Math.round(L.x), Math.round(L.y));
      ctx.globalAlpha = 1;
    }
    function drawLabels() {
      // a quiet map: only what is pointed at or picked is named, unless LABELS is on
      const list = V.labels.filter(L => (V.allLabels || L.selected || L.landmark || L.id === V.hover) && labelAlpha(L) > 0.02).sort((a, b) => (b.selected - a.selected) || b.rank - a.rank);
      const placed = [];
      for (const L of list) {
        const bx = labelBox(L);
        if (bx.x0 + bx.w < 0 || bx.x0 > V.cssW || bx.y0 + bx.h < 0 || bx.y0 > V.cssH) continue;
        if (placed.some(p => bx.x0 < p.x0 + p.w + 3 && p.x0 < bx.x0 + bx.w + 3 && bx.y0 < p.y0 + p.h + 1 && p.y0 < bx.y0 + bx.h + 1)) continue;
        placed.push(bx);
        drawLabel(L, labelAlpha(L), bx);
      }
    }

    // ---- the cutaway ------------------------------------------------------------------------
    function panelRect() {
      const narrow = V.cssW < 640;
      return narrow
        ? { x: 6, y: Math.round(V.cssH * 0.3), w: V.cssW - 12, h: Math.round(V.cssH * 0.7) - 6 }
        : { x: Math.round(V.cssW * 0.48), y: 8, w: Math.round(V.cssW * 0.52) - 8, h: V.cssH - 72 };
    }
    function fitText(text, maxW) {
      if (ctx.measureText(text).width <= maxW) return text;
      let t = text;
      while (t.length > 1 && ctx.measureText(t + "…").width > maxW) t = t.slice(0, -1);
      return t + "…";
    }
    function drawCutaway(b, mt, e, live) {
      const pr = panelRect();
      // floors, top storey first; basements below a ground line. A short building gets a
      // short panel (no dead space under it for the city to show through).
      const floors = b.floors.slice().sort((a, c) => c.level - a.level);
      const fh = clampN(Math.floor((pr.h - 52) / floors.length), 34, 190);
      pr.h = Math.min(pr.h, 52 + floors.length * fh);
      const x0 = pr.x, y0 = Math.round(pr.y + (1 - e) * 40);
      ctx.globalAlpha = e;
      ctx.fillStyle = PANEL_BG; ctx.fillRect(x0, y0, pr.w, pr.h);
      ctx.strokeStyle = "#4ade80"; ctx.lineWidth = 1; ctx.strokeRect(x0 + 0.5, y0 + 0.5, pr.w - 1, pr.h - 1);
      // header: name and address, cut to fit, clear of the close target
      const closeW = 48;
      ctx.font = `12px ${FONT}`; ctx.textAlign = "left"; ctx.textBaseline = "top";
      ctx.fillStyle = "#4ade80";
      ctx.fillText(fitText(`${b.name} // ${b.addr}`, pr.w - 20 - closeW), x0 + 10, y0 + 8);
      ctx.fillStyle = "#6b9a7c";
      const nF = b.floors.length;
      const game = PARK_LOTS[b.id] && gameAt(PARK_LOTS[b.id], mt);
      const sub = b.id === "hq" ? "CENSUS CLASSIFIED"
        : CIVIC_LOTS[b.id] ? civicLine(b.id, mt, V.occ[b.id] || 0)
        : COAST_LOTS[b.id] ? coastLine(b.id, mt, V.occ[b.id] || 0)
        : VENUE_LOTS[b.id] ? venueLine(b.id, mt, V.occ[b.id] || 0)
        : nightLine(b.id, mt, V.occ[b.id] || 0) ? nightLine(b.id, mt, V.occ[b.id] || 0)
        : PARK_LOTS[b.id] ? `${V.occ[b.id] || 0} ${b.id === "the-bowl" ? "IN THE BOWL" : "ON THE GROUND"} // ${game ? game.short : PARK_LOTS[b.id] === "rec-park" ? "LEISURE IN PROGRESS. IT IS BEING ENJOYED." : "NO FIXTURE. PRACTICE IS PERMITTED."}`
        : `${V.occ[b.id] || 0} INSIDE // ${nF} FLOOR${nF === 1 ? "" : "S"}`;
      ctx.fillText(fitText(sub, pr.w - 20 - closeW), x0 + 10, y0 + 24);
      ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.font = `13px ${FONT}`;
      ctx.strokeStyle = "rgba(74,222,128,0.5)"; ctx.strokeRect(x0 + pr.w - closeW - 2.5, y0 + 4.5, closeW - 4, 32);
      ctx.fillStyle = "#a7d7b5"; ctx.fillText("[ X ]", x0 + pr.w - closeW / 2 - 4, y0 + 21);
      if (live) V.hits.push({ kind: "close", panel: true, box: [x0 + pr.w - closeW - 6, y0, x0 + pr.w, y0 + 44] });
      const top = y0 + 44;
      const labW = 34;
      const now = V.reduced ? 0 : performance.now() / 1000;
      ctx.save(); ctx.beginPath(); ctx.rect(x0 + 1, top, pr.w - 2, pr.h - 46); ctx.clip();
      floors.forEach((f, i) => {
        const fy = top + i * fh;
        if (f.level === -1 || (i > 0 && floors[i - 1].level >= 0 && f.level < 0)) {
          ctx.fillStyle = "#3a2a1a"; ctx.fillRect(x0 + 1, fy - 2, pr.w - 2, 2);   // the ground line
        }
        ctx.fillStyle = f.level < 0 ? "#0b0906" : "#0a0f0a"; ctx.fillRect(x0 + 1, fy, labW, fh - 2);
        ctx.font = `11px ${FONT}`; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillStyle = "#6b9a7c";
        ctx.fillText(f.code, x0 + 1 + labW / 2, fy + fh / 2);
        const rw0 = pr.w - labW - 6;
        if (!f.places.length) { drawSealed(f, b, x0 + labW + 3, fy, rw0 - 2, fh - 2); return; }
        const rw = rw0 / f.places.length;
        f.places.forEach((pid, k) => drawRoomCut(b, f, pid, x0 + labW + 3 + k * rw, fy, rw - 2, fh - 2, f.places.length > 1, mt, now, live));
      });
      ctx.restore();
      ctx.globalAlpha = 1;
      V.panel = live ? { x0, y0, w: pr.w, h: pr.h } : null;
    }
    // A floor with no rooms on the census (HQ's bar and archive): shut, and it says so.
    function drawSealed(f, b, rx, ry, rw, rh) {
      ctx.fillStyle = "#0c110c"; ctx.fillRect(rx, ry, rw, rh);
      ctx.save(); ctx.beginPath(); ctx.rect(rx, ry, rw, rh); ctx.clip();
      ctx.strokeStyle = "rgba(74,222,128,0.08)"; ctx.lineWidth = 1;
      for (let x = rx - rh; x < rx + rw; x += 10) { ctx.beginPath(); ctx.moveTo(x, ry + rh); ctx.lineTo(x + rh, ry); ctx.stroke(); }
      ctx.restore();
      ctx.font = `10px ${FONT}`; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillStyle = "#6b9a7c";
      ctx.fillText(fitText(`${f.name} // ${b.id === "hq" ? "CLASSIFIED" : "SEALED"}`, rw - 8), rx + rw / 2, ry + rh / 2);
    }
    function nameTab(text, rx, ry, rw) {
      ctx.font = `10px ${FONT}`; ctx.textAlign = "left"; ctx.textBaseline = "top";
      const t = fitText(text, Math.max(30, rw - 10));
      const w = ctx.measureText(t).width + 6;
      ctx.fillStyle = "rgba(6,10,6,0.78)"; ctx.fillRect(rx + 1, ry + 1, w, 13);
      ctx.fillStyle = "rgba(230,240,230,0.8)"; ctx.fillText(t, rx + 4, ry + 2);
    }
    // One room: furniture from its plan (props.roomPlan), everyone present at an anchor of
    // their role (props.assignAnchors, seats kept while they stay), each doing their job
    // there (poses.drawPose). Sprites cap at 64 px: a room holds a workforce, not two giants.
    function drawRoomCut(b, f, pid, rx, ry, rw, rh, many, mt, now, live) {
      const u = Math.max(1, Math.round(rh / 40));
      const sh = clampN(Math.round(rh * 0.42), 16, 64), sw = sh * (SPRITE_W / SPRITE_H);
      const rt = typeOf(pid, f.code);
      const pk = `${pid}|${rt}|${Math.round(rw)}|${rh}|${sh}`;
      let plan = V.plans.get(pk);
      if (!plan) { plan = roomPlan(rt, rw, rh, sw, Math.round(PLACES[pid].cap / PLACES[pid].floors.length)); V.plans.set(pk, plan); }
      // the casino's tables answer a tap with their game; pushed first, so people on top win
      if (live) for (const h of casinoHits(plan, rx, ry)) V.hits.push({ kind: "casino", panel: true, go: h.go, box: h.box });
      const hour = ((mt % 24) + 24) % 24;
      const hq = b.id === "hq";
      const rk = `${b.id}|${f.index}|${pid}`;
      // HQ's census is classified; everyone else walking in counts, walking out does not sit
      const list = hq ? [] : (V.inside.get(rk) || []).filter(o => o.mode !== "leave");
      // on a field the footballers play and the sporting take the field first (parkGeo.fieldRole)
      const field = ORDERED_TYPES.has(plan.type);
      // the subject being found is seated first, so a full room never leaves them in the "+N"
      const F = V.find, fk = F && F.t?.mode === "inside" && F.t.buildingId === b.id ? F.who : null;
      const people = list.map(o => { const r = field ? fieldRole(o.s, o.w) : { role: roleOf(o.w), pri: 0 }; const key = who(o.s); return { key, role: r.role, pri: key === fk && !field ? -1e9 : r.pri, s: o.s }; });
      if (live && fk && f.index === F.t.floor && pid === F.t.placeId) F.room = { x: rx, y: ry, w: rw, h: rh };
      const prev = V.seats.get(rk);
      const { at, overflow } = assignAnchors(plan.anchors, people, prev && prev.plan === plan ? prev.at : null, hour, ORDERED_TYPES.has(plan.type));
      V.seats.set(rk, { plan, at });
      const byAnchor = new Array(plan.anchors.length);
      for (const p of people) { const i = at.get(p.key); if (i != null) byAnchor[i] = p; }
      if (live && byAnchor.length > 1) greet(rk, byAnchor.filter(Boolean).map(p => ({ s: p.s, sheet: sheetFor(p.s) })), now);   // friends who just met wave (rigReact)
      // the funnels (funnelProps.js): a cabinet opens its game, the shop floor the shop, the stage EBTV
      if (live) for (const h of funnelRoomHits(pid, plan, 0.3, u)) V.hits.push({ kind: "funnel", panel: true, spec: h.spec, box: [rx + h.box[0], ry + h.box[1], rx + h.box[2], ry + h.box[3]] });
      drawRoom(ctx, pid, rx, ry, rw, rh, u, {
        t: now, hour, plan, lit: true,
        people: (row) => {
          for (const it of row.items) {
            const a = it.a, p = a && byAnchor[a.i];
            if (!p) continue;
            const box = drawPose(ctx, sheetFor(p.s), a, actAt(a, hour, p.role, plan.type), rx + a.x, ry + a.y, sh * a.s, now, phaseOf(p.key), fitStature(p.s, a.y, sh * a.s));
            if (live) V.hits.push({ kind: "p", panel: true, s: p.s, box });
            if (live && p.key === fk) F.box = box;
          }
        },
      });
      for (const box of takeTvBoxes()) if (live) V.hits.push({ kind: "ebtv", panel: true, box });   // a TV on the wall: the real channel
      if (live) ctl.room(b, f, pid, rx, ry, rw, rh, sh, plan, byAnchor, now);   // DRIVE YOURSELF: the avatar in its room
      if (live) V.padRooms.push({ key: `${f.index}|${pid}`, x: rx + rw / 2, y: ry + rh / 2, box: [rx, ry, rx + rw, ry + rh], name: `${f.code} ${PLACES[pid]?.name || f.name}`, entry: f.level === 0, pid });   // GAMEPAD BROWSE: the rooms, to step between
      const fx = PARK_LOTS[b.id] && gameAt(pid, mt);
      nameTab(fx ? `${fx.name} // IN PLAY` : many ? PLACES[pid].name : f.name, rx, ry, rw);
      if (hq) {
        ctx.font = `9px ${FONT}`; ctx.textAlign = "right"; ctx.textBaseline = "bottom"; ctx.fillStyle = "rgba(107,154,124,0.8)";
        ctx.fillText("OCCUPANCY CLASSIFIED", rx + rw - 4, ry + rh - 3);
        return;
      }
      if (overflow.length) {
        const lab = `+${overflow.length}`;
        ctx.font = `11px ${FONT}`; const tw = ctx.measureText(lab).width + 6;
        ctx.fillStyle = "rgba(251,191,36,0.9)"; ctx.fillRect(Math.round(rx + rw - tw - 6), ry + 3, Math.round(tw), 14);
        ctx.fillStyle = "#1a1206"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
        ctx.fillText(lab, Math.round(rx + rw - tw / 2 - 6), ry + 10);
      }
    }

    // ---- which districts to load (planClient.wantSectors) -------------------------------------
    // The overview (the whole city, or near it) is drawn from the day's summary: stand-ins
    // (crowd.js) drawn the way anyone is at that size. Zoomed in past it (1.6x the fit, and
    // never before people are ~25 px tall), every district on screen loads its window, so its own
    // people replace the stand-ins; the open cutaway's district and a followed subject's too.
    // Only once the camera has settled: a zoom passes over most of the city on its way in,
    // and nothing it passes is worth downloading.
    function wantView(t) {
      const sig = `${V.cam.z.toFixed(2)}|${Math.round(V.cam.ox)}|${Math.round(V.cam.oy)}|${V.cam.r}|${V.sel}|${V.find?.t?.w?.districtId}`;
      if (sig !== V.camSig) { V.camSig = sig; V.camAt = t; }
      if (V.camTo || t - V.camAt < 350 || t - (V.wantAt || 0) < 300) return;
      V.wantAt = t;
      const ids = new Set();
      // on screen: the ground under a 7 x 7 grid over the view (a district's diamond is far
      // smaller than its bounding box), widened a little so a neighbour at the edge is ready
      if (V.cam.z >= Math.max(LOD_MID * 1.5, V.fitZ * 1.6)) for (let i = 0; i <= 6; i++) for (let j = 0; j <= 6; j++) {
        const [x, y] = screenToMap(-40 + (V.cssW + 80) * i / 6, -40 + (V.cssH + 120) * j / 6, V.cam);
        const d = DISTRICTS.find(q => x >= q.rect.x - 2 && x <= q.rect.x + q.rect.w + 2 && y >= q.rect.y - 2 && y <= q.rect.y + q.rect.h + 2);
        if (d) ids.add(d.id);
      }
      if (V.sel && BUILDING[V.sel]) ids.add(BUILDING[V.sel].districtId);
      const fw = V.find?.t?.w;
      if (fw) ids.add(fw.atDistrictId && fw.atDistrictId !== "loop" ? fw.atDistrictId : fw.districtId);
      wantSectors("iso", [...ids]);
    }

    function draw() {
      const t = performance.now();
      readCensus();
      if (!V.geo || V.geo.r !== V.cam.r) V.geo = buildGeo(V.cam.r);
      wantView(t);
      const mt = censusRef.current?.mt != null && V.reduced ? censusRef.current.mt : clockAt(Date.now()).mt;
      V.mt = mt;
      const trains = linePoses(lineTrainsAt(mt));
      if (V.find) findStep(mt, trains);
      ctl.step(mt, trains);   // DRIVE YOURSELF: input, moves, its camera
      easeCam();
      // DRIVE YOURSELF, THIRD PERSON: the street renderer behind your citizen draws this frame instead
      if (ctl.third()) { V.hits = []; V.labels = []; V.padRooms = []; V.panel = null; ctl.drawThird(); V.need = true; return; }
      const lod = lodFor(V.cam.z);
      ctx.setTransform(V.dpr, 0, 0, V.dpr, 0, 0);
      ctx.imageSmoothingEnabled = false;
      ctx.fillStyle = "#060a06"; ctx.fillRect(0, 0, V.cssW, V.cssH);
      V.hits = []; V.labels = []; V.padRooms = []; takeTvBoxes();
      V.river = riverShown(mt);
      drawGround();
      if (V.river) {
        // THE ATTRITION: the flow over the cached water, its reaches as hit areas under everything, the floats
        const RK = riverK(), tr = V.reduced ? 0 : performance.now() / 1000, night = nightAt(((mt % 24) + 24) % 24);
        drawRiverFlow(RK, lod, tr, night);
        for (const h of V.riverHits) V.hits.push({ kind: "river", id: h.id, hull: h.hull, at: h.at });
        drawSpots(RK, lod, tr, night, V.hits);
      }
      // movers slot between buildings and track by depth
      const { items, order } = V.geo;
      V.trainIn = new Set(trains.filter(t => t.dwell).map(t => t.stationId));
      const slots = new Map();
      const put = (k, m) => (slots.get(k) || slots.set(k, []).get(k)).push(m);
      V.mtnCars = [];
      // THE MOUNTAIN: every skier, rider and patroller placed once a frame; each band draws its own
      const race = raceAt(mt);
      V.crowd = { skiers: skiersIn(Object.fromEntries(SKI_PLACES.map(id => [id, V.park.get(id) || []])), mt, (s) => mountainJob(s), race), lodges: V.occ, race, lastRace: race ? null : lastRace(mt) };
      for (const m of movers(mt, trains)) put(slotForBox(m.box, m.h, items, order), m);
      const drawItem = (it, k) => {
        if (it.kind === "b") drawBuilding(it, lod, k);
        else if (it.kind === "y") drawYard(it, lod);
        else if (it.kind === "t") drawDeckPiece(it, lod);
        else if (it.kind === "k") drawCorner(it, lod);
        else if (it.kind === "lt") drawLinePiece(it, lod);
        else if (it.kind === "lk") drawLineCorner(it, lod);
        else drawStation(it, lod, k);
      };
      const late = V.geo.lateSlots;
      const tops = V.geo.topSlots;
      const drawTower = (it) => { if (it.kind === "bb") { const hour = ((mt % 24) + 24) % 24; drawBillboard(archG(), it, { lod, night: nightAt(hour), hour }); return; } const hour = ((mt % 24) + 24) % 24; drawBody(archG(), it.b, it.m, { lod, night: nightAt(hour), hour, t: V.reduced ? 0 : performance.now() / 1000, lit: 0.45, bid: bidOf(it.b.id), name: it.b.name, style: it.m.style }, new Set(["tower"])); };
      for (const it of late.get(-1) || []) drawItem(it, -1);
      for (const m of slots.get(-1) || []) drawMover(m, lod);
      for (const it of tops.get(-1) || []) drawTower(it);
      for (let k = 0; k < order.length; k++) {
        drawItem(items[order[k]], k);
        for (const it of late.get(k) || []) drawItem(it, k);
        for (const m of slots.get(k) || []) drawMover(m, lod);
        for (const it of tops.get(k) || []) drawTower(it);
      }
      drawSky(archG(), lod, mt, nightAt(((mt % 24) + 24) % 24));   // THE AIRPORT's aircraft on finals and climbing out, over everything
      // EMERGENCE (emergence.js): the drones and helicopters the city grew, and the helipads; capped (phones and reduced motion fewer)
      { const narrow = V.cssW < 640, A = airNow(mt, V.reduced ? { drones: 4, helis: 2, thin: 3 } : narrow ? { drones: 6, helis: 3 } : { drones: 14, helis: 4 });
        if (A) { drawAir(archG(), lod, nightAt(((mt % 24) + 24) % 24), V.reduced ? 0 : performance.now() / 1000, V.reduced, { air: A.air, today: A.today, pads: padsOn(A.today), depot: DEPOT }); } }
      // the overview's landmarks: where to look first (they fade as the street labels come up)
      if (V.cam.z < V.fitZ * 1.3 && !V.sel) for (const [id, text, x, y, h] of LANDMARKS) { const [lx, ly] = Q(x, y, h); V.labels.push({ id: `lm:${id}`, text, x: lx, y: ly, landmark: true, rank: 1e9 }); }
      // THE ATTRITION: the reach or fishing spot under the pointer, or the one tapped
      {
        const hov = V.hover?.startsWith("rv:") || V.hover?.startsWith("sp:") ? V.hover : null, pick = V.riverSel;
        for (const [id, at, selected] of [[pick?.id, pick && Q(pick.at[0], pick.at[1], pick.at[2] + 0.2), true], [hov !== pick?.id ? hov : null, V.ptr, false]]) {
          if (!id || !at) continue;
          const rid = id.slice(3), text = id.startsWith("sp:") ? spotName(rid) : `${REACH_NAME[rid] || ""}${selected && REACH_LINE[rid] ? ` // ${REACH_LINE[rid]}` : ""}`;
          if (text) V.labels.push({ id, text: text.length > 60 ? text.slice(0, 59) + "…" : text, x: at[0], y: at[1] - 10, selected, rank: 1e8 });
        }
      }
      if (V.hover?.startsWith("p:")) {
        const h = V.hits.find(q => q.kind === "p" && `p:${who(q.s)}` === V.hover);
        if (h) V.labels.push({ id: V.hover, text: String(h.s.name || h.s.slug || "").toUpperCase(), x: (h.box[0] + h.box[2]) / 2, y: h.box[1] - 2, rank: 1e8 });
      }
      drawLabels();
      // the prefects' designations: the hovered one's, or all of them with LABELS on
      drawPrefectTops(ctx, V.allLabels ? V.pfTops : V.pfTops.filter(T => `pf:${T.id}` === V.hover), FONT); V.pfTops = [];   // THE PREFECTS: designations over everything
      ctl.overlay();   // DRIVE YOURSELF: YOU
      // compass
      ctx.font = `11px ${FONT}`; ctx.textAlign = "left"; ctx.textBaseline = "top"; ctx.fillStyle = "rgba(107,154,124,0.8)";
      ctx.fillText(`FACING ${["NW", "NE", "SE", "SW"][V.cam.r]} // ${lod === "far" ? "OVERVIEW" : lod === "mid" ? "DISTRICT" : "STREET"}`, 8, 8);
      if (V.wheelHint > t) {
        const msg = "CLICK THE CITY FIRST TO ZOOM WITH THE WHEEL. OR HOLD CTRL.";
        ctx.font = `11px ${FONT}`; ctx.textAlign = "center"; ctx.textBaseline = "middle";
        const w = ctx.measureText(msg).width + 16;
        ctx.fillStyle = "rgba(6,10,6,0.9)"; ctx.fillRect(Math.round(V.cssW / 2 - w / 2), V.cssH - 64, Math.round(w), 22);
        ctx.fillStyle = "#a7d7b5"; ctx.fillText(msg, Math.round(V.cssW / 2), V.cssH - 53);
        V.need = true;
      }
      // the cutaway: the rest of the city steps back under a veil, the building comes forward
      V.panel = null;
      V.lift = V.sel ? (V.reduced ? 1 : Math.min(1, V.lift + 0.08)) : (V.reduced ? 0 : Math.max(0, V.lift - 0.12));
      if (!V.sel && V.lift <= 0) V.shown = null;
      const b = V.shown && BUILDING[V.shown];
      if (V.find && !b) drawFindMarker();
      if (b) {
        const e = 1 - Math.pow(1 - V.lift, 3);
        ctx.fillStyle = `rgba(4,8,4,${(0.62 * e).toFixed(3)})`; ctx.fillRect(0, 0, V.cssW, V.cssH);
        const it = items.find(x => x.kind === "b" && x.b.id === b.id);
        if (it && V.sel) drawBuilding(it, lod, 0, true);
        if (V.find) { V.find.room = null; V.find.box = null; }
        if (V.find && V.find.t?.buildingId !== b.id) drawFindMarker();
        drawCutaway(b, mt, e, !!V.sel);
        if (V.find && V.find.t?.buildingId === b.id) drawFindInPanel(e);
        V.need = true;
      }
      if (V.find && !V.reduced) V.need = true;   // the ring pulses
      // GAMEPAD BROWSE: the reticle over the open city, or the focus in the cutaway
      if (pad.active() && !ctl.active()) {
        const fb = padFocusBox();
        if (fb) drawFocus(ctx, fb, pad.P.level === "items");
        else if (!V.panel) drawReticle(ctx, pad.P.x, pad.P.y, Boolean(V.hover));
      }
    }

    // ---- the find marker: above everything, the same size at every zoom -----------------------
    // A pulsing ring where they stand (or on the roof of the car, or the building they are in),
    // a stem, and their name in inverse video. Off screen: the tag waits at the edge, pointing.
    function findTag(text, x, y, pulse) {
      ctx.font = `bold 12px ${FONT}`; ctx.textAlign = "center"; ctx.textBaseline = "middle";
      const w = Math.round(ctx.measureText(text).width + 12), h = 20;
      const bx = Math.round(clampN(x - w / 2, 4, V.cssW - w - 4)), by = Math.round(clampN(y - h, 4, V.cssH - h - 4));
      ctx.fillStyle = "#06210f"; ctx.fillRect(bx - 1, by - 1, w + 2, h + 2);
      ctx.fillStyle = "#4ade80"; ctx.fillRect(bx, by, w, h);
      ctx.fillStyle = "#06210f"; ctx.fillText(text, bx + w / 2, by + h / 2 + 1);
      return { bx, by, w, h, pulse };
    }
    function ring(x, y, r, a, flat = 0.5) {
      ctx.globalAlpha = a;
      ctx.lineWidth = 4; ctx.strokeStyle = "rgba(6,33,15,0.9)";
      ctx.beginPath(); ctx.ellipse(x, y, r, r * flat, 0, 0, Math.PI * 2); ctx.stroke();
      ctx.lineWidth = 2; ctx.strokeStyle = "#4ade80";
      ctx.beginPath(); ctx.ellipse(x, y, r, r * flat, 0, 0, Math.PI * 2); ctx.stroke();
      ctx.globalAlpha = 1;
    }
    function findName() {
      const n = V.find.s.name.toUpperCase();
      return (n.length > 24 ? n.slice(0, 23) + "…" : n) + (V.find.s.you ? " (YOU)" : "");
    }
    function drawFindMarker() {
      const F = V.find;
      if (!F.pos) return;
      const [x, y] = Q(F.pos.x, F.pos.y, F.pos.h);
      const ph = V.reduced ? 0.35 : (performance.now() / 1400) % 1;
      const off = x < 0 || x > V.cssW || y < 0 || y > V.cssH;
      if (!off) {
        const r0 = Math.max(9, V.cam.z * 0.7);
        ring(x, y, r0 + ph * 26, 1 - ph);
        ring(x, y, r0, 1);
        ctx.fillStyle = "#4ade80"; ctx.fillRect(Math.round(x) - 1, Math.round(y - 44), 2, 44 - r0 * 0.5);
        findTag(findName(), x, y - 44, ph);
        return;
      }
      // off screen: the tag at the edge, and a wedge towards them
      const cx = clampN(x, 14, V.cssW - 14), cy = clampN(y, 30, V.cssH - 14);
      const a = Math.atan2(y - cy, x - cx);
      ctx.fillStyle = "#4ade80"; ctx.beginPath();
      ctx.moveTo(cx + Math.cos(a) * 12, cy + Math.sin(a) * 12);
      ctx.lineTo(cx + Math.cos(a + 2.4) * 10, cy + Math.sin(a + 2.4) * 10);
      ctx.lineTo(cx + Math.cos(a - 2.4) * 10, cy + Math.sin(a - 2.4) * 10);
      ctx.closePath(); ctx.fill();
      findTag(findName(), cx, cy + (y < 0 ? 38 : -14), ph);
    }
    // Inside the cutaway: their room outlined, and a ring and their name on the sprite.
    function drawFindInPanel(e) {
      const F = V.find, P0 = V.panel;
      if (!F.room || !P0) return;
      const R = F.room, top = P0.y0 + 44, bot = P0.y0 + P0.h;
      if (R.y + R.h < top || R.y > bot) return;
      const ph = V.reduced ? 0.35 : (performance.now() / 1400) % 1;
      ctx.globalAlpha = e;
      ctx.lineWidth = 2; ctx.strokeStyle = "#4ade80";
      ctx.strokeRect(Math.round(R.x) + 1, Math.max(top, Math.round(R.y)) + 1, Math.round(R.w) - 2, Math.min(bot, R.y + R.h) - Math.max(top, R.y) - 2);
      ctx.globalAlpha = 1;
      if (F.box) {
        const [x0, y0, x1, y1] = F.box, cx = (x0 + x1) / 2, r0 = Math.max(10, (x1 - x0) * 0.7);
        ctx.save(); ctx.beginPath(); ctx.rect(P0.x0 + 1, top, P0.w - 2, P0.h - 45); ctx.clip();
        ring(cx, y1, r0 + ph * 18, (1 - ph) * e, 0.4);
        ring(cx, y1, r0, e, 0.4);
        ctx.restore();
        findTag(findName(), cx, y0 - 4, ph);
      } else {
        findTag(`${findName()} // IN THE ROOM`, R.x + R.w / 2, R.y + 20, ph);
      }
    }

    // ---- input -------------------------------------------------------------------------------
    const pts = new Map();
    let drag = null, pinch = null;
    const local = (e) => { const r = canvas.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
    function onDown(e) {
      pad.off();
      try { canvas.setPointerCapture?.(e.pointerId); } catch { /* synthetic or already gone */ }
      if (document.activeElement !== canvas) canvas.focus({ preventScroll: true });
      pts.set(e.pointerId, local(e));
      if (pts.size === 1) { const [x, y] = local(e); drag = { x, y, ox: V.cam.ox, oy: V.cam.oy, moved: false }; }
      if (pts.size === 2) {
        const [a, b] = [...pts.values()];
        pinch = { d: Math.hypot(a[0] - b[0], a[1] - b[1]), ang0: Math.atan2(b[1] - a[1], b[0] - a[0]), prev: 0, total: 0, done: 0, z: V.cam.z };
        drag = null;
        hands();
      }
    }
    // A mouse over the city: what is under it is named (and only that).
    function hoverAt(x, y) {
      let id = null;
      for (let i = V.hits.length - 1; i >= 0 && !id; i--) {
        const h = V.hits[i];
        if (h.panel) continue;
        const inBox = h.box && x >= h.box[0] && x <= h.box[2] && y >= h.box[1] && y <= h.box[3];
        if (h.kind === "p" && inBox) id = `p:${who(h.s)}`;
        else if (h.kind === "prefect" && inBox) id = `pf:${h.id}`;
        else if (h.kind === "b" && inPoly(x, y, h.hull)) id = h.id;
        else if (h.kind === "spot" && inBox) id = `sp:${h.id}`;
        else if (h.kind === "river" && inPoly(x, y, h.hull)) id = `rv:${h.id}`;
      }
      if (id?.startsWith("rv:") || id?.startsWith("sp:")) { V.ptr = [x, y]; V.need = true; }
      if (id !== V.hover) { V.hover = id; V.need = true; canvas.classList.toggle("point", !!id); }
    }
    function onMove(e) {
      if (e.pointerType === "mouse" && pad.active() && Math.abs(e.movementX || 0) + Math.abs(e.movementY || 0) > 2) pad.off();   // the mouse took over
      if (e.pointerType === "mouse" && !pts.size && !pad.active()) hoverAt(...local(e));
      if (!pts.has(e.pointerId)) return;
      pts.set(e.pointerId, local(e));
      if (pinch && pts.size >= 2) {
        const [a, b] = [...pts.values()];
        const d = Math.hypot(a[0] - b[0], a[1] - b[1]), ang = Math.atan2(b[1] - a[1], b[0] - a[0]);
        const cx = (a[0] + b[0]) / 2, cy = (a[1] + b[1]) / 2;
        zoomAt(cx, cy, (pinch.z * (d / pinch.d)) / V.cam.z);
        // Twist: the total angle, unwrapped, in quarter turns, rounded, with a little
        // hysteresis. 150 degrees of fingers is two quarter turns, never three.
        let da = ang - pinch.ang0 - pinch.prev;
        while (da > Math.PI) da -= 2 * Math.PI;
        while (da < -Math.PI) da += 2 * Math.PI;
        pinch.total += da; pinch.prev = ang - pinch.ang0;
        const q = Math.PI / 2, want = pinch.total / q;
        if (Math.abs(want - pinch.done) > 0.62) { const dir = want > pinch.done ? 1 : -1; pinch.done += dir; turn(dir, cx, cy); }
        return;
      }
      if (drag && ctl.third()) {   // DRIVE YOURSELF, THIRD PERSON: a drag turns the camera round you
        const [x] = local(e);
        ctl.orbit((x - (drag.lx ?? drag.x)) * 0.008); drag.lx = x;
        if (Math.abs(x - drag.x) > 4) drag.moved = true;
        return;
      }
      if (drag) {
        const [x, y] = local(e);
        if (Math.abs(x - drag.x) + Math.abs(y - drag.y) > 4) { if (!drag.moved) { hands(); unfollow(); ctl.hands(); } drag.moved = true; }
        if (drag.moved) { V.cam.ox = drag.ox + (x - drag.x); V.cam.oy = drag.oy + (y - drag.y); V.need = true; }
      }
    }
    function onUp(e) {
      const wasTap = drag && !drag.moved && pts.size === 1;
      pts.delete(e.pointerId);
      if (pts.size < 2) pinch = null;
      if (wasTap) tap(...local(e), e.pointerType !== "mouse");
      if (!pts.size) drag = null;
    }
    // Front-most first, in the order things were painted: whatever covers a spot owns the
    // tap. Inside the open cutaway only the cutaway answers (its people, its close box).
    function tap(x, y, touch = false) {
      const inBox = (h) => h.box && x >= h.box[0] && x <= h.box[2] && y >= h.box[1] && y <= h.box[3];
      if (V.panel && x >= V.panel.x0 && x <= V.panel.x0 + V.panel.w && y >= V.panel.y0 && y <= V.panel.y0 + V.panel.h) {
        for (let i = V.hits.length - 1; i >= 0; i--) {
          const h = V.hits[i];
          if (!h.panel || !inBox(h)) continue;
          if (h.kind === "close") { unfollow(); select(null); } else if (h.kind === "funnel") openFunnel(h.spec); else if (h.kind === "ebtv") openFunnel({ href: watchHref(), campaign: "ebtv-tv" }); else if (h.kind === "casino") window.location.hash = h.go; else onOpenRef.current?.(h.s);
          return;
        }
        return;
      }
      for (let i = V.hits.length - 1; i >= 0; i--) {
        const h = V.hits[i];
        if (h.panel) continue;
        if (h.kind === "p" && inBox(h)) { onOpenRef.current?.(h.s); return; }
        if (h.kind === "prefect" && inBox(h)) { openPrefect(h.id); return; }
        if (h.kind === "ebtv" && inBox(h)) { openFunnel({ href: watchHref(), campaign: "ebtv-tv" }); return; }
        if (h.kind === "chess" && inBox(h)) { window.location.hash = h.go; return; }   // PARK CHESS: sit at the table
        // THE ATTRITION: a tap names the reach (or the fishing spot) until the next tap elsewhere
        if (h.kind === "spot" && inBox(h)) { V.riverSel = { id: `sp:${h.id}`, at: h.at }; V.need = true; return; }
        if (h.kind === "river" && inPoly(x, y, h.hull)) { const [mx, my] = screenToMap(x, y, V.cam); V.riverSel = { id: `rv:${h.id}`, at: h.at[2] > 0.5 ? h.at : [mx, my, 0] }; V.need = true; return; }
        if (h.kind === "b" && inPoly(x, y, h.hull)) {
          unfollow();
          // touch: the first tap names it, the second opens it, a third goes inside
          if (!touch) select(V.sel === h.id ? null : h.id);
          else if (V.sel === h.id) apiRef.current.enter();
          else if (V.peek === h.id) select(h.id);
          else { if (V.sel) select(null); setPeekState(h.id); }
          return;
        }
      }
      if (V.riverSel) { V.riverSel = null; V.need = true; }
      if (V.peek) setPeekState(null);
      if (V.sel) { unfollow(); select(null); }
    }
    // The wheel scrolls the page unless the city has been clicked (focused) or ctrl is held
    // (a trackpad pinch sends ctrl): a 600 px canvas must not trap the page.
    function onWheel(e) {
      if (!(e.ctrlKey || e.metaKey || document.activeElement === canvas)) { V.wheelHint = performance.now() + 1600; V.need = true; return; }
      e.preventDefault();
      const [x, y] = local(e);
      zoomAt(x, y, Math.exp(-e.deltaY * 0.0015));
    }
    // the keyboard's building order: the ones on screen, by distance from the view's centre
    let keyIds = null, keyAt = "";
    function keyOrder() {
      const at = `${V.cam.r}|${Math.round(V.cam.ox / 40)}|${Math.round(V.cam.oy / 40)}|${Math.round(V.cam.z)}`;
      if (keyIds && (keyAt === at || V.sel)) return keyIds;
      keyAt = at;
      const cx = V.cssW / 2, cy = V.cssH / 2;
      keyIds = BUILDINGS.map(b => { const [x, y] = Q(b.pos.x, b.pos.y, 0); return { id: b.id, x, y }; })
        .filter(p => p.x > 0 && p.x < V.cssW && p.y > 0 && p.y < V.cssH)
        .sort((a, c) => Math.hypot(a.x - cx, a.y - cy) - Math.hypot(c.x - cx, c.y - cy)).map(p => p.id);
      return keyIds;
    }
    function onKey(e) {
      if (ctl.owns(e)) return;   // DRIVE YOURSELF: its keys are read on the window
      if (e.key === "q" || e.key === "Q") { turn(-1); e.preventDefault(); }
      else if (e.key === "e" || e.key === "E") { turn(1); e.preventDefault(); }
      else if (e.key === "+" || e.key === "=") zoomAt(V.cssW / 2, V.cssH / 2, 1.3);
      else if (e.key === "-") zoomAt(V.cssW / 2, V.cssH / 2, 1 / 1.3);
      else if (e.key === "Escape" && V.find) { e.preventDefault(); apiRef.current.endFind(); }
      else if (e.key === "Escape" && V.sel) select(null);
      else if (e.key === "Escape" && V.peek) setPeekState(null);
      else if (e.key === "Enter" && V.sel) apiRef.current.enter();
      // [ and ]: the buildings one by one, nearest the middle of the view first, for anyone without a pointer
      else if (e.key === "[" || e.key === "]") {
        const ids = keyOrder(), i = ids.indexOf(V.sel), n = ids.length;
        if (n) select(ids[(i < 0 ? (e.key === "]" ? 0 : n - 1) : i + (e.key === "]" ? 1 : -1) + n) % n]);
        e.preventDefault();
      }
      else if (e.key.startsWith("Arrow")) {
        hands(); unfollow();
        const d = 40;
        if (e.key === "ArrowLeft") V.cam.ox += d; if (e.key === "ArrowRight") V.cam.ox -= d;
        if (e.key === "ArrowUp") V.cam.oy += d; if (e.key === "ArrowDown") V.cam.oy -= d;
        V.need = true; e.preventDefault();
      } else return;
    }
    // ---- GAMEPAD BROWSE (padBrowse.js): everything but driving, from a controller ---------------
    const hitName = (id) => {
      if (!id) return null;
      if (BUILDING[id]) return `${BUILDING[id].name}. ${V.occ[id] || 0} inside.`;
      if (id.startsWith("p:")) { const h = V.hits.find(q => q.kind === "p" && !q.panel && `p:${who(q.s)}` === id); return h ? String(h.s.name || h.s.slug || "Someone") : null; }
      if (id.startsWith("pf:")) return "A prefect";
      if (id.startsWith("rv:") || id.startsWith("sp:")) return "The Attrition";
      return null;
    };
    const boxC = (b) => [(b[0] + b[2]) / 2, (b[1] + b[3]) / 2];
    const hullC = (hull) => { let x = 0, y = 0; for (const [a, c] of hull) { x += a; y += c; } return [x / hull.length, y / hull.length]; };
    let padIdx = -1;
    function padStep(dir) {
      const ids = keyOrder(), n = ids.length;
      if (!n) return null;
      const i = V.peek ? ids.indexOf(V.peek) : padIdx;
      padIdx = i < 0 ? (dir > 0 ? 0 : n - 1) : (i + dir + n) % n;
      const id = ids[padIdx];
      unfollow();
      setPeekState(id);
      const h = V.hits.find(q => q.kind === "b" && q.id === id && q.hull);
      if (h) return hullC(h.hull);
      const b = BUILDING[id];
      return Q(b.pos.x, b.pos.y, 1);
    }
    // what is in a room of the open cutaway: its people, cabinets, shop items, TVs (not the room itself)
    function padItems(roomKey) {
      const r = V.padRooms.find(q => q.key === roomKey);
      if (!r) return [];
      const [x0, y0, x1, y1] = r.box, area = (x1 - x0) * (y1 - y0), seen = new Map();
      const out = [];
      for (const h of V.hits) {
        if (!h.panel || h.kind === "close" || !h.box) continue;
        const [cx, cy] = boxC(h.box);
        if (cx < x0 || cx > x1 || cy < y0 || cy > y1) continue;
        if ((h.box[2] - h.box[0]) * (h.box[3] - h.box[1]) >= area * 0.8) continue;   // the room's own tap
        const sp = h.spec || {};
        let k = h.kind === "p" ? `p:${who(h.s)}` : h.kind === "funnel" ? `f:${sp.kind}:${sp.slug || sp.item || sp.host || ""}` : `${h.kind}:${h.go || ""}`;
        const n = seen.get(k) || 0; seen.set(k, n + 1); if (n) k += `#${n}`;
        const name = h.kind === "p" ? String(h.s.name || h.s.slug || "Someone")
          : h.kind === "funnel" ? (sp.kind === "game" ? `Play ${String(sp.slug || "the cabinet").replace(/-/g, " ")}` : sp.kind === "shop" ? (sp.item ? "A shop item" : "The shop") : sp.kind === "host" ? `${sp.host || "The host"}, on the floor` : sp.kind === "ebtv" ? "EBTV" : "Open")
          : h.kind === "ebtv" ? "EBTV, live" : h.kind === "casino" ? "A table" : "Open";
        out.push({ key: k, x: cx, y: cy, box: h.box, name, hit: h });
      }
      return out;
    }
    function padFocusBox() {
      const P = pad.P;
      if (!V.panel || !P.room) return null;
      if (P.level === "items") { const it = padItems(P.room).find(q => q.key === P.item); if (it) return it.box; }
      return V.padRooms.find(q => q.key === P.room)?.box || null;
    }
    const pad = makePadBrowse({
      size: () => [V.cssW, V.cssH], driving: () => ctl.active(), hasSelf: () => Boolean(selfRef.current), reduced: () => V.reduced,
      poke: () => { V.need = true; }, wake: () => dropHintRef.current?.(), publish: (ui) => setPadUiRef.current(ui), say: (t) => setPadSayRef.current(t), focus: () => canvas.focus({ preventScroll: true }),
      other: "MAP",
      targets: () => V.hits.filter(h => !h.panel && h.box && (h.kind === "p" || h.kind === "prefect" || h.kind === "spot")).map(h => { const [x, y] = boxC(h.box); return { x, y }; }),
      hover: (x, y) => { hoverAt(x, y); return hitName(V.hover); },
      // A again on the building whose chip is up opens it, whoever walks in front of it meanwhile
      tap: (x, y) => {
        const h = V.peek && V.hits.find(q => q.kind === "b" && q.id === V.peek && q.hull);
        if (h && inPoly(x, y, h.hull)) { unfollow(); select(V.peek); } else tap(x, y, true);
      },
      back: () => {
        if (V.peek) { setPeekState(null); return true; }
        if (V.riverSel) { V.riverSel = null; V.need = true; return true; }
        if (V.find) { apiRef.current.endFind(); return true; }
        return false;
      },
      pan: (dx, dy) => { hands(); unfollow(); V.cam.ox += dx; V.cam.oy += dy; V.need = true; },
      zoom: (f, x, y) => zoomAt(x, y, f), turn: (d) => turn(d), fit: () => apiRef.current.fit(), labels: () => toggleLabelsRef.current?.(),
      prev: () => padStep(-1), next: () => padStep(1),
      rooms: () => (V.sel && V.panel && V.padRooms?.length ? V.padRooms : null),
      items: padItems,
      open: (it) => {
        const h = it.hit;
        if (h.kind === "p") onOpenRef.current?.(h.s);
        else if (h.kind === "funnel") openFunnel(h.spec);
        else if (h.kind === "ebtv") openFunnel({ href: watchHref(), campaign: "ebtv-tv" });
        else if (h.kind === "casino") window.location.hash = h.go;
        else tap(it.x, it.y);
      },
      roomAct: (r) => {
        const [x0, y0, x1, y1] = r.box, area = (x1 - x0) * (y1 - y0);
        const whole = V.hits.find(h => h.panel && h.kind === "funnel" && h.box && (h.box[2] - h.box[0]) * (h.box[3] - h.box[1]) >= area * 0.8 && Math.abs(h.box[0] - x0) < 2 && Math.abs(h.box[1] - y0) < 2);
        if (whole) openFunnel(whole.spec); else apiRef.current.enter();
      },
      enter: () => apiRef.current.enter(), close: () => { unfollow(); select(null); },
    });
    canvas.addEventListener("pointerdown", onDown);
    // a hand on the city has understood the hint
    const seen = () => dropHintRef.current?.();
    canvas.addEventListener("pointerdown", seen, { once: true });
    canvas.addEventListener("wheel", seen, { once: true, passive: true });
    canvas.addEventListener("pointermove", onMove);
    const onLeave = () => { if (V.hover) { V.hover = null; V.need = true; canvas.classList.remove("point"); } };
    canvas.addEventListener("pointerleave", onLeave);
    canvas.addEventListener("pointerup", onUp);
    canvas.addEventListener("pointercancel", onUp);
    canvas.addEventListener("wheel", onWheel, { passive: false });
    canvas.addEventListener("keydown", onKey);
    const ctlDetach = ctl.attach();
    const onDocKey = (e) => {
      if (e.key !== "Escape" || !V.find || e.defaultPrevented || ctl.active()) return;
      const a = document.activeElement;
      if (a === canvas || (a && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName))) return;
      if (document.querySelector(".hvi-pen-card, [role='dialog']")) return;
      apiRef.current.endFind();
    };
    window.addEventListener("keydown", onDocKey);

    // ---- loop --------------------------------------------------------------------------------
    let raf = 0, onScreenNow = true, dead = false;
    function frame() {
      pad.poll();   // GAMEPAD BROWSE: before the frame is drawn
      if (!V.reduced || V.need || censusRef.current?.v !== V.censusV) { V.need = false; draw(); }
      const tl = tvLinkRef.current, lab = ebtvLabel();
      if (tl && tl.getAttribute("aria-label") !== lab) tl.setAttribute("aria-label", lab);
      else if (V.geo) wantView(performance.now());   // still, and drawing nothing new: the camera settles
      raf = requestAnimationFrame(frame);
    }
    function sync() {
      const want = !dead && onScreenNow && !document.hidden;
      if (want && !raf) raf = requestAnimationFrame(frame);
      if (!want && raf) { cancelAnimationFrame(raf); raf = 0; }
    }
    const io = typeof IntersectionObserver !== "undefined" ? new IntersectionObserver(([en]) => { onScreenNow = en.isIntersecting; sync(); }) : null;
    io?.observe(wrap);
    document.addEventListener("visibilitychange", sync);
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(() => resize()) : null;
    ro ? ro.observe(wrap) : window.addEventListener("resize", resize);
    const onMotion = () => { V.reduced = !!mq?.matches; V.need = true; };
    mq?.addEventListener?.("change", onMotion);
    resize();
    // Back from a building: the same camera, turn and cutaway (same width only).
    if (SAVED && SAVED.cssW === V.cssW) {
      V.cam = { ...SAVED.cam };
      V.geo = null;
      if (SAVED.sel) { V.sel = SAVED.sel; V.shown = SAVED.sel; V.lift = 1; V.seatsFor = SAVED.sel; setSelRef.current(SAVED.sel); }
      V.need = true;
    }
    SAVED = null;
    sync();
    if (import.meta.env?.DEV) window.__hviIso = { V, turn, select, zoomAt, fit, tap, draw, startFind, ctl, selfRef, centreOn, pad };
    return () => {
      SAVED = { cam: { ...(V.camTo ? { ...V.cam, ...V.camTo } : V.cam) }, sel: V.sel, cssW: V.cssW };
      dead = true; sync();
      wantSectors("iso", []);
      io?.disconnect();
      document.removeEventListener("visibilitychange", sync);
      ro ? ro.disconnect() : window.removeEventListener("resize", resize);
      mq?.removeEventListener?.("change", onMotion);
      canvas.removeEventListener("pointerdown", onDown);
      canvas.removeEventListener("pointerdown", seen);
      canvas.removeEventListener("wheel", seen);
      canvas.removeEventListener("pointermove", onMove);
      canvas.removeEventListener("pointerleave", onLeave);
      canvas.removeEventListener("pointerup", onUp);
      canvas.removeEventListener("pointercancel", onUp);
      canvas.removeEventListener("wheel", onWheel);
      canvas.removeEventListener("keydown", onKey);
      window.removeEventListener("keydown", onDocKey);
      ctlDetach();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  dropHintRef.current = hint ? dropHint : null;
  // A new find (or the same one picked again: n) flies the camera; null ends it.
  useEffect(() => { apiRef.current.find?.(find); }, [find]);
  // #city?welcome=<who> (City.jsx): the camera glides to the place they were invited to and opens it
  useEffect(() => { if (welcome) apiRef.current.visit?.(welcome.building); }, [welcome]);

  const b = sel && BUILDING[sel];
  return (
    <div className="hvi-city-stage" ref={wrapRef} data-pad-own="city">
      {found && (
        <div className="hvi-city-found">
          <span className="tag" aria-hidden="true">{found.following ? "TRACKING" : "FOUND"}</span>
          <span className="l" role="status">{found.line}</span>
          {!found.following && <button type="button" className="hvi-city-zb txt" onClick={() => apiRef.current.follow?.()}>FOLLOW</button>}
          {find?.s?.you && <TakeControlButton onTake={() => apiRef.current.takeControl?.()} />}
          <button type="button" className="hvi-city-zb" aria-label="Stop finding" onClick={() => apiRef.current.endFind?.()}>×</button>
        </div>
      )}
      {welcome && !found && (
        <div className="hvi-city-found">
          <span className="l" role="status">{welcome.line}</span>
          <button type="button" className="hvi-city-zb" aria-label="Dismiss the welcome" onClick={() => onWelcomeEnd?.()}>×</button>
        </div>
      )}
      {hint && !found && !b && !welcome && (
        <div className="hvi-city-hint" role="note" aria-label="What you are looking at">
          <p><b>THE SUBSTRATE.</b> A CITY THAT RUNS ITSELF. EVERYONE IN IT IS ON FILE, ON A SCHEDULE, IN REAL TIME.</p>
          <p className="do">TAP ANY BUILDING TO SEE WHO IS INSIDE.</p>
          <button type="button" className="hvi-city-zb txt" onClick={dropHint}>UNDERSTOOD</button>
        </div>
      )}
      <ControlLayer onRelease={() => apiRef.current.release?.()} />
      <PadHint ui={padUi} />
      <NoFileNote />
      <TouchGate label="TAP TO EXPLORE" hint="DRAG · PINCH">
        <canvas ref={canvasRef} tabIndex={0} className="hvi-city-canvas" role="img"
          aria-label="The Substrate from above, SimCity-style: solid buildings with lit windows, the Loop train on its deck, subjects in the streets. Drag or use the arrow keys to move, pinch or plus and minus to zoom, Q and E to turn. Tap a building, or press ] and [ to step through the buildings in view, to open its cutaway: every floor and room, and who is in it; Enter goes inside. With a game controller: the left stick moves a cursor that names what it is over, A opens, B backs out, the right stick pans, the triggers zoom, the bumpers turn, X finds, Y names everything. The list under the city says what is happening now, and the district directory lists every district." />
        {b?.id === "eb-shop" && <ShopWallLinks />}
        {b && UNIT_SET.has(b.id) && <NpcShopLinks pid={b.id} />}
        <a ref={tvLinkRef} className="sr-only hvi-city-tvlink" href={watchHref()} target="_blank" rel="noopener" aria-label={ebtvLabel()}>Electric Basement TV, live</a>
      </TouchGate>
      <div className={`hvi-city-zoom${peek && !b ? " peeking" : ""}`} role="toolbar" aria-label="City view controls">
        {b && <span className="hint" title={b.name}>{b.name}</span>}
        <button type="button" className="hvi-city-zb nav" aria-label="Turn left" onClick={() => apiRef.current.turn?.(-1)}><TurnIcon dir={-1} /></button>
        <button type="button" className="hvi-city-zb nav" aria-label="Turn right" onClick={() => apiRef.current.turn?.(1)}><TurnIcon dir={1} /></button>
        <button type="button" className="hvi-city-zb nav" aria-label="Zoom in" onClick={() => apiRef.current.zoom?.(1.4)}>+</button>
        <button type="button" className="hvi-city-zb nav" aria-label="Zoom out" onClick={() => apiRef.current.zoom?.(1 / 1.4)}>−</button>
        {b
          ? <>
              {funnelButtons(b.id).map(f => <button key={f.label} type="button" className="hvi-city-zb txt" aria-label={f.aria} onClick={() => openFunnel(f.spec)}>{f.label}</button>)}
              {storeButtons(b.id).map(f => <button key={f.label} type="button" className="hvi-city-zb txt" aria-label={f.aria} onClick={() => openBusiness(f.spec)}>{f.label}</button>)}
              <button type="button" className="hvi-city-zb txt" onClick={() => apiRef.current.enter?.()}>ENTER</button>
              <button type="button" className="hvi-city-zb txt" aria-label="Close the cutaway" onClick={() => apiRef.current.close?.()}>CLOSE</button>
            </>
          : peek
            ? <>
                <span className="chip" role="status" title={peek.line}>{peek.line}</span>
                <button type="button" className="hvi-city-zb txt" aria-label={`Open ${BUILDING[peek.id]?.name || "the building"}`} onClick={() => apiRef.current.open?.()}>OPEN</button>
              </>
            : <>
                <button type="button" className="hvi-city-zb txt" aria-label="Fit the whole city" onClick={() => apiRef.current.fit?.()}>FIT</button>
                <button type="button" className="hvi-city-zb txt" aria-pressed={labels} title="Name everything on the map" onClick={toggleLabels}>LABELS</button>
              </>}
      </div>
      {(b || padSay) && <p className="sr-only" role="status">{padSay && padUi ? padSay : b ? `${b.name} open. ${b.floors.length} floor${b.floors.length === 1 ? "" : "s"}. ${b.floors.map(f => `${f.code} ${f.name}`).join(", ")}.` : ""}</p>}
    </div>
  );
}

// A quarter-turn arrow, drawn (the ⟲ ⟳ glyphs are missing from the terminal font and fall
// back to small circles).
function TurnIcon({ dir }) {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="square" style={dir > 0 ? { transform: "scaleX(-1)" } : undefined}>
      <path d="M5 5.5A6 6 0 1 1 3.2 10" />
      <path d="M1.5 2.5v4h4" />
    </svg>
  );
}
