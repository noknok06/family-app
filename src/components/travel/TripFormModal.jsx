import { useState } from 'react'
import Modal from '../Modal'
import PlaceSearchInput from '../PlaceSearchInput'
import { MEMBER_COLORS } from '../../lib/schedule'
import { PREFECTURES, countExtraCompanions } from '../../lib/travel'
import styles from './Travel.module.css'

/**
 * 旅行の作成・編集フォーム。日程だけでなく、計画に必要な要素
 * （行き先・同行者・交通・宿・予算）をまとめて持たせる。
 *
 * props:
 *   trip    : 編集対象（新規は null）
 *   members : 家族メンバー（同行者の選択肢）
 *   onSave  : (payload) => Promise。失敗時は例外を投げること
 *   onClose : 閉じる
 */
export default function TripFormModal({ trip, members = [], onSave, onClose }) {
  const isEdit = !!trip
  const [form, setForm] = useState({
    title: trip?.title ?? '',
    start_date: trip?.start_date ?? '',
    end_date: trip?.end_date ?? '',
    prefecture: trip?.prefecture ?? '',
    companions: trip?.companions ?? '',
    companion_member_ids: trip?.companion_member_ids ?? [],
    transport: trip?.transport ?? '',
    lodging: trip?.lodging ?? '',
    lodging_address: trip?.lodging_address ?? '',
    lodging_lat: trip?.lodging_lat ?? null,
    lodging_lng: trip?.lodging_lng ?? null,
    budget: trip?.budget != null ? String(trip.budget) : '',
    memo: trip?.memo ?? '',
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const headcount = form.companion_member_ids.length + countExtraCompanions(form.companions)

  function update(key, value) {
    setForm(prev => ({ ...prev, [key]: value }))
  }

  /** 日帰り・1 泊が多いので、終了日が未入力・開始日より前なら開始日にそろえる */
  function updateStartDate(value) {
    setForm(prev => ({
      ...prev,
      start_date: value,
      end_date: !prev.end_date || prev.end_date < value ? value : prev.end_date,
    }))
  }

  function toggleMember(id) {
    setForm(prev => ({
      ...prev,
      companion_member_ids: prev.companion_member_ids.includes(id)
        ? prev.companion_member_ids.filter(memberId => memberId !== id)
        : [...prev.companion_member_ids, id],
    }))
  }

  async function handleSave() {
    if (!form.title.trim()) { setError('旅行名を入力してください'); return }
    if (!form.start_date) { setError('開始日を選択してください'); return }
    if (!form.end_date) { setError('終了日を選択してください'); return }
    if (form.end_date < form.start_date) { setError('終了日は開始日以降にしてください'); return }
    if (form.budget && !Number.isFinite(Number(form.budget))) { setError('予算は数値で入力してください'); return }

    setSaving(true)
    setError('')
    try {
      await onSave({
        title: form.title.trim(),
        start_date: form.start_date,
        end_date: form.end_date,
        prefecture: form.prefecture || null,
        companions: form.companions.trim() || null,
        companion_member_ids: form.companion_member_ids,
        transport: form.transport.trim() || null,
        lodging: form.lodging.trim() || null,
        lodging_address: form.lodging_address.trim() || null,
        lodging_lat: form.lodging_lat,
        lodging_lng: form.lodging_lng,
        budget: form.budget === '' ? null : Number(form.budget),
        memo: form.memo.trim() || null,
      })
    } catch (err) {
      console.error('旅行の保存エラー:', err)
      setError('保存に失敗しました。通信状況を確認してもう一度お試しください')
      setSaving(false)
    }
  }

  return (
    <Modal open onClose={onClose} title={isEdit ? '旅行を編集' : '新しい旅行'} variant="sheet">
      <div className={styles.body}>
        <label className={styles.label} htmlFor="trip-title">旅行名 *</label>
        <input
          id="trip-title"
          type="text"
          className={styles.input}
          placeholder="例：横浜旅行"
          value={form.title}
          onChange={e => update('title', e.target.value)}
          autoFocus
        />

        <div className={styles.fieldRow}>
          <div>
            <label className={styles.label} htmlFor="trip-start">開始日 *</label>
            <input
              id="trip-start"
              type="date"
              className={styles.input}
              value={form.start_date}
              onChange={e => updateStartDate(e.target.value)}
            />
          </div>
          <div>
            <label className={styles.label} htmlFor="trip-end">終了日 *</label>
            <input
              id="trip-end"
              type="date"
              className={styles.input}
              min={form.start_date || undefined}
              value={form.end_date}
              onChange={e => update('end_date', e.target.value)}
            />
          </div>
        </div>

        <label className={styles.label} htmlFor="trip-pref">旅行先（任意）</label>
        <select
          id="trip-pref"
          className={styles.select}
          value={form.prefecture}
          onChange={e => update('prefecture', e.target.value)}
        >
          <option value="">都道府県を選択</option>
          {PREFECTURES.map(pref => <option key={pref} value={pref}>{pref}</option>)}
        </select>

        {members.length > 0 && (
          <>
            <span className={styles.label}>同行者（任意）</span>
            <div className={styles.memberSelect}>
              {members.map((member, index) => {
                const color = MEMBER_COLORS[index % MEMBER_COLORS.length]
                const active = form.companion_member_ids.includes(member.id)
                return (
                  <button
                    key={member.id}
                    type="button"
                    className={`${styles.memberOption} ${active ? styles.memberOptionActive : ''}`}
                    style={active ? { '--active-color': color } : undefined}
                    aria-pressed={active}
                    onClick={() => toggleMember(member.id)}
                  >
                    <span className={styles.memberDot} style={{ background: color }} />
                    {member.name || 'メンバー'}
                  </button>
                )
              })}
            </div>
          </>
        )}

        <label className={styles.label} htmlFor="trip-companions">
          {members.length > 0 ? '家族以外の同行者（任意・「、」区切り）' : '同行者（任意・「、」区切り）'}
        </label>
        <input
          id="trip-companions"
          type="text"
          className={styles.input}
          placeholder="例：祖母、友人"
          value={form.companions}
          onChange={e => update('companions', e.target.value)}
        />
        {headcount > 0 && (
          <p className={styles.hint}>参加人数 {headcount}人（1人あたりの予算・費用の計算に使います）</p>
        )}

        <label className={styles.label} htmlFor="trip-transport">交通手段（任意）</label>
        <input
          id="trip-transport"
          type="text"
          className={styles.input}
          placeholder="例：新幹線 のぞみ 8:12 東京発"
          value={form.transport}
          onChange={e => update('transport', e.target.value)}
        />

        <label className={styles.label} htmlFor="trip-lodging">宿泊先（任意・Google マップ検索）</label>
        <PlaceSearchInput
          id="trip-lodging"
          inputClassName={styles.input}
          placeholder="ホテル名・施設名で検索（例：横浜ベイホテル）"
          defaultValue={form.lodging}
          onPick={({ name, address, lat, lng }) => {
            setForm(prev => ({ ...prev, lodging: name, lodging_address: address, lodging_lat: lat, lodging_lng: lng }))
          }}
          onType={value => {
            // 手で書き換えたら、前に選んだ場所の住所・座標は合わなくなるので外す
            setForm(prev => ({ ...prev, lodging: value, lodging_address: '', lodging_lat: null, lodging_lng: null }))
          }}
        />
        {form.lodging_address && <p className={styles.hint}>{form.lodging_address}</p>}

        <label className={styles.label} htmlFor="trip-budget">予算（任意・円）</label>
        <input
          id="trip-budget"
          type="number"
          inputMode="numeric"
          min="0"
          step="1000"
          className={styles.input}
          placeholder="例：80000"
          value={form.budget}
          onChange={e => update('budget', e.target.value)}
        />

        <label className={styles.label} htmlFor="trip-memo">メモ（任意）</label>
        <textarea
          id="trip-memo"
          className={styles.textarea}
          placeholder="旅行の概要や特記事項"
          rows="3"
          value={form.memo}
          onChange={e => update('memo', e.target.value)}
        />

        {error && <p className={styles.error} role="alert">{error}</p>}

        <button className={styles.saveBtn} onClick={handleSave} disabled={saving}>
          {saving ? '保存中…' : isEdit ? '更新する' : '追加する'}
        </button>
      </div>
    </Modal>
  )
}

