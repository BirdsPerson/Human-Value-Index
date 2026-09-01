// Central spreadsheet state + actions hook.

import { useCallback, useMemo, useRef, useState } from 'react'
import {
  type Cell,
  type CellValue,
  type Sheet,
  coordKey,
} from '../model/types'
import { computeSheet } from '../engine/engine'

export const DEFAULT_ROWS = 200
export const DEFAULT_COLS = 52 // A .. AZ

let sheetSeq = 1
function newSheet(name?: string): Sheet {
  return {
    id: `s${sheetSeq++}`,
    name: name ?? `Sheet${sheetSeq - 1}`,
    cells: new Map<string, Cell>(),
    rowCount: DEFAULT_ROWS,
    colCount: DEFAULT_COLS,
  }
}

export interface SelectionRange {
  r1: number
  c1: number
  r2: number
  c2: number
}

export function normalizeSelection(s: SelectionRange): SelectionRange {
  return {
    r1: Math.min(s.r1, s.r2),
    c1: Math.min(s.c1, s.c2),
    r2: Math.max(s.r1, s.r2),
    c2: Math.max(s.c1, s.c2),
  }
}

export function useSpreadsheet() {
  const [sheets, setSheets] = useState<Sheet[]>(() => [newSheet('Sheet1')])
  const [activeSheetId, setActiveSheetId] = useState(() => sheets[0].id)
  const [active, setActive] = useState({ row: 0, col: 0 })
  const [selection, setSelection] = useState<SelectionRange>({ r1: 0, c1: 0, r2: 0, c2: 0 })

  const activeSheet = useMemo(
    () => sheets.find((s) => s.id === activeSheetId) ?? sheets[0],
    [sheets, activeSheetId],
  )

  // Recompute values whenever the active sheet's cells change.
  const values = useMemo<Map<string, CellValue>>(
    () => computeSheet(activeSheet.cells, activeSheet.rowCount, activeSheet.colCount).values,
    [activeSheet.cells, activeSheet.rowCount, activeSheet.colCount],
  )

  const getRaw = useCallback(
    (row: number, col: number): string => activeSheet.cells.get(coordKey(row, col))?.raw ?? '',
    [activeSheet],
  )

  const getValue = useCallback(
    (row: number, col: number): CellValue => values.get(coordKey(row, col)) ?? null,
    [values],
  )

  const mutateSheet = useCallback(
    (id: string, fn: (cells: Map<string, Cell>) => void) => {
      setSheets((prev) =>
        prev.map((s) => {
          if (s.id !== id) return s
          const cells = new Map(s.cells)
          fn(cells)
          return { ...s, cells }
        }),
      )
    },
    [],
  )

  const setCellRaw = useCallback(
    (row: number, col: number, raw: string) => {
      mutateSheet(activeSheetId, (cells) => {
        const key = coordKey(row, col)
        if (raw === '') cells.delete(key)
        else cells.set(key, { raw })
      })
    },
    [activeSheetId, mutateSheet],
  )

  const clearRange = useCallback(
    (sel: SelectionRange) => {
      const n = normalizeSelection(sel)
      mutateSheet(activeSheetId, (cells) => {
        for (let r = n.r1; r <= n.r2; r++) {
          for (let c = n.c1; c <= n.c2; c++) cells.delete(coordKey(r, c))
        }
      })
    },
    [activeSheetId, mutateSheet],
  )

  const replaceCells = useCallback(
    (cells: Map<string, Cell>, rowCount?: number, colCount?: number) => {
      setSheets((prev) =>
        prev.map((s) =>
          s.id === activeSheetId
            ? {
                ...s,
                cells: new Map(cells),
                rowCount: Math.max(s.rowCount, rowCount ?? 0),
                colCount: Math.max(s.colCount, colCount ?? 0),
              }
            : s,
        ),
      )
    },
    [activeSheetId],
  )

  const selectCell = useCallback((row: number, col: number, extend = false) => {
    setActive((prev) => (extend ? prev : { row, col }))
    setSelection((prev) =>
      extend ? { ...prev, r2: row, c2: col } : { r1: row, c1: col, r2: row, c2: col },
    )
  }, [])

  // Sheet management
  const addSheet = useCallback(() => {
    const s = newSheet()
    setSheets((prev) => [...prev, s])
    setActiveSheetId(s.id)
    setActive({ row: 0, col: 0 })
    setSelection({ r1: 0, c1: 0, r2: 0, c2: 0 })
  }, [])

  const renameSheet = useCallback((id: string, name: string) => {
    setSheets((prev) => prev.map((s) => (s.id === id ? { ...s, name } : s)))
  }, [])

  const deleteSheet = useCallback(
    (id: string) => {
      setSheets((prev) => {
        if (prev.length === 1) return prev
        const filtered = prev.filter((s) => s.id !== id)
        if (id === activeSheetId) setActiveSheetId(filtered[0].id)
        return filtered
      })
    },
    [activeSheetId],
  )

  // Keep a ref to current sheets for export without stale closures.
  const sheetsRef = useRef(sheets)
  sheetsRef.current = sheets

  return {
    sheets,
    sheetsRef,
    activeSheet,
    activeSheetId,
    setActiveSheetId,
    active,
    setActive,
    selection,
    setSelection,
    values,
    getRaw,
    getValue,
    setCellRaw,
    clearRange,
    replaceCells,
    selectCell,
    addSheet,
    renameSheet,
    deleteSheet,
  }
}

export type SpreadsheetApi = ReturnType<typeof useSpreadsheet>
