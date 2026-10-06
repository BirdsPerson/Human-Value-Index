// TAGGED OUT (#hunt), the light-gun bar cabinet (docs/CITY_SPEC.md "THE HUNT"): the sim is pure and
// deterministic, its run-length log replays to the same trip, a doctored log fails the server's check,
// and the scoring rules hold (males by antlers, region and speed; females a penalty and a strike; three
// strikes revoke; the quota; reload by shooting off the screen; cover stops a shot).
// Run: node scripts/check-hunt.mjs
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { registerHooks } from "node:module";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
let n = 0, failed = 0;
const ok = (c, msg) => { n++; if (!c) { failed++; console.log(`  FAIL ${msg}`); } };

const S = await import("../src/play/hunt/sim.js");
const D = await import("../src/play/hunt/data.js");
const { RULES, TRIPS, SPECIES_BY, SCENES } = D;
const AT = Date.UTC(2026, 9, 5, 12);

// 1. Determinism: the same cfg and input give the same trip; the log replays it; the bot finishes.
for (const t of TRIPS) {
  const a = S.autoplay({ seed: 4242, trip: t.id, at: AT }), b = S.autoplay({ seed: 4242, trip: t.id, at: AT });
  ok(a.st.phase === "done" && a.st.end === "complete", `${t.id}: the marksman finishes the trip`);
  ok(JSON.stringify(S.resultOf(a.st)) === JSON.stringify(S.resultOf(b.st)) && JSON.stringify(a.log) === JSON.stringify(b.log), `${t.id}: the same seed and input give the same trip`);
  const r = S.replay(a.st.cfg, a.log);
  ok(r.score === a.st.score && r.tick === a.st.tick && JSON.stringify(r.kills) === JSON.stringify(a.st.kills), `${t.id}: the log replays to the same trip`);
  ok(a.st.score > 0 && a.st.kills.length >= t.scenes.filter(s => !SCENES[s].bonus).length, `${t.id}: a male (or a decoy) filed every hunting stage`);
  ok(a.st.tick <= S.tripTicks(t.id), `${t.id}: within the trip's length`);
  const v = S.verifyHunt(a.st.cfg, a.log, { score: a.st.score });
  ok(v.ok && v.result.score === a.st.score, `${t.id}: the server's check passes an honest log`);
}
const c = S.autoplay({ seed: 4243, trip: "whitetail", at: AT });
ok(c.st.score !== S.autoplay({ seed: 4242, trip: "whitetail", at: AT }).st.score, "a different seed is a different trip");

// 2. Doctored logs fail: a claimed score not earned, a shot moved, a log cut short, junk, a version.
{
  const { st, log } = S.autoplay({ seed: 777, trip: "elk", at: AT });
  ok(!S.verifyHunt(st.cfg, log, { score: st.score + 10 }).ok, "a claim above the replay fails");
  const moved = log.slice(); for (let i = 0; i < moved.length; i += 4) if (moved[i + 2] & S.BTN.FIRE) { moved[i] = (moved[i] + 37) % S.W; break; }
  ok(!S.verifyHunt(st.cfg, moved, { score: st.score }).ok, "a log with a shot moved fails the claimed score");
  ok(!S.verifyHunt(st.cfg, log.slice(0, log.length - 40), { score: st.score }).ok, "a log cut short is not a finished trip");
  ok(!S.verifyHunt(st.cfg, [1, 2, 3], { score: 0 }).ok && !S.verifyHunt(st.cfg, [0, 0, 9, 1], { score: 0 }).ok && !S.verifyHunt(st.cfg, [400, 0, 0, 1], { score: 0 }).ok, "an illegible log fails");
  ok(!S.verifyHunt({ ...st.cfg, seed: st.cfg.seed + 1 }, log, { score: st.score }).ok, "another seed's log does not verify");
  let threw = false; try { S.replay({ ...st.cfg, v: 99 }, log); } catch { threw = true; }
  ok(threw, "a log from another version of the cabinet is refused");
  ok(S.logTicks(log) === st.tick, "the log's ticks are the trip's ticks");
  const l2 = []; S.logPush(l2, 1, 2, 0); S.logPush(l2, 1, 2, 0); S.logPush(l2, 1, 2, 1);
  ok(JSON.stringify(l2) === "[1,2,0,2,1,2,1,1]", "the log is run-length: [x, y, bits, n]");
  ok(JSON.stringify(S.quantize(10.7, 5.2)) === "[10,5]" && JSON.stringify(S.quantize(-3, 50)) === "[-1,-1]" && JSON.stringify(S.quantize(S.W, 5)) === "[-1,-1]", "the pointer is quantized to whole game pixels, off the screen to -1");
}

