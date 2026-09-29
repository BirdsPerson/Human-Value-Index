# HVI design system

The terminal, sharpened. Green phosphor on near-black, one monospace font, box-drawn
frames where they mean something, block-digit scores, the WarGames logon once, and the
Overlord's voice everywhere. What made it read "vibe-coded" was the loose parts (four
button styles, eight type sizes, 21px tap targets). This is the one version of each.

Source of the decisions: `docs/design-audit/AUDIT.md` and its mockups.

## Files

| File | What |
|---|---|
| `src/ui/tokens.css` | Every colour, type size, space, border and chrome size. The only place values are defined. |
| `src/ui/ui.css` | Component and shell styles. Uses tokens only. |
| `src/ui/components.jsx` | Frame, Command, CommandList, Button, ButtonRow, Chip, Chips, ChipStrip, Meter, Disclosure, TextField, ListRow, PaLine |
| `src/ui/Shell.jsx` | AppHeader, CommandBar, NAV, navKeyFor |
| `src/ui/TouchGate.jsx` | TAP TO OPERATE for canvas views |
| `src/ui/barAction.js` | useBarAction: a screen's context action in the command bar |
| `src/ui/boot.js` | bootSeen / markBootSeen: the logon plays once per device |
| `src/ui/index.js` | One import for all of the above |
| `src/caseFile.jsx` | Case identity + shared result pieces (ScoreCard, Breakdown, AppealPanel, CaseLogon), split out of Intake.jsx |
| `scripts/sprite-atlas.mjs` | Packs repo sprites into one atlas (build + dev server, via `vite.config.js`) |
| `scripts/check-atlas.mjs` | Atlas is pixel-exact, complete, non-overlapping, deterministic |

`tokens.css` and `ui.css` are imported once in `src/main.jsx`. The older screen CSS is
still injected from JS (`App.jsx`, `Pen.jsx`, `Intake.jsx`, `city/cityUi.jsx`); it now
reads the tokens through legacy aliases (below).

## Tokens

**Colour roles.** Three text levels, three semantic hues. Nothing else is coloured.

| Token | Value | Use |
|---|---|---|
| `--bg` | `#0a0f0a` | page |
| `--panel` / `--panel-hi` | `#0d140d` / `#132013` | command bar, focused field, tooltip / its hover |
| `--line` / `--line-hi` | `#1f4a2c` / `#2f6a42` | CSS frames and dividers / active frame, bar edge |
| `--fg` / `--fg-dim` / `--fg-mute` | `#c8f5d8` / `#86c9a0` / `#4b7c5e` | primary / secondary / tertiary text (mute is also disabled; still readable) |
| `--fg-ghost` | `#2d5040` | decoration only: dot leaders, the empty part of a bar. **Never for words.** |
| `--accent` / `--accent-ink` | `#4ade80` / `#06210f` | actions, selected (inverse video) / text on accent |
| `--warn` | `#fbbf24` | middle tiers, CHARMING/INDULGED, caution, the APPEAL slot |
| `--harm` | `#f87171` | low tiers, FEARED/DISMISSED, errors |

Tier colours (`TIERS[].color` in `figures.js`) stay as data: they paint sprite uniforms
and the checks read them. They sit on the same three hues.

**Type.** Fira Mono only; UI text uppercase; text a person typed stays as typed
(`.as-typed`, and inputs are `text-transform: none`).

| Token | px | Use |
|---|---|---|
| `--t-xs` | 12 | meta, labels, the command bar. The floor. |
| `--t-s` | 14 | body (all widths) |
| `--t-m` | 16 | inputs (so iOS never zooms), command-row labels, verdicts |
| `--t-l` | 20 | screen headings, the logon greeting |
| `--t-xl` | 28 | display |

`--lh` 1.5 body, `--lh-tight` 1.3 display. The block-digit score (`BigNumber`, five rows)
is sized in the same scale: `--t-l` on desktop (100px tall), `--t-s` on phones (70px).
The block-letter banner scales to the viewport and appears on the menu only.

**Space.** `--s1..--s6` = 4 · 8 · 12 · 16 · 24 · 32. Page gutter `--gutter` (16). Between
frames 24.

**Touch and chrome.** `--hit` 48 (rows, commands, the bar), `--hit-min` 44 (the floor for
any tap target), `--head-h` 44, `--bar-h` 56, `--safe-t/-b/-l/-r` = `env(safe-area-inset-*)`.
`--bw` 1px borders, `--focus` 2px accent outline.

**Legacy aliases** (remove each once nothing uses it): `--green`→`--accent`,
`--green-dim`→`--accent-dim`, `--text`→`--fg`, `--text-dim`→`--fg-dim`,
`--text-muted`→`--fg-mute`, `--text-ghost`→`--fg-ghost`, `--amber`→`--warn`,
`--red`→`--harm`, `--bg2`→`--panel`, `--bg3`→`--panel-hi`. Note `--text-ghost` is
decoration-level: any *words* still set in it should move to `--fg-mute` when ported.

