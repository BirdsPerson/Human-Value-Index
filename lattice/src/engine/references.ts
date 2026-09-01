// A1-notation <-> zero-based (row, col) conversion utilities.

/** Convert a zero-based column index to letters: 0 -> "A", 25 -> "Z", 26 -> "AA". */
export function colToLetters(col: number): string {
  let n = col + 1
  let s = ''
  while (n > 0) {
    const rem = (n - 1) % 26
    s = String.fromCharCode(65 + rem) + s
    n = Math.floor((n - 1) / 26)
  }
  return s
}

/** Convert column letters to a zero-based index: "A" -> 0, "AA" -> 26. */
export function lettersToCol(letters: string): number {
  let n = 0
  for (const ch of letters.toUpperCase()) {
    n = n * 26 + (ch.charCodeAt(0) - 64)
  }
  return n - 1
}

export interface ParsedRef {
  row: number
  col: number
  absRow: boolean
  absCol: boolean
}

const REF_RE = /^(\$?)([A-Za-z]+)(\$?)(\d+)$/

/** Parse an A1 reference like "$A$1" into coordinates + absolute flags. */
export function parseA1(ref: string): ParsedRef | null {
  const m = REF_RE.exec(ref.trim())
  if (!m) return null
  const [, absColMark, letters, absRowMark, digits] = m
  const col = lettersToCol(letters)
  const row = parseInt(digits, 10) - 1
  if (row < 0) return null
  return { row, col, absRow: absRowMark === '$', absCol: absColMark === '$' }
}

/** Build an A1 string from coordinates, honoring absolute flags. */
export function toA1(row: number, col: number, absRow = false, absCol = false): string {
  return `${absCol ? '$' : ''}${colToLetters(col)}${absRow ? '$' : ''}${row + 1}`
}
