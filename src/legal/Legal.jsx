// ABOUT, PRIVACY, TERMS and DISPUTE. Lazy-loaded (App.jsx): none of it ships with the logon.
// The copy is docs/legal/*.md, imported raw and rendered by the small reader below, so
// Scott edits the markdown and the pages follow. The reader knows: # and ## headings,
// > the Overlord's line, - lists, | tables, **bold**, *italic*, [text](href), paragraphs,
// [[TODO ...]] (shown highlighted, for the draft) and <!-- form --> / <!-- purge --> slots.
import { useState } from "react";
import about from "../../docs/legal/about.md?raw";
import privacy from "../../docs/legal/privacy.md?raw";
import terms from "../../docs/legal/terms.md?raw";
import dispute from "../../docs/legal/dispute.md?raw";
import { Frame, Button, ButtonRow, TextField } from "../ui/index.js";
import { readCaseId } from "../caseFile.jsx";
// ?inline: the styles ride inside this lazy chunk, so the logon bundle carries no preload entry for them.
import legalCss from "./legal.css?inline";

const PAGES = { "#about": about, "#privacy": privacy, "#terms": terms, "#dispute": dispute };

function inline(text, key = "i") {
  // Tokens: [[TODO ...]], [text](href), **bold**, *italic*.
  const re = /\[\[(TODO[^\]]*)\]\]|\[([^\]]+)\]\(([^)\s]+)\)|\*\*([^*]+)\*\*|\*([^*]+)\*/g;
  const out = [];
  let last = 0, m, n = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const k = `${key}-${n++}`;
    if (m[1]) out.push(<mark key={k} className="lg-todo">{m[1]}</mark>);
    else if (m[2]) {
      const ext = /^https?:/.test(m[3]);
      out.push(<a key={k} href={m[3]} {...(ext ? { target: "_blank", rel: "noopener noreferrer" } : {})}>{m[2]}</a>);
    } else if (m[4]) out.push(<strong key={k}>{m[4]}</strong>);
    else out.push(<em key={k}>{m[5]}</em>);
    last = re.lastIndex;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

const cells = (row) => row.trim().replace(/^\||\|$/g, "").split("|").map(c => c.trim());

export function renderDoc(md, slots = {}) {
  const blocks = md.replace(/\r/g, "").split(/\n{2,}/);
  return blocks.map((b, i) => {
    const t = b.trim();
    if (!t) return null;
    const slot = t.match(/^<!--\s*(\w+)\s*-->$/);
    if (slot) return <div key={i}>{slots[slot[1]] || null}</div>;
    if (t.startsWith("# ")) return <h1 key={i} className="lg-h1">{t.slice(2)}</h1>;
    if (t.startsWith("## ")) return <h2 key={i} className="lg-h2">{t.slice(3)}</h2>;
    if (t.startsWith("> ")) return <p key={i} className="lg-voice">{inline(t.replace(/^> /gm, ""), `v${i}`)}</p>;
    if (t.startsWith("|")) {
      const rows = t.split("\n").filter(r => !/^\|?\s*-{3}/.test(r));
      const [head, ...body] = rows.map(cells);
      return (
        <div key={i} className="lg-table-wrap">
          <table className="lg-table">
            <thead><tr>{head.map((c, j) => <th key={j} scope="col">{c}</th>)}</tr></thead>
            <tbody>{body.map((r, j) => <tr key={j}>{r.map((c, k) => <td key={k} data-h={head[k]}>{inline(c, `t${i}-${j}-${k}`)}</td>)}</tr>)}</tbody>
          </table>
        </div>
      );
    }
    if (/^- /.test(t)) return <ul key={i} className="lg-list">{t.split(/\n(?=- )/).map((li, j) => <li key={j}>{inline(li.replace(/^- /, "").replace(/\n/g, " "), `l${i}-${j}`)}</li>)}</ul>;
    return <p key={i}>{inline(t.replace(/\n/g, " "), `p${i}`)}</p>;
  });
}

async function postJSON(url, body) {
  const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  return { status: res.status, data: await res.json().catch(() => null) };
}

// ---- DISPUTE form ------------------------------------------------------------------------
const KINDS = [["correction", "CORRECTION", "Something in a file is wrong"], ["takedown", "TAKEDOWN", "Review a file for removal"], ["privacy", "PRIVACY", "Find, copy or delete my data"]];
const RELS = [["self", "I AM THE SUBJECT"], ["representative", "I REPRESENT THE SUBJECT"], ["other", "OTHER"]];

function Choice({ legend, name, options, value, onChange }) {
  return (
    <fieldset className="lg-choice">
      <legend>{legend}</legend>
      {options.map(([v, label, sub]) => (
        <label key={v} className={value === v ? "on" : ""}>
          <input type="radio" name={name} value={v} checked={value === v} onChange={() => onChange(v)} />
          <span className="l">{label}</span>{sub && <span className="s">{sub}</span>}
        </label>
      ))}
    </fieldset>
  );
}

