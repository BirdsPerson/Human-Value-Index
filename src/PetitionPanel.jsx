// THE PEOPLE'S PETITION on a public figure's file (docs/PETITION.md): the machine's number
// beside the people's lean, and one vote per evaluation (TOO HIGH / FAIR / TOO LOW).
// Votes never move a score. Citizens' files never show this panel.
import { useEffect, useState } from "react";
import { Frame, Button, ButtonRow } from "./ui/components.jsx";
import { Bar } from "./term.jsx";
import { readCaseId } from "./caseFile.jsx";
import { slugify } from "./figures.js";
import { CHOICES, CHOICE_LABEL, BALLOT_RULE } from "./petition.js";
import { loadPetition, votePetition } from "./petitionClient.js";
import "./petition.css";

const STATE_TONE = { "CLOSED TO OPINION": "var(--fg-mute)", "REVIEW PENDING": "var(--warn)", NOTED: "var(--accent)", STIRRING: "var(--fg-dim)", QUIET: "var(--fg-mute)" };
const DIR = { high: "TOO HIGH", low: "TOO LOW" };
const fmtDelta = (d) => (d > 0 ? `+${d}` : d < 0 ? `−${-d}` : "±0");

export const petitionable = (s) => Boolean(s && s.kind === "figure" && !s.you);

function useCaseId() {
  const [id, setId] = useState(() => readCaseId());
  useEffect(() => { const on = (e) => setId(e.detail || readCaseId()); window.addEventListener("hvi-case", on); return () => window.removeEventListener("hvi-case", on); }, []);
  return id;
}

function Lean({ lean }) {
  return (
    <div role="list" aria-label="The people's lean this evaluation">
      {CHOICES.map(c => (
        <div key={c} className="pt-lean" role="listitem" aria-label={`${CHOICE_LABEL[c]}: ${lean[c]} percent`}>
          <span className="l" aria-hidden="true">{CHOICE_LABEL[c]}</span>
          <span className="bar" aria-hidden="true"><Bar value={lean[c]} width={14} tone={c === "fair" ? "var(--accent)" : "var(--warn)"} /></span>
          <span className="v" aria-hidden="true">{lean[c]}%</span>
        </div>
      ))}
    </div>
  );
}

