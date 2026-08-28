import { useMemo, useState } from 'react'
import { IconCheck, IconTrash } from '../../lib/icons'
import { PREP_CATEGORIES } from '../../lib/travel'
import styles from './Travel.module.css'

/**
 * 出発前の準備リスト（持ち物 / やること）。
 *
 * props:
 *   items    : travel_prep_items の配列（この旅行の分だけ）
 *   members  : 家族メンバー（担当の選択肢。空なら自由入力にフォールバック）
 *   onAdd    : ({ category, title, assignee }) => Promise
 *   onToggle : (item) => void
 *   onDelete : (item) => void
 */
export default function PrepList({ items, members = [], onAdd, onToggle, onDelete }) {
  const [category, setCategory] = useState('packing')
  const [title, setTitle] = useState('')
  const [assignee, setAssignee] = useState('')
  const [error, setError] = useState('')

  const groups = useMemo(
    () => PREP_CATEGORIES.map(cat => ({
      ...cat,
      items: items.filter(item => item.category === cat.key),
    })),
    [items]
  )

  const doneCount = items.filter(item => item.done).length
  const progress = items.length ? Math.round((doneCount / items.length) * 100) : 0

  async function handleAdd() {
    if (!title.trim()) { setError('項目名を入力してください'); return }
    setError('')
    try {
      await onAdd({ category, title: title.trim(), assignee: assignee.trim() || null })
      setTitle('')
    } catch (err) {
      console.error('準備項目の追加エラー:', err)
      setError('追加できませんでした。もう一度お試しください')
    }
  }

  return (
    <div>
      <div className={styles.prepHead}>
        <div className={styles.costRow}>
          <span>準備の進み具合</span>
          <span className={styles.costValue}>{doneCount} / {items.length}</span>
        </div>
        <div className={styles.meter} role="progressbar" aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100} aria-label="準備の進み具合">
          <div className={styles.meterFill} style={{ width: `${progress}%` }} />
        </div>
      </div>

      <div className={styles.addForm}>
        <div className={styles.segment}>
          {PREP_CATEGORIES.map(cat => (
            <button
              key={cat.key}
              type="button"
              className={styles.segmentBtn}
              aria-pressed={category === cat.key}
              onClick={() => setCategory(cat.key)}
            >
              {cat.label}
            </button>
          ))}
        </div>
        <input
          type="text"
          className={styles.input}
          placeholder={category === 'packing' ? '例：充電器' : '例：レンタカーを予約する'}
          value={title}
          onChange={e => setTitle(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') handleAdd() }}
        />
        <div className={styles.inlineRow}>
          {members.length > 0 ? (
            <select
              className={styles.select}
              aria-label="担当"
              value={assignee}
              onChange={e => setAssignee(e.target.value)}
            >
              <option value="">担当なし</option>
              {members.map(member => (
                <option key={member.id} value={member.name}>{member.name || 'メンバー'}</option>
              ))}
            </select>
          ) : (
            <input
              type="text"
              className={styles.input}
              placeholder="担当（任意）"
              value={assignee}
              onChange={e => setAssignee(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleAdd() }}
            />
          )}
          <button type="button" className={styles.addBtn} onClick={handleAdd}>追加</button>
        </div>
        {error && <p className={styles.error} role="alert">{error}</p>}
      </div>

      {groups.map(group => (
        <div key={group.key} className={styles.prepGroup}>
          <h4 className={styles.groupTitle}>
            {group.label}
            <span className={styles.groupCount}>
              {group.items.length ? `${group.items.filter(i => i.done).length} / ${group.items.length}` : '0件'}
            </span>
          </h4>
          {group.items.map(item => (
            <div key={item.id} className={`${styles.prepItem} ${item.done ? styles.prepDone : ''}`}>
              <button
                type="button"
                className={styles.doneBtn}
                aria-pressed={!!item.done}
                aria-label={item.done ? `${item.title} のチェックを外す` : `${item.title} をチェックする`}
                onClick={() => onToggle(item)}
              >
                <IconCheck />
              </button>
              <span className={styles.prepTitle}>{item.title}</span>
              {item.assignee && <span className={styles.assignee}>{item.assignee}</span>}
              <button
                type="button"
                className={styles.iconBtn}
                aria-label={`${item.title} を削除`}
                onClick={() => onDelete(item)}
              >
                <IconTrash />
              </button>
            </div>
          ))}
        </div>
      ))}
    </div>
  )
}