## States (one of each, app-wide)

- **Selected:** inverse video (`--accent` background, `--accent-ink` text). One selected thing at a time.
- **Hover:** underline. Never a second highlight. Hover rules live inside `@media (hover: hover)`: on a touch screen `:hover` sticks to whatever was last tapped, and an unscoped inverse-video hover made a tapped command look selected.
- **Focus:** 2px `--accent` outline (`:focus-visible`).
- **Disabled:** `--fg-mute`, still readable.
- **Loading:** the PA typing or `[ .. ] VERB-ING █`. No spinners.
- **Error:** in voice, `--harm`, with one command to retry.
- **Empty:** in voice. "NO FILE ON RECORD. BEGIN INTAKE."

## Components (API)

```js
import { Frame, Command, CommandList, Button, ButtonRow, Chip, Chips, ChipStrip,
         Meter, Disclosure, TextField, ListRow, PaLine, TouchGate, useBarAction } from "./ui";
```

`tone` everywhere accepts a role name (`"accent" | "warn" | "harm" | "mute" | "dim"`) or
any CSS colour (tier colours).

### Frame
```jsx
<Frame title="CATEGORY BREAKDOWN" meta="7 OF 9 ASSESSED">…</Frame>          // 1px line frame, inset title
<Frame box title="YOUR VALUE INDEX" tone={tier.color} double>…</Frame>        // box-drawing (TermBox)
```
Props: `title`, `meta` (right edge, drops first), `tone`, `box` (box-drawn), `double`
(╔═╗, implies box), `flush` (no padding), `className`, `bodyClass`, plus any div props (`id`).
Titles ellipsize. **Use `box` deliberately:** the score card, the case file, the live
interview, the logon terminal. Everything else takes the line frame. No frame nested
more than two deep.

### Command / CommandList
```jsx
<CommandList label="Main menu">
  <Command n="1" label="VOICE INTAKE" sub="A CLERK INTERVIEWS YOU" onClick={…} selected />
  <Command label="HOLDING PEN" href="#pen" />
</CommandList>
```
A full-width row: `N  LABEL  ›`, subtitle on its own line. 48px on touch (40 on desktop
with a mouse). Props: `n`, `label` (or children), `sub`, `kbd` (right glyph, default `›`,
`null` hides), `href` (renders `<a>`), `onClick`, `selected` (inverse video,
`aria-current`), `disabled`, ref forwarded, other props to the element. Use for menus and
any list of destinations.

### Button / ButtonRow
```jsx
<ButtonRow split stackOnMobile>
  <Button variant="back" onClick={…}>Main menu</Button>
  <Button variant="primary" onClick={…}>Submit for evaluation</Button>
</ButtonRow>
```
An inline terminal command. `variant`: `primary` `[ LABEL ]` (one per screen),
`secondary` `>LABEL`, `back` `<LABEL`, `danger`. `block` = full-width 48px row. `href`
renders `<a>`. 44px tall always. `ButtonRow`: `split` (first left, last right),
`stackOnMobile` (full-width rows under 720px). Replaces `.hvi-btn-*` and `.hvi-link-btn`.

### Chip / Chips / ChipStrip
```jsx
<Chips><Chip tone={tier.color}>TOLERATED GENERALIST</Chip><Chip tone="accent">ADMIRED</Chip></Chips>
<ChipStrip label="Filter by octant">
  {FILTERS.map(f => <Chip key={f} pressed={filter === f} onClick={() => setFilter(f)}>{f}</Chip>)}
</ChipStrip>
```
A state label: 1px outline, 12px. Not a button unless it has `onClick`; then it toggles
(`aria-pressed`, filled when pressed) with a 44px hit area around the small chip.
`ChipStrip` is one line that scrolls sideways (never five wrapped rows) and keeps the
pressed chip in view. Replaces `.hvi-filter-btn` and the cube's `[FILTER]` commands.

### Meter
```jsx
<div role="list">
  <Meter label="CARE" value={78} note="EV 80%" />
  <Meter label="THREAT ↓" value={30} display={70} />      {/* inverted: bar shows 100-v */}
  <Meter label="PHYSICAL" value={null} />                  {/* -- UNASSESSED -- */}
</div>
```
`LABEL  ████████░░░░  78  note`: a text bar on the character grid. Props: `label`,
`value` (number, or null for UNASSESSED), `display` (what the bar shows if different),
`max` (100), `width` (chars, 16), `tone` (default by value: >70 accent, >40 warn, else
harm), `note` (hidden under 420px). Renders a `listitem`; wrap in `role="list"`.

