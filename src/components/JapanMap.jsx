import { useEffect, useRef, useState } from 'react'
import { JAPAN_PREFECTURE_PATHS, JAPAN_MAP_VIEWBOX } from '../data/japanPrefecturePaths'
import { IconAdd, IconMinus, IconReset } from '../lib/icons'
import styles from './JapanMap.module.css'

const [BASE_X, BASE_Y, BASE_W, BASE_H] = JAPAN_MAP_VIEWBOX.split(/\s+/).map(Number)
const MAX_ZOOM = 8
const TAP_SLOP = 6 // これ以上動いたらタップではなくドラッグとみなす

const BASE_VIEW = { x: BASE_X, y: BASE_Y, w: BASE_W, h: BASE_H }

/**
 * 表示枠の縦横比に合わせた「地図全体が入る viewBox」。
 * viewBox 側を枠に合わせるので、拡大したときに枠の幅をすべて使える
 * （縦横比が違うと preserveAspectRatio が左右に余白を作ってしまう）。
 */
function fitView(aspect, base) {
  const baseAspect = base.w / base.h
  const w = aspect > baseAspect ? base.h * aspect : base.w
  const h = aspect > baseAspect ? base.h : base.w / aspect
  return { x: base.x - (w - base.w) / 2, y: base.y - (h - base.h) / 2, w, h }
}

function clampView(view, fit) {
  const w = Math.min(Math.max(view.w, fit.w / MAX_ZOOM), fit.w)
  const h = w * (fit.h / fit.w)
  return {
    w,
    h,
    x: Math.min(Math.max(view.x, fit.x), fit.x + fit.w - w),
    y: Math.min(Math.max(view.y, fit.y), fit.y + fit.h - h),
  }
}

/**
 * 日本地図（都道府県 SVG）。訪問済みのハイライトとタップ選択に加え、
 * ピンチ / ホイール / ボタンで拡大縮小し、拡大中はドラッグで移動できる。
 * 拡大は viewBox の操作なのでページ全体の表示倍率には影響しない。
 *
 * onZoomedChange: 拡大状態が変わったときに呼ばれる。拡大中はドラッグを地図の
 * 移動に使うため、外側でスワイプ操作を止めたい場合に使う（任意）。
 */
