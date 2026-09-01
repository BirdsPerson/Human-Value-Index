// Formats computed cell values for display in the grid.

import { type CellValue, isCellError } from '../model/types'

export function formatValue(v: CellValue): string {
  if (v === null) return ''
  if (typeof v === 'boolean') return v ? 'TRUE' : 'FALSE'
  if (isCellError(v)) return v
  if (typeof v === 'number') return formatNumber(v)
  return v
}

function formatNumber(n: number): string {
  if (!Number.isFinite(n)) return n > 0 ? '#NUM!' : '#NUM!'
  if (Number.isInteger(n)) return String(n)
  // Trim floating point noise while keeping reasonable precision.
  const rounded = Math.round(n * 1e10) / 1e10
  return String(rounded)
}

/** Right-align numbers/booleans/errors, left-align text. */
export function alignRight(v: CellValue): boolean {
  return typeof v === 'number'
}
