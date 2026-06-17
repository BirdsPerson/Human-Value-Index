// Value coercion helpers shared by the evaluator and function library.

import { type CellValue, type CellError, isCellError } from '../model/types'

/** A range evaluates to a 2D-flattened array; scalars stay scalar. */
export type ArgValue = CellValue | CellValue[]

/** A lazily-evaluated argument (enables short-circuiting in IF/AND/OR). */
export type Thunk = () => ArgValue

export class SpreadsheetError extends Error {
  constructor(public code: CellError) {
    super(code)
  }
}

export function flatten(v: ArgValue): CellValue[] {
  return Array.isArray(v) ? v : [v]
}

/** Find the first error within a value (errors propagate). */
export function findError(v: ArgValue): CellError | null {
  for (const x of flatten(v)) {
    if (isCellError(x)) return x
  }
  return null
}

/** Coerce a scalar to a number, throwing SpreadsheetError on failure. */
export function toNumber(v: CellValue): number {
  if (isCellError(v)) throw new SpreadsheetError(v)
  if (v === null || v === '') return 0
  if (typeof v === 'number') return v
  if (typeof v === 'boolean') return v ? 1 : 0
  const n = Number(v)
  if (Number.isNaN(n)) throw new SpreadsheetError('#VALUE!')
  return n
}

export function toText(v: CellValue): string {
  if (isCellError(v)) throw new SpreadsheetError(v)
  if (v === null) return ''
  if (typeof v === 'boolean') return v ? 'TRUE' : 'FALSE'
  return String(v)
}

export function toBoolean(v: CellValue): boolean {
  if (isCellError(v)) throw new SpreadsheetError(v)
  if (typeof v === 'boolean') return v
  if (typeof v === 'number') return v !== 0
  if (v === null || v === '') return false
  const s = String(v).toUpperCase()
  if (s === 'TRUE') return true
  if (s === 'FALSE') return false
  throw new SpreadsheetError('#VALUE!')
}

/** Collect only the numeric values from a list, ignoring blanks/text (SUM semantics). */
export function numbersOnly(values: CellValue[]): number[] {
  const out: number[] = []
  for (const v of values) {
    if (isCellError(v)) throw new SpreadsheetError(v)
    if (typeof v === 'number') out.push(v)
    else if (typeof v === 'boolean') out.push(v ? 1 : 0)
    // strings, null, '' are ignored for SUM/AVERAGE
  }
  return out
}
