import { useId, useMemo, useState } from 'react'
import Modal from '../Modal'
import ItineraryList from './ItineraryList'
import PrepList from './PrepList'
import { IconPin, IconTravel } from '../../lib/icons'
import { MEMBER_COLORS, mapsUrl } from '../../lib/schedule'
import { PHASES, dateRange, daysUntil, formatYen, partySize, tripDates, tripPhase } from '../../lib/travel'
import styles from './Travel.module.css'

const TABS = [
  { key: 'overview', label: '概要' },
  { key: 'prep', label: '準備' },
  { key: 'plan', label: '行程' },
]

/**
 * 旅行の詳細。概要（計画情報・費用）/ 準備（持ち物・やること）/ 行程 を
 * タブで切り替え、準備から当日の実行までを 1 つのモーダルで扱う。
 */
export default function TripDetailModal({
  trip,
  activities,
  prepItems,
  members,
  placeIndex,
  onAddActivity,
  onEditActivity,
  onToggleActivityDone,
  onReorderActivities,
  onAddPrep,
  onTogglePrep,
  onDeletePrep,
  onEdit,
  onDelete,
  onClose,
}) {
  const [tab, setTab] = useState('overview')
  const tabId = useId()

  const dayDates = useMemo(() => tripDates(trip.start_date, trip.end_date), [trip.start_date, trip.end_date])
  const spent = activities.reduce((sum, a) => sum + (Number(a.cost) || 0), 0)
  const budget = Number(trip.budget) || 0
  const overBudget = budget > 0 && spent > budget
  const usedPercent = budget > 0 ? Math.min(100, Math.round((spent / budget) * 100)) : 0
  const phase = tripPhase(trip)
  const untilStart = daysUntil(trip.start_date)
  const doneActivities = activities.filter(a => a.done).length
  // 家族を抜けたメンバーの ID は解決できないので表示から落ちる
  const companionMembers = (trip.companion_member_ids ?? [])
    .map(id => {
      const index = members.findIndex(member => member.id === id)
      return index < 0 ? null : { ...members[index], color: MEMBER_COLORS[index % MEMBER_COLORS.length] }
    })
    .filter(Boolean)
  const hasCompanions = companionMembers.length > 0 || !!trip.companions
  // 参加人数は同行者（メンバー + 家族以外）から数える
  const headcount = partySize(trip)
  const lodgingQuery = trip.lodging_lat != null && trip.lodging_lng != null
    ? `${trip.lodging_lat},${trip.lodging_lng}`
    : (trip.lodging_address || trip.lodging)
  const donePrep = prepItems.filter(item => item.done).length

  return (
    <Modal open onClose={onClose} title={trip.title} variant="sheet" size="lg">
      <div className={styles.body}>
        <div className={styles.summary}>
          <div className={styles.summaryDate}>{dateRange(trip.start_date, trip.end_date)}</div>
          <div className={styles.summaryMeta}>
            <span className={styles.phaseBadge}>{PHASES[phase].label}</span>
            {trip.prefecture && <span><IconPin /> {trip.prefecture}</span>}
            <span>{dayDates.length}日間</span>
            {untilStart != null && <span>あと{untilStart}日</span>}
          </div>
        </div>

        <div className={styles.tabs} role="tablist">
          {TABS.map(item => (
            <button
              key={item.key}
              type="button"
              role="tab"
              id={`${tabId}-${item.key}`}
              aria-selected={tab === item.key}
              aria-controls={`${tabId}-panel`}
              className={`${styles.tab} ${tab === item.key ? styles.tabActive : ''}`}
              onClick={() => setTab(item.key)}
            >
              {item.label}
              {item.key === 'prep' && prepItems.length > 0 && (
                <span className={styles.tabBadge}>{donePrep}/{prepItems.length}</span>
              )}
              {item.key === 'plan' && activities.length > 0 && (
                <span className={styles.tabBadge}>{doneActivities}/{activities.length}</span>
              )}
            </button>
          ))}
        </div>

        <div id={`${tabId}-panel`} role="tabpanel" aria-labelledby={`${tabId}-${tab}`} className={styles.panel}>
        {tab === 'overview' && (
          <>
            <div className={styles.infoList}>
              <div className={styles.infoRow}>
                <span className={styles.infoLabel}>同行者</span>
                <span className={styles.infoValue}>
                  {hasCompanions ? (
                    <span className={styles.memberTags}>
                      {companionMembers.map(member => (
                        <span key={member.id} className={styles.memberTag}>
                          <span className={styles.memberDot} style={{ background: member.color }} />
                          {member.name || 'メンバー'}
                        </span>
                      ))}
                      {trip.companions && <span>{trip.companions}</span>}
                    </span>
                  ) : '未設定'}
                </span>
              </div>
              <div className={styles.infoRow}>
                <span className={styles.infoLabel}>交通手段</span>
                <span className={styles.infoValue}>{trip.transport || '未設定'}</span>
              </div>
              <div className={styles.infoRow}>
                <span className={styles.infoLabel}>宿泊先</span>
                <span className={styles.infoValue}>
                  {trip.lodging || '未設定'}
                  {trip.lodging_address && <span className={styles.infoSub}>{trip.lodging_address}</span>}
                  {trip.lodging && (
                    <a
                      className={styles.mapLink}
                      href={mapsUrl(lodgingQuery)}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      <IconPin /> 地図で開く
                    </a>
                  )}
                </span>
              </div>
              <div className={styles.infoRow}>
                <span className={styles.infoLabel}>メモ</span>
                <span className={styles.infoValue}>{trip.memo || '未設定'}</span>
              </div>
              <div className={styles.infoRow}>
                <span className={styles.infoLabel}>予定表</span>
                <span className={styles.infoValue}>
                  {trip.schedule_event_id ? <><IconTravel /> 登録済み</> : '未登録'}
                </span>
              </div>
            </div>

            <div className={styles.costCard}>
              <div className={styles.costRow}>
                <span>予算</span>
                <span className={styles.costValue}>{budget > 0 ? formatYen(budget) : '未設定'}</span>
              </div>
              <div className={styles.costRow}>
                <span>行程の費用合計</span>
                <span className={`${styles.costValue} ${overBudget ? styles.costOver : ''}`}>{formatYen(spent)}</span>
              </div>
              {budget > 0 && (
                <>
                  <div
                    className={styles.meter}
                    role="progressbar"
                    aria-valuenow={usedPercent}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-label="予算の使用状況"
                  >
                    <div
                      className={`${styles.meterFill} ${overBudget ? styles.meterFillOver : ''}`}
                      style={{ width: `${usedPercent}%` }}
                    />
                  </div>
                  <div className={styles.costRow}>
                    <span>{overBudget ? '予算オーバー' : '残り'}</span>
                    <span className={`${styles.costValue} ${overBudget ? styles.costOver : ''}`}>
                      {formatYen(Math.abs(budget - spent))}
                    </span>
                  </div>
                </>
              )}
              {headcount > 0 && (
                <>
                  {budget > 0 && (
                    <div className={styles.costRow}>
                      <span>1人あたり予算（{headcount}人）</span>
                      <span className={styles.costValue}>{formatYen(budget / headcount)}</span>
                    </div>
                  )}
                  <div className={styles.costRow}>
                    <span>1人あたり費用（{headcount}人）</span>
                    <span className={styles.costValue}>{formatYen(spent / headcount)}</span>
                  </div>
                </>
              )}
            </div>

            <p className={styles.hint}>{PHASES[phase].hint}</p>

            <div className={styles.actionBtns}>
              <button className={styles.editBtn} onClick={onEdit}>編集</button>
              <button className={styles.deleteBtn} onClick={onDelete}>削除</button>
            </div>
          </>
        )}

        {tab === 'prep' && (
          <PrepList
            items={prepItems}
            onAdd={onAddPrep}
            onToggle={onTogglePrep}
            onDelete={onDeletePrep}
          />
        )}

        {tab === 'plan' && (
          <ItineraryList
            dayDates={dayDates}
            activities={activities}
            onAdd={onAddActivity}
            onEdit={onEditActivity}
            onToggleDone={onToggleActivityDone}
            onReorder={onReorderActivities}
            placeIndex={placeIndex}
          />
        )}
        </div>
      </div>
    </Modal>
  )
}
