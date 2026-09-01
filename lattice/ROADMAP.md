# Lattice Roadmap

Lattice's thesis: a spreadsheet that is **leaner, faster, and seamlessly
interoperable** with Excel / Google Sheets / Apple Numbers — cheap enough to
take market share. Phase 1 (shipped) proves the core: a from-scratch formula
engine, a canvas-rendered virtualized grid, and real `.xlsx` / `.csv` import &
export.

This document lays out what comes next and why, ordered to keep the
differentiators (interoperability + speed) ahead of feature parity.

---

## Phase 1 — MVP ✅ (shipped)

- [x] Formula engine: tokenizer → recursive-descent parser → evaluator
- [x] Operator precedence, `$A$1` refs, `A1:B3` ranges, ~50 functions
- [x] Error values + recalculation with memoization & cycle detection
- [x] Canvas grid: virtualized rendering, drag-select, in-cell edit, keyboard nav
- [x] `.xlsx` + `.csv` import/export (SheetJS lazy-loaded → ~55 kB gzip initial)
- [x] Multi-sheet workbook, formula bar, live Sum/Avg/Count status bar
- [x] Engine test suite (Vitest)

---

## Phase 2 — Real-document parity

Goal: a file imported from Excel survives a round-trip and *feels* like the same
document. This is where interoperability becomes trustworthy.

### 2.1 Cross-sheet references — *foundational, do first*
- `Sheet2!A1` and `Sheet2!A1:B3` in the parser, evaluator, and dependency graph.
- Recalc must span sheets; cycle detection becomes workbook-global.
- **Why first:** almost every real workbook uses them; the engine's reference
  model must absorb this before formatting/clipboard build on top.
- Touch points: `engine/tokenizer.ts` (sheet-qualified refs), `engine/parser.ts`,
  `engine/evaluator.ts` (resolver gains a sheet dimension), `engine/engine.ts`
  (compute across all sheets, not one).

### 2.2 Cell formatting
- Number formats (currency, %, dates, thousands, decimals), fonts, bold/italic,
  text/fill color, alignment, borders.
- Store a `style` per cell (or per-range style runs to stay sparse).
- Render in the canvas draw loop; round-trip styles through SheetJS on xlsx I/O.
- **Why:** the #1 visible gap vs. incumbents and required for xlsx fidelity.

### 2.3 Undo / redo
- Command-stack over the model (each mutation is an invertible op).
- Wire into existing `useSpreadsheet` actions; `Cmd/Ctrl+Z` / `Shift+Cmd+Z`.
- **Why:** table-stakes; also de-risks every feature built after it.

### 2.4 Clipboard with formula offset rewriting
- Copy/cut/paste a range; relative refs shift by the paste delta, absolute
  (`$`) refs stay pinned — the behavior users expect from Excel/Sheets.
- Paste from / copy to the system clipboard as TSV so it interops with other
  apps directly.
- **Why:** the single most-used spreadsheet interaction after typing.

---

## Phase 3 — Scale & ergonomics (the "faster" promise, made visible)

### 3.1 Column/row resize, insert, delete
- Resize via header drag (variable sizes → index→offset lookup in the grid).
- Insert/delete rows/cols, **rewriting all affected references** (incl. `#REF!`
  on deletion of a referenced cell).

### 3.2 Freeze panes
- Frozen header rows/cols rendered as separate canvas regions.

### 3.3 Sort & filter
- Range/column sort (multi-key); filter views.
- Must preserve formula integrity (sort values, not formula text, or rewrite).

### 3.4 Fill handle & autofill
- Drag-to-fill with series detection (numbers, dates, linear patterns) and
  formula propagation.

### 3.5 Performance pass
- Incremental recalc: dirty-set propagation through the dependency graph instead
  of recomputing every formula cell (current MVP recomputes per edit).
- Web Worker for recalc on very large sheets to keep the UI thread free.
- Benchmark vs. Google Sheets at 100k+ rows — this is the headline metric.

---

## Phase 4 — Visualization & analysis

- Charts (line/bar/pie/scatter) bound to ranges, live-updating.
- Conditional formatting (data bars, color scales, rules).
- Named ranges; more functions (`VLOOKUP`/`XLOOKUP`/`INDEX`/`MATCH`,
  `SUMIF(S)`/`COUNTIF(S)`, full date/time, financial).
- Data validation (dropdowns, constraints).

---

## Phase 5 — Persistence & collaboration

Deliberately last. Realtime collaboration is table-stakes in Sheets, expensive
to build, and adds the backend cost/complexity that fights the "cheap and lean"
positioning — so it follows only after the single-player product is clearly
better.

- Local-first persistence (IndexedDB) + file open/save with the File System
  Access API. Keeps the app backend-free for as long as possible.
- Optional account + cloud sync.
- Realtime co-editing via **CRDT** (e.g. Yjs) — presence cursors, conflict-free
  merges. CRDT over OT to keep the server thin and offline editing first-class.
- Sharing & permissions.

---

## Guiding principles

1. **Interoperability and speed lead.** Every phase should keep "import a real
   file and it just works, fast" true — features that break round-tripping wait.
2. **Stay lean.** No backend until Phase 5; lazy-load heavy deps; keep the
   initial bundle small. Leanness is a feature we sell.
3. **The engine is the moat.** Correctness (precedence, refs, recalc, errors)
   is non-negotiable — guard it with tests as the function set grows.
4. **Canvas for the viewport, React for the chrome.** Don't regress rendering
   performance by moving the grid into the DOM.
