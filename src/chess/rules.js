// The rules of chess, compact and complete: a 0x88 board, pseudo-legal generation filtered by
// make / unmake, castling (through and out of check refused), en passant, promotion (any piece),
// check, checkmate, stalemate, the fifty-move rule, threefold repetition and dead positions
// (insufficient material). SAN for the move list, UCI for the wire. Pure, no DOM: the board
// page, the engine's worker, /api/chess (which replays every game it is sent) and
// scripts/check-chess.mjs (perft on the standard positions) all run this one file.
//
// Squares: 0x88 index r * 16 + f, r = 0 is rank 1 (White's side), f = 0 is the a-file.
// Pieces: 1 pawn, 2 knight, 3 bishop, 4 rook, 5 queen, 6 king; White positive, Black negative.
// A move: {from, to, piece, cap, promo, flag} flag 0 quiet/capture, 1 en passant, 2 castle, 3 double push.

export const P = 1, N = 2, B = 3, R = 4, Q = 5, K = 6;
export const START_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
const LETTER = ".pnbrqk";
const N_OFF = [33, 31, 18, 14, -33, -31, -18, -14];
const B_OFF = [17, 15, -17, -15];
const R_OFF = [16, -16, 1, -1];
const K_OFF = [17, 15, -17, -15, 16, -16, 1, -1];
export const sqName = (s) => "abcdefgh"[s & 7] + ((s >> 4) + 1);
export const sqOf = (n) => (n.charCodeAt(1) - 49) * 16 + (n.charCodeAt(0) - 97);
const onBoard = (s) => (s & 0x88) === 0;
// castling rights lost when a piece leaves or lands on these squares
const CASTLE_MASK = new Uint8Array(128).fill(15);
CASTLE_MASK[0x04] = 15 & ~3; CASTLE_MASK[0x00] = 15 & ~2; CASTLE_MASK[0x07] = 15 & ~1;
CASTLE_MASK[0x74] = 15 & ~12; CASTLE_MASK[0x70] = 15 & ~8; CASTLE_MASK[0x77] = 15 & ~4;

// ---- positions ------------------------------------------------------------------------------
export function fromFen(fen = START_FEN) {
  const [rows, side, cas, ep, half, full] = fen.trim().split(/\s+/);
  const b = new Int8Array(128);
  const kings = [-1, -1];
  const ranks = rows.split("/");
  if (ranks.length !== 8) throw new Error("bad fen");
  for (let i = 0; i < 8; i++) {
    let f = 0;
    for (const ch of ranks[i]) {
      if (ch >= "1" && ch <= "8") { f += +ch; continue; }
      const t = LETTER.indexOf(ch.toLowerCase());
      if (t < 1 || f > 7) throw new Error("bad fen");
      const s = (7 - i) * 16 + f, v = ch === ch.toUpperCase() ? t : -t;
      b[s] = v;
      if (t === K) kings[v > 0 ? 0 : 1] = s;
      f++;
    }
    if (f !== 8) throw new Error("bad fen");
  }
  let castle = 0;
  if (cas && cas !== "-") for (const ch of cas) castle |= ch === "K" ? 1 : ch === "Q" ? 2 : ch === "k" ? 4 : ch === "q" ? 8 : 0;
  const pos = { b, turn: side === "b" ? -1 : 1, castle, ep: ep && ep !== "-" ? sqOf(ep) : -1, half: +half || 0, full: +full || 1, kings, hist: [], keys: [] };
  pos.keys.push(keyOf(pos));
  return pos;
}
export const newGame = () => fromFen(START_FEN);

export function toFen(pos) {
  const out = [];
  for (let r = 7; r >= 0; r--) {
    let row = "", e = 0;
    for (let f = 0; f < 8; f++) {
      const v = pos.b[r * 16 + f];
      if (!v) { e++; continue; }
      if (e) { row += e; e = 0; }
      const ch = LETTER[Math.abs(v)];
      row += v > 0 ? ch.toUpperCase() : ch;
    }
    out.push(row + (e ? e : ""));
  }
  const c = pos.castle;
  const cas = (c & 1 ? "K" : "") + (c & 2 ? "Q" : "") + (c & 4 ? "k" : "") + (c & 8 ? "q" : "") || "-";
  return `${out.join("/")} ${pos.turn > 0 ? "w" : "b"} ${cas} ${pos.ep >= 0 ? sqName(pos.ep) : "-"} ${pos.half} ${pos.full}`;
}

