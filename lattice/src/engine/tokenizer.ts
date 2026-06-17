// Tokenizer for spreadsheet formulas (the part after a leading "=").

export type TokenType =
  | 'number'
  | 'string'
  | 'boolean'
  | 'ref' // A1, $A$1
  | 'ident' // function name or named token
  | 'op' // + - * / ^ & = <> < > <= >= %
  | 'lparen'
  | 'rparen'
  | 'comma'
  | 'colon'

export interface Token {
  type: TokenType
  value: string
  pos: number
}

const TWO_CHAR_OPS = new Set(['<>', '<=', '>='])
const ONE_CHAR_OPS = new Set(['+', '-', '*', '/', '^', '&', '=', '<', '>', '%'])

export class TokenizeError extends Error {}

export function tokenize(input: string): Token[] {
  const tokens: Token[] = []
  let i = 0
  const n = input.length

  while (i < n) {
    const ch = input[i]

    // Whitespace
    if (ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r') {
      i++
      continue
    }

    // String literal: "..." with "" as an escaped quote
    if (ch === '"') {
      let j = i + 1
      let str = ''
      while (j < n) {
        if (input[j] === '"') {
          if (input[j + 1] === '"') {
            str += '"'
            j += 2
            continue
          }
          break
        }
        str += input[j]
        j++
      }
      if (j >= n) throw new TokenizeError('Unterminated string')
      tokens.push({ type: 'string', value: str, pos: i })
      i = j + 1
      continue
    }

    // Number: 123, 1.5, .5, 1e10, 1.2E-3
    if (/[0-9]/.test(ch) || (ch === '.' && /[0-9]/.test(input[i + 1] ?? ''))) {
      let j = i
      while (j < n && /[0-9.]/.test(input[j])) j++
      if (input[j] === 'e' || input[j] === 'E') {
        j++
        if (input[j] === '+' || input[j] === '-') j++
        while (j < n && /[0-9]/.test(input[j])) j++
      }
      tokens.push({ type: 'number', value: input.slice(i, j), pos: i })
      i = j
      continue
    }

    // Two-char operators
    const two = input.slice(i, i + 2)
    if (TWO_CHAR_OPS.has(two)) {
      tokens.push({ type: 'op', value: two, pos: i })
      i += 2
      continue
    }

    // One-char operators
    if (ONE_CHAR_OPS.has(ch)) {
      tokens.push({ type: 'op', value: ch, pos: i })
      i++
      continue
    }

    if (ch === '(') {
      tokens.push({ type: 'lparen', value: ch, pos: i })
      i++
      continue
    }
    if (ch === ')') {
      tokens.push({ type: 'rparen', value: ch, pos: i })
      i++
      continue
    }
    if (ch === ',') {
      tokens.push({ type: 'comma', value: ch, pos: i })
      i++
      continue
    }
    if (ch === ':') {
      tokens.push({ type: 'colon', value: ch, pos: i })
      i++
      continue
    }

    // Identifier / reference: starts with $ or a letter
    if (ch === '$' || /[A-Za-z_]/.test(ch)) {
      let j = i
      while (j < n && /[A-Za-z0-9_$.]/.test(input[j])) j++
      const word = input.slice(i, j)
      const upper = word.toUpperCase()
      if (upper === 'TRUE' || upper === 'FALSE') {
        tokens.push({ type: 'boolean', value: upper, pos: i })
      } else if (/^\$?[A-Za-z]+\$?[0-9]+$/.test(word)) {
        tokens.push({ type: 'ref', value: word, pos: i })
      } else {
        tokens.push({ type: 'ident', value: word, pos: i })
      }
      i = j
      continue
    }

    throw new TokenizeError(`Unexpected character '${ch}' at ${i}`)
  }

  return tokens
}
