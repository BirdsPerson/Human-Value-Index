// Sheet tab bar: switch, add, rename (double-click), and delete sheets.

import { useState } from 'react'
import type { SpreadsheetApi } from './useSpreadsheet'

export function SheetTabs({ api }: { api: SpreadsheetApi }) {
  const { sheets, activeSheetId, setActiveSheetId, addSheet, renameSheet, deleteSheet } = api
  const [renaming, setRenaming] = useState<string | null>(null)
  const [draft, setDraft] = useState('')

  return (
    <div className="sheet-tabs">
      <button className="add-sheet" title="Add sheet" onClick={addSheet}>
        +
      </button>
      {sheets.map((s) => {
        const isActive = s.id === activeSheetId
        if (renaming === s.id) {
          return (
            <input
              key={s.id}
              className="tab-rename"
              autoFocus
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onBlur={() => {
                if (draft.trim()) renameSheet(s.id, draft.trim())
                setRenaming(null)
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
                if (e.key === 'Escape') setRenaming(null)
              }}
            />
          )
        }
        return (
          <div
            key={s.id}
            className={`tab${isActive ? ' active' : ''}`}
            onClick={() => setActiveSheetId(s.id)}
            onDoubleClick={() => {
              setRenaming(s.id)
              setDraft(s.name)
            }}
          >
            <span>{s.name}</span>
            {sheets.length > 1 && (
              <span
                className="tab-close"
                title="Delete sheet"
                onClick={(e) => {
                  e.stopPropagation()
                  deleteSheet(s.id)
                }}
              >
                ×
              </span>
            )}
          </div>
        )
      })}
    </div>
  )
}
