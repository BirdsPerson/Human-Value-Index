// THE TENNIS CLUB, playable: the scoring. Pure, no DOM. Real tennis: 15/30/40, deuce and
// advantage, games, a set to six by two with a tiebreak at six-all (first to seven by two, the
// serve changing after the first point and every two after). FIRST TO FOUR is the short format:
// the first to four games, no tiebreak, no margin (games still go to deuce).
//
// Players are 0 and 1. sc.pts is the running game (or tiebreak) in points.

export const FORMATS = {
  set: { id: "set", name: "ONE SET", games: 6, winBy2: true, tiebreak: true, setsToWin: 1 },
  short: { id: "short", name: "FIRST TO 4", games: 4, winBy2: false, tiebreak: false, setsToWin: 1 },
};

export function newScore(fmt, firstServer = 0) {
  return { fmt, pts: [0, 0], games: [0, 0], sets: [], setsWon: [0, 0], tb: false, tbFirst: null, gameServer: firstServer, done: false, winner: null };
}

// Who serves the next point.
export function serverOf(sc) {
  if (!sc.tb) return sc.gameServer;
  const n = sc.pts[0] + sc.pts[1];
  return Math.floor((n + 1) / 2) % 2 === 0 ? sc.tbFirst : 1 - sc.tbFirst;
}
// "deuce" (the server's right) on an even point count, else "ad".
export const serveSide = (sc) => ((sc.pts[0] + sc.pts[1]) % 2 === 0 ? "deuce" : "ad");

function finishSet(sc, w, out) {
  sc.sets.push([sc.games[0], sc.games[1]]);
  sc.setsWon[w]++;
  if (sc.tb) sc.gameServer = 1 - sc.tbFirst;   // the receiver of the tiebreak's first point serves next
  sc.games = [0, 0]; sc.pts = [0, 0]; sc.tb = false; sc.tbFirst = null;
  out.set = true;
  if (sc.setsWon[w] >= sc.fmt.setsToWin) { sc.done = true; sc.winner = w; out.match = true; }
}

function winGame(sc, w, out) {
  sc.games[w]++; sc.pts = [0, 0]; sc.gameServer = 1 - sc.gameServer;
  out.game = true;
  const g = sc.games, n = sc.fmt.games;
  if (!sc.fmt.winBy2) { if (g[w] >= n) finishSet(sc, w, out); return; }
  if (g[w] >= n && g[w] - g[1 - w] >= 2) { finishSet(sc, w, out); return; }
  if (sc.fmt.tiebreak && g[0] === n && g[1] === n) { sc.tb = true; sc.tbFirst = sc.gameServer; out.tiebreak = true; }
}

// The point goes to w. -> {game, set, match, tiebreak} (what it completed).
export function addPoint(sc, w) {
  const out = { game: false, set: false, match: false, tiebreak: false };
  if (sc.done) return out;
  sc.pts[w]++;
  const a = sc.pts[w], b = sc.pts[1 - w];
  if (sc.tb) {
    if (a >= 7 && a - b >= 2) { sc.games[w]++; out.game = true; finishSet(sc, w, out); }
  } else if (a >= 4 && a - b >= 2) winGame(sc, w, out);
  return out;
}

const CALL = ["LOVE", "15", "30", "40"];
// The umpire's call, server first: "30-15", "15-ALL", "DEUCE", "AD IN", "AD OUT"; a tiebreak's points.
export function callOf(sc) {
  const s = serverOf(sc), a = sc.pts[s], b = sc.pts[1 - s];
  if (sc.tb) return a === b ? `${a}-ALL` : `${a}-${b}`;
  if (a >= 3 && b >= 3) return a === b ? "DEUCE" : a > b ? "AD IN" : "AD OUT";
  if (a === b) return `${CALL[a]}-ALL`;
  return `${CALL[a]}-${CALL[b]}`;
}
