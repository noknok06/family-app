import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { BsHouseFill } from 'react-icons/bs'
import { IconTravel, IconMap } from '../lib/icons'
import { supabase } from '../lib/supabase'
import { useFamilyData, unwrap } from '../hooks/useFamilyData'
import { useAuth } from '../contexts/AuthContext'
import ConfirmDialog from '../components/ConfirmDialog'
import BottomNav from '../components/BottomNav'
import LoadingSpinner from '../components/LoadingSpinner'
import ErrorNotice from '../components/ErrorNotice'
import Toast from '../components/Toast'
import MapPanel from '../components/travel/MapPanel'
import TripDetailModal from '../components/travel/TripDetailModal'
import TripFormModal from '../components/travel/TripFormModal'
import ActivityFormModal from '../components/travel/ActivityFormModal'
import { PHASES, PREFECTURES, buildPlaceIndex, shortDate, tripDates, tripPhase } from '../lib/travel'
import styles from './TravelPage.module.css'

/** upsert で送る列。取得した行をそのまま返すと不要な列まで書き戻すため明示する */
function activityRow(activity) {
  return {
    id: activity.id,
    trip_id: activity.trip_id,
    family_id: activity.family_id,
    day_index: activity.day_index ?? 0,
    order_index: activity.order_index ?? 0,
    start_time: activity.start_time ?? null,
    title: activity.title,
    place: activity.place ?? null,
    cost: activity.cost ?? null,
    memo: activity.memo ?? null,
    done: !!activity.done,
  }
}

/** 旅行から予定表へ書き出す内容。作成・更新・再登録で同じ形にそろえる */
function scheduleEventFields(trip) {
  return {
    title: `✈ ${trip.title}`,
    all_day: true,
    start_date: trip.start_date,
    end_date: trip.end_date,
    memo: trip.memo || null,
  }
}

function byItinerary(a, b) {
  return (a.day_index ?? 0) - (b.day_index ?? 0) || (a.order_index ?? 0) - (b.order_index ?? 0)
}