export default function PetitionPanel({ subject }) {
  const slug = subject.slug || slugify(subject.baseName || subject.name);
  const caseId = useCaseId();
  const [d, setD] = useState(null);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  useEffect(() => {
    let off = false;
    setD(null); setErr(""); setMsg(null);
    loadPetition(slug, caseId).then(v => { if (!off) setD(v); }).catch(e => { if (!off) setErr(e.message); });
    return () => { off = true; };
  }, [slug, caseId]);

  if (err) return <Frame title="THE PEOPLE'S PETITION" className="pt-frame"><div className="pt-fine">{err}</div></Frame>;
  if (!d) return <Frame title="THE PEOPLE'S PETITION" className="pt-frame"><div className="pt-fine" role="status">[ .. ] CONSULTING THE PUBLIC █</div></Frame>;

  const machine = d.machine || {};
  const evalNo = Math.max(1, machine.period || 0);   // the period is the number of evaluations on file
  if (d.closed) {
    return (
      <Frame title="THE PEOPLE'S PETITION" meta="CLOSED" className="pt-frame">
        <div className="pt-closed" role="note">FILE CLOSED TO OPINION.</div>
        <p className="pt-fine">{d.stateLine}</p>
      </Frame>
    );
  }

  const mine = d.mine?.choice || null;
  async function vote(choice) {
    if (!caseId || busy) return;
    setBusy(true); setMsg(null);
    try {
      const v = await votePetition(slug, caseId, choice);
      setD(v);
      setMsg({ ok: true, text: v.unchanged ? "UNCHANGED. THE DEPARTMENT HEARD YOU THE FIRST TIME." : v.changed ? "VOTE CHANGED. THE PREVIOUS ONE IS SUPERSEDED, NOT FORGOTTEN." : "VOTE RECORDED. IT MOVES NOTHING. IT IS COUNTED ANYWAY." });
    } catch (e) {
      setMsg({ ok: false, text: e.message });
    } finally { setBusy(false); }
  }
  const voters = d.counts?.voters;
  const people = d.people;
  return (
    <Frame title="THE PEOPLE'S PETITION" meta={`EVAL. ${evalNo}`} className="pt-frame">
      <div className="pt-side">
        <div className="pt-col">
          <h3>THE MACHINE</h3>
          <div className="pt-num">{machine.score}<small>{machine.tier}</small></div>
          <p className="pt-fine">THE NUMBER ON FILE. THE PEOPLE DO NOT SET IT.</p>
        </div>
        <div className="pt-col">
          <h3>THE PEOPLE, THIS EVALUATION</h3>
          {d.counts?.lean ? <Lean lean={d.counts.lean} /> : <div className="pt-fine">TESTIMONY TOO THIN TO LEAN.</div>}
          <p className="pt-fine">{voters == null ? "FEWER THAN 5 SUBJECTS HAVE VOTED." : `${d.state === "REVIEW PENDING" ? "" : "~"}${voters} SUBJECTS HAVE VOTED.`}
            {people?.crowd?.n >= 5 ? ` PUBLIC LIKABILITY ${people.likability}${people.polled != null ? ` (POLLED ${people.polled})` : ""}.` : ""}</p>
        </div>
      </div>
      <div className="pt-state" style={{ "--tone": STATE_TONE[d.state] }}><b>{d.state}</b>{d.stateLine}</div>

      {caseId ? (
        <>
          <div className="pt-choices" role="group" aria-label="Is the machine's score too high, fair, or too low?">
            {CHOICES.map(c => (
              <button key={c} type="button" className="pt-choice" aria-pressed={mine === c} disabled={busy} onClick={() => vote(c)}>
                {CHOICE_LABEL[c]}
              </button>
            ))}
          </div>
          <div className="pt-mine">{mine ? `YOUR VOTE THIS EVALUATION: ${CHOICE_LABEL[mine]}. YOU MAY CHANGE IT UNTIL THE DEPARTMENT RE-EXAMINES.` : `FILE ${caseId}. NO VOTE ON RECORD THIS EVALUATION.`}</div>
        </>
      ) : (
        <>
          <p className="pt-fine">NO FILE ON THIS TERMINAL. ONLY THE ASSESSED MAY PETITION. THE UNASSESSED MAY READ, WHICH THE DEPARTMENT ALSO RECORDS.</p>
          <ButtonRow stackOnMobile><Button variant="secondary" href="#intake">Be assessed</Button></ButtonRow>
        </>
      )}
      {msg && <div className={msg.ok ? "pt-ok" : "pt-err"} role={msg.ok ? "status" : "alert"}>{msg.ok ? "" : "!! "}{msg.text}</div>}
      <p className="pt-rule">{BALLOT_RULE}</p>
      <p className="pt-fine">VOTES NEVER MOVE A SCORE. AT {d.rules.noted} VOTERS A FILE IS NOTED. AT {d.rules.review}, IF SUBJECTS FROM THREE OF THE FOUR QUADRANTS LEAN THE SAME WAY FOR {d.rules.holdHours} HOURS, THE DEPARTMENT RE-EXAMINES THE RECORD, WITHOUT BEING TOLD WHICH WAY. {d.rules.reviewsPerDay} RE-EXAMINATIONS A DAY. NO FREE TEXT.</p>
      {d.history?.length > 0 && (
        <ul className="pt-hist" aria-label="Earlier evaluations">
          {d.history.map(h => (
            <li key={h.period}>EVALUATION {Math.max(1, h.period)}{h.score != null ? ` (${h.score})` : ""}: {CHOICES.map(c => `${h.lean[c]}% ${CHOICE_LABEL[c]}`).join(" · ")}, {h.voters} {h.voters === 1 ? "SUBJECT" : "SUBJECTS"}
              {h.petitioned ? `. PETITIONED ${DIR[h.petitioned.dir]}${h.petitioned.outcome ? `; ${h.petitioned.outcome} (${fmtDelta(h.petitioned.delta)})` : "; UNDER REVIEW"}` : ""}.</li>
          ))}
        </ul>
      )}
    </Frame>
  );
}
