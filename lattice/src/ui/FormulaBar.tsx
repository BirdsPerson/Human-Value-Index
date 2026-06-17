// Formula bar: shows the active cell address and lets you edit its raw content.

import { useEffect, useState } from 'react'
import { activeCellRef } from './Grid'
import type { SpreadsheetApi } from './useSpreadsheet'

export function FormulaBar({ api }: { api: SpreadsheetApi }) {
  const { active, getRaw, setCellRaw } = api
  const [draft, setDraft] = useState('')

  // Re-sync when the active cell or its content changes.
  const raw = getRaw(active.row, active.col)
  useEffect(() => {
    setDraft(raw)
  }, [active.row, active.col, raw])

  const commit = () => setCellRaw(active.row, active.col, draft)

  return (
    <div className="formula-bar">
      <div className="cell-ref">{activeCellRef(active.row, active.col)}</div>
      <div className="fx-label">fx</div>
      <input
        className="formula-input"
        value={draft}
        spellCheck={false}
        placeholder="Enter a value or =FORMULA()"
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault()
            commit()
            ;(e.target as HTMLInputElement).blur()
          } else if (e.key === 'Escape') {
            setDraft(raw)
            ;(e.target as HTMLInputElement).blur()
          }
        }}
        onBlur={commit}
      />
    </div>
  )
}
