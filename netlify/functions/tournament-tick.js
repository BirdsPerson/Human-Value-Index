// THE OPEN TOURNAMENTS' results desk (docs/TOURNAMENTS.md), every 15 real minutes: every event whose
// window and grace have closed in the last ten days is made final once (its places written into the
// board) and its prizes delivered: the line on each winner's file, the trophy into each winner's
// inventory (retried until the file has a wallet, for thirty days). netlify/lib/tournament-awards.js.
import { finalizeDue } from "../lib/tournament-awards.js";

export default async () => {
  try {
    const done = await finalizeDue(Date.now());
    if (done.length) console.log("tournament tick", JSON.stringify(done));
  } catch (err) {
    console.error("tournament tick failed", err?.name, err?.message);
  }
};

export const config = { schedule: "*/15 * * * *" };