export default function TravelPage() {
  const { familyMember } = useAuth()
  const navigate = useNavigate()

  const [selectedTripId, setSelectedTripId] = useState(null)
  const [showTripModal, setShowTripModal] = useState(false)
  const [editingTrip, setEditingTrip] = useState(null)
  const [activityForm, setActivityForm] = useState(null) // { activity, defaultDay }
  const [deleteConfirmId, setDeleteConfirmId] = useState(null)
  const [prefectureFilter, setPrefectureFilter] = useState('all')
  const [showMap, setShowMap] = useState(true)
  const [toast, setToast] = useState(null)

  const {
    data: { trips, activitiesMap, prepMap, members, wishPlaces },
    loading,
    error: loadError,
    refetch: fetchTrips,
    familyId: fid,
    setData,
  } = useFamilyData(
    async familyId => {
      const [trips, members, wishPlaces] = await Promise.all([
        unwrap(
          supabase.from('travel_trips').select('*').eq('family_id', familyId).order('start_date', { ascending: false })
        ),
        // 同行者の選択肢。家族を抜けたメンバーの ID は表示側で解決できず自然に落ちる
        unwrap(
          supabase.from('family_members').select('id, name').eq('family_id', familyId).order('joined_at')
        ),
        // 行程の「場所」と突き合わせて地図リンクを出すための付随データ。
        // 取得できなくても旅行そのものは表示したいので、失敗は握って空扱いにする
        unwrap(
          supabase.from('wish_places').select('id, name, address, lat, lng')
            .eq('family_id', familyId).order('created_at')
        ).catch(err => { console.error('お出かけリストの取得エラー:', err); return [] }),
      ])
      const tripIds = trips.map(t => t.id)
      // 旅行ごとに問い合わせず、行程と準備リストは 1 クエリずつでまとめて取得する
      const [activities, prepItems] = tripIds.length
        ? await Promise.all([
            unwrap(
              supabase.from('travel_activities').select('*')
                .in('trip_id', tripIds).order('day_index').order('order_index')
            ),
            unwrap(
              supabase.from('travel_prep_items').select('*')
                .in('trip_id', tripIds).order('order_index').order('created_at')
            ),
          ])
        : [[], []]

      const activitiesMap = Object.fromEntries(tripIds.map(id => [id, []]))
      for (const activity of activities) activitiesMap[activity.trip_id]?.push(activity)
      const prepMap = Object.fromEntries(tripIds.map(id => [id, []]))
      for (const item of prepItems) prepMap[item.trip_id]?.push(item)
      return { trips, activitiesMap, prepMap, members, wishPlaces }
    },
    ['travel_trips', 'travel_activities', 'travel_prep_items', 'family_members', 'wish_places'],
    { trips: [], activitiesMap: {}, prepMap: {}, members: [], wishPlaces: [] },
  )

  const selectedTrip = trips.find(t => t.id === selectedTripId) ?? null

  // 行程の「場所」からお出かけリストの行を引くための索引
  const placeIndex = useMemo(() => buildPlaceIndex(wishPlaces), [wishPlaces])

  const visitedPrefectures = useMemo(
    () => new Set(trips.map(t => t.prefecture).filter(Boolean)),
    [trips]
  )

  const sections = useMemo(() => {
    const filtered = prefectureFilter === 'all'
      ? trips
      : trips.filter(t => t.prefecture === prefectureFilter)
    // これからの旅行は出発が近い順、終わった旅行は新しい順に見たい
    const planned = filtered.filter(t => tripPhase(t) !== 'past')
      .sort((a, b) => a.start_date.localeCompare(b.start_date))
    const past = filtered.filter(t => tripPhase(t) === 'past')
    return [
      { key: 'planned', title: 'これからの旅行', trips: planned },
      { key: 'past', title: 'おもいで', trips: past },
    ].filter(section => section.trips.length > 0)
  }, [trips, prefectureFilter])

  function patchList(key, tripId, updater) {
    setData(prev => ({
      ...prev,
      [key]: { ...prev[key], [tripId]: updater(prev[key][tripId] ?? []) },
    }))
  }

  function notifyFailure(message) {
    setToast({ message, variant: 'error' })
  }

  function insertScheduleEvent(payload) {
    return supabase
      .from('schedule_events')
      .insert({ family_id: fid, ...scheduleEventFields(payload) })
      .select('id')
      .single()
  }

  /** 予定表から予定を消された旅行に、予定を作り直して紐付け直す */
  async function relinkScheduleEvent(tripId, payload) {
    const { data: event, error: eventErr } = await insertScheduleEvent(payload)
    if (eventErr) return eventErr

    const { error } = await supabase
      .from('travel_trips')
      .update({ schedule_event_id: event.id })
      .eq('id', tripId)

    if (error) {
      // 紐付けられなかった予定は残さない
      await supabase.from('schedule_events').delete().eq('id', event.id)
      return error
    }
    return null
  }

  async function createTrip(payload) {
    // 予定を先に作ってから旅行に紐付ける。逆順だと途中で失敗したときに
    // 予定のない旅行が残り、以後の編集が予定へ反映されなくなる
    const { data: event, error: eventErr } = await insertScheduleEvent(payload)

    if (eventErr) throw eventErr

    const { error } = await supabase
      .from('travel_trips')
      .insert({ ...payload, family_id: fid, created_by: familyMember.name, schedule_event_id: event.id })

    if (error) {
      // 旅行を作れなかった予定は残さない
      await supabase.from('schedule_events').delete().eq('id', event.id)
      throw error
    }

    await fetchTrips()
  }

  async function updateTrip(tripId, payload) {
    const trip = trips.find(t => t.id === tripId)

    const { error } = await supabase.from('travel_trips').update(payload).eq('id', tripId)
    if (error) throw error

    if (trip?.schedule_event_id) {
      const { error: eventErr } = await supabase
        .from('schedule_events')
        .update(scheduleEventFields(payload))
        .eq('id', trip.schedule_event_id)
      if (eventErr) {
        console.error('旅行の予定更新エラー:', eventErr)
        notifyFailure('予定表への反映に失敗しました。予定表側の日付をご確認ください。')
      }
    } else {
      const relinkErr = await relinkScheduleEvent(tripId, payload)
      if (relinkErr) {
        console.error('旅行の予定再登録エラー:', relinkErr)
        notifyFailure('予定表への再登録に失敗しました。通信環境を確認してください。')
      }
    }

    await fetchTrips()
  }

  async function deleteTrip(tripId) {
    const trip = trips.find(t => t.id === tripId)

    // 予定から先に消す。旅行の削除に失敗しても、予定だけが取り残されない
    // （schedule_event_id は ON DELETE SET NULL で自動的に外れる）
    if (trip?.schedule_event_id) {
      const { error: eventErr } = await supabase
        .from('schedule_events')
        .delete()
        .eq('id', trip.schedule_event_id)
      if (eventErr) {
        // 予定だけが予定表に取り残されるため、旅行の削除には進まない
        console.error('旅行の予定削除エラー:', eventErr)
        notifyFailure('予定表の予定を削除できなかったため、旅行を削除していません。通信環境を確認してください。')
        return
      }
    }

    const { error } = await supabase.from('travel_trips').delete().eq('id', tripId)
    if (error) {
      console.error('旅行の削除エラー:', error)
      notifyFailure('旅行を削除できませんでした。通信環境を確認してください。')
      return
    }

    setSelectedTripId(null)
    await fetchTrips()
  }

  async function saveActivity(payload) {
    const tripId = activityForm?.activity?.trip_id ?? selectedTripId
    if (!tripId) return

    if (activityForm?.activity) {
      const { error } = await supabase
        .from('travel_activities')
        .update(payload)
        .eq('id', activityForm.activity.id)
      if (error) throw error
    } else {
      const sameDay = (activitiesMap[tripId] ?? []).filter(a => a.day_index === payload.day_index)
      const orderIndex = sameDay.reduce((max, a) => Math.max(max, a.order_index ?? 0), -1) + 1
      const { error } = await supabase
        .from('travel_activities')
        .insert({ ...payload, trip_id: tripId, family_id: fid, order_index: orderIndex })
      if (error) throw error
    }

    setActivityForm(null)
    await fetchTrips()
  }

  async function deleteActivity(activity) {
    setActivityForm(null)
    patchList('activitiesMap', activity.trip_id, list => list.filter(a => a.id !== activity.id))

    const { error } = await supabase.from('travel_activities').delete().eq('id', activity.id)
    if (error) {
      console.error('行程の削除エラー:', error)
      notifyFailure('行程を削除できませんでした。通信環境を確認してください。')
      await fetchTrips()
    }
  }

  async function toggleActivityDone(activity) {
    const done = !activity.done
    patchList('activitiesMap', activity.trip_id, list =>
      list.map(a => (a.id === activity.id ? { ...a, done } : a))
    )

    const { error } = await supabase.from('travel_activities').update({ done }).eq('id', activity.id)
    if (error) {
      console.error('行程の更新エラー:', error)
      patchList('activitiesMap', activity.trip_id, list =>
        list.map(a => (a.id === activity.id ? { ...a, done: !done } : a))
      )
      notifyFailure('チェックを保存できませんでした。通信環境を確認してください。')
    }
  }

  async function reorderActivities(changed) {
    const tripId = changed[0].trip_id
    const previous = activitiesMap[tripId] ?? []
    const changedById = new Map(changed.map(row => [row.id, row]))
    patchList('activitiesMap', tripId, list =>
      list.map(a => changedById.get(a.id) ?? a).sort(byItinerary)
    )

    const { error } = await supabase.from('travel_activities').upsert(changed.map(activityRow))
    if (error) {
      console.error('行程の並び替えエラー:', error)
      patchList('activitiesMap', tripId, () => previous)
      notifyFailure('並び替えを保存できませんでした。通信環境を確認してください。')
    }
  }

  async function addPrepItem({ category, title, assignee }) {
    if (!selectedTripId) return
    const items = prepMap[selectedTripId] ?? []
    const orderIndex = items.reduce((max, item) => Math.max(max, item.order_index ?? 0), -1) + 1

    const { error } = await supabase.from('travel_prep_items').insert({
      trip_id: selectedTripId,
      family_id: fid,
      category,
      title,
      assignee,
      order_index: orderIndex,
    })
    if (error) throw error
    await fetchTrips()
  }

  async function togglePrepItem(item) {
    const done = !item.done
    patchList('prepMap', item.trip_id, list =>
      list.map(i => (i.id === item.id ? { ...i, done } : i))
    )

    const { error } = await supabase.from('travel_prep_items').update({ done }).eq('id', item.id)
    if (error) {
      console.error('準備項目の更新エラー:', error)
      patchList('prepMap', item.trip_id, list =>
        list.map(i => (i.id === item.id ? { ...i, done: !done } : i))
      )
      notifyFailure('チェックを保存できませんでした。通信環境を確認してください。')
    }
  }

  async function deletePrepItem(item) {
    patchList('prepMap', item.trip_id, list => list.filter(i => i.id !== item.id))

    const { error } = await supabase.from('travel_prep_items').delete().eq('id', item.id)
    if (error) {
      console.error('準備項目の削除エラー:', error)
      notifyFailure('削除できませんでした。通信環境を確認してください。')
      await fetchTrips()
    }
  }

  function openNewTrip() {
    setEditingTrip(null)
    setShowTripModal(true)
  }

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <button className={styles.backBtn} onClick={() => navigate('/')} aria-label="ホームへ戻る"><BsHouseFill /></button>
        <span className={styles.title}><IconTravel className={styles.titleIcon} /> 旅行計画・記録</span>
        <button className={styles.addBtn} onClick={openNewTrip}>＋ 新しい旅行</button>
      </header>

      {trips.length > 0 && (
        <div className={styles.filterBar}>
          <select
            className={styles.prefectureFilter}
            value={prefectureFilter}
            onChange={e => setPrefectureFilter(e.target.value)}
            aria-label="都道府県で絞り込む"
          >
            <option value="all">すべての都道府県</option>
            {PREFECTURES.map(pref => (
              <option key={pref} value={pref}>{pref}</option>
            ))}
          </select>
          <button
            className={styles.mapToggleBtn}
            onClick={() => setShowMap(v => !v)}
            aria-pressed={showMap}
          >
            <IconMap /> {showMap ? '地図を隠す' : '地図で見る'}
          </button>
        </div>
      )}

      {trips.length > 0 && (
        <MapPanel
          visited={visitedPrefectures}
          selected={prefectureFilter === 'all' ? null : prefectureFilter}
          onSelect={pref => setPrefectureFilter(pref ?? 'all')}
          open={showMap}
          onOpenChange={setShowMap}
        />
      )}

      <main className={styles.main}>
        {loading ? (
          <LoadingSpinner inline />
        ) : loadError ? (
          <ErrorNotice onRetry={fetchTrips} />
        ) : trips.length === 0 ? (
          <div className={styles.empty}>
            <span className={styles.emptyIcon}><IconTravel /></span>
            <p>旅行の計画・記録がありません</p>
            <button className={styles.emptyAddBtn} onClick={openNewTrip}>
              最初の旅行を計画する
            </button>
          </div>
        ) : sections.length === 0 ? (
          <div className={styles.empty}>
            <p>{prefectureFilter}の旅行がありません</p>
          </div>
        ) : (
          sections.map(section => (
            <section key={section.key} className={styles.section}>
              <h2 className={styles.sectionTitle}>{section.title}</h2>
              <div className={styles.tripList}>
                {section.trips.map(trip => (
                  <TripCard
                    key={trip.id}
                    trip={trip}
                    activities={activitiesMap[trip.id] ?? []}
                    prepItems={prepMap[trip.id] ?? []}
                    onClick={() => setSelectedTripId(trip.id)}
                  />
                ))}
              </div>
            </section>
          ))
        )}
      </main>

      {selectedTrip && (
        <TripDetailModal
          trip={selectedTrip}
          activities={(activitiesMap[selectedTrip.id] ?? []).slice().sort(byItinerary)}
          prepItems={prepMap[selectedTrip.id] ?? []}
          members={members}
          placeIndex={placeIndex}
          onAddActivity={day => setActivityForm({ activity: null, defaultDay: day })}
          onEditActivity={activity => setActivityForm({ activity, defaultDay: activity.day_index ?? 0 })}
          onToggleActivityDone={toggleActivityDone}
          onReorderActivities={reorderActivities}
          onAddPrep={addPrepItem}
          onTogglePrep={togglePrepItem}
          onDeletePrep={deletePrepItem}
          onEdit={() => { setEditingTrip(selectedTrip); setShowTripModal(true) }}
          onDelete={() => setDeleteConfirmId(selectedTrip.id)}
          onClose={() => setSelectedTripId(null)}
        />
      )}

      {activityForm && selectedTrip && (
        <ActivityFormModal
          activity={activityForm.activity}
          dayDates={tripDates(selectedTrip.start_date, selectedTrip.end_date)}
          defaultDay={activityForm.defaultDay}
          wishPlaces={wishPlaces}
          onSave={saveActivity}
          onDelete={activityForm.activity ? () => deleteActivity(activityForm.activity) : undefined}
          onClose={() => setActivityForm(null)}
        />
      )}

      {showTripModal && (
        <TripFormModal
          trip={editingTrip}
          members={members}
          onClose={() => setShowTripModal(false)}
          onSave={async payload => {
            if (editingTrip) await updateTrip(editingTrip.id, payload)
            else await createTrip(payload)
            setShowTripModal(false)
          }}
        />
      )}

      <ConfirmDialog
        open={!!deleteConfirmId}
        title="旅行を削除しますか？"
        message="この旅行の準備リストと行程がすべて削除されます。この操作は取り消せません。"
        confirmLabel="削除する"
        onConfirm={() => { const id = deleteConfirmId; setDeleteConfirmId(null); deleteTrip(id) }}
        onCancel={() => setDeleteConfirmId(null)}
      />

      {toast && (
        <Toast
          message={toast.message}
          variant={toast.variant}
          onClose={() => setToast(null)}
        />
      )}

      <BottomNav />
    </div>
  )
}

function TripCard({ trip, activities, prepItems, onClick }) {
  const phase = tripPhase(trip)
  const donePrep = prepItems.filter(item => item.done).length
  const doneActivities = activities.filter(a => a.done).length

  return (
    <div className={styles.card} onClick={onClick} role="button" tabIndex={0}
      onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick() } }}
    >
      <div className={styles.cardHeader}>
        <div className={styles.cardDate}>
          {shortDate(trip.start_date)} 〜 {shortDate(trip.end_date)}
        </div>
        {trip.prefecture && <span className={styles.prefBadge}>{trip.prefecture}</span>}
      </div>
      <div className={styles.cardTitle}>{trip.title}</div>
      <div className={styles.cardMeta}>
        <span className={styles.phaseChip} data-phase={phase}>{PHASES[phase].label}</span>
        <span className={styles.metaChip}>行程 {doneActivities}/{activities.length}</span>
        <span className={styles.metaChip}>準備 {donePrep}/{prepItems.length}</span>
      </div>
    </div>
  )
}
