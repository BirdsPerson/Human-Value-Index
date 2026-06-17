// CSV import/export (RFC 4180-ish).

import { type Cell, type CellValue, coordKey } from '../model/types'
import { isCellError } from '../model/types'

export function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let inQuotes = false
  let i = 0
  const n = text.length

  while (i < n) {
    const ch = text[i]
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"'
          i += 2
          continue
        }
        inQuotes = false
        i++
        continue
      }
      field += ch
      i++
      continue
    }
    if (ch === '"') {
      inQuotes = true
      i++
      continue
    }
    if (ch === ',') {
      row.push(field)
      field = ''
      i++
      continue
    }
    if (ch === '\r') {
      i++
      continue
    }
    if (ch === '\n') {
      row.push(field)
      rows.push(row)
      row = []
      field = ''
      i++
      continue
    }
    field += ch
    i++
  }
  // Flush trailing field/row if any content present.
  if (field !== '' || row.length > 0) {
    row.push(field)
    rows.push(row)
  }
  return rows
}

/** Build a sparse cell map from a 2D string grid. */
export function gridToCells(grid: string[][]): Map<string, Cell> {
  const cells = new Map<string, Cell>()
  for (let r = 0; r < grid.length; r++) {
    for (let c = 0; c < grid[r].length; c++) {
      const raw = grid[r][c]
      if (raw !== '') cells.set(coordKey(r, c), { raw })
    }
  }
  return cells
}

function escapeCsv(s: string): string {
  if (/[",\n\r]/.test(s)) {
    return '"' + s.replace(/"/g, '""') + '"'
  }
  return s
}

/** Export computed values to CSV. */
export function valuesToCsv(
  values: Map<string, CellValue>,
  rowCount: number,
  colCount: number,
): string {
  // Find used bounds to avoid emitting a giant empty grid.
  let maxRow = -1
  let maxCol = -1
  for (const key of values.keys()) {
    const [r, c] = key.split(',').map(Number)
    const v = values.get(key)
    if (v === null || v === '') continue
    if (r > maxRow) maxRow = r
    if (c > maxCol) maxCol = c
  }
  maxRow = Math.min(maxRow, rowCount - 1)
  maxCol = Math.min(maxCol, colCount - 1)

  const lines: string[] = []
  for (let r = 0; r <= maxRow; r++) {
    const cols: string[] = []
    for (let c = 0; c <= maxCol; c++) {
      cols.push(escapeCsv(formatForCsv(values.get(coordKey(r, c)) ?? null)))
    }
    lines.push(cols.join(','))
  }
  return lines.join('\n')
}

function formatForCsv(v: CellValue): string {
  if (v === null) return ''
  if (typeof v === 'boolean') return v ? 'TRUE' : 'FALSE'
  if (isCellError(v)) return v
  return String(v)
}
