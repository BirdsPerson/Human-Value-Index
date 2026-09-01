# Lattice

A lean, fast, interoperable spreadsheet — the MVP of an Excel / Numbers / Sheets
alternative built to be cheaper, lighter, and seamless to move files in and out of.

> **Status:** Phase-1 MVP. Self-contained Vite + React + TypeScript app with a
> canvas-rendered grid, a from-scratch formula engine, and real `.xlsx` / `.csv`
> import & export. Lives in its own folder with zero coupling to the rest of the
> repo, so it can be extracted into a standalone repository at any time.

## Why Lattice

The wedge is **interoperability riding on speed**:

- **Bring your files.** Drop in a real `.xlsx` and keep your formulas — they're
  re-parsed and evaluated natively, not just displayed. Export back to `.xlsx`
  or `.csv` losslessly for round-tripping with Excel / Sheets / Numbers.
- **Stays fast.** The data viewport is painted on a single `<canvas>` and only
  draws visible cells, so scrolling stays smooth far past where DOM-based web
  grids stutter.
- **Lean.** No backend, no account, no bloat. The whole app is a static bundle.

Realtime collaboration is deliberately deferred to a later phase — it's
table-stakes in Sheets, expensive to build, and fights the "cheap and lean"
positioning. Phase 1 proves the core thesis first.

## Architecture

```
src/
  model/        Data types (Sheet, Cell, Workbook) — sparse cell maps
  engine/       The formula engine (the value-add, written from scratch):
    tokenizer   → parser (recursive descent, full precedence)
    → ast       → evaluator (operators, refs, ranges, functions)
    functions   ~50 built-ins (SUM, IF, VLOOKUP-class, text, logic, math…)
    engine      recalculation with memoization + cycle detection (#CYCLE!)
    references  A1 ⇄ (row,col) conversion
  io/           csv + xlsx (SheetJS) import/export — the interoperability wedge
  ui/           React chrome + the canvas Grid:
    useSpreadsheet  central state + actions
    Grid        virtualized canvas grid (selection, editing, keyboard nav)
    Toolbar / FormulaBar / SheetTabs / StatusBar
```

**Stack rationale:** TypeScript for a type-safe parser/dependency graph, React
for the chrome (toolbar, dialogs, tabs), and a canvas grid for the data
viewport — the same split Google Sheets uses.

## Formula engine

Supports operator precedence (`+ - * / ^ & %` and comparisons, with right-assoc
`^`), absolute/relative refs (`$A$1`), ranges (`A1:B3`), short-circuiting
control flow (`IF`/`IFERROR`/`AND`/`OR`), error values
(`#DIV/0! #VALUE! #REF! #NAME? #N/A #NUM! #CYCLE!`), and ~50 functions across
math, logic, text, info, and date categories. Recalculation is on-demand with
memoization and cycle detection.

```
=SUM(A1:A10)
=IF(B2>100, "high", "low")
=IFERROR(C1/C2, 0)
="Hello, "&UPPER(A1)
=ROUND(AVERAGE(D1:D20), 2)
```

## Develop

```bash
cd lattice
npm install
npm run dev        # start the app
npm test           # run the engine test suite (Vitest)
npm run build      # type-check + production build
```

## Roadmap

See [ROADMAP.md](./ROADMAP.md) for the full phased plan. In short:

- [x] **Phase 1 (shipped):** canvas grid, formula engine, `.xlsx`/`.csv` interop, multi-sheet
- [ ] **Phase 2:** cross-sheet refs, cell formatting, undo/redo, clipboard with formula rewriting
- [ ] **Phase 3:** row/col resize+insert+delete, freeze panes, sort/filter, incremental recalc
- [ ] **Phase 4:** charts, conditional formatting, lookup/criteria functions
- [ ] **Phase 5:** local-first persistence, then CRDT-backed realtime collaboration

## Deploy

`netlify.toml` is included, so once this folder is its own repo you can point a
Netlify site at it and it builds (`npm run build` → `dist`) out of the box.
