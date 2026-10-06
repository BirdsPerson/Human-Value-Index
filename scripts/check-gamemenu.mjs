// GameMenu's pure logic (src/play/gameMenuLogic.js): which rows show, in what order, and what the
// keys and the pad do. Usage: node scripts/check-gamemenu.mjs
import { menuItems, moveFocus, keyAction, padStep } from "../src/play/gameMenuLogic.js";

let bad = 0;
const ok = (c, msg) => { if (!c) { bad++; console.error("FAIL", msg); } };
const ids = (xs) => xs.map(x => x.id).join(",");
const fn = () => {};

// rows: in the order passed; off rows dropped; custom rows where they are put
let m = menuItems("end", { again: fn, replay: false, settings: null, play: true, city: true, aquarium: { label: "THE AQUARIUM", href: "#aquarium" } });
ok(ids(m) === "again,play,city,aquarium", `end order/filter: ${ids(m)}`);
ok(ids(menuItems("end", { again: fn, aquarium: "#aquarium", play: true })) === "again,aquarium,play", "custom row keeps its place");
ok(m[1].href === "#play" && m[2].href === "#city", "default links for play and city");
ok(m[0].label === "PLAY AGAIN" && m[3].label === "THE AQUARIUM", "default and custom labels");
m = menuItems("end", { rematch: { label: "NEW SPOT", onSelect: fn }, city: { label: "BACK TO THE PIER", href: "#city" } });
ok(m[0].label === "NEW SPOT" && m[1].label === "BACK TO THE PIER", "relabelled rows");
m = menuItems("end", { city: { label: "BACK TO THE PARK" } });
ok(m[0].href === "#city", "city without a link falls back to #city");
ok(menuItems("end", { again: true }).length === 0, "true on a row with no default link shows nothing");
ok(menuItems("end", { weird: {} }).length === 0, "a custom row with nothing to do is dropped");

m = menuItems("pause", { resume: fn, restart: fn, controls: { $$typeof: Symbol.for("react.element") }, sound: { on: false, onSelect: fn }, quit: true });
ok(ids(m) === "resume,restart,controls,sound,quit", `pause order: ${ids(m)}`);
ok(m[3].label === "SOUND: OFF", "sound label off");
ok(menuItems("pause", { sound: { on: true, onSelect: fn } })[0].label === "SOUND: ON", "sound label on");
ok(m[2].legend && !m[2].onSelect, "controls carries the legend");
ok(menuItems("pause", { controls: true }).length === 0, "controls with no legend is dropped");

// focus: wraps, skips disabled
const it = [{}, { disabled: true }, {}, {}];
ok(moveFocus(it, 0, 1) === 2, "down skips disabled");
ok(moveFocus(it, 0, -1) === 3, "up wraps");
ok(moveFocus(it, 3, 1) === 0, "down wraps");
ok(moveFocus([{ disabled: true }, {}], 0, "first") === 1, "first skips disabled");
ok(moveFocus(it, 0, "last") === 3, "last");
ok(moveFocus([], 0, 1) === -1, "empty list");
ok(moveFocus([{ disabled: true }], 0, 1) === -1, "all disabled");

// keys
ok(keyAction("ArrowUp") === "up" && keyAction("ArrowDown") === "down", "arrows");
ok(keyAction("Enter") === "select" && keyAction(" ") === "select", "enter/space select");
ok(keyAction("Escape") === "back" && keyAction("Backspace") === "back", "esc/backspace back");
ok(keyAction("Home") === "first" && keyAction("End") === "last", "home/end");
ok(keyAction("q") === null, "other keys ignored");

// pad: stick/d-pad edges, A on release only if pressed while open, B on press
let s = padStep(null, { y: 0, act: true }).next;           // A already held when the menu opened
let r = padStep(s, { y: 0, act: false });
ok(r.action === null, "a held-over A does not select on release");
r = padStep(r.next, { y: 0, act: true }); ok(r.action === null, "A press: nothing yet");
r = padStep(r.next, { y: 0, act: false }); ok(r.action === "select", "A release selects");
r = padStep(r.next, { y: 1 }); ok(r.action === "down", "stick down");
r = padStep(r.next, { y: 1 }); ok(r.action === null, "held stick: one step");
r = padStep(r.next, { y: -0.9 }); ok(r.action === "up", "stick up");
r = padStep(r.next, { y: 0, back: true }); ok(r.action === "back", "B backs");
ok(padStep(null, { back: true }).action === null, "a held-over B does nothing");

console.log(bad ? `${bad} FAILED` : "OK gamemenu: rows, focus, keys, pad");
process.exit(bad ? 1 : 0);
