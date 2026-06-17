// AST node definitions for parsed formulas.

import type { ParsedRef } from './references'

export type Node =
  | NumberNode
  | StringNode
  | BooleanNode
  | RefNode
  | RangeNode
  | UnaryNode
  | BinaryNode
  | CallNode

export interface NumberNode {
  kind: 'number'
  value: number
}

export interface StringNode {
  kind: 'string'
  value: string
}

export interface BooleanNode {
  kind: 'boolean'
  value: boolean
}

export interface RefNode {
  kind: 'ref'
  ref: ParsedRef
  raw: string
}

export interface RangeNode {
  kind: 'range'
  start: ParsedRef
  end: ParsedRef
}

export interface UnaryNode {
  kind: 'unary'
  op: '-' | '+' | '%'
  operand: Node
}

export interface BinaryNode {
  kind: 'binary'
  op: string
  left: Node
  right: Node
}

export interface CallNode {
  kind: 'call'
  name: string
  args: Node[]
}
