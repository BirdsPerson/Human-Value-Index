// Built-in spreadsheet function library.
//
// Each function receives lazily-evaluated argument thunks so that control-flow
// functions (IF, AND, OR, IFERROR) can short-circuit and avoid propagating
// errors from branches that are never taken.

import { type CellValue, isCellError } from '../model/types'
import {
  type ArgValue,
  type Thunk,
  SpreadsheetError,
  flatten,
  findError,
  numbersOnly,
  toNumber,
  toText,
  toBoolean,
} from './values'

export type FuncImpl = (args: Thunk[]) => CellValue

/** Flatten every argument into a single numeric list (SUM/AVERAGE/etc.). */
function gatherNumbers(args: Thunk[]): number[] {
  const all: CellValue[] = []
  for (const a of args) all.push(...flatten(a()))
  return numbersOnly(all)
}

function gatherAll(args: Thunk[]): CellValue[] {
  const all: CellValue[] = []
  for (const a of args) all.push(...flatten(a()))
  return all
}

function requireArgs(args: Thunk[], min: number, max = min): void {
  if (args.length < min || args.length > max) {
    throw new SpreadsheetError('#N/A')
  }
}

function round(n: number, digits: number): number {
  const f = Math.pow(10, digits)
  return Math.round((n + Number.EPSILON) * f) / f
}