// The identity of a position for repetition: the pieces, the side to move, the castling rights
// and the en passant square only when a pawn could actually take there (FIDE 9.2).
export function keyOf(pos) {
  let s = "";
  for (let r = 0; r < 8; r++) for (let f = 0; f < 8; f++) s += LETTER[Math.abs(pos.b[r * 16 + f])] + (pos.b[r * 16 + f] < 0 ? "'" : "");
  let ep = -1;
  if (pos.ep >= 0) {
    const from = pos.ep - pos.turn * 16;
    for (const d of [-1, 1]) { const s2 = from + d; if (onBoard(s2) && pos.b[s2] === pos.turn * P) ep = pos.ep; }
  }
  return `${s}${pos.turn}${pos.castle}${ep}`;
}

export function clone(pos) {
  return { b: new Int8Array(pos.b), turn: pos.turn, castle: pos.castle, ep: pos.ep, half: pos.half, full: pos.full, kings: pos.kings.slice(), hist: [], keys: pos.keys.slice() };
}

// ---- attacks --------------------------------------------------------------------------------
// Is square s attacked by side `by` (1 White, -1 Black)?
export function attacked(pos, s, by) {
  const b = pos.b;
  // pawns: a White pawn attacks up-left and up-right, so look down from s
  const pr = s - by * 16;
  if (onBoard(pr - 1) && b[pr - 1] === by * P) return true;
  if (onBoard(pr + 1) && b[pr + 1] === by * P) return true;
  for (const o of N_OFF) { const t = s + o; if (onBoard(t) && b[t] === by * N) return true; }
  for (const o of K_OFF) { const t = s + o; if (onBoard(t) && b[t] === by * K) return true; }
  for (const o of B_OFF) {
    for (let t = s + o; onBoard(t); t += o) { const v = b[t]; if (v) { if (v === by * B || v === by * Q) return true; break; } }
  }
  for (const o of R_OFF) {
    for (let t = s + o; onBoard(t); t += o) { const v = b[t]; if (v) { if (v === by * R || v === by * Q) return true; break; } }
  }
  return false;
}
export const inCheck = (pos, side = pos.turn) => attacked(pos, pos.kings[side > 0 ? 0 : 1], -side);

// ---- generation -----------------------------------------------------------------------------
// Pseudo-legal moves for the side to move (captures only when capsOnly).
export function pseudo(pos, capsOnly = false) {
  const b = pos.b, us = pos.turn, out = [];
  const add = (from, to, piece, cap, flag = 0) => {
    if (Math.abs(piece) === P && ((to >> 4) === 7 || (to >> 4) === 0)) { for (const pr of [Q, N, R, B]) out.push({ from, to, piece, cap, promo: pr * us, flag }); }
    else out.push({ from, to, piece, cap, promo: 0, flag });
  };
  for (let s = 0; s < 128; s++) {
    if (s & 0x88) { s += 7; continue; }
    const v = b[s];
    if (!v || (v > 0) !== (us > 0)) continue;
    const t = Math.abs(v);
    if (t === P) {
      const fwd = s + us * 16, startRank = us > 0 ? 1 : 6;
      if (!capsOnly && onBoard(fwd) && !b[fwd]) {
        add(s, fwd, v, 0);
        const two = fwd + us * 16;
        if ((s >> 4) === startRank && !b[two]) out.push({ from: s, to: two, piece: v, cap: 0, promo: 0, flag: 3 });
      } else if (capsOnly && onBoard(fwd) && !b[fwd] && ((fwd >> 4) === 7 || (fwd >> 4) === 0)) add(s, fwd, v, 0);   // a promotion counts as noisy
      for (const d of [15, 17]) {
        const to = s + us * d;
        if (!onBoard(to)) continue;
        if (b[to] && (b[to] > 0) !== (us > 0)) add(s, to, v, b[to]);
        else if (to === pos.ep) out.push({ from: s, to, piece: v, cap: -us * P, promo: 0, flag: 1 });
      }
      continue;
    }
    const slide = t === B ? B_OFF : t === R ? R_OFF : t === Q ? K_OFF : null;
    if (slide) {
      for (const o of slide) for (let to = s + o; onBoard(to); to += o) {
        const w = b[to];
        if (!w) { if (!capsOnly) add(s, to, v, 0); continue; }
        if ((w > 0) !== (us > 0)) add(s, to, v, w);
        break;
      }
      continue;
    }
    for (const o of t === N ? N_OFF : K_OFF) {
      const to = s + o;
      if (!onBoard(to)) continue;
      const w = b[to];
      if (!w) { if (!capsOnly) add(s, to, v, 0); } else if ((w > 0) !== (us > 0)) add(s, to, v, w);
    }
    if (t === K && !capsOnly) {
      // castling: rights held, the squares between empty, the king not in, through or into check
      const home = us > 0 ? 0x04 : 0x74, kr = us > 0 ? 1 : 4, qr = us > 0 ? 2 : 8;
      if (s === home) {
        if ((pos.castle & kr) && !b[home + 1] && !b[home + 2] && b[home + 3] === us * R && !attacked(pos, home, -us) && !attacked(pos, home + 1, -us) && !attacked(pos, home + 2, -us))
          out.push({ from: s, to: home + 2, piece: v, cap: 0, promo: 0, flag: 2 });
        if ((pos.castle & qr) && !b[home - 1] && !b[home - 2] && !b[home - 3] && b[home - 4] === us * R && !attacked(pos, home, -us) && !attacked(pos, home - 1, -us) && !attacked(pos, home - 2, -us))
          out.push({ from: s, to: home - 2, piece: v, cap: 0, promo: 0, flag: 2 });
      }
    }
  }
  return out;
}

