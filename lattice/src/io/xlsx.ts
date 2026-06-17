// XLSX import/export via SheetJS. This is the interoperability wedge:
// drop in a real Excel file, edit it, export it back.

// SheetJS is heavy, so it is loaded on demand (only when the user actually
// imports or exports Excel). This keeps the initial bundle lean — the pitch.
import type * as XLSX from 'xlsx'
import { type Cell, type CellValue, coordKey } from '../model/types'
import { isCellError } from '../model/types'
import { colToLetters } from '../engine/references'

let xlsxModule: typeof XLSX | null = null
async function loadXlsx(): Promise<typeof XLSX> {
  if (!xlsxModule) xlsxModule = await import('xlsx')
  return xlsxModule
}

export interface ImportedSheet {
  name: string
  cells: Map<string, Cell>
  rowCount: number
  colCount: number
}

/** Read the first... all sheets of an xlsx ArrayBuffer into Lattice sheets. */
export async function importXlsx(data: ArrayBuffer): Promise<ImportedSheet[]> {
  const XLSX = await loadXlsx()
  const wb = XLSX.read(data, { type: 'array', cellFormula: true })
  const out: ImportedSheet[] = []

  for (const name of wb.SheetNames) {
    const ws = wb.Sheets[name]
    const cells = new Map<string, Cell>()
    const ref = ws['!ref']
    let rowCount = 100
    let colCount = 26
    if (ref) {
      const range = XLSX.utils.decode_range(ref)
      rowCount = Math.max(rowCount, range.e.r + 1)
      colCount = Math.max(colCount, range.e.c + 1)
      for (let r = range.s.r; r <= range.e.r; r++) {
        for (let c = range.s.c; c <= range.e.c; c++) {
          const addr = XLSX.utils.encode_cell({ r, c })
          const cell = ws[addr] as XLSX.CellObject | undefined
          if (!cell) continue
          const raw = cellToRaw(cell)
          if (raw !== '') cells.set(coordKey(r, c), { raw })
        }
      }
    }
    out.push({ name, cells, rowCount, colCount })
  }
  return out
}

function cellToRaw(cell: XLSX.CellObject): string {
  // Prefer the original formula so Lattice recomputes it natively.
  if (cell.f) return '=' + cell.f
  if (cell.v === undefined || cell.v === null) return ''
  if (cell.t === 'b') return cell.v ? 'TRUE' : 'FALSE'
  return String(cell.v)
}

export interface ExportSheet {
  name: string
  cells: Map<string, Cell>
  values: Map<string, CellValue>
  rowCount: number
  colCount: number
}

/** Write Lattice sheets to an xlsx ArrayBuffer, preserving formulas + values. */
export async function exportXlsx(sheets: ExportSheet[]): Promise<ArrayBuffer> {
  const XLSX = await loadXlsx()
  const wb = XLSX.utils.book_new()

  for (const sheet of sheets) {
    const ws: XLSX.WorkSheet = {}
    let maxRow = 0
    let maxCol = 0

    for (const [key, cell] of sheet.cells) {
      const [r, c] = key.split(',').map(Number)
      const addr = XLSX.utils.encode_cell({ r, c })
      const value = sheet.values.get(key) ?? null
      const obj = buildCellObject(cell, value)
      if (obj) {
        ws[addr] = obj
        if (r > maxRow) maxRow = r
        if (c > maxCol) maxCol = c
      }
    }

    ws['!ref'] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: maxRow, c: maxCol } })
    XLSX.utils.book_append_sheet(wb, ws, sanitizeSheetName(sheet.name))
  }

  return XLSX.write(wb, { type: 'array', bookType: 'xlsx' })
}

function buildCellObject(cell: Cell, value: CellValue): XLSX.CellObject | null {
  const isFormula = cell.raw.length > 1 && cell.raw[0] === '='
  if (isFormula) {
    const obj: XLSX.CellObject = { t: cellType(value), f: cell.raw.slice(1) }
    if (value !== null && !isCellError(value)) obj.v = value as string | number | boolean
    return obj
  }
  if (value === null) return null
  return { t: cellType(value), v: value as string | number | boolean }
}

function cellType(v: CellValue): XLSX.ExcelDataType {
  if (typeof v === 'number') return 'n'
  if (typeof v === 'boolean') return 'b'
  if (isCellError(v)) return 'e'
  return 's'
}

/** Excel sheet names: <=31 chars, no []:*?/\ */
function sanitizeSheetName(name: string): string {
  return name.replace(/[[\]:*?/\\]/g, ' ').slice(0, 31) || 'Sheet'
}

/** Trigger a browser download of an xlsx file. */
export function downloadXlsx(buffer: ArrayBuffer, filename: string): void {
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  })
  triggerDownload(blob, filename)
}

export function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

export { colToLetters }
