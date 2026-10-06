// GET /api/cam: SUBSTRATE.CAM, the front page's tiny live view of the city (netlify/lib/front.js
// camSvg). The overview at the machine hour: districts, the Loop, every line and train, night or
// day. A small SVG (~10 KB), the same for every viewer in a minute: the landing asks for
// /api/cam?m=<real minute> and the edge keeps each minute's picture.
import { camSvg } from "../lib/front.js";
import { DISTRICTS, LOOP_LINE, STATIONS, STATION_ORDER, machineClock, linesOn, lineTrainsAt } from "../../src/city/sim.js";
import { layoutDistricts } from "../../src/city/cityKit.js";

const LOOP_CAR = "#67e8f9";
let layout = null;
export function camNow(realMs = Date.now()) {
  layout ||= layoutDistricts(DISTRICTS);
  const clock = machineClock(realMs);
  const ls = linesOn(), byId = Object.fromEntries(ls.map(l => [l.id, l]));
  const trains = lineTrainsAt(clock.mt).map(t => {
    const line = t.line === "loop" ? null : byId[t.line];
    return { cars: t.cars, at: line ? line.at : LOOP_LINE.at, color: line ? line.color : LOOP_CAR };
  }).filter(t => t.at);
  return camSvg({
    clock, layout, ring: LOOP_LINE.loop, carLen: LOOP_LINE.carLen,
    stations: STATION_ORDER.map(id => STATIONS[id]),
    lines: ls.filter(l => l.id !== "loop").map(l => ({ color: l.color, pts: l.centre?.pts || [] })),
    trains,
  });
}

export default async (req) => {
  if (req.method !== "GET") return new Response("The camera is watched, not written to.", { status: 405 });
  try {
    return new Response(camNow(), { status: 200, headers: {
      "Content-Type": "image/svg+xml; charset=utf-8",
      "Cache-Control": "public, max-age=60",
      "Netlify-CDN-Cache-Control": "public, max-age=60, stale-while-revalidate=60",
      "X-Content-Type-Options": "nosniff",
    } });
  } catch (err) {
    console.error("cam failed", err?.message);
    return new Response("NO PICTURE. THE CAMERA IS BEING SERVICED.", { status: 503, headers: { "Cache-Control": "no-store" } });
  }
};

export const config = { path: "/api/cam" };