export function DisputeForm({ file: initialFile = "" }) {
  const [f, setF] = useState({ kind: "correction", relationship: "", name: "", file: initialFile, problem: "", email: "", website: "" });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const [done, setDone] = useState(null);
  const set = (k) => (e) => setF(p => ({ ...p, [k]: e?.target ? e.target.value : e }));

  async function submit(e) {
    e.preventDefault();
    if (busy) return;
    setBusy(true); setErr(null);
    try {
      const { status, data } = await postJSON("/api/request", f);
      if (status === 200) { setDone(data); window.scrollTo(0, 0); }
      else setErr(data?.error || "The request desk could not be reached. Please try again.");
    } catch { setErr("The request desk could not be reached. Check your connection and try again."); }
    finally { setBusy(false); }
  }

  if (done) return (
    <Frame box title="REQUEST FILED" meta={done.id || ""} className="lg-done">
      <p className="lg-voice">{done.message}</p>
      <p><strong>A human reviews every request.</strong> You will get a reply within 7 days at the address you gave. Your reference: <strong>{done.id}</strong>.</p>
      <ButtonRow><Button variant="secondary" href="#">Return to the terminal</Button></ButtonRow>
    </Frame>
  );
  return (
    <form className="lg-form" onSubmit={submit} noValidate>
      <Choice legend="KIND OF REQUEST" name="kind" options={KINDS} value={f.kind} onChange={set("kind")} />
      <Choice legend="YOUR RELATIONSHIP TO THE SUBJECT" name="rel" options={RELS} value={f.relationship} onChange={set("relationship")} />
      <TextField stacked label="YOUR NAME" value={f.name} onChange={set("name")} maxLength={120} autoComplete="name" />
      <TextField stacked label="WHICH FILE (NAME OR CASE NUMBER)" value={f.file} onChange={set("file")} maxLength={160} />
      <TextField stacked multiline rows={6} label="WHAT IS WRONG" value={f.problem} onChange={set("problem")} maxLength={4000}
        placeholder="Quote the sentence if you can, and say what the record actually shows." />
      <TextField stacked label="YOUR EMAIL (FOR THE REPLY)" type="email" inputMode="email" value={f.email} onChange={set("email")} maxLength={254}
        autoComplete="email" autoCapitalize="off" spellCheck={false} />
      <div className="lg-hp" aria-hidden="true">
        <label>Leave this empty <input tabIndex={-1} autoComplete="off" value={f.website} onChange={set("website")} /></label>
      </div>
      {err && <div className="hvi-err" role="alert">!! {err}</div>}
      <ButtonRow stackOnMobile>
        <Button type="submit" variant="primary" disabled={busy}>{busy ? "Filing" : "File request"}</Button>
      </ButtonRow>
    </form>
  );
}

// ---- PURGE MY FILE -------------------------------------------------------------------------
export function PurgePanel() {
  const [caseId, setCaseId] = useState(() => readCaseId());
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const [armed, setArmed] = useState(false);

  async function purge(e) {
    e.preventDefault();
    if (busy) return;
    setBusy(true); setMsg(null);
    try {
      const { status, data } = await postJSON("/api/purge", { caseId, confirm });
      if (status === 200) {
        try { localStorage.removeItem("hvi-case-id"); localStorage.removeItem("hvi-last-result"); } catch { /* nothing to clear */ }
        try { window.dispatchEvent(new CustomEvent("hvi-case", { detail: null })); } catch { /* header stays stale */ }
        setMsg({ ok: true, text: `${data.message} ${data.accountDeleted ? "Your email address and sign-in were deleted too." : ""}`.trim() });
        setCaseId(null);
      } else setMsg({ ok: false, text: data?.error || "The purge did not complete. Try again." });
    } catch { setMsg({ ok: false, text: "The Department could not be reached. Check your connection." }); }
    finally { setBusy(false); }
  }

  return (
    <Frame box title="PURGE MY FILE" meta={caseId || "NO FILE HERE"} tone="harm" className="lg-purge">
      {msg && <div className={msg.ok ? "hvi-case-note" : "hvi-err"} role={msg.ok ? "status" : "alert"}>{msg.ok ? "" : "!! "}{msg.text}</div>}
      {!caseId && !msg?.ok && <p>This browser holds no case file. If your file is on another device, open this page there, or restore it with its case number from the menu first.</p>}
      {caseId && !armed && (
        <>
          <p>Deletes case <strong>{caseId}</strong>: transcripts, scores, verdicts, photo and history, and its public card. This cannot be undone.</p>
          <ButtonRow><Button variant="secondary" onClick={() => setArmed(true)}>Purge this file</Button></ButtonRow>
        </>
      )}
      {caseId && armed && (
        <form onSubmit={purge} className="lg-form">
          <TextField stacked label={`TYPE ${caseId} TO CONFIRM`} value={confirm} onChange={e => setConfirm(e.target.value)} maxLength={12}
            autoCapitalize="characters" spellCheck={false} inputClassName="hvi-caseno" />
          <ButtonRow stackOnMobile>
            <Button type="submit" variant="primary" disabled={busy || confirm.trim().toUpperCase() !== caseId}>{busy ? "Shredding" : "Purge permanently"}</Button>
            <Button variant="back" onClick={() => { setArmed(false); setConfirm(""); }}>Keep my file</Button>
          </ButtonRow>
        </form>
      )}
    </Frame>
  );
}

export default function Legal({ route = "" }) {
  const [path, query = ""] = route.split("?");
  const md = PAGES[path] || about;
  const file = new URLSearchParams(query).get("file") || "";
  return (
    <article className="lg-doc">
      <style>{legalCss}</style>
      {renderDoc(md, { form: <DisputeForm file={file} />, purge: <PurgePanel /> })}
    </article>
  );
}
