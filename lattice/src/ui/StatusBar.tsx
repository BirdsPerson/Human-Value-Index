// Status bar showing live aggregates over the current selection (Sum/Avg/Count).

import { coordKey } from '../model/types'
import { normalizeSelection, type SpreadsheetApi } from './useSpreadsheet'
import { formatValue } from './format'

export function StatusBar({ api }: { api: SpreadsheetApi }) {
  const sel = normalizeSelection(api.selection)
  const nums: number[] = []
  let count = 0
  for (let r = sel.r1; r <= sel.r2; r++) {
    for (let c = sel.c1; c <= sel.c2; c++) {
      const v = api.values.get(coordKey(r, c))
      if (v === null || v === undefined || v === '') continue
      count++
      if (typeof v === 'number') nums.push(v)
    }
  }
  const cellCount = (sel.r2 - sel.r1 + 1) * (sel.c2 - sel.c1 + 1)
  const sum = nums.reduce((a, b) => a + b, 0)
  const avg = nums.length ? sum / nums.length : null

  return (
    <div className="status-bar">
      <span>{cellCount > 1 ? `${cellCount} cells` : 'Ready'}</span>
      <span className="spacer" />
      {nums.length > 0 && (
        <>
          <span>Sum: {formatValue(sum)}</span>
          <span>Avg: {avg !== null ? formatValue(avg) : ''}</span>
        </>
      )}
      {count > 0 && <span>Count: {count}</span>}
    </div>
  )
}
