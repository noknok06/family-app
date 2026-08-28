import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { IconAdd, IconCheck, IconDrag, IconPin } from '../../lib/icons'
import { mapsUrl } from '../../lib/schedule'
import { shortDate, formatYen, findWishPlace, placeMapQuery, todayStr } from '../../lib/travel'
import styles from './Travel.module.css'

/** ドラッグ中に端でスクロールさせるため、実際にスクロールする祖先を探す */
function findScrollParent(el) {
  let node = el?.parentElement
  while (node) {
    const { overflowY } = getComputedStyle(node)
    if ((overflowY === 'auto' || overflowY === 'scroll') && node.scrollHeight > node.clientHeight) return node
    node = node.parentElement
  }
  return null
}

const EDGE = 60

/**
 * 日ごとに区切った行程リスト。ハンドルのドラッグ（日をまたいだ移動も可）と
 * ↑↓ キーで並び替えでき、確定した並びだけを onReorder で親に返す。
 *
 * props:
 *   dayDates     : 旅行期間の日付配列。index が day_index に対応する
 *   activities   : 旅行の全行程（day_index / order_index を持つ）
 *   onAdd        : (dayIndex) => void
 *   onEdit       : (activity) => void
 *   onToggleDone : (activity) => void
 *   onReorder    : (changedRows) => void。day_index / order_index が変わった行のみ
 *   placeIndex   : お出かけリストの索引（lib/travel の buildPlaceIndex）。
 *                  行程の「場所」と一致する場所があれば地図リンクを出す
 */
