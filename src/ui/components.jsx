// The canonical components. One version of each; every screen uses these instead of
// its own button, chip, bar or collapsible. Styles live in ui.css, values in tokens.css.
// API and rules: docs/design-system.md.

import { forwardRef, useEffect, useId, useRef, useState } from "react";
import { TermBox, Bar, Typed } from "../term.jsx";

const cx = (...a) => a.filter(Boolean).join(" ");

// A tone is a role name (accent | warn | harm | mute) or any CSS colour (tier colours).
const TONE_VARS = { accent: "var(--accent)", warn: "var(--warn)", harm: "var(--harm)", mute: "var(--fg-mute)", dim: "var(--fg-dim)" };
export const toneVar = (t) => (t ? TONE_VARS[t] || t : undefined);

// ---------------------------------------------------------------------------
// Frame. The container. `box` draws it in box-drawing characters (TermBox): use that
// for the few panels that carry the file (score, case file, the interview) so they
// read as the terminal's own furniture. Everything else takes the plain 1px frame.
// Titles ellipsize; `meta` sits on the right edge and drops out first.
export function Frame({ title, meta, tone, box = false, double = false, flush = false, className, bodyClass, children, style, ...rest }) {
  if (box || double) {
    return (
      <TermBox title={title} right={meta} tone={toneVar(tone)} double={double} className={className}
        bodyClass={cx(bodyClass, flush && "flush")} style={style} {...rest}>
        {children}
      </TermBox>
    );
  }
  return (
    <section className={cx("ui-frame", flush && "flush", className)} style={{ ...(tone ? { "--tone": toneVar(tone) } : null), ...style }}
      aria-label={typeof title === "string" ? title : undefined} {...rest}>
      {(title || meta) && (
        <div className="ui-frame-ttl" aria-hidden="true">
          {title ? <span className="t">{title}</span> : <span />}
          {meta && <span className="m">{meta}</span>}
        </div>
      )}
      <div className={bodyClass}>{children}</div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Command: a full-width menu row.  N  LABEL  ›  with an optional subtitle line.
// 48px tall on touch. `selected` is inverse video (one selection state app-wide);
// hover and focus underline / outline, never a second highlight.
export const Command = forwardRef(function Command(
  { n, label, sub, kbd = "›", href, onClick, selected = false, disabled, className, children, ...rest }, ref) {
  const Tag = href ? "a" : "button";
  const props = href ? { href } : { type: "button", disabled };
  return (
    <Tag ref={ref} className={cx("ui-cmd", n == null && "no-n", className)} aria-current={selected ? "true" : undefined}
      onClick={onClick} {...props} {...rest}>
      {n != null && <span className="n" aria-hidden="true">{n}</span>}
      <span className="l">{label ?? children}</span>
      {kbd && <span className="k" aria-hidden="true">{kbd}</span>}
      {sub && <span className="s">{sub}</span>}
    </Tag>
  );
});

// A list of Commands with dividers. Pass Command elements as children.
export function CommandList({ label, children, className }) {
  const items = Array.isArray(children) ? children.flat() : [children];
  return (
    <ul className={cx("ui-cmd-list", className)} aria-label={label}>
      {items.filter(Boolean).map((c, i) => <li key={c.key ?? i}>{c}</li>)}
    </ul>
  );
}

// ---------------------------------------------------------------------------
// Button: an inline terminal command.
//   primary    [ SUBMIT ]     the one action a screen wants
//   secondary  > HOLDING PEN  an alternative
//   back       < MAIN MENU    leave
//   danger     red text, for destructive commands
// `block` makes it a full-width 48px row (use inside ButtonRow stack-m on phones).
export const Button = forwardRef(function Button(
  { variant = "secondary", block = false, href, className, children, type = "button", ...rest }, ref) {
  const cls = cx("ui-btn", variant, block && "block", className);
  if (href) return <a ref={ref} className={cls} href={href} {...rest}>{children}</a>;
  return <button ref={ref} type={type} className={cls} {...rest}>{children}</button>;
});

// A row of Buttons. split: first left, last right. stackOnMobile: full-width rows on phones.
export function ButtonRow({ split = false, stackOnMobile = false, className, children, ...rest }) {
  return <div className={cx("ui-btn-row", split && "split", stackOnMobile && "stack-m", className)} {...rest}>{children}</div>;
}

// ---------------------------------------------------------------------------
// Chip: an outlined state label (tier, octant, judge). Not a button, unless it has
// onClick, in which case it toggles (aria-pressed) and gets a 44px hit area.
export function Chip({ tone, onClick, pressed, className, children, ...rest }) {
  const role = TONE_VARS[tone] ? tone : null;
  const style = tone && !role ? { "--tone": tone } : undefined;
  if (onClick) {
    return (
      <button type="button" className={cx("ui-chip", role, className)} style={style} aria-pressed={!!pressed} onClick={onClick} {...rest}>
        {children}
      </button>
    );
  }
  return <span className={cx("ui-chip", role, className)} style={style} {...rest}>{children}</span>;
}

// A wrapping group of state chips.
export function Chips({ children, className, ...rest }) {
  return <div className={cx("ui-chips", className)} {...rest}>{children}</div>;
}

// A filter strip: one line, scrolls sideways. Keeps the pressed chip in view by scrolling
// the strip itself, and only when a different chip becomes the pressed one. Never
// scrollIntoView: that moves the page too, and a parent that re-renders every second (the
// city) would drag the window back to the strip on every tick.
export function ChipStrip({ label, children, className }) {
  const ref = useRef(null);
  const last = useRef(null);
  useEffect(() => {
    const el = ref.current, on = el?.querySelector('[aria-pressed="true"]');
    if (!el || !on || on === last.current) return;
    last.current = on;
    const a = el.getBoundingClientRect(), b = on.getBoundingClientRect();
    if (b.left < a.left) el.scrollLeft -= a.left - b.left;
    else if (b.right > a.right) el.scrollLeft += b.right - a.right;
  });
  return <div ref={ref} className={cx("ui-chipstrip", className)} role="group" aria-label={label}>{children}</div>;
}

// ---------------------------------------------------------------------------
// Meter: LABEL  ████████░░░░  78  [note]. A text bar on the character grid.
// `value` null/undefined renders UNASSESSED. `tone` defaults by value (>70 accent,
// >40 warn, else harm); `display` is what the bar shows when it differs from the
// number (inverted dimensions). The note (evidence %) hides under 420px.
export function Meter({ label, value, display, max = 100, width = 16, tone, note, className }) {
  const na = typeof value !== "number";
  const shown = na ? 0 : (typeof display === "number" ? display : value);
  const pct = (shown / max) * 100;
  const color = toneVar(tone) || (pct > 70 ? "var(--accent)" : pct > 40 ? "var(--warn)" : "var(--harm)");
  return (
    <div className={cx("ui-meter", na && "na", className)} role="listitem"
      aria-label={`${label}: ${na ? "unassessed" : value}${note ? `, ${note}` : ""}`}>
      <span className="lbl" aria-hidden="true">{label}</span>
      {na
        ? <span className="trk" aria-hidden="true">-- UNASSESSED --</span>
        : <span className="trk" aria-hidden="true"><Bar value={shown} max={max} width={width} tone={color} /></span>}
      <span className="val" aria-hidden="true" style={na ? undefined : { color }}>{na ? "" : value}</span>
      {note && <span className="note" aria-hidden="true">{note}</span>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Disclosure: a collapsible section. TITLE ............ META ▸
// Uncontrolled (defaultOpen) or controlled (open + onToggle).
export function Disclosure({ title, meta, open, defaultOpen = false, onToggle, id, className, children }) {
  const ref = useRef(null);
  const controlled = typeof open === "boolean";
  useEffect(() => { if (controlled && ref.current && ref.current.open !== open) ref.current.open = open; }, [controlled, open]);
  return (
    <details ref={ref} id={id} className={cx("ui-disc", className)} open={controlled ? open : defaultOpen || undefined}
      onToggle={e => { if (onToggle && e.currentTarget.open !== open) onToggle(e.currentTarget.open); }}>
      <summary><span className="t">{title}</span><span className="m">{meta}</span></summary>
      <div className="ui-disc-body">{children}</div>
    </details>
  );
}

// ---------------------------------------------------------------------------
// TextField: LABEL > [input]. 16px so iOS never zooms; user text stays as typed.
// multiline renders a textarea. `stacked` puts the label on its own line above.
// `message` (+ `error`) prints a line under the field. Other props go to the input.
export const TextField = forwardRef(function TextField(
  { label, prompt = ">", id, multiline = false, stacked = false, message, error = false, className, inputClassName, ...input }, ref) {
  const auto = useId();
  const fid = id || `f${auto.replace(/:/g, "")}`;
  const Tag = multiline ? "textarea" : "input";
  const msgId = message ? `${fid}-msg` : undefined;
  return (
    <div className={cx("ui-field", stacked && "stacked", message && "has-msg", className)}>
      {label != null && <label htmlFor={fid}>{label}{stacked || !prompt ? "" : ` ${prompt}`}</label>}
      <Tag ref={ref} id={fid} className={cx("ui-input", inputClassName)} aria-invalid={error || undefined} aria-describedby={msgId}
        autoComplete="off" {...input} />
      {message && <div id={msgId} className={cx("ui-field-msg", error && "err")} role={error ? "alert" : "status"}>{message}</div>}
    </div>
  );
});

// ---------------------------------------------------------------------------
// ListRow: NAME ............ 742 [TAG], optionally with a thumbnail (`lead`).
// Interactive when it has onClick or href (44px). With `children` it expands on tap
// (aria-expanded) and shows them underneath: the index pattern, compact rows that
// open to the full verdict. `selected` is inverse video.
export function ListRow({ lead, label, value, tag, tagOptional = false, tone, onClick, href, selected, expanded, defaultExpanded = false,
  onExpand, children, subAsTyped = false, className, ...rest }) {
  const [openLocal, setOpenLocal] = useState(defaultExpanded);
  const expandable = children != null && children !== false;
  const isOpen = expandable && (typeof expanded === "boolean" ? expanded : openLocal);
  const color = toneVar(tone);
  const body = (
    <>
      {lead && <span className="lead">{lead}</span>}
      <span className="name">{label}</span>
      <span className="dots" aria-hidden="true">{" " + ".".repeat(200)}</span>
      {value != null && <span className="val" style={color ? { color } : undefined}>{value}</span>}
      {tag && <span className={cx("tag", tagOptional && "opt")} style={color ? { color } : undefined}>[{tag}]</span>}
      {expandable && <span className="x" aria-hidden="true">{isOpen ? "▾" : "▸"}</span>}
    </>
  );
  let row;
  if (href) row = <a className={cx("ui-row", className)} href={href} aria-current={selected ? "true" : undefined} {...rest}>{body}</a>;
  else if (onClick || expandable) {
    const click = (e) => {
      if (expandable) { const n = !isOpen; if (typeof expanded !== "boolean") setOpenLocal(n); onExpand?.(n); }
      onClick?.(e);
    };
    row = (
      <button type="button" className={cx("ui-row", className)} onClick={click}
        aria-expanded={expandable ? isOpen : undefined} aria-pressed={!expandable && selected != null ? !!selected : undefined} {...rest}>
        {body}
      </button>
    );
  } else row = <div className={cx("ui-row", className)} {...rest}>{body}</div>;
  if (!expandable) return row;
  return (
    <div className="ui-row-wrap">
      {row}
      {isOpen && <div className={cx("sub", subAsTyped && "as-typed")}>{children}</div>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// PaLine: the one-line status announcer, typed. The only animated text outside the logon.
export function PaLine({ tag = "PA>", text, tone, className }) {
  return (
    <div className={cx("ui-pa", tone, className)} aria-live="polite">
      <span className="tag" aria-hidden="true">{tag}</span>
      <Typed as="span" text={text} cps={48} />
    </div>
  );
}
