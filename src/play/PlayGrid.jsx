// #play: THE GAMES as a grid of square tiles, a pixel icon and a title each (src/play/games.js).
// The note shows on hover or focus only. Arrow keys move between tiles.
import { GAMES, isLive } from "./games.js";
import { iconPaths } from "./gameIcons.js";
import { liveGames } from "../tournament/calendar.js";
import "./playgrid.css";

function Icon({ k }) {
  return (
    <svg className="pgd-ic" viewBox="0 0 12 12" shapeRendering="crispEdges" aria-hidden="true" focusable="false">
      {iconPaths(k).map(p => <path key={p.fill} d={p.d} style={{ fill: p.fill }} />)}
    </svg>
  );
}

function onArrow(e) {
  const k = e.key;
  if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(k)) return;
  const tiles = [...e.currentTarget.querySelectorAll("a.pgd-t")];
  const i = tiles.indexOf(document.activeElement);
  if (i < 0) return;
  let j = i;
  if (k === "ArrowLeft") j = i - 1;
  else if (k === "ArrowRight") j = i + 1;
  else {
    // the tile in the next row with the nearest left edge
    const me = tiles[i].getBoundingClientRect(), down = k === "ArrowDown";
    const rows = tiles.filter(t => { const r = t.getBoundingClientRect(); return down ? r.top > me.top + 2 : r.top < me.top - 2; });
    if (!rows.length) return;
    const rowTop = down ? Math.min(...rows.map(t => t.getBoundingClientRect().top)) : Math.max(...rows.map(t => t.getBoundingClientRect().top));
    const row = rows.filter(t => Math.abs(t.getBoundingClientRect().top - rowTop) < 2);
    j = tiles.indexOf(row.reduce((b, t) => Math.abs(t.getBoundingClientRect().left - me.left) < Math.abs(b.getBoundingClientRect().left - me.left) ? t : b));
  }
  if (tiles[j]) { e.preventDefault(); tiles[j].focus(); }
}

// A tile whose game has an open tournament (src/tournament/calendar.js) wears LIVE EVENT.
const EVENT_GAME = { "#golf": "golf", "#bowling": "bowling", "#fish": "fish" };
export default function PlayGrid() {
  let live0 = new Set();
  try { live0 = liveGames(Date.now()); } catch { /* no Intl time zones: no marker */ }
  const seen = new Set();
  const games = GAMES.filter(g => !seen.has(g.href) && seen.add(g.href));
  return (
    <ul className="pgd" aria-label="Games" onKeyDown={onArrow}>
      {games.map((g, i) => {
        const live = isLive(g), id = `pgd-n${i}`, ev = live && live0.has(EVENT_GAME[g.href]);
        const body = <>
          {ev && <span className="pgd-ev">LIVE EVENT</span>}
          <Icon k={g.icon} />
          <span className="pgd-l">{g.title}</span>
          <span className="pgd-n" id={id}>{live ? g.note : "COMING SOON"}</span>
        </>;
        return (
          <li key={g.href}>
            {live
              ? <a className="pgd-t" href={g.href} aria-label={`Play ${g.name}${ev ? ", a tournament is open" : ""}`} aria-describedby={id}>{body}</a>
              : <span className="pgd-t off" aria-label={`${g.name}: coming soon`} role="img">{body}</span>}
          </li>
        );
      })}
    </ul>
  );
}