export default function ItineraryList({ dayDates, activities, onAdd, onEdit, onToggleDone, onReorder, placeIndex }) {
  const [drag, setDrag] = useState(null)
  const rootRef = useRef(null)
  const rowRefs = useRef(new Map())
  const handleRefs = useRef(new Map())
  const dayRefs = useRef(new Map())
  const scrollRef = useRef(null)
  const pointerYRef = useRef(0)
  const rafRef = useRef(0)
  const scrollDyRef = useRef(0)
  const refocusRef = useRef(null)
  const todayRef = useRef(null)

  // 旅行中に開いたときは今日の行程がすぐ見えるところまで送る（初日ならそのまま）
  const todayIndex = dayDates.indexOf(todayStr())
  useEffect(() => {
    if (todayIndex > 0) todayRef.current?.scrollIntoView({ block: 'start' })
    // 開いた直後の 1 回だけ。以降のスクロール位置は利用者に任せる
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const grouped = useMemo(() => {
    const byDay = dayDates.map(() => [])
    for (const activity of activities) {
      // 日程を縮めた後などに範囲外の day_index が残っていても最終日に寄せて表示する
      const day = Math.min(Math.max(activity.day_index ?? 0, 0), dayDates.length - 1)
      byDay[day].push(activity)
    }
    for (const list of byDay) list.sort((a, b) => (a.order_index ?? 0) - (b.order_index ?? 0))
    return byDay
  }, [activities, dayDates])

  const groupedRef = useRef(grouped)
  groupedRef.current = grouped
  const dragRef = useRef(drag)
  dragRef.current = drag

  const locate = useCallback(clientY => {
    const dragId = dragRef.current?.id
    let bestDay = 0
    let bestDistance = Infinity
    for (const [day, el] of dayRefs.current) {
      if (!el) continue
      const rect = el.getBoundingClientRect()
      const distance = clientY < rect.top ? rect.top - clientY : Math.max(0, clientY - rect.bottom)
      if (distance < bestDistance) { bestDistance = distance; bestDay = day }
    }
    const items = (groupedRef.current[bestDay] ?? []).filter(a => a.id !== dragId)
    let index = items.length
    for (let i = 0; i < items.length; i++) {
      const rect = rowRefs.current.get(items[i].id)?.getBoundingClientRect()
      if (rect && clientY < rect.top + rect.height / 2) { index = i; break }
    }
    return { day: bestDay, index }
  }, [])

  const updateTarget = useCallback(() => {
    const target = locate(pointerYRef.current)
    setDrag(prev =>
      prev && (prev.day !== target.day || prev.index !== target.index) ? { ...prev, ...target } : prev
    )
  }, [locate])

  const step = useCallback(() => {
    rafRef.current = 0
    const el = scrollRef.current
    const dy = scrollDyRef.current
    if (!el || !dy || !dragRef.current) return
    el.scrollTop += dy
    updateTarget()
    rafRef.current = requestAnimationFrame(step)
  }, [updateTarget])

  const updateAutoScroll = useCallback(() => {
    const el = scrollRef.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    const y = pointerYRef.current
    let dy = 0
    if (y < rect.top + EDGE) dy = -Math.min(14, Math.ceil((rect.top + EDGE - y) / 4))
    else if (y > rect.bottom - EDGE) dy = Math.min(14, Math.ceil((y - (rect.bottom - EDGE)) / 4))
    scrollDyRef.current = dy
    if (dy && !rafRef.current) rafRef.current = requestAnimationFrame(step)
  }, [step])

  const stopAutoScroll = useCallback(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current)
    rafRef.current = 0
    scrollDyRef.current = 0
  }, [])

  useEffect(() => () => { if (rafRef.current) cancelAnimationFrame(rafRef.current) }, [])

  // キーボードで動かした項目は日をまたぐと再マウントされるため、フォーカスを戻す
  useEffect(() => {
    if (!refocusRef.current) return
    handleRefs.current.get(refocusRef.current)?.focus()
    refocusRef.current = null
  }, [activities])

  const applyMove = useCallback((activity, targetDay, targetIndex) => {
    const groups = groupedRef.current.map(list => list.filter(a => a.id !== activity.id))
    const destination = groups[targetDay]
    if (!destination) return
    destination.splice(Math.min(targetIndex, destination.length), 0, activity)

    const changed = []
    groups.forEach((list, day) => {
      list.forEach((item, index) => {
        if (item.day_index !== day || item.order_index !== index) {
          changed.push({ ...item, day_index: day, order_index: index })
        }
      })
    })
    if (changed.length) onReorder(changed)
  }, [onReorder])

  function startDrag(e, activity, day, index) {
    if (e.button !== 0 && e.pointerType === 'mouse') return
    e.currentTarget.setPointerCapture?.(e.pointerId)
    scrollRef.current = findScrollParent(rootRef.current)
    pointerYRef.current = e.clientY
    setDrag({ id: activity.id, day, index })
  }

  function moveDrag(e) {
    if (!dragRef.current) return
    pointerYRef.current = e.clientY
    updateTarget()
    updateAutoScroll()
  }

  function endDrag(e) {
    const current = dragRef.current
    stopAutoScroll()
    setDrag(null)
    e.currentTarget.releasePointerCapture?.(e.pointerId)
    if (!current) return
    const activity = activities.find(a => a.id === current.id)
    if (activity) applyMove(activity, current.day, current.index)
  }

  function handleKeyDown(e, activity, day, index) {
    if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return
    e.preventDefault()

    let targetDay = day
    let targetIndex = index + (e.key === 'ArrowUp' ? -1 : 1)
    const lastIndex = grouped[day].length - 1
    if (targetIndex < 0) {
      if (day === 0) return
      targetDay = day - 1
      targetIndex = grouped[targetDay].length
    } else if (targetIndex > lastIndex) {
      if (day >= dayDates.length - 1) return
      targetDay = day + 1
      targetIndex = 0
    }
    refocusRef.current = activity.id
    applyMove(activity, targetDay, targetIndex)
  }

  return (
    <div ref={rootRef}>
      {activities.length > 1 && (
        <p className={styles.hint}>
          ハンドルをドラッグすると並び替えられます（日をまたいだ移動も可）
        </p>
      )}

      {dayDates.map((date, day) => {
        const items = grouped[day]
        const dayCost = items.reduce((sum, a) => sum + (Number(a.cost) || 0), 0)
        const dropping = drag?.day === day
        const remaining = dropping ? items.filter(a => a.id !== drag.id) : items
        const dropBeforeId = dropping ? (remaining[drag.index]?.id ?? null) : undefined

        const isToday = day === todayIndex

        return (
          <section
            key={date}
            ref={isToday ? todayRef : undefined}
            className={[
              styles.dayBlock,
              dropping ? styles.dayBlockActive : '',
              isToday ? styles.dayBlockToday : '',
            ].filter(Boolean).join(' ')}
          >
            <div className={styles.dayHead}>
              <span className={styles.dayLabel}>{day + 1}日目</span>
              <span className={styles.dayDate}>{shortDate(date)}</span>
              {isToday && <span className={styles.todayBadge}>今日</span>}
              {dayCost > 0 && <span className={styles.dayCost}>{formatYen(dayCost)}</span>}
            </div>

            <ul
              className={styles.itemList}
              ref={el => { if (el) dayRefs.current.set(day, el); else dayRefs.current.delete(day) }}
            >
              {items.length === 0 && !dropping && (
                <li className={styles.dayEmpty}>まだ予定がありません</li>
              )}
              {items.map((activity, index) => {
                const wishPlace = findWishPlace(placeIndex, activity.place)
                return (
                  <Fragment key={activity.id}>
                    {dropBeforeId === activity.id && <li className={styles.dropLine} aria-hidden="true" />}
                    <li
                      ref={el => { if (el) rowRefs.current.set(activity.id, el); else rowRefs.current.delete(activity.id) }}
                      className={[
                        styles.item,
                        activity.done ? styles.itemDone : '',
                        drag?.id === activity.id ? styles.itemDragging : '',
                      ].filter(Boolean).join(' ')}
                    >
                      <button
                        type="button"
                        className={styles.handle}
                        ref={el => { if (el) handleRefs.current.set(activity.id, el); else handleRefs.current.delete(activity.id) }}
                        aria-label={`${activity.title} の並び順を変更（上下キーで移動）`}
                        onPointerDown={e => startDrag(e, activity, day, index)}
                        onPointerMove={moveDrag}
                        onPointerUp={endDrag}
                        onPointerCancel={endDrag}
                        onKeyDown={e => handleKeyDown(e, activity, day, index)}
                      >
                        <IconDrag />
                      </button>

                      <button
                        type="button"
                        className={styles.doneBtn}
                        aria-pressed={!!activity.done}
                        aria-label={activity.done ? `${activity.title} を未完了に戻す` : `${activity.title} を完了にする`}
                        onClick={() => onToggleDone(activity)}
                      >
                        <IconCheck />
                      </button>

                      <button type="button" className={styles.itemMain} onClick={() => onEdit(activity)}>
                        <span className={styles.itemTitleRow}>
                          {activity.start_time && (
                            <span className={styles.itemTime}>{activity.start_time.slice(0, 5)}</span>
                          )}
                          <span className={styles.itemTitle}>{activity.title}</span>
                        </span>
                        {(activity.place || activity.cost != null || activity.memo) && (
                          <span className={styles.itemSub}>
                            {activity.place && (
                              <span className={wishPlace ? styles.itemPlaceLinked : ''}>
                                <IconPin /> {activity.place}
                              </span>
                            )}
                            {activity.cost != null && (
                              <span className={styles.itemCost}>{formatYen(activity.cost)}</span>
                            )}
                            {activity.memo && <span>{activity.memo}</span>}
                          </span>
                        )}
                      </button>

                      {wishPlace && (
                        <a
                          className={styles.itemMapBtn}
                          href={mapsUrl(placeMapQuery(wishPlace))}
                          target="_blank"
                          rel="noopener noreferrer"
                          title="Google マップで開く"
                          aria-label={`${wishPlace.name} を Google マップで開く`}
                        >
                          <IconPin /> 地図
                        </a>
                      )}
                    </li>
                  </Fragment>
                )
              })}
              {dropping && dropBeforeId === null && <li className={styles.dropLine} aria-hidden="true" />}
            </ul>

            <button type="button" className={styles.dayAddBtn} onClick={() => onAdd(day)}>
              <IconAdd /> この日に追加
            </button>
          </section>
        )
      })}
    </div>
  )
}