### Disclosure
```jsx
<Disclosure title="CATEGORY BREAKDOWN" meta="7 OF 9 ASSESSED" defaultOpen>…</Disclosure>
<Disclosure title="APPEAL A SECTION" open={o} onToggle={setO} id="appeal">…</Disclosure>
```
A 48px section header row, `TITLE … META ▸/▾`, native `<details>` (keyboard and screen
readers for free). Consecutive disclosures share dividers. Use for every secondary block
on file screens (the result: breakdown open, the rest closed).

### TextField
```jsx
<TextField label="FIND" value={q} onChange={e => setQ(e.target.value)} placeholder="a name on record" />
<TextField label="YOUR ANSWER" stacked multiline rows={3} message={err} error />
```
`LABEL > [input]`, 16px (no iOS zoom), 44px tall, block caret, underline that lights on
focus. Props: `label`, `prompt` (`>`), `id` (auto if omitted), `multiline` (textarea),
`stacked` (label above), `message` + `error`, `inputClassName`; everything else goes to
the input (value, onChange, onKeyDown, autoFocus, maxLength…). Ref forwarded to the input.

### ListRow
```jsx
<ListRow lead={<FilePhoto subject={f} scale={1} compact />} label="ADA LOVELACE" value={742}
         tag="RETAINED" tagOptional tone={tier.color}>{f.verdict}</ListRow>
<ListRow label="YOU" value={660} onClick={…} selected />
```
`NAME ......... 742 [TAG]`. Static by default; `onClick`/`href` make it a 44px button or
link; `children` make it expand on tap (`aria-expanded`, ▸/▾) with the children under it:
the index pattern, compact rows that open to the verdict. Props: `lead`, `label`, `value`,
`tag`, `tagOptional` (hidden under 420px), `tone`, `onClick`, `href`, `selected`,
`expanded`/`defaultExpanded`/`onExpand`, `subAsTyped` (children in readable case).

### PaLine
```jsx
<PaLine text="CITIZEN REGISTRY UNREACHABLE." tone="warn" />
```
The one-line typed announcer (`PA>`), `aria-live`. The only animated text outside the logon.

### TouchGate (TAP TO OPERATE)
```jsx
<TouchGate><canvas … style={{ touchAction: "none" }} /></TouchGate>
<TouchGate off={single}>…</TouchGate>
```
On touch-only devices, a veil covers the canvas: a one-finger vertical swipe scrolls the
page through it; a tap lifts it and the canvas gets every gesture; `[DONE]`, or scrolling
the canvas mostly off screen, puts it back. Mouse/keyboard users never see it. The
wrapper div is identical in every state so the canvas is never remounted (views bind
pointer handlers once). Props: `off`, `label`, `hint`, `onActiveChange(live)`.
Applied to: the full cube (`Cube3D`, not the single-file cube), the 2D city map, the 3D
city. The pen and district canvases are `touch-action: pan-y` already and need no gate.

## Shell

**Header** (`AppHeader`): one sticky 44px line on every screen: `▌HUMAN VALUE INDEX`
(links to the menu), the case number on the right, and on desktop (≥721px) the section
links MENU · CITY · CUBE · MY FILE with the current one in inverse video. The block-letter
banner renders above it on the menu only (`banner` prop), scaled to fit any width.

**Command bar** (`CommandBar`, under 721px only): fixed to the bottom, 56px + the
safe-area inset, MENU · CITY · CUBE · MY FILE, current tab inverse. It hides while a text
field has focus on a touch screen (the keyboard is up). A spacer keeps page content clear
of it.

Routes: MENU = the logon/menu phase, CITY = `#city…`, CUBE = `#cube`, MY FILE = `#file`
(renders the intake screen, which opens on the case file, breakdown and appeals desk;
`#intake` also maps to MY FILE). The pen has no tab. `navKeyFor(route)` gives the tab.

**Context action.** A screen puts one action in the CUBE slot while it is mounted:
```js
useBarAction(showAppeal ? { label: "APPEAL", glyph: "✎", onSelect: () => … } : null);
```
Intake does this for APPEAL (ready-with-file and result stages): it scrolls to
`#hvi-appeal` (the AppealPanel) and focuses its first command. The slot is drawn in
`--warn`. One slot, last writer wins, cleared on unmount.

`App.jsx` wraps every screen in `Screen` (header + page + bar). New screens rendered by
App get the shell automatically.

## Boot

The WarGames logon (diagnostics, LOGON, GREETINGS, SHALL WE ASSESS YOUR VALUE?) plays in
full on the first visit per device, with a visible `[TAP TO SKIP]` command; a tap, click
or any key also skips (a `pointerdown` anywhere on the page, not just inside the terminal box). When it finishes or is skipped, `localStorage["hvi-booted"] = "1"`
(wrapped in try/catch). After that the menu is instant: one status line
(`LOGON: <case> // ASSESSMENT ENGINE READY.`) and the greeting. With storage blocked it
plays each time, as before, still skippable.