export const FUNCTIONS: Record<string, FuncImpl> = {
  // ---- Math / aggregation ----
  SUM: (args) => gatherNumbers(args).reduce((a, b) => a + b, 0),
  PRODUCT: (args) => gatherNumbers(args).reduce((a, b) => a * b, 1),
  AVERAGE: (args) => {
    const nums = gatherNumbers(args)
    if (nums.length === 0) throw new SpreadsheetError('#DIV/0!')
    return nums.reduce((a, b) => a + b, 0) / nums.length
  },
  MIN: (args) => {
    const nums = gatherNumbers(args)
    return nums.length ? Math.min(...nums) : 0
  },
  MAX: (args) => {
    const nums = gatherNumbers(args)
    return nums.length ? Math.max(...nums) : 0
  },
  COUNT: (args) => gatherNumbers(args).length,
  COUNTA: (args) =>
    gatherAll(args).filter((v) => v !== null && v !== '').length,
  ABS: (args) => {
    requireArgs(args, 1)
    return Math.abs(toNumber(args[0]() as CellValue))
  },
  SQRT: (args) => {
    requireArgs(args, 1)
    const n = toNumber(args[0]() as CellValue)
    if (n < 0) throw new SpreadsheetError('#NUM!')
    return Math.sqrt(n)
  },
  POWER: (args) => {
    requireArgs(args, 2)
    return Math.pow(toNumber(args[0]() as CellValue), toNumber(args[1]() as CellValue))
  },
  MOD: (args) => {
    requireArgs(args, 2)
    const a = toNumber(args[0]() as CellValue)
    const b = toNumber(args[1]() as CellValue)
    if (b === 0) throw new SpreadsheetError('#DIV/0!')
    return a - b * Math.floor(a / b)
  },
  ROUND: (args) => {
    requireArgs(args, 1, 2)
    const n = toNumber(args[0]() as CellValue)
    const d = args[1] ? toNumber(args[1]() as CellValue) : 0
    return round(n, d)
  },
  ROUNDUP: (args) => {
    requireArgs(args, 1, 2)
    const n = toNumber(args[0]() as CellValue)
    const d = args[1] ? toNumber(args[1]() as CellValue) : 0
    const f = Math.pow(10, d)
    return (n < 0 ? -1 : 1) * Math.ceil(Math.abs(n) * f) / f
  },
  ROUNDDOWN: (args) => {
    requireArgs(args, 1, 2)
    const n = toNumber(args[0]() as CellValue)
    const d = args[1] ? toNumber(args[1]() as CellValue) : 0
    const f = Math.pow(10, d)
    return (n < 0 ? -1 : 1) * Math.floor(Math.abs(n) * f) / f
  },
  FLOOR: (args) => {
    requireArgs(args, 1)
    return Math.floor(toNumber(args[0]() as CellValue))
  },
  CEILING: (args) => {
    requireArgs(args, 1)
    return Math.ceil(toNumber(args[0]() as CellValue))
  },
  INT: (args) => {
    requireArgs(args, 1)
    return Math.floor(toNumber(args[0]() as CellValue))
  },
  PI: () => Math.PI,

  // ---- Logical ----
  IF: (args) => {
    requireArgs(args, 2, 3)
    const cond = toBoolean(args[0]() as CellValue)
    if (cond) return scalar(args[1]())
    return args[2] ? scalar(args[2]()) : false
  },
  IFERROR: (args) => {
    requireArgs(args, 2)
    try {
      const v = args[0]()
      const err = findError(v)
      if (err) return scalar(args[1]())
      return scalar(v)
    } catch (e) {
      if (e instanceof SpreadsheetError) return scalar(args[1]())
      throw e
    }
  },
  AND: (args) => {
    for (const v of gatherAll(args)) {
      if (!toBoolean(v)) return false
    }
    return true
  },
  OR: (args) => {
    for (const v of gatherAll(args)) {
      if (toBoolean(v)) return true
    }
    return false
  },
  NOT: (args) => {
    requireArgs(args, 1)
    return !toBoolean(args[0]() as CellValue)
  },
  TRUE: () => true,
  FALSE: () => false,

  // ---- Information ----
  ISBLANK: (args) => {
    requireArgs(args, 1)
    const v = scalar(args[0]())
    return v === null || v === ''
  },
  ISNUMBER: (args) => {
    requireArgs(args, 1)
    return typeof scalar(args[0]()) === 'number'
  },
  ISTEXT: (args) => {
    requireArgs(args, 1)
    const v = scalar(args[0]())
    return typeof v === 'string' && !isCellError(v)
  },
  ISERROR: (args) => {
    try {
      return findError(args[0]()) !== null
    } catch (e) {
      if (e instanceof SpreadsheetError) return true
      throw e
    }
  },

  // ---- Text ----
  CONCAT: (args) => gatherAll(args).map(toText).join(''),
  CONCATENATE: (args) => gatherAll(args).map(toText).join(''),
  LEN: (args) => {
    requireArgs(args, 1)
    return toText(args[0]() as CellValue).length
  },
  LEFT: (args) => {
    requireArgs(args, 1, 2)
    const s = toText(args[0]() as CellValue)
    const n = args[1] ? toNumber(args[1]() as CellValue) : 1
    return s.slice(0, Math.max(0, n))
  },
  RIGHT: (args) => {
    requireArgs(args, 1, 2)
    const s = toText(args[0]() as CellValue)
    const n = args[1] ? toNumber(args[1]() as CellValue) : 1
    return n <= 0 ? '' : s.slice(-n)
  },
  MID: (args) => {
    requireArgs(args, 3)
    const s = toText(args[0]() as CellValue)
    const start = toNumber(args[1]() as CellValue)
    const len = toNumber(args[2]() as CellValue)
    return s.slice(Math.max(0, start - 1), Math.max(0, start - 1) + Math.max(0, len))
  },
  UPPER: (args) => {
    requireArgs(args, 1)
    return toText(args[0]() as CellValue).toUpperCase()
  },
  LOWER: (args) => {
    requireArgs(args, 1)
    return toText(args[0]() as CellValue).toLowerCase()
  },
  TRIM: (args) => {
    requireArgs(args, 1)
    return toText(args[0]() as CellValue).trim().replace(/\s+/g, ' ')
  },
  TEXT: (args) => {
    requireArgs(args, 2)
    return toText(args[0]() as CellValue)
  },

  // ---- Date/time ----
  TODAY: () => {
    const d = new Date()
    return Math.floor(d.getTime() / 86400000) + 25569
  },
  NOW: () => Date.now() / 86400000 + 25569,

  // ---- Lookup ----
  ROWS: (args) => {
    requireArgs(args, 1)
    return flatten(args[0]()).length
  },
}

/** Reduce an ArgValue (possibly a range array) to a single scalar. */
function scalar(v: ArgValue): CellValue {
  if (Array.isArray(v)) return v.length ? v[0] : null
  return v
}

export function isFunction(name: string): boolean {
  return Object.prototype.hasOwnProperty.call(FUNCTIONS, name.toUpperCase())
}
