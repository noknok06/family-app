import { useEffect, useRef, useState } from 'react'
import { getPlacePhoto } from '../../utils/placePhotos'
import styles from './PlacePhoto.module.css'

/**
 * 場所の参考画像。登録された名前・住所から Google の場所写真を引いて表示する
 * （画像そのものは登録・保存しない。取得の制限は utils/placePhotos.js）。
 *
 * props:
 *   variant : 'card'（一覧カードの帯）| 'detail'（詳細モーダルのヘッダー）
 *   Icon    : 画像がないときのプレースホルダーに出すカテゴリアイコン
 *
 * 一覧では画面に入ったカードだけ取得するため、スクロールした分しか呼び出さない。
 * 画像が無い場所では card は何も描画せず、これまでのカード表示のままになる。
 */
export default function PlacePhoto({ name, address, lat, lng, variant = 'card', Icon }) {
  const [photo, setPhoto] = useState(null)
  const [status, setStatus] = useState('loading')   // 'loading' | 'ready' | 'none'
  const [visible, setVisible] = useState(variant === 'detail')
  const boxRef = useRef(null)

  useEffect(() => {
    if (visible) return
    const el = boxRef.current
    if (!el || typeof IntersectionObserver === 'undefined') { setVisible(true); return }
    const observer = new IntersectionObserver(entries => {
      if (entries.some(e => e.isIntersecting)) {
        setVisible(true)
        observer.disconnect()
      }
    }, { rootMargin: '200px' })
    observer.observe(el)
    return () => observer.disconnect()
  }, [visible])

  useEffect(() => {
    if (!visible) return
    let cancelled = false
    setStatus('loading')
    getPlacePhoto({ name, address, lat, lng })
      .then(result => {
        if (cancelled) return
        setPhoto(result)
        setStatus(result ? 'ready' : 'none')
      })
      .catch(() => {
        if (cancelled) return
        setPhoto(null)
        setStatus('none')
      })
    return () => { cancelled = true }
  }, [visible, name, address, lat, lng])

  // 参考画像が無い場所で一覧の見た目を変えないよう、カードでは何も出さない
  if (variant === 'card' && status === 'none') return null

  const boxClass = `${styles.box} ${variant === 'detail' ? styles.boxDetail : styles.boxCard}`

  if (status === 'ready') {
    return (
      <div className={boxClass}>
        <img
          className={styles.image}
          src={photo.url}
          alt={`${name}の参考画像`}
          loading="lazy"
          decoding="async"
          onError={() => setStatus('none')}
        />
        <span className={styles.credit}>
          {photo.author ? `Google · ${photo.author}` : 'Google'}
        </span>
      </div>
    )
  }

  return (
    <div ref={boxRef} className={`${boxClass} ${styles.boxEmpty}`} aria-hidden="true">
      {status === 'loading'
        ? <span className={styles.skeleton} />
        : Icon && <Icon className={styles.placeholderIcon} />
      }
    </div>
  )
}
