// Evaluates an AST to a cell value, given a resolver for cell references.

import { type CellValue } from '../model/types'
import type { Node, RefNode, RangeNode } from './ast'
import { FUNCTIONS, isFunction } from './functions'
import {
  type ArgValue,
  type Thunk,
  SpreadsheetError,
  toNumber,
  toText,
  toBoolean,
} from './values'

/** Resolves a single cell's already-computed value. */
export type CellResolver = (row: number, col: number) => CellValue

export interface EvalEnv {
  resolve: CellResolver
  rowCount: number
  colCount: number
}

export function evaluate(node: Node, env: EvalEnv): CellValue {
  const v = evalNode(node, env)
  return Array.isArray(v) ? (v.length ? v[0] : null) : v
}

function evalNode(node: Node, env: EvalEnv): ArgValue {
  switch (node.kind) {
    case 'number':
      return node.value
    case 'string':
      return node.value
    case 'boolean':
      return node.value
    case 'ref':
      return resolveRef(node, env)
    case 'range':
      return resolveRange(node, env)
    case 'unary':
      return evalUnary(node.op, evalNode(node.operand, env))
    case 'binary':
      return evalBinary(node.op, node.left, node.right, env)
    case 'call':
      return evalCall(node.name, node.args, env)
  }
}

function resolveRef(node: RefNode, env: EvalEnv): CellValue {
  const { row, col } = node.ref
  if (row >= env.rowCount || col >= env.colCount || row < 0 || col < 0) {
    throw new SpreadsheetError('#REF!')
  }
  return env.resolve(row, col)
}

function resolveRange(node: RangeNode, env: EvalEnv): CellValue[] {
  const r1 = Math.min(node.start.row, node.end.row)
  const r2 = Math.max(node.start.row, node.end.row)
  const c1 = Math.min(node.start.col, node.end.col)
  const c2 = Math.max(node.start.col, node.end.col)
  const out: CellValue[] = []
  for (let r = r1; r <= r2; r++) {
    for (let c = c1; c <= c2; c++) {
      out.push(env.resolve(r, c))
    }
  }
  return out
}

function scalarOf(v: ArgValue): CellValue {
  return Array.isArray(v) ? (v.length ? v[0] : null) : v
}

function evalUnary(op: string, operand: ArgValue): CellValue {
  const v = scalarOf(operand)
  switch (op) {
    case '-':
      return -toNumber(v)
    case '+':
      return toNumber(v)
    case '%':
      return toNumber(v) / 100
    default:
      throw new SpreadsheetError('#ERROR!')
  }
}

function evalBinary(op: string, leftNode: Node, rightNode: Node, env: EvalEnv): CellValue {
  const left = scalarOf(evalNode(leftNode, env))
  const right = scalarOf(evalNode(rightNode, env))

  switch (op) {
    case '+':
      return toNumber(left) + toNumber(right)
    case '-':
      return toNumber(left) - toNumber(right)
    case '*':
      return toNumber(left) * toNumber(right)
    case '/': {
      const d = toNumber(right)
      if (d === 0) throw new SpreadsheetError('#DIV/0!')
      return toNumber(left) / d
    }
    case '^':
      return Math.pow(toNumber(left), toNumber(right))
    case '&':
      return toText(left) + toText(right)
    case '=':
      return compare(left, right) === 0
    case '<>':
      return compare(left, right) !== 0
    case '<':
      return compare(left, right) < 0
    case '>':
      return compare(left, right) > 0
    case '<=':
      return compare(left, right) <= 0
    case '>=':
      return compare(left, right) >= 0
    default:
      throw new SpreadsheetError('#ERROR!')
  }
}

/** Spreadsheet comparison: numbers numerically, otherwise case-insensitive text. */
function compare(a: CellValue, b: CellValue): number {
  if (typeof a === 'number' && typeof b === 'number') {
    return a === b ? 0 : a < b ? -1 : 1
  }
  if (typeof a === 'boolean' || typeof b === 'boolean') {
    const an = toBoolean(a) ? 1 : 0
    const bn = toBoolean(b) ? 1 : 0
    return an === bn ? 0 : an < bn ? -1 : 1
  }
  const as = toText(a).toUpperCase()
  const bs = toText(b).toUpperCase()
  return as === bs ? 0 : as < bs ? -1 : 1
}

function evalCall(name: string, argNodes: Node[], env: EvalEnv): CellValue {
  if (!isFunction(name)) {
    throw new SpreadsheetError('#NAME?')
  }
  const impl = FUNCTIONS[name.toUpperCase()]
  // Pass lazy thunks so control-flow functions can short-circuit.
  const thunks: Thunk[] = argNodes.map((n) => () => evalNode(n, env))
  return impl(thunks)
}