// 3. The scoring rules, on a hand-set stage.
const sp = SPECIES_BY.whitetail;
ok(S.maleScore("whitetail", 8, 50, "vital", 1000) === (sp.base * 8 + 100) * RULES.VITAL, "behind the shoulder doubles a male");
ok(S.maleScore("whitetail", 8, 50, "head", 1000) === Math.floor((sp.base * 8 + 100) * 3 / 2), "a head shot is half again");
ok(S.maleScore("whitetail", 8, 50, "body", 1000) === sp.base * 8 + 100, "a body shot is the antlers and the size");
ok(S.maleScore("whitetail", 8, 50, "body", 0) === sp.base * 8 + 100 + RULES.QUICK / 2 && S.maleScore("whitetail", 10, 50, "body", 1000) > S.maleScore("whitetail", 8, 50, "body", 1000), "a quick shot and more points score more");
function stageWith(targets, trip = "whitetail") {
  const st = S.newHunt({ seed: 9, trip, at: AT });
  for (let i = 0; i < RULES.TITLE_TICKS; i++) S.step(st);
  st.sched = []; st.targets = targets.map((a, i) => ({ id: 100 + i, born: st.tick, t: 0, wait: 0, stopX: null, size: 0, pts: 0, ...a }));
  return st;
}
// where a part of an animal is on the screen (its own frame: facing right, feet at 0)
const at = (st, a, lx, ly) => { const s = S.scaleOf(a.d), sc = S.sceneOf(st); return [Math.round(a.x - st.cam + a.dir * lx * sp.w * s), Math.round(S.groundY(sc, a.d) + ly * sp.h * s)]; };
const fire = (st, x, y) => { S.step(st, x, y, S.BTN.FIRE); S.step(st, x, y, 0); for (let i = 0; i < RULES.COOLDOWN; i++) S.step(st, x, y, 0); };
{
  const buck = { kind: "male", male: true, sp: "whitetail", pts: 10, size: 40, x: 160, d: 0.9, dir: 1, state: "stop" };
  const st = stageWith([buck]);
  const [x, y] = at(st, st.targets[0], 0.16, -0.65);
  ok(S.regionAt(st.targets[0], S.sceneOf(st), x + st.cam, y) === "vital", "behind the shoulder is the vitals");
  const before = st.score; fire(st, x, y);
  ok(st.kills.length === 1 && st.kills[0].region === "vital" && st.score - before === st.kills[0].score && st.stage.males === 1, "a buck shot behind the shoulder is filed, its points on the score");
  ok(st.ammo === RULES.SHELLS - 1 && st.shots === 1 && st.hits === 1, "a shot costs a shell");
}
{
  const doe = { kind: "female", male: false, sp: "whitetail", x: 160, d: 0.9, dir: -1, state: "stop" };
  const st = stageWith([doe]);
  const [x, y] = at(st, st.targets[0], 0.0, -0.65);
  fire(st, x, y);
  ok(st.score === RULES.FEMALE && st.strikes === 1 && st.kills.length === 0, "a doe is a penalty and a strike");
}
{
  const does = [0, 1, 2].map(i => ({ kind: "female", male: false, sp: "whitetail", x: 60 + i * 100, d: 0.8, dir: 1, state: "stop" }));
  const st = stageWith(does);
  for (const a of [...st.targets]) { const [x, y] = at(st, a, 0, -0.65); fire(st, x, y); }
  ok(st.strikes === RULES.STRIKES && st.end === "revoked" && st.phase === "clear", "three strikes revoke the licence");
  for (let i = 0; i < RULES.CLEAR_TICKS + 2; i++) S.step(st);
  ok(st.phase === "done" && S.resultOf(st).end === "revoked", "a revoked trip ends");
}
{
  const st = stageWith([]);
  while (st.phase === "play") S.step(st);
  ok(st.end === "quota", "a hunting stage with no male filed closes the season");
}
{
  const st = stageWith([]);
  for (let i = 0; i < RULES.SHELLS; i++) fire(st, 100, 100);
  ok(st.ammo === 0 && st.shots === RULES.SHELLS, "five shells, then empty");
  fire(st, 100, 100);
  ok(st.shots === RULES.SHELLS, "an empty gun clicks: no shot");
  S.step(st, S.OFF, S.OFF, S.BTN.FIRE); S.step(st, S.OFF, S.OFF, 0);
  ok(st.reload > 0, "shooting off the screen reloads");
  for (let i = 0; i < RULES.RELOAD_TICKS; i++) S.step(st);
  ok(st.ammo === RULES.SHELLS, "the magazine is full again");
  S.step(st, 100, 100, S.BTN.FIRE); S.step(st, 100, 100, 0);
  S.step(st, 100, 100, S.BTN.RELOAD); S.step(st, 100, 100, 0);
  ok(st.reload > 0, "the reload button reloads a part-empty gun");
}
{
  // a trunk in front of a buck stops the shot
  const st = stageWith([], "whitetail");
  st.si = 1; const sc = S.sceneOf(st); st.cam = 0;
  const [cx, cw] = sc.cover[1];
  const buck = { id: 200, born: st.tick, t: 0, kind: "male", male: true, sp: "whitetail", pts: 8, size: 0, x: cx + cw / 2, d: 0.5, dir: 1, state: "stop", wait: 999, stopX: null };
  st.targets = [buck]; st.phase = "play"; st.pt = 1; st.sched = [];
  const y = Math.round(S.groundY(sc, 0.5) - 0.65 * sp.h * S.scaleOf(0.5)), x = Math.round(cx + cw / 2 - st.cam);
  S.step(st, x, y, S.BTN.FIRE);
  ok(st.kills.length === 0 && st.shots === 1, "a shot into a trunk stops there");
}
{
  // a shot spooks the animals near it
  const st = stageWith([{ kind: "female", male: false, sp: "whitetail", x: 150, d: 0.5, dir: 1, state: "walk" }]);
  S.step(st, 120, 20, S.BTN.FIRE);
  ok(st.targets[0].state === "run" && st.targets[0].dir === 1, "a miss nearby makes them bolt, away from it");
}
// 4. The data: four species and a Department round; animals only; every scene in our own world.
ok(["whitetail", "elk", "moose", "caribou"].every(id => TRIPS.some(t => t.id === id)) && TRIPS.some(t => t.decoys), "whitetail, elk, moose, caribou, and the Department shoot");
ok(TRIPS.every(t => t.scenes.some(s => SCENES[s].bonus)), "every trip has a bonus round");
ok(Object.values(SCENES).every(s => /FOOTHILLS|FOREST|ATTRITION|MOUNTAIN|DEPARTMENT|POOL|TREE LINE/.test(s.name + s.place)), "the scenes are the city's own ground");
const src = ["sim.js", "data.js", "render.js", "Hunt.jsx"].map(f => readFileSync(join(ROOT, "src/play/hunt", f), "utf8")).join("\n");
ok(!/Math\.(random|sin|cos|exp|pow|atan|log)\(/.test(readFileSync(join(ROOT, "src/play/hunt/sim.js"), "utf8")), "the sim uses no Math.random and no transcendental Math");
ok(!/big buck/i.test(src), "never the other cabinet's name");
ok(/<GameMenu key="end"/.test(src) && /<GameMenu key="pause"/.test(src), "the end and pause menus are the shared GameMenu");
ok(D.seasonOpen("department", AT) && [0, 1, 2, 3].some(s => SPECIES_BY.whitetail.open.includes(s)), "the seasons: the Department always open, each species by the calendar");

// 5. The board's rule (netlify/lib/hunt-store.js): signed permits, one filing each, ranked.
{
  globalThis.__blobs = new Map();
  registerHooks({ resolve(spec, ctx, next) { return spec === "@netlify/blobs" ? { url: "data:text/javascript," + encodeURIComponent("export function getStore(){return {}}"), shortCircuit: true } : next(spec, ctx); } });
  const B = await import("../netlify/lib/hunt-store.js");
  const p = { id: "0123456789abcdef", seed: 12345, at: 1790000000000, trip: "elk" };
  const tok = B.signPermit(p, "k");
  ok(JSON.stringify(B.readPermit(tok, "k")) === JSON.stringify(p), "a signed permit reads back");
  ok(B.readPermit(tok.replace(".12345.", ".12346."), "k") === null && B.readPermit(tok, "other") === null, "a forged or re-seeded permit is refused");
  let b = null;
  for (const [s, id] of [[500, "a"], [900, "b"], [700, "c"]]) b = B.fileTrip(b, { day: 3, tag: "ABC", trip: "elk", score: s, at: "" }, id).board;
  ok(b.top.map(r => r.score).join() === "900,700,500", "the board ranks high to low");
  ok(B.fileTrip(b, { day: 3, tag: "X", trip: "elk", score: 9999, at: "" }, "b").dup, "one filing per permit");
  ok(B.fileTrip(b, { day: 3, tag: "X", trip: "elk", score: 700, at: "" }, "d").rank === 3, "a tie keeps the earlier one ahead");
  ok(!JSON.stringify(B.publicBoard(b, 3)).includes("used"), "the public board never shows the permits");
}

// 6. A casual human (Scott, 2026-10-06: the sports games are too hard): aims at a legal target after a late
// reaction (~250 ms, +-100 ms), with a sloppy aim (about 4-12 px) and no lead. The easy trip (WHITETAIL,
// rank 1) should be cleared at stage 1 (one male filed) in at least 70% of runs, and so should the rest.
{
function rng(seed){let r=seed>>>0;return()=>{r=(Math.imul(r^(r>>>15),2246822507)+0x6d2b79f5)>>>0;return r/4294967296;};}
const gauss=(rnd)=>(rnd()+rnd()+rnd()+rnd()-2)*1.73;
function casual(cfg,{noise=4,react=15,jit=6,speed=5}={}){
  const rnd=rng(cfg.seed*13+5), st=S.newHunt(cfg);
  let tgt=null,seenAt=0,aimOff=[0,0],cap=S.tripTicks(cfg.trip),stage1=null;
  while(st.phase!=="done"&&st.tick<cap){
    let x=Math.round(st.px),y=Math.round(st.py),b=0;
    if(st.phase==="play"){
      if(st.ammo<=0&&st.reload===0){x=S.OFF;y=S.OFF;b=st.prevB&1?0:1;}
      else{
        const pts=S.aimPoints(st).filter(p=>p.x>6&&p.x<S.W-6&&p.y>6&&p.y<S.H-6);
        // sees a target after a reaction delay
        if(!tgt||!pts.some(p=>Math.hypot(p.x-tgt.x,p.y-tgt.y)<30)){ if(pts.length){ if(!seenAt)seenAt=st.tick; if(st.tick-seenAt>=Math.max(4,Math.round(react+gauss(rnd)*jit))){tgt=pts[0];seenAt=0;aimOff=[gauss(rnd)*noise,gauss(rnd)*noise];} } else {tgt=null;seenAt=0;} }
        if(tgt){
          const cur=pts.reduce((a,p)=>!a||Math.hypot(p.x-tgt.x,p.y-tgt.y)<Math.hypot(a.x-tgt.x,a.y-tgt.y)?p:a,null);
          if(cur){tgt=cur;const tx=cur.x+aimOff[0],ty=cur.y+aimOff[1];
            const mv=(a,t)=>Math.abs(t-a)<=speed?t:a+Math.sign(t-a)*speed;
            x=Math.round(mv(st.px,tx));y=Math.round(mv(st.py,ty));
            if(Math.abs(x-tx)<=2&&Math.abs(y-ty)<=2&&st.cool===0&&st.reload===0&&!(st.prevB&1)){b=1;aimOff=[gauss(rnd)*noise,gauss(rnd)*noise];}}
        }
      }
    }
    S.step(st,Math.max(-1,Math.min(S.W-1,x)),Math.max(-1,Math.min(S.H-1,y)),b);
    if(st.stages.length===1&&stage1===null)stage1=st.stages[0].males>=D.RULES.QUOTA;
    st.ev.length=0;
  }
  return {st,stage1:stage1===true};
}

  for (const [trip, cfgn] of [["whitetail", { noise: 4 }], ["whitetail", { noise: 12, react: 20 }], ["elk", { noise: 8 }]]) {
    let hit = 0; const N = 40;
    for (let i = 0; i < N; i++) if (casual({ seed: 500 + i * 11, trip, at: AT }, cfgn).stage1) hit++;
    ok(hit / N >= 0.7, `a casual human (${JSON.stringify(cfgn)}) clears stage 1 of ${trip} ${(hit / N * 100).toFixed(0)}% of runs (>= 70%)`);
    if (process.env.VERBOSE) console.log(`  casual ${trip} ${JSON.stringify(cfgn)}: stage 1 ${(hit / N * 100).toFixed(0)}%`);
  }
}

console.log(`check-hunt: ${n - failed}/${n} passed`);
process.exit(failed ? 1 : 0);
