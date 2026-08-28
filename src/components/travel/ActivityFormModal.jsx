import { useId, useMemo, useState } from 'react'
import Modal from '../Modal'
import { buildPlaceIndex, findWishPlace, shortDate } from '../../lib/travel'
import styles from './Travel.module.css'

/**
 * 行程の 1 項目（何日目・時刻・場所・費用・メモ）の作成・編集フォーム。
 *
 * props:
 *   activity   : 編集対象（新規は null）
 *   dayDates   : 旅行期間の日付配列。index が day_index に対応する
 *   defaultDay : 新規追加時の初期 day_index
 *   wishPlaces : お出かけリストの場所。名前をそろえると行程から地図を開けるので候補として出す
 *   onSave     : (payload) => Promise
 *   onDelete   : 削除（編集時のみ表示）
 *   onClose    : 閉じる
 */
export default function ActivityFormModal({ activity, dayDates, defaultDay = 0, wishPlaces, onSave, onDelete, onClose }) {
  const isEdit = !!activity
  // 日程を縮めた後などに範囲外の日が残っていても、選択肢のある日に寄せる
  const initialDay = Math.min(Math.max(activity?.day_index ?? defaultDay, 0), Math.max(dayDates.length - 1, 0))
  const [form, setForm] = useState({
    day_index: initialDay,
    start_time: activity?.start_time ?? '',
    title: activity?.title ?? '',
    place: activity?.place ?? '',
    cost: activity?.cost != null ? String(activity.cost) : '',
    memo: activity?.memo ?? '',
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const placeListId = useId()
  const placeIndex = useMemo(() => buildPlaceIndex(wishPlaces), [wishPlaces])
  const matchedPlace = findWishPlace(placeIndex, form.place)

  function update(key, value) {
    setForm(prev => ({ ...prev, [key]: value }))
  }

  async function handleSave() {
    if (!form.title.trim()) { setError('やること・行き先を入力してください'); return }
    if (form.cost && !Number.isFinite(Number(form.cost))) { setError('費用は数値で入力してください'); return }

    setSaving(true)
    setError('')
    try {
      await onSave({
        day_index: Number(form.day_index),
        start_time: form.start_time || null,
        title: form.title.trim(),
        place: form.place.trim() || null,
        cost: form.cost === '' ? null : Number(form.cost),
        memo: form.memo.trim() || null,
      })
    } catch (err) {
      console.error('行程の保存エラー:', err)
      setError('保存に失敗しました。通信状況を確認してもう一度お試しください')
      setSaving(false)
    }
  }

  return (
    <Modal open onClose={onClose} title={isEdit ? '行程を編集' : '行程を追加'} variant="sheet">
      <div className={styles.body}>
        <div className={styles.fieldRow}>
          <div>
            <label className={styles.label} htmlFor="act-day">日</label>
            <select
              id="act-day"
              className={styles.select}
              value={form.day_index}
              onChange={e => update('day_index', e.target.value)}
            >
              {dayDates.map((date, idx) => (
                <option key={date} value={idx}>{idx + 1}日目 {shortDate(date)}</option>
              ))}
            </select>
          </div>
          <div className={styles.fieldTime}>
            <label className={styles.label} htmlFor="act-time">時刻（任意）</label>
            <input
              id="act-time"
              type="time"
              className={styles.input}
              value={form.start_time}
              onChange={e => update('start_time', e.target.value)}
            />
          </div>
        </div>

        <label className={styles.label} htmlFor="act-title">やること・行き先 *</label>
        <input
          id="act-title"
          type="text"
          className={styles.input}
          placeholder="例：中華街でランチ"
          value={form.title}
          onChange={e => update('title', e.target.value)}
          autoFocus
        />

        <label className={styles.label} htmlFor="act-place">場所（任意）</label>
        <input
          id="act-place"
          type="text"
          className={styles.input}
          placeholder="例：横浜中華街"
          value={form.place}
          onChange={e => update('place', e.target.value)}
          list={placeListId}
          aria-describedby={`${placeListId}-hint`}
        />
        <datalist id={placeListId}>
          {[...placeIndex.values()].map(place => (
            <option key={place.id} value={place.name} />
          ))}
        </datalist>
        <p className={styles.hint} id={`${placeListId}-hint`}>
          {matchedPlace
            ? `お出かけリストの「${matchedPlace.name}」と一致しています。行程から地図を開けます`
            : 'お出かけリストと同じ場所名にすると、行程から地図を開けます'}
        </p>

        <label className={styles.label} htmlFor="act-cost">費用（任意・円）</label>
        <input
          id="act-cost"
          type="number"
          inputMode="numeric"
          min="0"
          step="100"
          className={styles.input}
          placeholder="例：4000"
          value={form.cost}
          onChange={e => update('cost', e.target.value)}
        />

        <label className={styles.label} htmlFor="act-memo">メモ（任意）</label>
        <textarea
          id="act-memo"
          className={styles.textarea}
          placeholder="予約状況・持ち物・感想など"
          rows="2"
          value={form.memo}
          onChange={e => update('memo', e.target.value)}
        />

        {error && <p className={styles.error} role="alert">{error}</p>}

        <button className={styles.saveBtn} onClick={handleSave} disabled={saving}>
          {saving ? '保存中…' : isEdit ? '更新する' : '追加する'}
        </button>

        {isEdit && onDelete && (
          <div className={styles.actionBtns}>
            <button className={styles.deleteBtn} onClick={onDelete}>この行程を削除</button>
          </div>
        )}
      </div>
    </Modal>
  )
}
