// Canvas-rendered, virtualized spreadsheet grid.
//
// The data viewport is painted on a single <canvas> that stays pinned to the
// top-left of the scroll container (position: sticky) while an oversized
// "sizer" div drives native scrolling. Only the visible cells are drawn, so
// the grid stays smooth at hundreds of thousands of rows.

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react'
import { colToLetters } from '../engine/references'
import { coordKey } from '../model/types'
import { formatValue, alignRight } from './format'
import { normalizeSelection, type SpreadsheetApi } from './useSpreadsheet'

export const HEADER_W = 48
export const HEADER_H = 26
export const ROW_H = 24
export const COL_W = 96

const COLORS = {
  grid: '#e3e6ea',
  headerBg: '#f7f8fa',
  headerText: '#5f6571',
  headerActiveBg: '#e8eefc',
  cellText: '#1a1d24',
  selectionFill: 'rgba(38, 109, 240, 0.10)',
  selectionBorder: '#266df0',
  activeBorder: '#266df0',
  errorText: '#d1393b',
}

interface EditState {
  row: number
  col: number
  value: string
}

interface Props {
  api: SpreadsheetApi
}

export function Grid({ api }: Props) {
  const { activeSheet, active, selection, getValue, getRaw, setCellRaw, selectCell, clearRange } =
    api

  const viewportRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [viewport, setViewport] = useState({ w: 0, h: 0 })
  const [scroll, setScroll] = useState({ x: 0, y: 0 })
  const [edit, setEdit] = useState<EditState | null>(null)
  const editInputRef = useRef<HTMLInputElement>(null)

  const rowCount = activeSheet.rowCount
  const colCount = activeSheet.colCount
  const totalW = HEADER_W + colCount * COL_W
  const totalH = HEADER_H + rowCount * ROW_H

  // Track viewport size.
  useLayoutEffect(() => {
    const el = viewportRef.current
    if (!el) return
    const ro = new ResizeObserver(() => {
      setViewport({ w: el.clientWidth, h: el.clientHeight })
    })
    ro.observe(el)
    setViewport({ w: el.clientWidth, h: el.clientHeight })
    return () => ro.disconnect()
  }, [])

  const onScroll = useCallback(() => {
    const el = viewportRef.current
    if (!el) return
    setScroll({ x: el.scrollLeft, y: el.scrollTop })
  }, [])

  // ----- Drawing -----
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || viewport.w === 0) return
    const dpr = window.devicePixelRatio || 1
    canvas.width = Math.floor(viewport.w * dpr)
    canvas.height = Math.floor(viewport.h * dpr)
    canvas.style.width = `${viewport.w}px`
    canvas.style.height = `${viewport.h}px`
    const ctx = canvas.getContext('2d')!
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    draw(ctx)
  })

  const draw = (ctx: CanvasRenderingContext2D) => {
    const { w, h } = viewport
    const { x: sx, y: sy } = scroll
    ctx.clearRect(0, 0, w, h)
    ctx.font = '13px -apple-system, "Segoe UI", system-ui, sans-serif'
    ctx.textBaseline = 'middle'

    const firstCol = Math.floor(sx / COL_W)
    const lastCol = Math.min(colCount - 1, Math.floor((sx + w) / COL_W))
    const firstRow = Math.floor(sy / ROW_H)
    const lastRow = Math.min(rowCount - 1, Math.floor((sy + h) / ROW_H))

    const sel = normalizeSelection(selection)

    // Cell background for selection
    ctx.fillStyle = COLORS.selectionFill
    for (let r = Math.max(firstRow, sel.r1); r <= Math.min(lastRow, sel.r2); r++) {
      for (let c = Math.max(firstCol, sel.c1); c <= Math.min(lastCol, sel.c2); c++) {
        const x = HEADER_W + c * COL_W - sx
        const y = HEADER_H + r * ROW_H - sy
        ctx.fillRect(x, y, COL_W, ROW_H)
      }
    }

    // Grid lines + cell text
    ctx.strokeStyle = COLORS.grid
    ctx.lineWidth = 1
    ctx.beginPath()
    for (let c = firstCol; c <= lastCol + 1; c++) {
      const x = Math.floor(HEADER_W + c * COL_W - sx) + 0.5
      ctx.moveTo(x, HEADER_H)
      ctx.lineTo(x, h)
    }
    for (let r = firstRow; r <= lastRow + 1; r++) {
      const y = Math.floor(HEADER_H + r * ROW_H - sy) + 0.5
      ctx.moveTo(HEADER_W, y)
      ctx.lineTo(w, y)
    }
    ctx.stroke()

    // Cell values
    for (let r = firstRow; r <= lastRow; r++) {
      const y = HEADER_H + r * ROW_H - sy
      for (let c = firstCol; c <= lastCol; c++) {
        const v = getValue(r, c)
        if (v === null || v === '') continue
        const x = HEADER_W + c * COL_W - sx
        const text = formatValue(v)
        ctx.fillStyle =
          typeof v === 'string' && /^#[A-Z0-9/!?]+$/.test(v) ? COLORS.errorText : COLORS.cellText
        ctx.save()
        ctx.beginPath()
        ctx.rect(x + 1, y, COL_W - 2, ROW_H)
        ctx.clip()
        if (alignRight(v)) {
          ctx.textAlign = 'right'
          ctx.fillText(text, x + COL_W - 6, y + ROW_H / 2)
        } else {
          ctx.textAlign = 'left'
          ctx.fillText(text, x + 6, y + ROW_H / 2)
        }
        ctx.restore()
      }
    }

    // Selection border
    const selX = HEADER_W + sel.c1 * COL_W - sx
    const selY = HEADER_H + sel.r1 * ROW_H - sy
    const selW = (sel.c2 - sel.c1 + 1) * COL_W
    const selH = (sel.r2 - sel.r1 + 1) * ROW_H
    ctx.strokeStyle = COLORS.selectionBorder
    ctx.lineWidth = 2
    ctx.strokeRect(selX + 1, selY + 1, selW - 2, selH - 2)

    // Active cell border (stronger)
    const acX = HEADER_W + active.col * COL_W - sx
    const acY = HEADER_H + active.row * ROW_H - sy
    ctx.strokeStyle = COLORS.activeBorder
    ctx.lineWidth = 2
    ctx.strokeRect(acX + 1, acY + 1, COL_W - 2, ROW_H - 2)

    // ----- Headers (drawn last, on top) -----
    // Column headers
    ctx.fillStyle = COLORS.headerBg
    ctx.fillRect(0, 0, w, HEADER_H)
    ctx.fillRect(0, 0, HEADER_W, h)

    ctx.textAlign = 'center'
    for (let c = firstCol; c <= lastCol; c++) {
      const x = HEADER_W + c * COL_W - sx
      if (c >= sel.c1 && c <= sel.c2) {
        ctx.fillStyle = COLORS.headerActiveBg
        ctx.fillRect(x, 0, COL_W, HEADER_H)
      }
      ctx.fillStyle = COLORS.headerText
      ctx.fillText(colToLetters(c), x + COL_W / 2, HEADER_H / 2)
    }
    for (let r = firstRow; r <= lastRow; r++) {
      const y = HEADER_H + r * ROW_H - sy
      if (r >= sel.r1 && r <= sel.r2) {
        ctx.fillStyle = COLORS.headerActiveBg
        ctx.fillRect(0, y, HEADER_W, ROW_H)
      }
      ctx.fillStyle = COLORS.headerText
      ctx.fillText(String(r + 1), HEADER_W / 2, y + ROW_H / 2)
    }

    // Header borders + corner
    ctx.strokeStyle = COLORS.grid
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(0, HEADER_H + 0.5)
    ctx.lineTo(w, HEADER_H + 0.5)
    ctx.moveTo(HEADER_W + 0.5, 0)
    ctx.lineTo(HEADER_W + 0.5, h)
    ctx.stroke()
  }

  // ----- Hit testing -----
  const cellAt = useCallback(
    (clientX: number, clientY: number): { row: number; col: number } | null => {
      const canvas = canvasRef.current
      if (!canvas) return null
      const rect = canvas.getBoundingClientRect()
      const px = clientX - rect.left + scroll.x
      const py = clientY - rect.top + scroll.y
      if (px < HEADER_W || py < HEADER_H) return null
      const col = Math.floor((px - HEADER_W) / COL_W)
      const row = Math.floor((py - HEADER_H) / ROW_H)
      if (row < 0 || col < 0 || row >= rowCount || col >= colCount) return null
      return { row, col }
    },
    [scroll, rowCount, colCount],
  )

  const dragging = useRef(false)

  const onMouseDown = (e: React.MouseEvent) => {
    const hit = cellAt(e.clientX, e.clientY)
    if (!hit) return
    commitEdit()
    selectCell(hit.row, hit.col, e.shiftKey)
    dragging.current = true
    viewportRef.current?.focus()
  }

  const onMouseMove = (e: React.MouseEvent) => {
    if (!dragging.current) return
    const hit = cellAt(e.clientX, e.clientY)
    if (hit) selectCell(hit.row, hit.col, true)
  }

  const onMouseUp = () => {
    dragging.current = false
  }

  const onDoubleClick = (e: React.MouseEvent) => {
    const hit = cellAt(e.clientX, e.clientY)
    if (hit) startEdit(hit.row, hit.col, getRaw(hit.row, hit.col))
  }

  // ----- Editing -----
  const startEdit = (row: number, col: number, initial: string) => {
    setEdit({ row, col, value: initial })
    requestAnimationFrame(() => {
      const inp = editInputRef.current
      if (inp) {
        inp.focus()
        const len = inp.value.length
        inp.setSelectionRange(len, len)
      }
    })
  }

  const commitEdit = useCallback(() => {
    setEdit((cur) => {
      if (cur) setCellRaw(cur.row, cur.col, cur.value)
      return null
    })
  }, [setCellRaw])

  const ensureVisible = useCallback(
    (row: number, col: number) => {
      const el = viewportRef.current
      if (!el) return
      const cellLeft = HEADER_W + col * COL_W
      const cellTop = HEADER_H + row * ROW_H
      if (cellLeft - HEADER_W < el.scrollLeft) el.scrollLeft = cellLeft - HEADER_W
      else if (cellLeft + COL_W > el.scrollLeft + el.clientWidth)
        el.scrollLeft = cellLeft + COL_W - el.clientWidth
      if (cellTop - HEADER_H < el.scrollTop) el.scrollTop = cellTop - HEADER_H
      else if (cellTop + ROW_H > el.scrollTop + el.clientHeight)
        el.scrollTop = cellTop + ROW_H - el.clientHeight
    },
    [],
  )

  const move = useCallback(
    (dr: number, dc: number, extend: boolean) => {
      const row = Math.max(0, Math.min(rowCount - 1, active.row + dr))
      const col = Math.max(0, Math.min(colCount - 1, active.col + dc))
      selectCell(row, col, extend)
      ensureVisible(row, col)
    },
    [active, rowCount, colCount, selectCell, ensureVisible],
  )

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (edit) return // input handles its own keys
    switch (e.key) {
      case 'ArrowUp':
        e.preventDefault()
        move(-1, 0, e.shiftKey)
        break
      case 'ArrowDown':
        e.preventDefault()
        move(1, 0, e.shiftKey)
        break
      case 'ArrowLeft':
        e.preventDefault()
        move(0, -1, e.shiftKey)
        break
      case 'ArrowRight':
        e.preventDefault()
        move(0, 1, e.shiftKey)
        break
      case 'Tab':
        e.preventDefault()
        move(0, e.shiftKey ? -1 : 1, false)
        break
      case 'Enter':
        e.preventDefault()
        startEdit(active.row, active.col, getRaw(active.row, active.col))
        break
      case 'Backspace':
      case 'Delete':
        e.preventDefault()
        clearRange(selection)
        break
      case 'Escape':
        break
      default:
        // Start editing on a printable character.
        if (e.key.length === 1 && !e.ctrlKey && !e.metaKey) {
          e.preventDefault()
          startEdit(active.row, active.col, e.key)
        }
    }
  }

  const onEditKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      commitEdit()
      move(1, 0, false)
      viewportRef.current?.focus()
    } else if (e.key === 'Tab') {
      e.preventDefault()
      commitEdit()
      move(0, e.shiftKey ? -1 : 1, false)
      viewportRef.current?.focus()
    } else if (e.key === 'Escape') {
      e.preventDefault()
      setEdit(null)
      viewportRef.current?.focus()
    }
  }

  // Sync external active-cell edits (formula bar) — expose start via window? Keep simple.
  useEffect(() => {
    setEdit(null)
  }, [activeSheet.id])

  const editStyle: React.CSSProperties | undefined = edit
    ? {
        position: 'absolute',
        left: HEADER_W + edit.col * COL_W,
        top: HEADER_H + edit.row * ROW_H,
        width: COL_W,
        height: ROW_H,
      }
    : undefined

  return (
    <div
      className="grid-viewport"
      ref={viewportRef}
      tabIndex={0}
      onScroll={onScroll}
      onKeyDown={onKeyDown}
      onMouseDown={onMouseDown}
      onMouseMove={onMouseMove}
      onMouseUp={onMouseUp}
      onDoubleClick={onDoubleClick}
    >
      <div className="grid-sizer" style={{ width: totalW, height: totalH }}>
        <canvas ref={canvasRef} className="grid-canvas" />
        {edit && (
          <input
            ref={editInputRef}
            className="grid-edit-input"
            style={editStyle}
            value={edit.value}
            onChange={(e) => setEdit({ ...edit, value: e.target.value })}
            onKeyDown={onEditKeyDown}
            onBlur={commitEdit}
            spellCheck={false}
          />
        )}
      </div>
    </div>
  )
}

export function activeCellRef(row: number, col: number): string {
  return `${colToLetters(col)}${row + 1}`
}

export { coordKey }