// ---- make / unmake --------------------------------------------------------------------------
// Plays m on pos (in place). keepKey: push the repetition key (the game and the engine do; perft does not need it).
export function make(pos, m, keepKey = true) {
  const b = pos.b, us = pos.turn;
  pos.hist.push({ m, castle: pos.castle, ep: pos.ep, half: pos.half });
  b[m.to] = m.promo || m.piece;
  b[m.from] = 0;
  if (m.flag === 1) b[m.to - us * 16] = 0;
  else if (m.flag === 2) {
    if (m.to > m.from) { b[m.to - 1] = b[m.to + 1]; b[m.to + 1] = 0; } else { b[m.to + 1] = b[m.to - 2]; b[m.to - 2] = 0; }
  }
  if (Math.abs(m.piece) === K) pos.kings[us > 0 ? 0 : 1] = m.to;
  pos.castle &= CASTLE_MASK[m.from] & CASTLE_MASK[m.to];
  pos.ep = m.flag === 3 ? m.from + us * 16 : -1;
  pos.half = Math.abs(m.piece) === P || m.cap ? 0 : pos.half + 1;
  if (us < 0) pos.full++;
  pos.turn = -us;
  if (keepKey) pos.keys.push(keyOf(pos));
}
export function unmake(pos, keepKey = true) {
  const h = pos.hist.pop(), m = h.m, b = pos.b;
  pos.turn = -pos.turn;
  const us = pos.turn;
  if (us < 0) pos.full--;
  b[m.from] = m.piece;
  b[m.to] = m.flag === 1 ? 0 : m.cap;
  if (m.flag === 1) b[m.to - us * 16] = m.cap;
  else if (m.flag === 2) {
    if (m.to > m.from) { b[m.to + 1] = b[m.to - 1]; b[m.to - 1] = 0; } else { b[m.to - 2] = b[m.to + 1]; b[m.to + 1] = 0; }
  }
  if (Math.abs(m.piece) === K) pos.kings[us > 0 ? 0 : 1] = m.from;
  pos.castle = h.castle; pos.ep = h.ep; pos.half = h.half;
  if (keepKey) pos.keys.pop();
}

export function legalMoves(pos) {
  const out = [];
  for (const m of pseudo(pos)) {
    make(pos, m, false);
    if (!inCheck(pos, -pos.turn)) out.push(m);
    unmake(pos, false);
  }
  return out;
}

export function perft(pos, depth) {
  if (depth === 0) return 1;
  let n = 0;
  for (const m of pseudo(pos)) {
    make(pos, m, false);
    if (!inCheck(pos, -pos.turn)) n += depth === 1 ? 1 : perft(pos, depth - 1);
    unmake(pos, false);
  }
  return n;
}

