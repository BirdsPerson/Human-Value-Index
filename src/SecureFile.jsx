import { useEffect, useState } from "react";
import { readCaseId, writeCaseId } from "./Intake.jsx";

// Email magic link: tie a case file to a real address so it follows you to any device.
// The address never comes back to the browser except masked.
const AUTH_LINES = {
  ok: "ACCESS GRANTED. YOUR FILE IS NOW SECURED TO YOUR ADDRESS.",
  expired: "THAT LINK IS SPENT OR EXPIRED. REQUEST ANOTHER. THE DEPARTMENT HAS PLENTY.",
  error: "THE ACCESS OFFICE FAILED TO PROCESS YOUR LINK. REQUEST ANOTHER.",
};

async function postJSON(url, body) {
  const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  return { status: res.status, data: await res.json().catch(() => null) };
}

export default function SecureFile({ onCase, autoFocus = false }) {
  const [me, setMe] = useState(null);
  const [email, setEmail] = useState("");
  const [msg, setMsg] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let dead = false;
    try {
      const u = new URL(window.location.href);
      const a = u.searchParams.get("auth");
      if (a) { if (AUTH_LINES[a]) setMsg(AUTH_LINES[a]); u.searchParams.delete("auth"); window.history.replaceState(null, "", u.pathname + u.search + u.hash); }
    } catch { /* leave the URL */ }
    (async () => {
      const r = await fetch("/api/me", { cache: "no-store" }).then(x => x.json()).catch(() => null);
      if (dead || !r) return;
      if (!r.signedIn) { setMe({ signedIn: false }); return; }
      const held = readCaseId();
      // This browser holds a case the account doesn't: secure it. A browser with no case
      // but a signed-in account: bring the account's latest file here.
      if (held && !r.cases.includes(held)) {
        const c = await postJSON("/api/me", { action: "claim", caseId: held }).catch(() => null);
        if (dead) return;
        if (c?.status === 200) { setMe(c.data); return; }
        if (c?.status === 409) setMsg(c.data?.error);
      } else if (!held && r.cases.length) {
        const id = r.cases[r.cases.length - 1];
        writeCaseId(id);
        onCase?.(id);
        setMsg(`FILE ${id} RESTORED FROM YOUR ACCOUNT.`);
      }
      setMe(r);
    })();
    return () => { dead = true; };
  }, []);

  async function request(e) {
    e.preventDefault();
    if (busy) return;
    setBusy(true); setMsg(null);
    try {
      const { status, data } = await postJSON("/api/login", { email: email.trim() });
      setMsg(status === 200 ? `LINK DISPATCHED. ${data?.message || ""}`.trim() : (data?.error || "The access office is unavailable."));
    } catch {
      setMsg("The Department cannot be reached. Check your connection.");
    } finally { setBusy(false); }
  }

  async function logout() {
    await postJSON("/api/logout", {}).catch(() => null);
    setMe({ signedIn: false }); setMsg("SESSION ENDED. YOUR FILE REMAINS. IT ALWAYS REMAINS.");
  }

  if (!me) return null;
  if (me.signedIn) return (
    <div className="hvi-secure">
      <div className="bright">FILE SECURED // {me.email}</div>
      {me.cases?.length > 0 && <div className="dim">FILES ON THIS ADDRESS: {me.cases.join(", ")}</div>}
      <button className="hvi-link-btn" onClick={logout}>Log out on this device</button>
      {msg && <div className="hvi-logon-msg" role="status">{msg}</div>}
    </div>
  );
  return (
    <form className="hvi-logon-form hvi-secure" onSubmit={request}>
      <div className="dim">SECURE YOUR FILE: TIE IT TO AN EMAIL ADDRESS SO IT FOLLOWS YOU TO ANY DEVICE. NO PASSWORD. THE DEPARTMENT SENDS A LINK.</div>
      <label className="p" htmlFor="hvi-secure-email">EMAIL:</label>
      <input id="hvi-secure-email" className="hvi-refer-input" type="email" value={email} autoFocus={autoFocus} disabled={busy}
        onChange={e => setEmail(e.target.value)} placeholder="you@example.com" maxLength={254} autoComplete="email"
        aria-label="Email address" onKeyDown={e => e.stopPropagation()} />
      <button className="hvi-btn-secondary" type="submit" disabled={busy || !email.includes("@")}>Send link</button>
      {msg && <div className="hvi-logon-msg" role="status">{msg}</div>}
    </form>
  );
}
