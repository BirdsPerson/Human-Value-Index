// #cards: THE CARD ROOM. Card tables in the city: HOUSE EDGE CASINO's card room, the back table at
// THE DIVE, the card table at THE UNION LOUNGE, and your own flat. Tap a table, sit, play.
//   #cards[?at=casino|bar|union|home]           the room: three tables, three figures at each
//   #cards/hearts?at=..&t=1..3[&short=1]        HEARTS at that table
//   #cards/spades?at=..&t=1..3[&short=1]        SPADES (you and the figure across, against the other two)
//   #cards/solitaire, #cards/spider             the home games: they need a DECK OF CARDS (EASTGATE HOME)
// Exhibition: no CYCLES or chips are won or lost at these tables (the casino's HOLD'EM is the chips game).
import { useEffect, useMemo, useState } from "react";
import { Frame, Button, ButtonRow, Chip, Chips, PaLine, ScreenHead } from "../../ui/index.js";
import { readCaseId, CaseLogon } from "../../caseFile.jsx";
import { loadShops, lastView } from "../../shops/client.js";
import { tablesFor, tableLevel, roomOf, ROOMS, ownsDeck, ownsEbDeck, ownsTable } from "./roster.js";
import { useFour, setFour, utcDay } from "./prefs.js";
import PixelCard from "./PixelCard.jsx";
import Head, { spriteOf } from "./Head.jsx";
import TrickGame from "./TrickGame.jsx";
import { Klondike, Spider } from "./Solitaire.jsx";
import CSS from "./cards.css?inline";
import "../pages.css";

const GAMES = ["hearts", "spades", "solitaire", "spider"];
function injectStyles() {
  let el = document.getElementById("cr-styles");
  if (!el) { el = document.createElement("style"); el.id = "cr-styles"; document.head.appendChild(el); }
  if (el.textContent !== CSS) el.textContent = CSS;
}
export function parseCards(route) {
  const [path, q] = String(route || "").split("?");
  const g = path.split("/")[1];
  const p = new URLSearchParams(q || "");
  const at = ROOMS[p.get("at")] ? p.get("at") : g === "solitaire" || g === "spider" ? "home" : "casino";
  const t = Math.max(1, Math.min(3, Number(p.get("t")) || 1));
  return { game: GAMES.includes(g) ? g : null, at, t, short: p.get("short") === "1" };
}
const hrefOf = ({ game, at, t, short }) => `#cards${game ? `/${game}` : ""}?at=${at}${game === "hearts" || game === "spades" ? `&t=${t}${short ? "&short=1" : ""}` : ""}`;
const CITY = { casino: "#city/strip/casino", bar: "#city/strip/the-dive", union: "#city/campus/eb-shop", home: "#city" };

// The case's deck (THE SHOPS' inventory): null while asking.
function useDeck() {
  const [caseId, setCaseId] = useState(() => readCaseId());
  useEffect(() => { const on = (e) => setCaseId(e.detail || readCaseId()); window.addEventListener("hvi-case", on); return () => window.removeEventListener("hvi-case", on); }, []);
  const [v, setV] = useState(() => (caseId ? lastView(caseId) : null));
  const [state, setState] = useState(caseId ? "asking" : "nocase");
  useEffect(() => {
    let off = false;
    if (!caseId) { setState("nocase"); return undefined; }
    setState("asking");
    loadShops(caseId).then(d => { if (!off) { setV(d); setState("ok"); } }).catch(() => { if (!off) setState("error"); });
    return () => { off = true; };
  }, [caseId]);
  const items = v?.items || null;
  return { caseId, setCaseId, state, deck: ownsDeck(items), eb: ownsEbDeck(items), table: ownsTable(items), poker: Array.isArray(items) && items.some(i => i?.ref === "poker-table") };
}

function BuyDeck({ D }) {
  return (
    <div>
      <PaLine tag="EASTGATE HOME>" text={D.state === "error" ? "THE DEPARTMENT CANNOT CONFIRM YOUR DECK RIGHT NOW. THE SHOPS DID NOT ANSWER." : "SOLITAIRE AND SPIDER ARE PLAYED AT HOME, WITH YOUR OWN DECK OF CARDS. THE DEPARTMENT DOES NOT LEND DECKS."} />
      <ButtonRow stackOnMobile>
        <Button variant="primary" href="#shop/eastgate-home" data-pad="first">BUY A DECK AT EASTGATE HOME</Button>
      </ButtonRow>
      <p className="cr-fine">A DECK OF CARDS IS 50 CYCLES (THE EB HOUSE DECK, 400). PLACE IT ON A TABLE IN YOUR FLAT AND TAP IT TO DEAL. UPGRADE IT TO A CARD TABLE FOR HOME GAME NIGHT.</p>
      {D.state === "nocase" && <><p className="cr-p cr-dim">ALREADY OWN ONE? ENTER YOUR CASE NUMBER.</p><CaseLogon onRestored={(id) => D.setCaseId(id)} /></>}
    </div>
  );
}

