import { describe, it, expect } from 'vitest'
import { computeSheet, parseLiteral } from './engine'
import { type Cell, coordKey, type CellValue } from '../model/types'

function sheet(map: Record<string, string>): Map<string, Cell> {
  const cells = new Map<string, Cell>()
  for (const [a1, raw] of Object.entries(map)) {
    const m = /^([A-Z]+)(\d+)$/.exec(a1)!
    const col = m[1].split('').reduce((n, ch) => n * 26 + (ch.charCodeAt(0) - 64), 0) - 1
    const row = parseInt(m[2], 10) - 1
    cells.set(coordKey(row, col), { raw })
  }
  return cells
}

function val(map: Record<string, string>, a1: string): CellValue {
  const m = /^([A-Z]+)(\d+)$/.exec(a1)!
  const col = m[1].split('').reduce((n, ch) => n * 26 + (ch.charCodeAt(0) - 64), 0) - 1
  const row = parseInt(m[2], 10) - 1
  const { values } = computeSheet(sheet(map), 100, 26)
  return values.get(coordKey(row, col)) ?? null
}

describe('parseLiteral', () => {
  it('parses numbers, booleans, text', () => {
    expect(parseLiteral('42')).toBe(42)
    expect(parseLiteral('-3.14')).toBe(-3.14)
    expect(parseLiteral('1e3')).toBe(1000)
    expect(parseLiteral('TRUE')).toBe(true)
    expect(parseLiteral('hello')).toBe('hello')
    expect(parseLiteral('')).toBe(null)
  })
})

describe('arithmetic', () => {
  it('evaluates operator precedence', () => {
    expect(val({ A1: '=1+2*3' }, 'A1')).toBe(7)
    expect(val({ A1: '=(1+2)*3' }, 'A1')).toBe(9)
    expect(val({ A1: '=2^3^2' }, 'A1')).toBe(512) // right assoc
    expect(val({ A1: '=10/4' }, 'A1')).toBe(2.5)
    expect(val({ A1: '=-2^2' }, 'A1')).toBe(4) // unary binds tighter than ^ here
    expect(val({ A1: '=10%' }, 'A1')).toBe(0.1)
  })

  it('reports division by zero', () => {
    expect(val({ A1: '=1/0' }, 'A1')).toBe('#DIV/0!')
  })
})

describe('references and ranges', () => {
  it('resolves cell refs', () => {
    const m = { A1: '5', A2: '=A1*2' }
    expect(val(m, 'A2')).toBe(10)
  })

  it('sums ranges', () => {
    const m = { A1: '1', A2: '2', A3: '3', B1: '=SUM(A1:A3)' }
    expect(val(m, 'B1')).toBe(6)
  })

  it('averages ranges ignoring blanks/text', () => {
    const m = { A1: '2', A2: 'x', A3: '4', B1: '=AVERAGE(A1:A3)' }
    expect(val(m, 'B1')).toBe(3)
  })
})

describe('functions', () => {
  it('IF short-circuits the untaken branch', () => {
    expect(val({ A1: '=IF(FALSE, 1/0, 5)' }, 'A1')).toBe(5)
    expect(val({ A1: '=IF(2>1, "yes", "no")' }, 'A1')).toBe('yes')
  })

  it('IFERROR catches errors', () => {
    expect(val({ A1: '=IFERROR(1/0, "safe")' }, 'A1')).toBe('safe')
  })

  it('text functions', () => {
    expect(val({ A1: '=CONCAT("a","b","c")' }, 'A1')).toBe('abc')
    expect(val({ A1: '=UPPER("hi")' }, 'A1')).toBe('HI')
    expect(val({ A1: '=LEFT("hello",3)' }, 'A1')).toBe('hel')
    expect(val({ A1: '=LEN("hello")' }, 'A1')).toBe(5)
  })

  it('string concatenation operator', () => {
    expect(val({ A1: '="Total: "&(2+3)' }, 'A1')).toBe('Total: 5')
  })

  it('unknown function -> #NAME?', () => {
    expect(val({ A1: '=BOGUS(1)' }, 'A1')).toBe('#NAME?')
  })
})

describe('cycle detection', () => {
  it('flags direct cycles', () => {
    expect(val({ A1: '=B1', B1: '=A1' }, 'A1')).toBe('#CYCLE!')
  })

  it('flags self-reference', () => {
    expect(val({ A1: '=A1+1' }, 'A1')).toBe('#CYCLE!')
  })
})

describe('dependency propagation', () => {
  it('chains updates through dependents', () => {
    const m = { A1: '10', A2: '=A1+1', A3: '=A2*2' }
    expect(val(m, 'A3')).toBe(22)
  })
})
