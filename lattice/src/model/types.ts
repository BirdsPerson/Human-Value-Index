// Core data types for the Lattice spreadsheet engine.

/** A spreadsheet error value, modeled after Excel's error set. */
export type CellError =
  | '#DIV/0!'
  | '#VALUE!'
  | '#REF!'
  | '#NAME?'
  | '#N/A'
  | '#NUM!'
  | '#CYCLE!'
  | '#ERROR!'

export const ERROR_VALUES: CellError[] = [
  '#DIV/0!',
  '#VALUE!',
  '#REF!',
  '#NAME?',
  '#N/A',
  '#NUM!',
  '#CYCLE!',
  '#ERROR!',
]

/** The runtime value a cell can resolve to. */
export type CellValue = number | string | boolean | CellError | null

/** Raw user-entered content stored per cell. */
export interface Cell {
  /** Exactly what the user typed, e.g. "=SUM(A1:A3)" or "42" or "hello". */
  raw: string
}

/** Coordinates are zero-based row/col indices internally. */
export interface CellCoord {
  row: number
  col: number
}

export interface Sheet {
  id: string
  name: string
  /** Sparse map keyed by "row,col" -> Cell. Empty cells are absent. */
  cells: Map<string, Cell>
  rowCount: number
  colCount: number
}

export interface Workbook {
  sheets: Sheet[]
  activeSheetId: string
}

export function coordKey(row: number, col: number): string {
  return `${row},${col}`
}

export function parseCoordKey(key: string): CellCoord {
  const [row, col] = key.split(',').map(Number)
  return { row, col }
}

export function isCellError(v: CellValue): v is CellError {
  return typeof v === 'string' && (ERROR_VALUES as string[]).includes(v)
}
