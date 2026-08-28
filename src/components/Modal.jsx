import { useEffect, useId, useRef } from 'react'
import { createPortal } from 'react-dom'
import { IconClose } from '../lib/icons'
import styles from './Modal.module.css'

// 入れ子で開いたモーダルのうち、最前面のものだけが Esc に反応するようにする
const openStack = []

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

/**
 * iOS ではキーボード表示・ピンチ時に「見えている領域（visual viewport）」だけがずれ、
 * position: fixed のオーバーレイはレイアウトビューポート基準のままなので、
 * モーダルが横や縦に揺れて見える。表示領域に合わせて位置と大きさを追従させる。
 */
function useVisualViewport(overlayRef, open) {
  useEffect(() => {
    const viewport = window.visualViewport
    if (!open || !viewport) return

    function apply() {
      const overlay = overlayRef.current
      if (!overlay) return
      overlay.style.width = `${viewport.width}px`
      overlay.style.height = `${viewport.height}px`
      overlay.style.transform = `translate(${viewport.offsetLeft}px, ${viewport.offsetTop}px)`
    }

    apply()
    viewport.addEventListener('resize', apply)
    viewport.addEventListener('scroll', apply)
    return () => {
      viewport.removeEventListener('resize', apply)
      viewport.removeEventListener('scroll', apply)
    }
  }, [overlayRef, open])
}

/**
 * sheet のヘッダーは sticky なので、その下に別の要素を貼り付けたいページのために
 * 実測した高さを CSS 変数（--modal-header-h）としてパネルに公開する。
 */
function useHeaderHeight(panelRef, headerRef, open) {
  useEffect(() => {
    const panel = panelRef.current
    const header = headerRef.current
    if (!open || !panel || !header) return
    const observer = new ResizeObserver(() => {
      panel.style.setProperty('--modal-header-h', `${header.offsetHeight}px`)
    })
    observer.observe(header)
    return () => observer.disconnect()
  }, [panelRef, headerRef, open])
}

/**
 * 全ページ共通のモーダル（モバイルはボトムシート、480px 以上で中央表示）。
 * Esc・背景タップで閉じる / 開いている間の背景スクロールロック /
 * フォーカストラップ・閉じた後のフォーカス復帰をここで一元的に担保する。
 *
 * props:
 *   open       : 表示フラグ（false で何も描画しない）
 *   onClose    : 閉じる要求（Esc / 背景タップ / × ボタン）
 *   title      : 見出し。省略するとヘッダーごと描画しない
 *   headerStart: 見出しの左に置く要素（戻るボタン等）
 *   variant    : 'card'（既定・不透明カード）| 'sheet'（グラス調・ヘッダー固定）
 *                'plain' はパネルの装飾を持たず className 側のスタイルに委ねる
 *   size       : 'sm' 380px | 'md' 480px（既定）| 'lg' 640px | 'auto'（幅指定なし）
 *   className  : パネルへの追加クラス（ページ固有の調整用）
 *   closeOnOverlay : 背景タップで閉じるか（既定 true）
 */
export default function Modal({
  open,
  onClose,
  title,
  headerStart,
  variant = 'card',
  size = 'md',
  className = '',
  closeOnOverlay = true,
  children,
}) {
  const panelRef = useRef(null)
  const overlayRef = useRef(null)
  const headerRef = useRef(null)
  const titleId = useId()

  useVisualViewport(overlayRef, open)
  useHeaderHeight(panelRef, headerRef, open)

  // onClose は呼び出し側でインライン関数になりがちなので、
  // 依存に含めて毎レンダー登録し直さないよう ref 経由で参照する
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose

  useEffect(() => {
    if (!open) return

    const previouslyFocused = document.activeElement
    const { overflow } = document.body.style
    document.body.style.overflow = 'hidden'
    const token = {}
    openStack.push(token)

    function onKeyDown(e) {
      if (openStack[openStack.length - 1] !== token) return
      if (e.key === 'Escape') {
        onCloseRef.current?.()
        return
      }
      if (e.key !== 'Tab') return
      const panel = panelRef.current
      if (!panel) return
      const items = [...panel.querySelectorAll(FOCUSABLE)].filter(el => el.offsetParent !== null)
      if (items.length === 0) {
        e.preventDefault()
        return
      }
      const first = items[0]
      const last = items[items.length - 1]
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault()
        first.focus()
      }
    }

    document.addEventListener('keydown', onKeyDown)
    // autoFocus 指定の要素を尊重し、なければパネル自体にフォーカスを移す
    const panel = panelRef.current
    if (panel && !panel.contains(document.activeElement)) {
      const target = panel.querySelector('[autofocus]') || panel
      target.focus?.()
    }

    return () => {
      document.removeEventListener('keydown', onKeyDown)
      openStack.splice(openStack.indexOf(token), 1)
      document.body.style.overflow = overflow
      previouslyFocused?.focus?.()
    }
  }, [open])

  if (!open) return null

  return createPortal(
    <div
      ref={overlayRef}
      className={styles.overlay}
      onClick={e => { if (closeOnOverlay && e.target === e.currentTarget) onClose?.() }}
    >
      <div
        ref={panelRef}
        className={`${styles.panel} ${styles[variant] ?? ''} ${styles[size] ?? ''} ${className}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? titleId : undefined}
        tabIndex={-1}
      >
        {title && (
          <div className={styles.header} ref={headerRef}>
            {headerStart}
            <h2 className={styles.title} id={titleId}>{title}</h2>
            <button type="button" className={styles.closeBtn} onClick={onClose} aria-label="閉じる">
              <IconClose />
            </button>
          </div>
        )}
        {children}
      </div>
    </div>,
    document.body
  )
}
