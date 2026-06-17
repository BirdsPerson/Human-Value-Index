// Toolbar with file interoperability actions (the wedge: CSV + XLSX in/out).

import { useRef } from 'react'
import { parseCsv, gridToCells, valuesToCsv } from '../io/csv'
import {
  importXlsx,
  exportXlsx,
  downloadXlsx,
  triggerDownload,
  type ExportSheet,
} from '../io/xlsx'
import { computeSheet } from '../engine/engine'
import type { SpreadsheetApi } from './useSpreadsheet'

export function Toolbar({ api }: { api: SpreadsheetApi }) {
  const csvInputRef = useRef<HTMLInputElement>(null)
  const xlsxInputRef = useRef<HTMLInputElement>(null)

  const onCsvFile = async (file: File) => {
    const text = await file.text()
    const grid = parseCsv(text)
    const cells = gridToCells(grid)
    api.replaceCells(cells, grid.length, Math.max(...grid.map((r) => r.length), 0))
    api.selectCell(0, 0, false)
  }

  const onXlsxFile = async (file: File) => {
    const buf = await file.arrayBuffer()
    const sheets = await importXlsx(buf)
    if (sheets.length === 0) return
    const first = sheets[0]
    api.replaceCells(first.cells, first.rowCount, first.colCount)
    api.selectCell(0, 0, false)
  }

  const exportCsv = () => {
    const { activeSheet, values } = api
    const csv = valuesToCsv(values, activeSheet.rowCount, activeSheet.colCount)
    triggerDownload(new Blob([csv], { type: 'text/csv;charset=utf-8' }), `${activeSheet.name}.csv`)
  }

  const exportXl = async () => {
    const exportSheets: ExportSheet[] = api.sheetsRef.current.map((s) => ({
      name: s.name,
      cells: s.cells,
      values: computeSheet(s.cells, s.rowCount, s.colCount).values,
      rowCount: s.rowCount,
      colCount: s.colCount,
    }))
    const buf = await exportXlsx(exportSheets)
    downloadXlsx(buf, 'lattice-workbook.xlsx')
  }

  return (
    <div className="toolbar">
      <span className="brand">▦ Lattice</span>
      <span className="divider" />
      <button onClick={() => xlsxInputRef.current?.click()}>Import .xlsx</button>
      <button onClick={() => csvInputRef.current?.click()}>Import .csv</button>
      <span className="divider" />
      <button onClick={exportXl}>Export .xlsx</button>
      <button onClick={exportCsv}>Export .csv</button>
      <span className="spacer" />
      <span className="tagline">lean · fast · interoperable</span>

      <input
        ref={csvInputRef}
        type="file"
        accept=".csv,text/csv"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0]
          if (f) onCsvFile(f)
          e.target.value = ''
        }}
      />
      <input
        ref={xlsxInputRef}
        type="file"
        accept=".xlsx,.xls"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0]
          if (f) onXlsxFile(f)
          e.target.value = ''
        }}
      />
    </div>
  )
}
