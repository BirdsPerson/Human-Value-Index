// The city's door to THE MARKET: one row in the Finance district (and the Reserve Tower), with
// the index as it stands. Fetches the ticker (small, cached a minute); says nothing if the floor is dark.
import { useEffect, useState } from "react";
import { ListRow } from "../ui/index.js";
import { loadTicker } from "./client.js";

export default function ExchangeRow() {
  const [t, setT] = useState(null);
  useEffect(() => { let off = false; loadTicker().then(d => { if (!off) setT(d); }).catch(() => {}); return () => { off = true; }; }, []);
  const label = t?.ticker?.[0] ? `THE EXCHANGE // ${t.ticker[0]}` : "THE EXCHANGE // THE MARKET IN HUMANS";
  return (
    <div style={{ margin: "0 0 var(--s4)" }}>
      <ListRow lead="RSV" label={label} tag="TRADE" href="#market" aria-label={`${label}. Open the market.`} />
    </div>
  );
}
