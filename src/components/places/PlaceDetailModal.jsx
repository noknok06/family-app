import {
  IconPin, IconSearch, IconStar, IconStarFill, IconCheckCircle,
  IconReview, IconExternal,
} from '../../lib/icons'
import Modal from '../Modal'
import PlacePhoto from './PlacePhoto'
import styles from './PlaceDetailModal.module.css'

function Stars({ value = 0, max = 5 }) {
  return (
    <span className={styles.stars} aria-label={`評価 ${value} / ${max}`}>
      {Array.from({ length: max }, (_, i) =>
        i < value ? <IconStarFill key={i} /> : <IconStar key={i} />
      )}
    </span>
  )
}

/**
 * お出かけリストの場所詳細（読み取り専用）。
 * 一覧のカードをタップしたときに開き、ここから編集・訪問記録・地図・Web 検索へ進む。
 *
 * props:
 *   place            : wish_places の 1 行
 *   category         : CATEGORIES のエントリ（{ label, icon }）
 *   subcategoryLabel : サブカテゴリの表示名（なければ null）
 *   onEdit / onVisit / onSearchTitle / onClose
 */
export default function PlaceDetailModal({
  place, category, subcategoryLabel, onEdit, onVisit, onSearchTitle, onClose,
}) {
  const isVisited = place.status === 'visited'
  const CategoryIcon = category.icon
  const mapUrl = `https://www.google.com/maps/search/${encodeURIComponent(place.address || place.name)}`

  return (
    <Modal open onClose={onClose} title="場所の詳細">
      <div className={styles.body}>
        <PlacePhoto
          variant="detail"
          name={place.name}
          address={place.address}
          lat={place.lat}
          lng={place.lng}
          Icon={CategoryIcon}
        />

        <div className={styles.badges}>
          <span className={styles.categoryBadge}><CategoryIcon /> {category.label}</span>
          {subcategoryLabel && <span className={styles.subBadge}>{subcategoryLabel}</span>}
          {isVisited
            ? <span className={styles.visitedBadge}><IconCheckCircle /> 行った</span>
            : <span className={styles.wantBadge}><IconStarFill /> 行きたい</span>
          }
          {place._distanceKm != null && (
            <span className={styles.distanceBadge}><IconPin /> {place._distanceKm.toFixed(1)}km</span>
          )}
        </div>

        <h3 className={styles.name}>{place.name}</h3>

        <div className={styles.quickActions}>
          <a
            className={styles.quickBtn}
            href={mapUrl}
            target="_blank"
            rel="noopener noreferrer"
          ><IconPin /> 地図で開く <IconExternal className={styles.quickBtnIcon} aria-hidden="true" /></a>
          <button type="button" className={styles.quickBtn} onClick={onSearchTitle}>
            <IconSearch /> Web検索
          </button>
        </div>

        <dl className={styles.detailList}>
          {place.address && (
            <div className={styles.detailItem}>
              <dt className={styles.detailLabel}>住所</dt>
              <dd className={styles.detailValue}>{place.address}</dd>
            </div>
          )}
          {place.tags?.length > 0 && (
            <div className={styles.detailItem}>
              <dt className={styles.detailLabel}>タグ</dt>
              <dd className={styles.detailValue}>
                <div className={styles.tags}>
                  {place.tags.map(t => <span key={t} className={styles.tagPill}>#{t}</span>)}
                </div>
              </dd>
            </div>
          )}
          {place.memo && (
            <div className={styles.detailItem}>
              <dt className={styles.detailLabel}>メモ</dt>
              <dd className={styles.detailValue}>{place.memo}</dd>
            </div>
          )}
          {isVisited && place.visited_at && (
            <div className={styles.detailItem}>
              <dt className={styles.detailLabel}>訪問日</dt>
              <dd className={styles.detailValue}>
                {new Date(place.visited_at).toLocaleDateString('ja-JP', { year: 'numeric', month: 'long', day: 'numeric' })}
              </dd>
            </div>
          )}
          {isVisited && place.rating && (
            <div className={styles.detailItem}>
              <dt className={styles.detailLabel}>評価</dt>
              <dd className={styles.detailValue}><Stars value={place.rating} /></dd>
            </div>
          )}
          {isVisited && place.review && (
            <div className={styles.detailItem}>
              <dt className={styles.detailLabel}>感想</dt>
              <dd className={styles.detailValue}><IconReview className={styles.reviewIcon} /> {place.review}</dd>
            </div>
          )}
          {place.added_by_member?.name && (
            <div className={styles.detailItem}>
              <dt className={styles.detailLabel}>追加した人</dt>
              <dd className={styles.detailValue}>{place.added_by_member.name}</dd>
            </div>
          )}
        </dl>

        {!isVisited && (
          <button type="button" className={styles.visitBtn} onClick={onVisit}>
            <IconCheckCircle /> 行った！を記録する
          </button>
        )}
      </div>

      <div className={styles.footerBtns}>
        <button type="button" className={styles.cancelBtn} onClick={onClose}>閉じる</button>
        <button type="button" className={styles.editBtn} onClick={onEdit}>編集</button>
      </div>
    </Modal>
  )
}