## Mobile rules

- Tap targets ≥44px (rows 48). Legacy `.hvi-*` commands get 44px under 720px or on coarse pointers until ported.
- Inputs 16px on phones (global rule, `!important`, covers the legacy inputs too).
- No horizontal page scroll (`overflow-x: clip` on the app; frames ellipsize titles; wide text blocks scroll inside themselves).
- Safe areas: `viewport-fit=cover`; header pads `--safe-t`, bar pads `--safe-b/-l/-r`, the page wrap pads left/right.
- Thumb reach: navigation and the one context action live in the bottom bar.
- The interview's answer dock rests on the command bar from the first question (the live screen fills the space between header and bar), and rides the keyboard via `--kb` from `visualViewport` when a field has focus.
- "Enter sends / arrow keys" hints: desktop only (`.hvi-desk-only` hides on coarse pointers).

## Performance

- **Route-level splitting.** `React.lazy` for Intake (and with it the ElevenLabs SDK, already a separate chunk), Pen, CubeView, City, and Cube3D inside CubePanel. The shared file pieces moved to `caseFile.jsx` so the menu and survey don't pull in Intake. Entry: 114 KB → 87 KB gzip.
- **Sprite atlas.** `scripts/sprite-atlas.mjs` packs every `public/sprites/*.png` (63 sheets) into `sprites/atlas.png` (1024×192, ~41 KB) + `sprites/atlas.json` (`{ v, png: "atlas.png?v=<hash>", w, h, sprites: { slug: { x, y, w, h, fw, frames } } }`). Emitted into `dist/` by the Vite plugin at build; built fresh per request on the dev server. Pure node (zlib), so the Netlify build needs nothing extra.
  - Client: `loadRepoSprite(slug)` in `src/sprites.js` cuts a sheet out of the atlas into a canvas (cached), which draws exactly like the PNG. A slug the atlas lacks, or a missing atlas, falls back to `/sprites/<slug>.png`.
  - Used by the pen, the city sprite bank and FilePhoto. The pen went from ~65 sprite requests to 3 (manifest, atlas.json, atlas.png).
  - **Production atlas.** Referral/engine sprites (drawn later by the Mac job) are packed by `scripts/prod-atlas.mjs` into sheets of up to 256 (1024x768) in the `hvi-atlas` Blobs store, served by `netlify/functions/atlas.js`: `/api/atlas.json` (`{ v, count, sheets: [hash], sprites: { slug: [v, sheet, x, y, w, h, frames] } }`, 60 s cache) and `/api/atlas/<hash>.png` (content-addressed, immutable). `scripts/referral_sprites.py` calls it every pass (two Blobs reads when nothing changed); sheets keep their members, so a new likeness re-encodes one sheet. Client: `loadSprite(url)` cuts `/api/sprite/<slug>?v=<v>` from the atlas only when the atlas rect was packed from that same `v`; anything newer, or missing, loads its own URL.
  - `node scripts/check-atlas.mjs` verifies it pixel for pixel.
- **FigureIndex** (the index and the result's compare list) is lazy too. Entry after the QA pass: 88.2 KB gzip (vite's figure).
- **Budget.** `node scripts/check-bundle.mjs` (after a build) fails if the entry script is over 90 KB gzip. figures.js is ~12 KB of it; moving the verdict text out is the next lever when it gets tight.
- **Measured** (390×844, DPR 3, Slow 4G 150ms/1.6 Mbps, 4× CPU, `vite preview`): menu LCP ~0.92 s returning / ~1.0 s first visit; pen LCP ~1.3 s with 18 requests (6 sprite), against 76 requests (67 sprite) for the committed build. Longest task under 80 ms.
- **Fonts.** Fira Mono loads from a `<link>` in `index.html` with `preconnect`, not a CSS `@import` inside injected JS.

## Porting a screen (for the screen agents)

1. Swap `.hvi-btn-*`/`.hvi-link-btn` for `Button`, menus for `Command`, `[FILTER]` rows for `ChipStrip` + `Chip`, bar rows for `Meter`, secondary blocks for `Disclosure`, inputs for `TextField`, `.hvi-row-btn` lists for `ListRow`.
2. Replace literal px, colours and `--text-*` names with tokens.
3. Drop the per-screen `< MAIN MENU / > HOLDING PEN` footers where the command bar covers them (keep them on desktop only if they add something the header doesn't).
4. Keep `box` frames for the few panels that carry the file; everything else the line frame.
5. Check at 390×844: nothing under 44px, no input under 16px, `scrollWidth === innerWidth`.
