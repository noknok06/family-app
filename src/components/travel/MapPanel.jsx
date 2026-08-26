import { useEffect, useId, useMemo, useRef, useState } from 'react'
import JapanMap from '../JapanMap'
import styles from './MapPanel.module.css'

/** スワイプで開閉が確定する移動量(px) */
const SWIPE_THRESHOLD = 44
/** タップとスワイプを区別する移動量(px) */
const DRAG_SLOP = 6

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max)
}

/**
 * 日本地図を上下スワイプ（またはハンドルのタップ）で開閉できるパネル。
 *
 * props:
 *   visited / selected / onSelect : JapanMap にそのまま渡す
 *   open         : 地図を開いているか
 *   onOpenChange : (open) => void
 */
export default function MapPanel({ visited, selected, onSelect, open, onOpenChange }) {
  const panelId = useId()
  const bodyRef = useRef(null)
  const dragRef = useRef(null)
  const swipedRef = useRef(false)
  const [fullHeight, setFullHeight] = useState(0)
  const [dragHeight, setDragHeight] = useState(null)
  const [zoomed, setZoomed] = useState(false)

  // 開閉アニメーションと指追従には px の高さが要るため、地図本体の高さを実測する
  useEffect(() => {
    const el = bodyRef.current
    if (!el) return
    const observer = new ResizeObserver(() => setFullHeight(el.offsetHeight))
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  function beginDrag(e, fromHandle) {
    if (e.touches.length !== 1) {
      cancelDrag()
      return
    }
    const el = bodyRef.current
    // 地図の拡大中は地図のパン、本体がはみ出しているときは中身のスクロールを優先する
    if (!fromHandle && (!open || zoomed || (el && el.scrollHeight > el.clientHeight + 1))) return
    dragRef.current = {
      startY: e.touches[0].clientY,
      base: open ? fullHeight : 0,
      dy: 0,
      moved: false,
      fromHandle,
    }
  }

  function moveDrag(e) {
    const drag = dragRef.current
    if (!drag) return
    // 2 本目の指が乗ったら地図のピンチ操作。スワイプ判定は取り消す
    if (e.touches.length !== 1 || !fullHeight) {
      cancelDrag()
      return
    }
    drag.dy = e.touches[0].clientY - drag.startY
    if (!drag.moved && Math.abs(drag.dy) < DRAG_SLOP) return
    drag.moved = true
    setDragHeight(clamp(drag.base + drag.dy, 0, fullHeight))
  }

  function endDrag() {
    const drag = dragRef.current
    dragRef.current = null
    setDragHeight(null)
    if (!drag || !drag.moved) return
    // スワイプ直後の click でハンドルのトグルが二重に走らないようにする
    if (drag.fromHandle) swipedRef.current = true
    if (Math.abs(drag.dy) >= SWIPE_THRESHOLD) onOpenChange(drag.dy > 0)
  }

  function cancelDrag() {
    dragRef.current = null
    setDragHeight(null)
  }

  function handleClick() {
    if (swipedRef.current) {
      swipedRef.current = false
      return
    }
    onOpenChange(!open)
  }

  // ドラッグ中は 1 フレームごとに再描画されるため、47 都道府県の SVG は作り直さない
  const map = useMemo(
    () => (
      <JapanMap visited={visited} selected={selected} onSelect={onSelect} onZoomedChange={setZoomed} />
    ),
    [visited, selected, onSelect],
  )

  const dragging = dragHeight !== null
  const height = dragging ? dragHeight : open ? fullHeight || 'auto' : 0

  return (
    <div className={styles.panel}>
      <div
        id={panelId}
        className={styles.collapse}
        style={{ height, transition: dragging ? 'none' : undefined }}
        inert={!open && !dragging}
        onTouchStart={e => beginDrag(e, false)}
        onTouchMove={moveDrag}
        onTouchEnd={endDrag}
        onTouchCancel={cancelDrag}
      >
        <div ref={bodyRef} className={styles.body}>{map}</div>
      </div>

      <button
        type="button"
        className={styles.handle}
        aria-expanded={open}
        aria-controls={panelId}
        aria-label={open ? '地図を閉じる（上下スワイプでも開閉できます）' : '地図を開く（上下スワイプでも開閉できます）'}
        onTouchStart={e => beginDrag(e, true)}
        onTouchMove={moveDrag}
        onTouchEnd={endDrag}
        onTouchCancel={cancelDrag}
        onClick={handleClick}
      >
        <span className={styles.grabber} />
      </button>
    </div>
  )
}