export default function Cards({ route }) {
  useEffect(() => { injectStyles(); }, []);
  const nav = parseCards(route);
  const { game, at, t, short } = nav;
  const room = roomOf(at);
  const four = useFour();
  const day = useMemo(utcDay, []);
  const tables = useMemo(() => tablesFor(at, day), [at, day]);
  const D = useDeck();
  const go = (next) => { window.location.hash = hrefOf({ ...nav, ...next }).slice(1); };
  const roomHref = hrefOf({ at });

  // ---- a game ---------------------------------------------------------------------------------------
  if (game === "hearts" || game === "spades") {
    const tb = tables[t - 1];
    const homeLocked = at === "home" && D.state === "ok" && !D.table;
    return (
      <div className="cr">
        <ScreenHead title={game === "hearts" ? "HEARTS" : "SPADES"} meta={`${room.name} // TABLE ${t}`} />
        {homeLocked ? (
          <Frame title="HOME GAME NIGHT" meta="NEEDS A CARD TABLE">
            <PaLine tag="EASTGATE HOME>" text="FOUR AT A TABLE NEEDS A TABLE. UPGRADE YOUR DECK OF CARDS TO A CARD TABLE (YOUR FURNITURE, AT THE SHOPS), OR PLAY AT THE CASINO, THE DIVE OR THE UNION LOUNGE." />
            <ButtonRow stackOnMobile><Button variant="primary" href="#shop">YOUR FURNITURE</Button><Button variant="secondary" href={hrefOf({ at: "casino" })}>THE CASINO'S CARD ROOM</Button></ButtonRow>
          </Frame>
        ) : (
          <Frame title={`${game === "hearts" ? "HEARTS" : "SPADES"} // ${tb.seats.map(s => s.name).join(", ")}`} meta={short ? "SHORT GAME" : "EXHIBITION"}>
            <TrickGame key={`${game}-${at}-${t}-${short}`} kind={game} table={tb} at={at} target={game === "hearts" ? (short ? 50 : 100) : (short ? 300 : 500)}
              onLeave={() => go({ game: null })} onNewTable={() => go({ game: null })} backHref={roomHref} />
          </Frame>
        )}
        <ButtonRow split stackOnMobile>
          <Button variant="back" href={roomHref}>Leave the table</Button>
          <Button variant="secondary" onClick={() => setFour(!four)} aria-pressed={four}>{four ? "FOUR-COLOUR DECK: ON" : "FOUR-COLOUR DECK: OFF"}</Button>
        </ButtonRow>
      </div>
    );
  }
  if (game === "solitaire" || game === "spider") {
    return (
      <div className="cr">
        <ScreenHead title={game === "solitaire" ? "SOLITAIRE" : "SPIDER SOLITAIRE"} meta="YOUR FLAT // YOUR OWN DECK" />
        <Frame title={game === "solitaire" ? "SOLITAIRE (KLONDIKE)" : "SPIDER SOLITAIRE"} meta={D.eb ? "THE EB HOUSE DECK" : D.deck ? "A DECK OF CARDS" : "NO DECK ON FILE"}>
          {D.state === "asking" && !D.deck ? <p className="cr-p cr-dim">CHECKING YOUR INVENTORY FOR A DECK OF CARDS…</p>
            : !D.deck ? <BuyDeck D={D} />
              : game === "solitaire" ? <Klondike back={D.eb ? "eb" : "dept"} backHref={hrefOf({ at: "home" })} /> : <Spider back={D.eb ? "eb" : "dept"} backHref={hrefOf({ at: "home" })} />}
        </Frame>
        <ButtonRow split stackOnMobile>
          <Button variant="back" href={hrefOf({ at: "home" })}>Put the cards away</Button>
          <Button variant="secondary" onClick={() => setFour(!four)} aria-pressed={four}>{four ? "FOUR-COLOUR DECK: ON" : "FOUR-COLOUR DECK: OFF"}</Button>
        </ButtonRow>
      </div>
    );
  }

  // ---- the room ---------------------------------------------------------------------------------------
  return (
    <div className="cr">
      <ScreenHead title="THE CARD ROOM" meta={`${room.name} // ${room.sub}`} />
      <p className="pg-lede">HEARTS AND SPADES AGAINST FIGURES ON FILE, SOLITAIRE AND SPIDER AT HOME. EXHIBITIONS: NO CYCLES OR CHIPS ARE WON AT THESE TABLES. THE FIGURES PLAY THE WAY THEIR FILES SAY THEY WOULD, AND SAY NOTHING.</p>
      <div className="cr-row" role="group" aria-label="Rooms" style={{ marginBottom: "var(--s3)" }}>
        <Chips>
          {Object.entries(ROOMS).map(([k, r]) => <Chip key={k} pressed={at === k} onClick={() => go({ at: k, game: null })}>{k === "home" ? "YOUR FLAT" : r.name}</Chip>)}
        </Chips>
      </div>
      {at !== "home" && (
        <Frame title={`THE TABLES // ${room.name}`} meta={`TODAY'S SEATING // ${day}`}>
          <div className="cp-tables">{tables.map(tb => <TablePickFelt key={tb.n} tb={tb} at={at} short={short} />)}</div>
          <div className="cr-row" style={{ marginTop: "var(--s3)" }}>
            <Chips><Chip pressed={!short} onClick={() => go({ short: false })}>FULL GAME (HEARTS 100, SPADES 500)</Chip><Chip pressed={short} onClick={() => go({ short: true })}>SHORT GAME (50 / 300)</Chip></Chips>
          </div>
          {at === "casino" && <p className="cr-fine">HOLD'EM FOR HOUSE CHIPS IS ON THE CASINO FLOOR: <a href="#casino/poker">THE POKER TABLE</a>.</p>}
        </Frame>
      )}
      <Frame title={at === "home" ? "YOUR KITCHEN TABLE" : "AT HOME"} meta={D.deck ? (D.eb ? "THE EB HOUSE DECK" : "YOUR DECK OF CARDS") : "SOLITAIRE AND SPIDER"}>
        <div className="cp-fan" aria-hidden="true">{["Ks", "Qh", "Jd", "Tc", "9s"].map(c => <PixelCard key={c} code={c} scale={1.5} four={four} />)}<PixelCard code={null} scale={1.5} back={D.eb ? "eb" : "dept"} /></div>
        {D.deck ? (
          <>
            <ButtonRow stackOnMobile>
              <Button variant="primary" href="#cards/solitaire" data-pad="first">DEAL SOLITAIRE</Button>
              <Button variant="primary" href="#cards/spider">DEAL SPIDER</Button>
            </ButtonRow>
            {at === "home" && (D.table ? (
              <>
                <p className="cr-p">HOME GAME NIGHT: THE CARD TABLE SEATS THREE.</p>
                <div className="cp-tables">{tables.map(tb => <TablePickFelt key={tb.n} tb={tb} at="home" short={short} />)}</div>
                {D.poker && <ButtonRow><Button variant="secondary" href="#casino/poker">HOLD'EM (HOUSE CHIPS, THE CASINO'S RULES)</Button></ButtonRow>}
              </>
            ) : <p className="cr-fine">UPGRADE THE DECK TO A CARD TABLE (YOUR FURNITURE, AT THE SHOPS) AND THREE FIGURES COME ROUND FOR HEARTS AND SPADES. THEN A POKER TABLE.</p>)}
          </>
        ) : D.state === "asking" ? <p className="cr-p cr-dim">CHECKING YOUR INVENTORY FOR A DECK OF CARDS…</p> : <BuyDeck D={D} />}
      </Frame>
      <ButtonRow split stackOnMobile>
        <Button variant="back" href="#play">The games</Button>
        <Button variant="secondary" onClick={() => setFour(!four)} aria-pressed={four}>{four ? "FOUR-COLOUR DECK: ON" : "FOUR-COLOUR DECK: OFF"}</Button>
        <Button variant="secondary" href={CITY[at]}>{at === "home" ? "Back to the city" : `${room.name}, in the city`}</Button>
      </ButtonRow>
    </div>
  );
}

function TablePickFelt({ tb, at, short }) {
  return (
    <div className={`cp-t cr-felt felt-${roomOf(at).felt}`}>
      <h3>TABLE {tb.n} <span style={{ color: "#c8f5d8", fontSize: 11 }}>// PLAYS AT {tableLevel(tb)}</span></h3>
      <div className="cp-seats">
        {tb.seats.map(s => <div key={s.key} className="cp-seat"><Head src={spriteOf(s.key)} name={s.name} px={2} /><span>{s.name}</span></div>)}
      </div>
      <div className="cp-go">
        <a href={hrefOf({ game: "hearts", at, t: tb.n, short })} data-pad="1" aria-label={`Sit at table ${tb.n} for hearts`}>HEARTS</a>
        <a href={hrefOf({ game: "spades", at, t: tb.n, short })} data-pad="1" aria-label={`Sit at table ${tb.n} for spades, partnered with ${tb.seats[1].name}`}>SPADES</a>
      </div>
    </div>
  );
}