export default function JapanMap({ visited, selected, onSelect, onZoomedChange }) {
  const [fit, setFit] = useState(BASE_VIEW)
  const [view, setView] = useState(BASE_VIEW)
  const svgRef = useRef(null)
  const groupRef = useRef(null)
  const pointers = useRef(new Map())
  const pinch = useRef(null)
  const dragged = useRef(false)
  const captured = useRef(false)

  const zoomed = view.w < fit.w - 0.5
  const zoomedRef = useRef(zoomed)
  zoomedRef.current = zoomed
  const fitRef = useRef(fit)
  fitRef.current = fit

  useEffect(() => {
    onZoomedChange?.(zoomed)
  }, [zoomed, onZoomedChange])

  /** 実際に描かれている範囲。viewBox には上下に余白があり、そのままでは地図が小さくなる */
  function contentBox() {
    const box = groupRef.current?.getBBox?.()
    if (!box?.width || !box?.height) return BASE_VIEW
    const margin = Math.max(box.width, box.height) * 0.02
    return { x: box.x - margin, y: box.y - margin, w: box.width + margin * 2, h: box.height + margin * 2 }
  }

  // 表示枠の縦横比が変わったら（回転・画面幅の変化）表示範囲を作り直す
  useEffect(() => {
    const svg = svgRef.current
    if (!svg) return
    const observer = new ResizeObserver(entries => {
      const { width, height } = entries[0].contentRect
      if (!width || !height) return
      const next = fitView(width / height, contentBox())
      const previousFit = fitRef.current
      if (Math.abs(next.w - previousFit.w) < 1 && Math.abs(next.h - previousFit.h) < 1) return
      setFit(next)
      // 拡大の倍率と中心は保ったまま、新しい枠に合わせ直す
      // （iOS のアドレスバー開閉で表示が飛ばないようにするため）
      setView(prev => {
        const scale = prev.w / previousFit.w
        const centerX = prev.x + prev.w / 2
        const centerY = prev.y + prev.h / 2
        const w = next.w * scale
        const h = w * (next.h / next.w)
        return clampView({ x: centerX - w / 2, y: centerY - h / 2, w, h }, next)
      })
    })
    observer.observe(svg)
    return () => observer.disconnect()
  }, [])

  /** クライアント座標(px)基準の拡大と移動を 1 回の更新にまとめる */
  function applyGesture({ factor = 1, originX = 0, originY = 0, dxPx = 0, dyPx = 0 }) {
    const rect = svgRef.current?.getBoundingClientRect()
    if (!rect || !rect.width) return
    setView(prev => {
      const currentFit = fitRef.current
      const zoomedView = clampView({ ...prev, w: prev.w / factor }, currentFit)
      // 拡大の中心が指（またはカーソル）の位置に留まるよう原点をずらす
      const ratioX = (originX - rect.left) / rect.width
      const ratioY = (originY - rect.top) / rect.height
      const centered = {
        ...zoomedView,
        x: prev.x + (prev.w - zoomedView.w) * ratioX,
        y: prev.y + (prev.h - zoomedView.h) * ratioY,
      }
      const unitsPerPx = centered.w / rect.width
      return clampView({
        ...centered,
        x: centered.x - dxPx * unitsPerPx,
        y: centered.y - dyPx * unitsPerPx,
      }, currentFit)
    })
  }

  function zoomFromCenter(factor) {
    const rect = svgRef.current?.getBoundingClientRect()
    if (!rect) return
    applyGesture({ factor, originX: rect.left + rect.width / 2, originY: rect.top + rect.height / 2 })
  }

  /**
   * ポインタを捕捉するのは実際に操作が始まってから。
   * pointerdown で捕捉すると、続くクリックの対象が都道府県のパスではなく
   * SVG に付け替えられ、タップで都道府県を選べなくなる。
   */
  function capturePointer(e) {
    if (captured.current) return
    try {
      e.currentTarget.setPointerCapture?.(e.pointerId)
      captured.current = true
    } catch { /* 捕捉できない環境でも操作は続けられる */ }
  }

  function handlePointerDown(e) {
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    dragged.current = false
    if (pointers.current.size === 2) pinch.current = null
  }

  function handlePointerMove(e) {
    if (!pointers.current.has(e.pointerId)) return
    const previous = pointers.current.get(e.pointerId)
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    const points = [...pointers.current.values()]

    if (points.length >= 2) {
      const [a, b] = points
      const distance = Math.hypot(a.x - b.x, a.y - b.y)
      const centerX = (a.x + b.x) / 2
      const centerY = (a.y + b.y) / 2
      if (pinch.current) {
        dragged.current = true
        capturePointer(e)
        applyGesture({
          factor: distance / pinch.current.distance,
          originX: centerX,
          originY: centerY,
          dxPx: centerX - pinch.current.centerX,
          dyPx: centerY - pinch.current.centerY,
        })
      }
      pinch.current = { distance, centerX, centerY }
      return
    }

    if (!zoomed) return
    const dx = e.clientX - previous.x
    const dy = e.clientY - previous.y
    if (Math.abs(dx) > TAP_SLOP || Math.abs(dy) > TAP_SLOP) {
      dragged.current = true
      capturePointer(e)
    }
    applyGesture({ dxPx: dx, dyPx: dy })
  }

  function handlePointerUp(e) {
    pointers.current.delete(e.pointerId)
    if (pointers.current.size < 2) pinch.current = null
    if (pointers.current.size === 0) captured.current = false
  }

  // React の onWheel は passive で登録され preventDefault が効かないため、自前で登録する
  useEffect(() => {
    const svg = svgRef.current
    if (!svg) return
    function onWheel(e) {
      // 等倍のうちは地図の上でもページを普通にスクロールできるようにする
      // （Ctrl/⌘ 押下とトラックパッドのピンチは ctrlKey が立つのでその場で拡大する）
      if (!e.ctrlKey && !zoomedRef.current) return
      e.preventDefault()
      applyGesture({ factor: e.deltaY < 0 ? 1.2 : 1 / 1.2, originX: e.clientX, originY: e.clientY })
    }
    svg.addEventListener('wheel', onWheel, { passive: false })
    return () => svg.removeEventListener('wheel', onWheel)
  }, [])

  /** ドラッグ終わりのクリックで都道府県が選ばれてしまわないようにする（キーボード操作は対象外） */
  function handleTap(prefName, isSelected) {
    if (dragged.current) return
    onSelect(isSelected ? null : prefName)
  }

  return (
    <div className={styles.wrap}>
      <div className={styles.canvas}>
        <svg
          ref={svgRef}
          className={`${styles.svg} ${zoomed ? styles.svgPanning : ''}`}
          viewBox={`${view.x} ${view.y} ${view.w} ${view.h}`}
          role="img"
          aria-label="日本地図（旅行記録のある都道府県のハイライト表示）"
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
        >
          <g ref={groupRef}>
          {JAPAN_PREFECTURE_PATHS.map(pref => {
            const isVisited = visited.has(pref.name)
            const isSelected = selected === pref.name
            return (
              <path
                key={pref.name}
                d={pref.d}
                role="button"
                tabIndex={0}
                aria-label={`${pref.name}（${isVisited ? '訪問済み' : '未訪問'}）`}
                aria-pressed={isSelected}
                className={[
                  styles.pref,
                  isVisited ? styles.visited : styles.unvisited,
                  isSelected ? styles.selected : '',
                ].filter(Boolean).join(' ')}
                onClick={() => handleTap(pref.name, isSelected)}
                onKeyDown={e => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault()
                    onSelect(isSelected ? null : pref.name)
                  }
                }}
              >
                <title>{pref.name}</title>
              </path>
            )
          })}
          </g>
        </svg>

        <div className={styles.zoomBtns}>
          <button type="button" className={styles.zoomBtn} aria-label="地図を拡大" onClick={() => zoomFromCenter(1.5)}>
            <IconAdd />
          </button>
          <button type="button" className={styles.zoomBtn} aria-label="地図を縮小" onClick={() => zoomFromCenter(1 / 1.5)}>
            <IconMinus />
          </button>
          <button
            type="button"
            className={styles.zoomBtn}
            aria-label="地図の表示を元に戻す"
            onClick={() => setView(fit)}
            disabled={!zoomed}
          >
            <IconReset />
          </button>
        </div>
      </div>

      <div className={styles.legend}>
        <span className={styles.legendItem}>
          <span className={`${styles.legendSwatch} ${styles.visited}`} />
          訪問済み（{visited.size}/47）
        </span>
        <span className={styles.legendItem}>
          <span className={`${styles.legendSwatch} ${styles.unvisited}`} />
          未訪問
        </span>
      </div>
    </div>
  )
}
