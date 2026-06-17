// Recalculation engine: turns raw cell contents into computed values,
// resolving formula dependencies on demand with memoization and cycle
// detection.

import {
  type Cell,
  type CellValue,
  coordKey,
} from '../model/types'
import { parseFormula } from './parser'
import { evaluate } from './evaluator'
import { SpreadsheetError } from './values'
import type { Node } from './ast'

// Parsed-AST cache keyed by formula text, shared across recalcs.
const astCache = new Map<string, Node | Error>()

function getAst(formula: string): Node | Error {
  let cached = astCache.get(formula)
  if (cached === undefined) {
    try {
      cached = parseFormula(formula)
    } catch (e) {
      cached = e instanceof Error ? e : new Error('parse error')
    }
    astCache.set(formula, cached)
  }
  return cached
}

/** Parse a non-formula literal into its typed value. */
export function parseLiteral(raw: string): CellValue {
  if (raw === '') return null
  const trimmed = raw.trim()
  const upper = trimmed.toUpperCase()
  if (upper === 'TRUE') return true
  if (upper === 'FALSE') return false
  // Numeric (incl. leading +/-, decimals, scientific). Reject things like "1 2".
  if (/^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/.test(trimmed)) {
    return parseFloat(trimmed)
  }
  return raw
}

export function isFormula(raw: string): boolean {
  return raw.length > 1 && raw[0] === '='
}

export interface ComputeResult {
  values: Map<string, CellValue>
}

/**
 * Compute every non-empty cell's value. Formula cells are evaluated with
 * memoization; cells currently on the evaluation stack resolve to #CYCLE!.
 */
export function computeSheet(
  cells: Map<string, Cell>,
  rowCount: number,
  colCount: number,
): ComputeResult {
  const values = new Map<string, CellValue>()
  const visiting = new Set<string>()

  function resolve(row: number, col: number): CellValue {
    const key = coordKey(row, col)
    if (values.has(key)) return values.get(key)!

    const cell = cells.get(key)
    if (!cell || cell.raw === '') {
      values.set(key, null)
      return null
    }

    if (!isFormula(cell.raw)) {
      const v = parseLiteral(cell.raw)
      values.set(key, v)
      return v
    }

    // Formula cell.
    if (visiting.has(key)) {
      // A cycle: this cell depends on itself (directly or transitively).
      return '#CYCLE!'
    }
    visiting.add(key)
    let result: CellValue
    try {
      const ast = getAst(cell.raw.slice(1))
      if (ast instanceof Error) {
        result = '#ERROR!'
      } else {
        result = evaluate(ast, { resolve, rowCount, colCount })
      }
    } catch (e) {
      result = e instanceof SpreadsheetError ? e.code : '#ERROR!'
    } finally {
      visiting.delete(key)
    }
    values.set(key, result)
    return result
  }

  for (const key of cells.keys()) {
    if (!values.has(key)) {
      const [row, col] = key.split(',').map(Number)
      resolve(row, col)
    }
  }

  return { values }
}
