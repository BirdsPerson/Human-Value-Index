// Recursive-descent parser producing an AST from formula tokens.
//
// Precedence (lowest to highest):
//   comparison: = <> < > <= >=
//   concat:     &
//   add/sub:    + -
//   mul/div:    * /
//   power:      ^   (right associative)
//   unary:      - +
//   postfix:    %
//   primary:    number, string, bool, ref, range, ( expr ), func( ... )

import { tokenize, type Token } from './tokenizer'
import { parseA1 } from './references'
import type { Node } from './ast'

export class ParseError extends Error {}

class Parser {
  private tokens: Token[]
  private i = 0

  constructor(tokens: Token[]) {
    this.tokens = tokens
  }

  private peek(): Token | undefined {
    return this.tokens[this.i]
  }

  private next(): Token | undefined {
    return this.tokens[this.i++]
  }

  private expect(type: Token['type']): Token {
    const t = this.next()
    if (!t || t.type !== type) {
      throw new ParseError(`Expected ${type} but got ${t ? t.type : 'end of input'}`)
    }
    return t
  }

  parse(): Node {
    const node = this.parseComparison()
    if (this.peek()) {
      throw new ParseError(`Unexpected token '${this.peek()!.value}'`)
    }
    return node
  }

  private parseComparison(): Node {
    let left = this.parseConcat()
    while (this.isOp('=', '<>', '<', '>', '<=', '>=')) {
      const op = this.next()!.value
      const right = this.parseConcat()
      left = { kind: 'binary', op, left, right }
    }
    return left
  }

  private parseConcat(): Node {
    let left = this.parseAddSub()
    while (this.isOp('&')) {
      this.next()
      const right = this.parseAddSub()
      left = { kind: 'binary', op: '&', left, right }
    }
    return left
  }

  private parseAddSub(): Node {
    let left = this.parseMulDiv()
    while (this.isOp('+', '-')) {
      const op = this.next()!.value
      const right = this.parseMulDiv()
      left = { kind: 'binary', op, left, right }
    }
    return left
  }

  private parseMulDiv(): Node {
    let left = this.parsePower()
    while (this.isOp('*', '/')) {
      const op = this.next()!.value
      const right = this.parsePower()
      left = { kind: 'binary', op, left, right }
    }
    return left
  }

  private parsePower(): Node {
    const left = this.parseUnary()
    if (this.isOp('^')) {
      this.next()
      const right = this.parsePower() // right associative
      return { kind: 'binary', op: '^', left, right }
    }
    return left
  }

  private parseUnary(): Node {
    if (this.isOp('-', '+')) {
      const op = this.next()!.value as '-' | '+'
      const operand = this.parseUnary()
      return { kind: 'unary', op, operand }
    }
    return this.parsePostfix()
  }

  private parsePostfix(): Node {
    let node = this.parsePrimary()
    while (this.isOp('%')) {
      this.next()
      node = { kind: 'unary', op: '%', operand: node }
    }
    return node
  }

  private parsePrimary(): Node {
    const t = this.peek()
    if (!t) throw new ParseError('Unexpected end of formula')

    switch (t.type) {
      case 'number':
        this.next()
        return { kind: 'number', value: parseFloat(t.value) }
      case 'string':
        this.next()
        return { kind: 'string', value: t.value }
      case 'boolean':
        this.next()
        return { kind: 'boolean', value: t.value === 'TRUE' }
      case 'lparen': {
        this.next()
        const inner = this.parseComparison()
        this.expect('rparen')
        return inner
      }
      case 'ref': {
        this.next()
        return this.maybeRange(t.value)
      }
      case 'ident': {
        this.next()
        // Function call
        if (this.peek()?.type === 'lparen') {
          this.next()
          const args: Node[] = []
          if (this.peek()?.type !== 'rparen') {
            args.push(this.parseComparison())
            while (this.peek()?.type === 'comma') {
              this.next()
              args.push(this.parseComparison())
            }
          }
          this.expect('rparen')
          return { kind: 'call', name: t.value.toUpperCase(), args }
        }
        throw new ParseError(`Unknown identifier '${t.value}'`)
      }
      default:
        throw new ParseError(`Unexpected token '${t.value}'`)
    }
  }

  /** After consuming a ref token, check for ':' to form a range. */
  private maybeRange(startRaw: string): Node {
    const start = parseA1(startRaw)
    if (!start) throw new ParseError(`Bad reference '${startRaw}'`)
    if (this.peek()?.type === 'colon') {
      this.next()
      const endTok = this.expect('ref')
      const end = parseA1(endTok.value)
      if (!end) throw new ParseError(`Bad reference '${endTok.value}'`)
      return { kind: 'range', start, end }
    }
    return { kind: 'ref', ref: start, raw: startRaw }
  }

  private isOp(...ops: string[]): boolean {
    const t = this.peek()
    return !!t && t.type === 'op' && ops.includes(t.value)
  }
}

export function parseFormula(formula: string): Node {
  const tokens = tokenize(formula)
  return new Parser(tokens).parse()
}
