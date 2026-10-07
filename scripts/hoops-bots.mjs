// THE COURTS: the two bots that play the human's side headless (check-hoops.mjs, freeze-hoops.mjs).
//
// casualHuman(S, seed, stats?) plays the human's man the way a person new to the game does (Scott,
// 2026-10-06: "the basketball game is way too hard"). Its error model is fixed before any dial moves
// (docs/design/BASKETBALL.md 4.11) and published with each engine version:
//   release        X let go about 100 ms either side of the top (sd 6 frames); free throws the same
//   defence        chases where the ball was 250 ms ago (LAG 15 frames); reaches 1 frame in 45 when
//                  within 1.1 m; jumps at a shot late; ball-watches with the stick let go (0.4 % a frame,
//                  30-70 frames)
//   passing        thumb 30 degrees off (gauss sd 0.5 rad) toward the teammate it means
//   moves          a random right-stick flick (0.6 % a frame when a defender is within 1.6 m); a random
//                  stick direction 4 % of frames; no pro stick
//   plans          on the catch: drive (40 %), a spot to shoot from (45 %, 4.8-8.2 m out, anywhere in a
//                  160-degree fan: some spots are past the sideline, which the line awareness meets),
//                  or look to pass (15 %, after 20-60 frames); it gives up on reaching its spot after 30-120
//                  frames once it is in range (8.6 m) and takes the look it has
//                  (v5 counts these from the catch; v4's bot read a counter only the CPU keeps, so it
//                  never passed and never ran out of patience)
//   v5 throw-ins   steers the handler toward his receiving spot and calls for the ball (A) 15-90
//                  frames into the throw-in (uniform); as the inbounder (cfg.inb "me") it throws toward
//                  the handler 20-70 frames in, thumb 30 degrees off
//   v5 half court  carries it over half court on its way to its plan (its spots are all in the
//                  frontcourt); never thinks about the 8 seconds, over-and-back or the lane
// stats (optional) collects: oob (its own), passes (a pass thrown when the man it meant is the only
// teammate inside the stick's +-60 degree cone) and hits (the pass went to him).
export function casualHuman(S, seed, stats = null) {
  const { BTN, COURT: C } = S;
  let s = seed >>> 0;
  const rnd = () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const g = () => (rnd() + rnd() + rnd() + rnd() - 2) * 1.732;
  const LAG = 15;                                                   // 250 ms on defence
  const hist = [];
  let prev = 0, plan = null, rel = 0, tipAt = -1, ftKey = "", ftRel = 0, rs = 0, rsT = 0, watch = 0, jumped = -99, callAt = -1, tiKey = "", meant = null;
  const stickTo = (P, tx, ty, slop = 0.35) => { const dx = tx - P.x, dy = ty - P.y; let m = 0; if (dx > slop) m |= BTN.RIGHT; else if (dx < -slop) m |= BTN.LEFT; if (dy > slop) m |= BTN.UP; else if (dy < -slop) m |= BTN.DOWN; return m; };
  const press = (bit) => (prev & bit ? 0 : bit);
  const out = (m) => { prev = m; return m; };
  // a pass toward Q with the thumb 30 degrees off; notes whether the engine took the man it meant
  let st0 = null;
  const aimAt = (P, Q) => {
    const a = Math.atan2(Q.y - P.y, Q.x - P.x) + g() * 0.5, m = stickTo({ x: 0, y: 0 }, Math.cos(a), Math.sin(a), 0.38);
    const sx = (m & BTN.RIGHT ? 1 : 0) - (m & BTN.LEFT ? 1 : 0), sy = (m & BTN.UP ? 1 : 0) - (m & BTN.DOWN ? 1 : 0);
    const cosOf = (T) => ((sx || sy) ? ((T.x - P.x) * sx + (T.y - P.y) * sy) / (Math.hypot(T.x - P.x, T.y - P.y) * Math.hypot(sx, sy) || 1) : -1);
    // the check's case: the man it meant is the only teammate inside the stick's +-60 degree cone
    const inCone = st0.p.filter(T => T.t === P.t && T !== P && cosOf(T) >= 0.5);
    meant = { g: Q.g, from: P.g, cone: inCone.length === 1 && inCone[0] === Q };
    return m;
  };
  return (st) => {
    const b = st.ball, P = st.p[st.ctl];
    st0 = st;
    if (meant) {
      if (stats && b.st === "pass" && b.from === meant.from && meant.cone) { stats.passes = (stats.passes || 0) + 1; if (b.to === meant.g) stats.hits = (stats.hits || 0) + 1; }
      meant = null;
    }
    if (stats && st.ev.includes("oob") && st.note?.team === 0 && st.note.g === P.g) stats.oob = (stats.oob || 0) + 1;
    hist.push({ x: b.x, y: b.y, st: b.st, own: b.own, ot: b.own >= 0 ? st.p[b.own].t : -1, hx: b.own >= 0 ? st.p[b.own].x : b.x, hy: b.own >= 0 ? st.p[b.own].y : b.y, shooting: b.own >= 0 && st.p[b.own].act?.kind === "jump" });
    if (hist.length > LAG + 1) hist.shift();
    const seen = hist[0];
    if (st.phase === "tip") { if (tipAt < 0) tipAt = S.TIP_JUMP + Math.round(g() * 9); return out(st.t === tipAt ? BTN.Y : 0); }
    if (st.phase === "ft") {
      if (!st.ft || st.ft.g !== P.g) return out(0);
      const key = `${st.ft.g}|${st.frame - st.ft.t}|${st.ft.k}`;
      if (key !== ftKey) { ftKey = key; ftRel = S.FT_TOP + Math.round(g() * 6); }
      if (st.ft.t < 40 + (st.ft.k ? 0 : 10)) return out(0);
      if (P.act?.kind === "ftshot") return out(P.act.f < ftRel - 1 ? BTN.X : 0);
      return out(st.ball.st === "held" ? press(BTN.X) : 0);
    }
    // v5: the throw-in
    if (st.phase === "throwin" && st.ti) {
      plan = null;
      const key = `${st.frame - st.ti.f}`;
      if (key !== tiKey) { tiKey = key; callAt = st.ti.g === P.g ? 20 + Math.floor(rnd() * 51) : 15 + Math.floor(rnd() * 76); }
      if (st.ti.t === 0) {
        if (st.ti.g === P.g) {
          if (st.ti.f < callAt) return out(0);
          const Q = st.p[st.recv?.g ?? 0];
          return out(aimAt(P, Q) | press(BTN.A));
        }
        const r = st.recv, m = r ? stickTo(P, r.x, r.y, 0.5) : 0;
        return out(m | (st.ti.f >= callAt ? press(BTN.A) : 0));
      }
      return out(stickTo(P, seen.x, seen.y, 0.4));
    }
    if (st.phase !== "live") { plan = null; return out(0); }
    const has = b.st === "held" && b.own === P.g, rx = C.rimX;
    if (has) {
      if (P.act?.kind === "jump") return out(P.act.f < rel - 1 ? BTN.X : 0);
      if (P.act) return out(0);
      if (!plan || plan.g !== P.g || plan.caught !== P.caught) {
        const u = rnd();
        const ang = (rnd() - 0.5) * 2.6, dist = rnd() < 0.5 ? 7.6 + rnd() * 0.6 : 4.8 + rnd() * 1.6;
        plan = { g: P.g, caught: P.caught, kind: u < 0.4 ? "drive" : u < 0.85 || st.n === 1 ? "spot" : "swing", tx: rx - dist * Math.cos(ang), ty: C.cy + dist * Math.sin(ang), patience: 30 + Math.floor(rnd() * 90), passAt: 20 + Math.floor(rnd() * 40), think: 0 };
      }
      // v5: frames since the catch (v4 read P.hold, which only the CPU's carrier counts: its patience never
      // ran out and its swing pass never came)
      const r = Math.hypot(rx - P.x, C.cy - P.y), held = st.frame - P.caught;
      // the street: take it back past the arc first, as the tip says
      if (st.half && st.clear === 0) return out(stickTo(P, rx - 8.4, C.cy + (P.y - C.cy) * 0.5));
      if (rsT > 0) { rsT--; return out(rs); }
      const shoot = () => { rel = S.TOP + Math.round(g() * 6); return out(BTN.X | (r < 2.6 && rnd() < 0.3 ? BTN.RT : 0)); };
      if (prev & BTN.X) return out(0);
      if (st.shot < 100 + rnd() * 60) return shoot();
      if (r < 1.9 && rnd() < 0.2) return shoot();
      let D = null, dd = 9;
      for (const Q of st.p) if (Q.t === 1) { const k = Math.hypot(Q.x - P.x, Q.y - P.y); if (k < dd) { dd = k; D = Q; } }
      if (dd < 1.6 && rnd() < 0.006) { rs = [BTN.RSU, BTN.RSD, BTN.RSL, BTN.RSR][Math.floor(rnd() * 4)]; rsT = 2; return out(rs); }
      const c = S.contestOf(st, P).c;
      if (--plan.think <= 0) {
        plan.think = 8 + Math.floor(rnd() * 10);
        const mates = st.p.filter(Q => Q.t === 0 && Q !== P);
        if (plan.kind === "swing" && held > plan.passAt && mates.length) {
          const Q = mates[Math.floor(rnd() * mates.length)];
          plan.kind = rnd() < 0.5 ? "spot" : "drive";
          return out(press(BTN.A) | aimAt(P, Q));
        }
        if (plan.kind === "spot" && (Math.hypot(plan.tx - P.x, plan.ty - P.y) < 0.9 || (held > plan.patience && r < 8.6))) {
          if (c < 0.46 || rnd() < 0.3) return shoot();
          plan.kind = rnd() < 0.5 || !mates.length ? "drive" : "swing"; plan.passAt = held + 10;
        }
        if (plan.kind === "drive" && r < 4.5 && c > 0.66 && rnd() < 0.25) {
          if (rnd() < 0.5 || !mates.length) return shoot();
          plan.kind = "swing"; plan.passAt = held;
        }
        if (plan.kind === "drive" && r < 3.2 && rnd() < 0.5) return shoot();
      }
      const [tx, ty] = plan.kind === "drive" ? [rx - 0.6, C.cy + (P.y > C.cy ? 0.4 : -0.4)] : [plan.tx, plan.ty];
      let m = stickTo(P, tx, ty);
      if (rnd() < 0.04) m = [BTN.UP, BTN.DOWN, BTN.LEFT, BTN.RIGHT][Math.floor(rnd() * 4)];
      if (plan.kind === "drive" && r > 3.5 && P.sta > 0.3) m |= BTN.RT;
      return out(m);
    }
    plan = null;
    if (b.st === "pass" && b.to === P.g) return out(0);
    if (st.poss === 0 && b.st === "held") return out(0);
    if (watch > 0) { watch--; return out(0); }
    if (rnd() < 0.004) { watch = 30 + Math.floor(rnd() * 40); return out(0); }
    let m = 0;
    if (seen.st === "held" && seen.ot === 1) {
      // between the man and the rim he attacks (-x on the full court, +x on a half court)
      const orx = st.half ? C.rimX : -C.rimX, od = Math.hypot(orx - seen.hx, C.cy - seen.hy) || 1;
      const tx = seen.hx + ((orx - seen.hx) / od) * 1.0, ty = seen.hy + ((C.cy - seen.hy) / od) * 1.0;
      m = stickTo(P, tx, ty, 0.4);
      const k = Math.hypot(seen.hx - P.x, seen.hy - P.y);
      if (seen.shooting && k < 2.2 && st.frame - jumped > 40) { jumped = st.frame; return out(m | press(BTN.Y)); }
      if (k < 1.1 && rnd() < 1 / 45) m |= press(BTN.X);
      if (k > 4 && P.sta > 0.3) m |= BTN.RT;
      return out(m);
    }
    m = stickTo(P, seen.x, seen.y, 0.3);
    if (seen.st === "loose" && b.z > 2 && Math.hypot(b.x - P.x, b.y - P.y) < 1 && st.frame - jumped > 30) { jumped = st.frame; m |= press(BTN.Y); }
    return out(m);
  };
}

