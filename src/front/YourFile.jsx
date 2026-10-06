// YOUR FILE, on the desk: your file photo (your avatar: the Department has no sign-maker yet, so
// your likeness is your emblem), score, tier, cubrant, MOVEMENT LOG, unread mail and the first day.
// Reads what this device already holds (the cached file, caseFile.jsx) and asks the mail room for
// one number. No file: the line that gets you one.
import { lazy, Suspense, useEffect, useState } from "react";
import { Frame } from "../ui/index.js";
import Sparkline from "../ui/Sparkline.jsx";
import { readCaseId, readLastResult } from "../caseFile.jsx";
import { cubePlace } from "../CubePanel.jsx";
import { getTier } from "../figures.js";

const FilePhoto = lazy(() => import("../FilePhoto.jsx"));

function useFile() {
  const [f, setF] = useState(() => ({ id: readCaseId(), r: readLastResult() }));
  useEffect(() => {
    const on = () => setF({ id: readCaseId(), r: readLastResult() });
    window.addEventListener("hvi-file", on); window.addEventListener("hvi-case", on);
    return () => { window.removeEventListener("hvi-file", on); window.removeEventListener("hvi-case", on); };
  }, []);
  return f;
}

export default function YourFile({ size = "L" }) {
  const { id, r } = useFile();
  const [mail, setMail] = useState(null);
  useEffect(() => {
    if (!id) return undefined;
    let off = false;
    import("../mail/client.js").then(m => m.unreadCount(id)).then(n => { if (!off && typeof n === "number") setMail(n); }).catch(() => {});
    const on = (e) => { if (e.detail?.caseId === id && typeof e.detail.unread === "number") setMail(e.detail.unread); };
    window.addEventListener("hvi-mail", on);
    return () => { off = true; window.removeEventListener("hvi-mail", on); };
  }, [id]);
  const mine = r && r.caseId === id ? r : null;
  if (!id || !mine) return (
    <Frame title="YOUR FILE" meta={size === "S" ? "" : "NOT ON RECORD"} tone="var(--accent)" className={`fr-file v-${size}`}>
      <p className="fr-dim">NO FILE ON THIS DEVICE. THE DEPARTMENT FINDS THIS SUSPICIOUS.</p>
      <a className="fr-go" href="#intake">GET EVALUATED ›</a>
    </Frame>
  );
  const tier = getTier(mine.score);
  let fdDone = false;
  try { fdDone = localStorage.getItem(`hvi-fd:${id}:done`) === "1"; } catch { /* unknown: shown as open */ }
  const me = { ...mine, kind: "citizen", you: true, caseId: id, name: `Subject ${id.slice(-4)}` };
  const V = VIEWS_file[size] || VIEWS_file.L;
  return (
    <Frame title="YOUR FILE" meta={size === "S" ? "" : `CASE ${id}`} tone="var(--accent)" className={`fr-file v-${size}`}>
      <V mine={mine} tier={tier} me={me} id={id} mail={mail} fdDone={fdDone} />
    </Frame>
  );
}

// one prepared layout per size: S the score and tier, M adds your photo, L the mail and first-day lines
const Link = ({ id, mine, tier, children }) => <a className="fr-file-link" href="#file" aria-label={`Your file: score ${mine.score}, ${mine.tier || tier.label}. Open your file.`}>{children}</a>;
const Rows = ({ mine, tier }) => (
  <span className="rows" aria-hidden="true">
    <span className="sc"><b>{mine.score}</b><span className="of">/1000</span></span>
    <span className="tr"><i style={{ background: tier.color }} />{mine.tier || tier.label}</span>
    <span className="cb">{cubePlace(mine) || "CUBRANT PENDING"}</span>
    <span className="mv">MOVEMENT <Sparkline s={{ you: true, score: mine.score, history: mine.history }} /></span>
  </span>
);
const Photo = ({ me }) => <span className="ph" aria-hidden="true"><Suspense fallback={<span className="ph-wait" />}><FilePhoto subject={me} scale={2} compact /></Suspense></span>;
const VIEWS_file = {
  S: ({ id, mine, tier }) => (
    <a className="fr-glance" href="#file" aria-label={`Your file: score ${mine.score}, ${mine.tier || tier.label}. Open your file.`}>
      <span className="big">{mine.score}<span className="of">/1000</span></span>
      <span className="ln1"><i className="sq" style={{ background: tier.color }} aria-hidden="true" /><span className="n">{mine.tier || tier.label}</span></span>
    </a>
  ),
  M: ({ id, mine, tier, me }) => <Link id={id} mine={mine} tier={tier}><Photo me={me} /><Rows mine={mine} tier={tier} /></Link>,
  L: ({ id, mine, tier, me, mail, fdDone }) => (
    <>
      <Link id={id} mine={mine} tier={tier}><Photo me={me} /><Rows mine={mine} tier={tier} /></Link>
      <ul className="fr-file-lines">
        <li><a href="#mail">MAIL: {mail == null ? "…" : mail ? `${mail} UNREAD` : "NOTHING UNREAD"}</a></li>
        <li><a href="#">{fdDone ? "FIRST DAY: COMPLETE. YOU ARE NOW ORDINARY." : "FIRST DAY: OPEN. THE STEPS ARE ON THE MENU."}</a></li>
      </ul>
    </>
  ),
};