// ---- the state of the game ------------------------------------------------------------------
// Dead position by material alone: K v K, K+minor v K, K+B v K+B with bishops on one colour.
export function insufficient(pos) {
  const minors = [];
  for (let s = 0; s < 128; s++) {
    if (s & 0x88) { s += 7; continue; }
    const t = Math.abs(pos.b[s]);
    if (!t || t === K) continue;
    if (t === P || t === R || t === Q) return false;
    minors.push({ t, c: ((s >> 4) + (s & 7)) & 1 });
  }
  if (minors.length <= 1) return true;
  return minors.every(x => x.t === B) && minors.every(x => x.c === minors[0].c);
}
export const repetitions = (pos) => { const k = pos.keys[pos.keys.length - 1]; let n = 0; for (const x of pos.keys) if (x === k) n++; return n; };

// -> {check, over, result: "1-0" | "0-1" | "1/2-1/2" | null, reason: "checkmate" | "stalemate" | "threefold" | "fifty" | "insufficient" | null, moves}
export function status(pos) {
  const moves = legalMoves(pos), check = inCheck(pos);
  if (!moves.length) return check ? { check, over: true, result: pos.turn > 0 ? "0-1" : "1-0", reason: "checkmate", moves } : { check, over: true, result: "1/2-1/2", reason: "stalemate", moves };
  if (insufficient(pos)) return { check, over: true, result: "1/2-1/2", reason: "insufficient", moves };
  if (pos.half >= 100) return { check, over: true, result: "1/2-1/2", reason: "fifty", moves };
  if (repetitions(pos) >= 3) return { check, over: true, result: "1/2-1/2", reason: "threefold", moves };
  return { check, over: false, result: null, reason: null, moves };
}

// ---- notation -------------------------------------------------------------------------------
export const uci = (m) => sqName(m.from) + sqName(m.to) + (m.promo ? LETTER[Math.abs(m.promo)] : "");
export function fromUci(pos, s, moves = legalMoves(pos)) {
  if (typeof s !== "string" || !/^[a-h][1-8][a-h][1-8][qrbn]?$/.test(s)) return null;
  const from = sqOf(s.slice(0, 2)), to = sqOf(s.slice(2, 4)), pr = s[4] ? LETTER.indexOf(s[4]) : 0;
  return moves.find(m => m.from === from && m.to === to && Math.abs(m.promo) === pr) || null;
}
// SAN of a legal move m in pos (before it is played), with + or #.
export function san(pos, m, moves = legalMoves(pos)) {
  const t = Math.abs(m.piece);
  let s;
  if (m.flag === 2) s = m.to > m.from ? "O-O" : "O-O-O";
  else {
    const to = sqName(m.to), x = m.cap ? "x" : "";
    if (t === P) s = (m.cap ? "abcdefgh"[m.from & 7] + "x" : "") + to + (m.promo ? "=" + LETTER[Math.abs(m.promo)].toUpperCase() : "");
    else {
      const rivals = moves.filter(o => o !== m && o.piece === m.piece && o.to === m.to && o.from !== m.from);
      let dis = "";
      if (rivals.length) {
        const sameFile = rivals.some(o => (o.from & 7) === (m.from & 7)), sameRank = rivals.some(o => (o.from >> 4) === (m.from >> 4));
        dis = !sameFile ? "abcdefgh"[m.from & 7] : !sameRank ? String((m.from >> 4) + 1) : sqName(m.from);
      }
      s = LETTER[t].toUpperCase() + dis + x + to;
    }
  }
  make(pos, m);
  const st = status(pos);
  unmake(pos);
  return s + (st.reason === "checkmate" ? "#" : st.check ? "+" : "");
}

// Replay a list of UCI moves from the start. -> {pos, sans, error?, at?}
export function replay(list, fen = START_FEN) {
  const pos = fromFen(fen), sans = [];
  if (!Array.isArray(list)) return { pos, sans, error: "no moves" };
  for (let i = 0; i < list.length; i++) {
    const st = status(pos);
    if (st.over) return { pos, sans, error: "moves after the end", at: i };
    const m = fromUci(pos, list[i], st.moves);
    if (!m) return { pos, sans, error: "illegal move", at: i };
    sans.push(san(pos, m, st.moves));
    make(pos, m);
  }
  return { pos, sans };
}

// The board as [rank 8 .. rank 1][file a .. h] of piece codes ("wK", "bp", null) for drawing.
export function grid(pos) {
  const out = [];
  for (let r = 7; r >= 0; r--) {
    const row = [];
    for (let f = 0; f < 8; f++) { const v = pos.b[r * 16 + f]; row.push(v ? (v > 0 ? "w" : "b") + "pnbrqk"[Math.abs(v) - 1] : null); }
    out.push(row);
  }
  return out;
}