// checkBot: a bot on the human's side for the determinism checks: drives at the rim, holds X to the top
// of the jump, passes now and then, shoots its free throws at the top of the meter; on defence chases the
// ball and reaches. v5: at its throw-ins it calls for the ball on the first frame it can.
export function checkBot(S, mem) {
  const { BTN, COURT: C } = S;
  return (st) => {
    const P = st.p[st.ctl], b = st.ball;
    if (st.phase === "tip") return st.t >= S.TIP_JUMP - 1 && st.t <= S.TIP_JUMP + 1 ? BTN.Y : 0;
    if (st.phase === "ft") { if (!st.ft || st.ft.g !== P.g || st.ft.t < 31) return 0; if (P.act?.kind === "ftshot") return P.act.f < S.FT_TOP - 1 ? BTN.X : 0; return BTN.X; }
    if (st.phase === "throwin") return st.ti && st.ti.t === 0 && st.ti.f % 2 === 1 ? BTN.A : 0;
    if (st.phase !== "live") return 0;
    let m = 0;
    if (b.st === "held" && b.own === P.g) {
      if (P.act?.kind === "jump") return P.act.f < S.TOP - 1 ? BTN.X : 0;
      if (P.act) return 0;
      const dx = C.rimX - P.x, dy = C.cy - P.y, r = Math.sqrt(dx * dx + dy * dy);
      if (r < 6.5 || st.shot < 200) return mem.lastA === st.frame - 1 ? 0 : (mem.lastA = st.frame, BTN.X);
      if (++mem.t % 97 === 50) return BTN.A;
      if (mem.t % 151 === 70) return BTN.RSU;
      m |= dx > 0.3 ? BTN.RIGHT : dx < -0.3 ? BTN.LEFT : 0;
      m |= dy > 0.5 ? BTN.UP : dy < -0.5 ? BTN.DOWN : 0;
      return m;
    }
    const dx = b.x - P.x, dy = b.y - P.y;
    m |= dx > 0.3 ? BTN.RIGHT : dx < -0.3 ? BTN.LEFT : 0;
    m |= dy > 0.3 ? BTN.UP : dy < -0.3 ? BTN.DOWN : 0;
    if (dx * dx + dy * dy < 1.4 && st.frame % 40 === 0) m |= BTN.X;
    if (b.st === "loose" && b.z > 2 && dx * dx + dy * dy < 1 && st.frame % 30 === 0) m |= BTN.Y;
    return m;
  };
}
