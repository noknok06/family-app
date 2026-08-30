import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { BsHouseFill } from 'react-icons/bs'
import {
  IconPlaces, IconSearch, IconFilter, IconList, IconMap, IconPin, IconPinFill,
  IconSparkle, IconDice, IconStar, IconStarFill, IconCheckCircle, IconReview,
  IconBroadcast, IconFood, IconPlay, IconMore, IconClose, IconExternal,
  IconRamen, IconCafe, IconNightview, IconDate, IconKids, IconRainy,
  IconDrive, IconYakiniku, IconSweets, IconPark, IconOnsen, IconAnniversary,
  IconIzakaya, IconSea, IconFlower, IconMovie, IconShopBag, IconCamera,
  IconView, IconMoney, IconCheck,
} from '../lib/icons'
import { supabase } from '../lib/supabase'
import { useFamilyData, unwrap } from '../hooks/useFamilyData'
import { useAuth } from '../contexts/AuthContext'
import { loadGoogleMapsScript } from '../utils/googleMaps'
import ConfirmDialog from '../components/ConfirmDialog'
import BottomNav from '../components/BottomNav'
import LoadingSpinner from '../components/LoadingSpinner'
import ErrorNotice from '../components/ErrorNotice'
import Toast from '../components/Toast'
import Modal from '../components/Modal'
import PlaceDetailModal from '../components/places/PlaceDetailModal'
import PlacePhoto from '../components/places/PlacePhoto'
import PlaceSearchInput from '../components/PlaceSearchInput'
import styles from './PlacesPage.module.css'


const CATEGORIES = {
  food: {
    label: 'グルメ',
    icon: IconFood,
    subs: [
      { key: 'yakiniku', label: '焼肉・焼き鳥' },
      { key: 'ramen', label: 'ラーメン・麺類' },
      { key: 'sushi', label: '寿司・海鮮' },
      { key: 'izakaya', label: '居酒屋・和食' },
      { key: 'cafe', label: 'カフェ・喫茶' },
      { key: 'sweets', label: 'スイーツ・パン' },
      { key: 'italian', label: 'イタリアン・洋食' },
      { key: 'chinese', label: '中華・アジア料理' },
      { key: 'other_food', label: 'その他グルメ' },
    ],
  },
  play: {
    label: '遊び',
    icon: IconPlay,
    subs: [
      { key: 'nature', label: '自然・公園' },
      { key: 'shopping', label: 'ショッピング' },
      { key: 'amusement', label: '遊園地・レジャー' },
      { key: 'culture', label: '文化・観光' },
      { key: 'sports', label: 'スポーツ・体験' },
      { key: 'other_play', label: 'その他遊び' },
    ],
  },
  other: {
    label: 'その他',
    icon: IconMore,
    subs: [],
  },
}

function getSubcategoryLabel(category, subcategory) {
  const cat = CATEGORIES[category]
  if (!cat || !subcategory) return null
  const sub = cat.subs.find(s => s.key === subcategory)
  return sub?.label ?? null
}

// 「今日はどこ行く？」で使う目的別タグのプリセット
const PRESET_TAGS = [
  { label: 'ラーメン', icon: IconRamen },
  { label: 'カフェ', icon: IconCafe },
  { label: '焼肉', icon: IconYakiniku },
  { label: '居酒屋', icon: IconIzakaya },
  { label: 'スイーツ', icon: IconSweets },
  { label: 'デート', icon: IconDate },
  { label: '記念日', icon: IconAnniversary },
  { label: '夜景', icon: IconNightview },
  { label: '絶景', icon: IconView },
  { label: '写真映え', icon: IconCamera },
  { label: '子供と遊べる', icon: IconKids },
  { label: '公園', icon: IconPark },
  { label: '海・ビーチ', icon: IconSea },
  { label: '花見', icon: IconFlower },
  { label: '紅葉', icon: IconFlower },
  { label: '温泉', icon: IconOnsen },
  { label: 'ドライブ', icon: IconDrive },
  { label: '映画', icon: IconMovie },
  { label: 'ショッピング', icon: IconShopBag },
  { label: '雨の日', icon: IconRainy },
  { label: 'コスパ良し', icon: IconMoney },
]

// タグに対応するアイコンコンポーネントを返す（プリセット外は汎用タグアイコン）
function TagIcon({ label, ...props }) {
  const Icon = PRESET_TAGS.find(t => t.label === label)?.icon ?? IconMore
  return <Icon {...props} />
}

// 評価の星表示（塗り＋枠でシンプルに）
function StarRating({ value = 0, max = 5 }) {
  return (
    <span className={styles.stars} aria-label={`評価 ${value} / ${max}`}>
      {Array.from({ length: max }, (_, i) =>
        i < value ? <IconStarFill key={i} /> : <IconStar key={i} />
      )}
    </span>
  )
}

// 地図マーカー用のアイコン（Google Maps の DOM 要素に流し込むため SVG 文字列で保持）
const MAP_PIN_SVG =
  '<svg viewBox="0 0 16 16" width="1em" height="1em" fill="currentColor" xmlns="http://www.w3.org/2000/svg"><path d="M8 16s6-5.686 6-10A6 6 0 0 0 2 6c0 4.314 6 10 6 10m0-7a3 3 0 1 1 0-6 3 3 0 0 1 0 6"/></svg>'
const MAP_PIN_VISITED_SVG =
  '<svg viewBox="0 0 16 16" width="1em" height="1em" fill="currentColor" xmlns="http://www.w3.org/2000/svg"><path d="M16 8A8 8 0 1 1 0 8a8 8 0 0 1 16 0m-3.97-3.03a.75.75 0 0 0-1.08.022L7.477 9.417 5.384 7.323a.75.75 0 0 0-1.06 1.06L6.97 11.03a.75.75 0 0 0 1.079-.02l3.992-4.99a.75.75 0 0 0-.01-1.05z"/></svg>'

function haversineKm(lat1, lng1, lat2, lng2) {
  const R = 6371
  const dLat = (lat2 - lat1) * Math.PI / 180
  const dLng = (lng2 - lng1) * Math.PI / 180
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

export default function PlacesPage() {
  const { familyMember } = useAuth()
  const navigate = useNavigate()
  const [statusFilter, setStatusFilter] = useState('all')   // 'all'|'want'|'visited'
  const [categoryFilter, setCategoryFilter] = useState('all')
  const [subcategoryFilter, setSubcategoryFilter] = useState('all')
  const [selectedTags, setSelectedTags] = useState([])
  const [searchQuery, setSearchQuery] = useState('')
  const [showAdd, setShowAdd] = useState(false)
  const [visitTarget, setVisitTarget] = useState(null)      // place object
  const [detailTarget, setDetailTarget] = useState(null)    // place object
  const [editTarget, setEditTarget] = useState(null)        // place object
  const [searchTitle, setSearchTitle] = useState(null)      // タイトルの簡易Web検索（文字列）
  const [toast, setToast] = useState(null)                  // { message, variant }
  const [view, setView] = useState('list')                  // 'list' | 'map'
  const [showRadiusSearch, setShowRadiusSearch] = useState(false)
  const [radiusCenter, setRadiusCenter] = useState(null)    // { lat, lng, address }
  const [radiusKm, setRadiusKm] = useState(5)
  const [prefectureFilter, setPrefectureFilter] = useState('')
  const [recommendPlace, setRecommendPlace] = useState(null)
  const [showFilters, setShowFilters] = useState(false)

  const {
    data: { places, members },
    loading,
    error: loadError,
    refetch: fetchAll,
  } = useFamilyData(
    async familyId => {
      const [places, members] = await Promise.all([
        unwrap(
          supabase.from('wish_places')
            .select('*, added_by_member:family_members!wish_places_added_by_fkey(id, name)')
            .eq('family_id', familyId).order('created_at', { ascending: false })
        ),
        unwrap(supabase.from('family_members').select('id, name').eq('family_id', familyId)),
      ])
      return { places, members }
    },
    ['wish_places'],
    { places: [], members: [] },
  )

  // Google Maps スクリプトをページロード時に事前読み込み
  useEffect(() => { loadGoogleMapsScript().catch(() => {}) }, [])

  // 「今日はここ！」のおすすめ場所を維持・再抽選
  useEffect(() => {
    setRecommendPlace(prev => {
      const pool = places.filter(p => p.status === 'want')
      if (prev && pool.some(p => p.id === prev.id)) return prev
      if (pool.length === 0) return null
      return pool[Math.floor(Math.random() * pool.length)]
    })
  }, [places])

  async function handleAdd({ name, category, memo, address, lat, lng, tags }) {
    const { error } = await supabase.from('wish_places').insert({
      family_id: familyMember.family_id,
      name: name.trim(),
      category,
      memo: memo?.trim() || null,
      address: address?.trim() || null,
      lat: lat ?? null,
      lng: lng ?? null,
      tags: tags ?? [],
      added_by: familyMember.id,
    })
    if (error) { console.error('wish_places insert failed:', error); setToast({ message: '場所の保存に失敗しました。', variant: 'error' }); throw error }
    await fetchAll()
  }

  async function handleVisit(id, { visitedAt, rating, review }) {
    await supabase.from('wish_places').update({
      status: 'visited',
      visited_at: visitedAt || null,
      rating: rating || null,
      review: review?.trim() || null,
    }).eq('id', id)
    await fetchAll()
  }

  async function handleEdit(id, { name, category, memo, address, lat, lng, tags }) {
    const { error } = await supabase.from('wish_places').update({
      name: name.trim(),
      category,
      memo: memo?.trim() || null,
      address: address?.trim() || null,
      lat: lat ?? null,
      lng: lng ?? null,
      tags: tags ?? [],
    }).eq('id', id)
    if (error) { console.error('wish_places update failed:', error); setToast({ message: '場所の更新に失敗しました。', variant: 'error' }); throw error }
    await fetchAll()
  }

  async function handleDelete(id) {
    await supabase.from('wish_places').delete().eq('id', id)
    await fetchAll()
  }

  // 都道府県抽出（「日本、〒100-0005 東京都…」形式にも対応）
  function extractPrefecture(address) {
    if (!address) return null
    // 数字・〒・記号を除いた日本語文字列＋都道府県の組み合わせを探す
    const m = address.match(/([^\s,、\d〒\-]+[都道府県])/)
    return m ? m[1] : null
  }

  const availablePrefectures = [...new Set(
    places.map(p => extractPrefecture(p.address)).filter(Boolean)
  )].sort()

  // タグ頻度からよく使うタグ上位を抽出（絞り込みチップ用）
  const tagFrequency = {}
  places.forEach(p => (p.tags || []).forEach(t => { tagFrequency[t] = (tagFrequency[t] || 0) + 1 }))
  const topTags = Object.entries(tagFrequency).sort((a, b) => b[1] - a[1]).map(([t]) => t).slice(0, 16)
  const tagSuggestions = [...new Set([...PRESET_TAGS.map(t => t.label), ...topTags])]

  // フィルタリング
  const q = searchQuery.trim().toLowerCase()
  const radiusActive = showRadiusSearch && radiusCenter != null
  let filtered = places.filter(p => {
    if (statusFilter !== 'all' && p.status !== statusFilter) return false
    if (categoryFilter !== 'all' && p.category !== categoryFilter) return false
    if (subcategoryFilter !== 'all' && p.subcategory !== subcategoryFilter) return false
    if (q) {
      const inName    = p.name?.toLowerCase().includes(q)
      const inAddress = p.address?.toLowerCase().includes(q)
      const inMemo    = p.memo?.toLowerCase().includes(q)
      const inTags    = (p.tags || []).some(t => t.toLowerCase().includes(q))
      if (!inName && !inAddress && !inMemo && !inTags) return false
    }
    if (selectedTags.length > 0) {
      const tags = p.tags || []
      if (!selectedTags.every(t => tags.includes(t))) return false
    }
    if (prefectureFilter && extractPrefecture(p.address) !== prefectureFilter) return false
    if (radiusActive) {
      if (p.lat == null || p.lng == null) return false
      if (haversineKm(radiusCenter.lat, radiusCenter.lng, p.lat, p.lng) > radiusKm) return false
    }
    return true
  })

  // 範囲検索が有効な間は、現在地（起点）に近い順に並べ替え、各カードに距離を持たせる
  if (radiusActive) {
    filtered = filtered
      .map(p => ({ ...p, _distanceKm: haversineKm(radiusCenter.lat, radiusCenter.lng, p.lat, p.lng) }))
      .sort((a, b) => a._distanceKm - b._distanceKm)
  }

  // 検索・絞り込みが何も効いていない「ブラウズ中」かどうか（探索導線を出す条件）
  const isBrowsing = statusFilter !== 'visited' && !q && selectedTags.length === 0 &&
    categoryFilter === 'all' && !prefectureFilter && !radiusActive

  // 検索語や絞り込み条件が何かしら効いているか（結果一覧の見出し切り替え用）
  const narrowingActive = !!q || selectedTags.length > 0 ||
    categoryFilter !== 'all' || !!prefectureFilter || radiusActive
  const statusLabel = statusFilter === 'want' ? '行きたい場所' : statusFilter === 'visited' ? '行った場所' : 'すべての場所'

  // 折りたたみ絞り込みパネルの中で有効になっている条件の数（バッジ表示用）
  const activeFilterCount =
    (categoryFilter !== 'all' ? 1 : 0) +
    (prefectureFilter ? 1 : 0) +
    selectedTags.length +
    (radiusActive ? 1 : 0)

  function clearAllFilters() {
    setCategoryFilter('all')
    setPrefectureFilter('')
    setSelectedTags([])
    setShowRadiusSearch(false)
    setRadiusCenter(null)
  }

  function clearSearchAndFilters() {
    setSearchQuery('')
    clearAllFilters()
  }

  // 「現在地から近い場所を探す」→ 既存の範囲検索フィルタに現在地をセットし、検索結果として一覧表示する
  // 絞り込みパネル自体は開かない（開くと結果一覧の表示領域が圧迫されるため。必要なら「絞り込み」から確認・調整できる）
  function handleNearbyLocate({ lat, lng }) {
    setRadiusCenter({ lat, lng, address: '現在地' })
    setShowRadiusSearch(true)
  }

  const wantPlaces = places.filter(p => p.status === 'want')
  const recentPlaces = places.slice(0, 6)

  // 詳細モーダルは開いている間に Realtime 更新が来ても最新の内容を映す（距離は開いた時の値を保持）
  const latestDetail = detailTarget ? places.find(p => p.id === detailTarget.id) : null
  const detailPlace = latestDetail
    ? { ...latestDetail, _distanceKm: detailTarget._distanceKm }
    : detailTarget

  function toggleTag(t) {
    setSelectedTags(prev => prev.includes(t) ? prev.filter(x => x !== t) : [...prev, t])
  }

  function handleDiscoverTagSelect(label) {
    setSelectedTags(prev => (prev.length === 1 && prev[0] === label) ? [] : [label])
  }

  function handleReroll() {
    setRecommendPlace(prev => {
      const others = wantPlaces.filter(p => p.id !== prev?.id)
      const pool = others.length ? others : wantPlaces
      if (!pool.length) return null
      return pool[Math.floor(Math.random() * pool.length)]
    })
  }

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <button className={styles.backBtn} onClick={() => navigate('/')} aria-label="ホームへ戻る">
          <BsHouseFill />
        </button>
        <h1 className={styles.headerTitle}><IconPlaces className={styles.headerTitleIcon} /> お出かけリスト</h1>
        <button className={styles.addBtn} onClick={() => setShowAdd(true)}>＋ 追加</button>
      </header>

      {/* ステータスタブ */}
      <div className={styles.statusTabs}>
        {[['all', 'すべて'], ['want', '行きたい'], ['visited', '行った']].map(([v, label]) => (
          <button
            key={v}
            className={`${styles.statusTab} ${statusFilter === v ? styles.statusTabActive : ''}`}
            onClick={() => setStatusFilter(v)}
          >{label}</button>
        ))}
      </div>

      {/* 検索 + 絞り込みトグル + ビュー切り替え（1 行に集約） */}
      <div className={styles.searchBar}>
        <div className={styles.searchWrapper}>
          <span className={styles.searchIcon}><IconSearch /></span>
          <input
            className={styles.searchInput}
            type="search"
            placeholder="場所名・タグ・住所で検索"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
          />
          {searchQuery && (
            <button className={styles.searchClear} onClick={() => setSearchQuery('')} aria-label="クリア">×</button>
          )}
        </div>
        <button
          className={`${styles.filterToggleBtn} ${(showFilters || activeFilterCount > 0) ? styles.filterToggleBtnActive : ''}`}
          onClick={() => setShowFilters(v => !v)}
          aria-expanded={showFilters}
          aria-label="絞り込み"
        >
          <span className={styles.filterToggleIcon}><IconFilter /></span>
          <span className={styles.filterToggleLabel}>絞り込み</span>
          {activeFilterCount > 0 && <span className={styles.filterCountBadge}>{activeFilterCount}</span>}
        </button>
        <div className={styles.viewToggle}>
          <button
            className={`${styles.viewBtn} ${view === 'list' ? styles.viewBtnActive : ''}`}
            onClick={() => setView('list')}
            aria-label="リスト表示"
            title="リスト"
          ><IconList /></button>
          <button
            className={`${styles.viewBtn} ${view === 'map' ? styles.viewBtnActive : ''}`}
            onClick={() => setView('map')}
            aria-label="地図表示"
            title="地図"
          ><IconMap /></button>
        </div>
      </div>

      {/* 絞り込みパネル（「絞り込み」ボタンで開閉） */}
      {showFilters && (
        <div className={styles.filterPanel}>
          <div className={styles.filterPanelHeader}>
            <span className={styles.filterPanelTitle}>絞り込み条件</span>
            {activeFilterCount > 0 && (
              <button type="button" className={styles.filterClearBtn} onClick={clearAllFilters}>
                すべて解除
              </button>
            )}
          </div>

          <div className={styles.filterPanelActions}>
            <button
              type="button"
              className={`${styles.radiusToggleBtn} ${showRadiusSearch ? styles.radiusToggleBtnActive : ''}`}
              onClick={() => setShowRadiusSearch(v => !v)}
              aria-expanded={showRadiusSearch}
            >
              <span className={styles.radiusToggleIcon}><IconPin /></span>
              <span className={styles.radiusToggleLabel}>範囲で探す</span>
              {radiusActive && <span className={styles.radiusActiveDot} />}
            </button>
          </div>

          {showRadiusSearch && (
            <RadiusSearchPanel
              center={radiusCenter}
              radiusKm={radiusKm}
              onCenterChange={setRadiusCenter}
              onRadiusChange={setRadiusKm}
              matchCount={radiusActive ? filtered.length : null}
            />
          )}

          <div className={styles.categoryChips}>
            <button
              className={`${styles.chip} ${categoryFilter === 'all' ? styles.chipActive : ''}`}
              onClick={() => { setCategoryFilter('all'); setSubcategoryFilter('all') }}
            >すべて</button>
            {Object.entries(CATEGORIES).map(([key, { label, icon: Icon }]) => (
              <button
                key={key}
                className={`${styles.chip} ${categoryFilter === key ? styles.chipActive : ''}`}
                onClick={() => { setCategoryFilter(key); setSubcategoryFilter('all') }}
              ><Icon className={styles.chipIcon} /> {label}</button>
            ))}
            {availablePrefectures.length > 0 && (
              <select
                className={`${styles.prefectureSelect} ${prefectureFilter ? styles.prefectureSelectActive : ''}`}
                value={prefectureFilter}
                onChange={e => setPrefectureFilter(e.target.value)}
                aria-label="都道府県で絞り込む"
              >
                <option value="">都道府県</option>
                {availablePrefectures.map(pref => (
                  <option key={pref} value={pref}>{pref}</option>
                ))}
              </select>
            )}
          </div>

          {/* Subcategory chips (only show when a category is selected) */}
          {categoryFilter !== 'all' && CATEGORIES[categoryFilter]?.subs.length > 0 && (
            <div className={styles.subcategoryChips}>
              <button
                className={`${styles.chip} ${subcategoryFilter === 'all' ? styles.chipActive : ''}`}
                onClick={() => setSubcategoryFilter('all')}
              >すべての{CATEGORIES[categoryFilter].label}</button>
              {CATEGORIES[categoryFilter].subs.map(sub => (
                <button
                  key={sub.key}
                  className={`${styles.chip} ${subcategoryFilter === sub.key ? styles.chipActive : ''}`}
                  onClick={() => setSubcategoryFilter(sub.key)}
                >{sub.label}</button>
              ))}
            </div>
          )}

          <TagFilterRow selected={selectedTags} suggestions={tagSuggestions} onToggle={toggleTag} />
        </div>
      )}

      <main className={`${styles.main} ${view === 'map' ? styles.mainMap : ''}`}>
        {view === 'map' ? (
          <MapView places={filtered} />
        ) : loading ? (
          <LoadingSpinner inline />
        ) : loadError ? (
          <ErrorNotice onRetry={fetchAll} />
        ) : (
          <>
            {isBrowsing && (
              <div className={styles.discoverArea}>
                <RecommendCard place={recommendPlace} onReroll={handleReroll} onOpen={setDetailTarget} onSearchTitle={() => setSearchTitle(recommendPlace?.name)} />
                <DiscoverStrip activeTags={selectedTags} onSelectTag={handleDiscoverTagSelect} />
                {recentPlaces.length > 0 && (
                  <RecentRow places={recentPlaces} onOpen={setDetailTarget} />
                )}
                <NearbySection onLocate={handleNearbyLocate} />
              </div>
            )}

            {filtered.length === 0 ? (
              <div className={styles.empty}>
                <span className={styles.emptyIcon}>
                  {narrowingActive ? <IconSearch /> : statusFilter === 'visited' ? <IconCheckCircle /> : <IconPin />}
                </span>
                <p>
                  {narrowingActive
                    ? '条件に一致する場所が見つかりませんでした'
                    : statusFilter === 'visited' ? 'まだ行った場所がありません' : '行きたい場所を追加しましょう'}
                </p>
                {narrowingActive ? (
                  <button className={styles.emptyBtn} onClick={clearSearchAndFilters}>
                    条件をクリア
                  </button>
                ) : statusFilter !== 'visited' && (
                  <button className={styles.emptyBtn} onClick={() => setShowAdd(true)}>
                    場所を追加する
                  </button>
                )}
              </div>
            ) : (
              <>
                <div className={styles.resultsHeaderRow}>
                  <h2 className={styles.sectionTitle}>
                    {narrowingActive ? <><IconSearch /> 検索結果</> : statusLabel}
                    {' '}<span className={styles.sectionCount}>{filtered.length}件</span>
                  </h2>
                  {narrowingActive && (
                    <button type="button" className={styles.sectionLinkBtn} onClick={clearSearchAndFilters}>
                      条件をクリア
                    </button>
                  )}
                </div>
                <ul className={styles.placeList}>
                  {filtered.map(place => (
                    <PlaceCard
                      key={place.id}
                      place={place}
                      onOpenDetail={() => setDetailTarget(place)}
                      onVisit={() => setVisitTarget(place)}
                      onSearchTitle={() => setSearchTitle(place.name)}
                    />
                  ))}
                </ul>
              </>
            )}
          </>
        )}
      </main>

      {showAdd && (
        <AddPlaceModal
          tagSuggestions={tagSuggestions}
          onSubmit={async data => { await handleAdd(data); setShowAdd(false) }}
          onClose={() => setShowAdd(false)}
        />
      )}

      {detailPlace && (
        <PlaceDetailModal
          place={detailPlace}
          category={CATEGORIES[detailPlace.category] ?? CATEGORIES.other}
          subcategoryLabel={getSubcategoryLabel(detailPlace.category, detailPlace.subcategory)}
          onEdit={() => { setEditTarget(detailPlace); setDetailTarget(null) }}
          onVisit={() => { setVisitTarget(detailPlace); setDetailTarget(null) }}
          onSearchTitle={() => { setSearchTitle(detailPlace.name); setDetailTarget(null) }}
          onClose={() => setDetailTarget(null)}
        />
      )}

      {visitTarget && (
        <VisitModal
          place={visitTarget}
          onSubmit={async data => { await handleVisit(visitTarget.id, data); setVisitTarget(null) }}
          onClose={() => setVisitTarget(null)}
        />
      )}

      {editTarget && (
        <EditPlaceModal
          place={editTarget}
          tagSuggestions={tagSuggestions}
          onSubmit={async data => { await handleEdit(editTarget.id, data); setEditTarget(null) }}
          onDelete={async () => { await handleDelete(editTarget.id); setEditTarget(null) }}
          onClose={() => setEditTarget(null)}
        />
      )}

      {searchTitle && (
        <WebSearchModal query={searchTitle} onClose={() => setSearchTitle(null)} />
      )}

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

// ── 「今日はここ！」おすすめカード ──────────────────────
function RecommendCard({ place, onReroll, onOpen, onSearchTitle }) {
  if (!place) return null
  const cat = CATEGORIES[place.category] ?? CATEGORIES.other
  return (
    <section className={styles.recommendCard} onClick={() => onOpen(place)}>
      <div className={styles.recommendHeader}>
        <span className={styles.recommendBadge}><IconSparkle /> 今日はここ！</span>
        <button
          type="button"
          className={styles.rerollBtn}
          onClick={e => { e.stopPropagation(); onReroll() }}
          aria-label="別の場所を提案"
          title="別の場所を提案"
        ><IconDice /></button>
      </div>
      <button
        type="button"
        className={styles.recommendName}
        onClick={e => { e.stopPropagation(); onSearchTitle?.() }}
        title="この場所をWeb検索"
      >
        <cat.icon className={styles.recommendNameIcon} /> {place.name}
        <IconSearch className={styles.placeNameSearchIcon} aria-hidden="true" />
      </button>
      {place.address && <p className={styles.recommendAddress}><IconPin /> {place.address}</p>}
      {place.memo && <p className={styles.recommendMemo}>{place.memo}</p>}
      {place.tags?.length > 0 && (
        <div className={styles.cardTags}>
          {place.tags.slice(0, 4).map(t => <span key={t} className={styles.tagPill}>#{t}</span>)}
        </div>
      )}
    </section>
  )
}

// ── 「今日はどこ行く？」目的別ディスカバー ──────────────
function DiscoverStrip({ activeTags, onSelectTag }) {
  return (
    <section className={styles.discoverSection}>
      <h2 className={styles.sectionTitle}>今日はどこ行く？</h2>
      <div className={styles.discoverStrip}>
        {PRESET_TAGS.map(({ label, icon: Icon }) => (
          <button
            key={label}
            className={`${styles.discoverCard} ${activeTags.includes(label) ? styles.discoverCardActive : ''}`}
            onClick={() => onSelectTag(label)}
          >
            <span className={styles.discoverIcon}><Icon /></span>
            <span className={styles.discoverLabel}>{label}</span>
          </button>
        ))}
      </div>
    </section>
  )
}

// ── 最近追加した場所 ──────────────────────────────────────
function RecentRow({ places, onOpen }) {
  return (
    <section className={styles.horizontalSection}>
      <h2 className={styles.sectionTitle}>最近追加した場所</h2>
      <div className={styles.horizontalScroll}>
        {places.map(p => (
          <MiniPlaceCard key={p.id} place={p} onClick={() => onOpen(p)} />
        ))}
      </div>
    </section>
  )
}

// ── 近くの場所（現在地ベース。範囲検索フィルタに現在地をセットし検索結果として表示する） ──
function NearbySection({ onLocate }) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(false)

  function locate() {
    if (!navigator.geolocation) { setError(true); return }
    setLoading(true)
    setError(false)
    navigator.geolocation.getCurrentPosition(
      pos => {
        setLoading(false)
        onLocate({ lat: pos.coords.latitude, lng: pos.coords.longitude })
      },
      () => { setLoading(false); setError(true) },
      { timeout: 8000 }
    )
  }

  return (
    <section className={styles.horizontalSection}>
      <h2 className={styles.sectionTitle}>近くの場所</h2>
      <button type="button" className={styles.nearbyPromptBtn} onClick={locate} disabled={loading}>
        {loading ? '取得中...' : <><IconPin /> 現在地から近い場所を探す</>}
      </button>
      {error && (
        <p className={styles.hintSmall}>位置情報を取得できませんでした</p>
      )}
    </section>
  )
}

// ── 横スクロール用ミニカード（最近追加／近くの場所で共用） ──
function MiniPlaceCard({ place, subtitle, onClick }) {
  const cat = CATEGORIES[place.category] ?? CATEGORIES.other
  return (
    <button type="button" className={styles.miniCard} onClick={onClick}>
      <span className={styles.miniCardIcon}><cat.icon /></span>
      <span className={styles.miniCardName}>{place.name}</span>
      <span className={styles.miniCardSubtitle}>{subtitle ?? (place.address || cat.label)}</span>
    </button>
  )
}

// ── 範囲検索パネル ────────────────────────────────────────
const RADIUS_OPTIONS = [1, 3, 5, 10, 30]

function RadiusSearchPanel({ center, radiusKm, onCenterChange, onRadiusChange, matchCount }) {
  const inputRef = useRef(null)
  const [locating, setLocating] = useState(false)

  function useCurrentLocation() {
    if (!navigator.geolocation) return
    setLocating(true)
    navigator.geolocation.getCurrentPosition(
      pos => {
        setLocating(false)
        onCenterChange({ lat: pos.coords.latitude, lng: pos.coords.longitude, address: '現在地' })
        if (inputRef.current) inputRef.current.value = '現在地'
      },
      () => setLocating(false),
      { timeout: 8000 }
    )
  }

  function handleClear() {
    onCenterChange(null)
    if (inputRef.current) inputRef.current.value = ''
  }

  return (
    <div className={styles.radiusPanel}>
      <div className={styles.radiusInputRow}>
        <div className={styles.radiusInputWrapper}>
          <span className={styles.radiusInputIcon}><IconPin /></span>
          <PlaceSearchInput
            id="radius-center"
            inputRef={inputRef}
            inputClassName={styles.radiusInput}
            placeholder="起点となる住所・場所名を入力..."
            defaultValue={center?.address === '現在地' ? '現在地' : (center?.address ?? '')}
            onPick={({ name, address, lat, lng }) => {
              if (lat == null || lng == null) return
              onCenterChange({ lat, lng, address: address || name || inputRef.current?.value || '' })
            }}
          />
          {center && (
            <button className={styles.searchClear} onClick={handleClear} aria-label="クリア">×</button>
          )}
        </div>
        <button
          className={`${styles.gpsBtn} ${locating ? styles.gpsBtnLoading : ''}`}
          onClick={useCurrentLocation}
          disabled={locating}
          aria-label="現在地を使う"
          title="現在地を使う"
        >
          {locating ? '...' : <IconBroadcast />}
        </button>
      </div>

      {center && (
        <div className={styles.radiusKmRow}>
          <span className={styles.radiusLabel}>半径</span>
          {RADIUS_OPTIONS.map(km => (
            <button
              key={km}
              className={`${styles.radiusKmBtn} ${radiusKm === km ? styles.radiusKmBtnActive : ''}`}
              onClick={() => onRadiusChange(km)}
            >{km}km</button>
          ))}
          {matchCount != null && (
            <span className={styles.radiusMatchCount}>{matchCount}件</span>
          )}
        </div>
      )}

      {!center && (
        <p className={styles.radiusHint}>住所を入力するか、電波アイコンのボタンで現在地を起点に絞り込めます</p>
      )}
    </div>
  )
}

// ── 場所カード ────────────────────────────────────────────
function PlaceCard({ place, onOpenDetail, onVisit, onSearchTitle }) {
  const cat = CATEGORIES[place.category] ?? CATEGORIES.other
  const subLabel = getSubcategoryLabel(place.category, place.subcategory)
  const isVisited = place.status === 'visited'

  function openMap(e) {
    e.stopPropagation()
    const query = place.address || place.name
    window.open(
      `https://www.google.com/maps/search/${encodeURIComponent(query)}`,
      '_blank',
      'noopener,noreferrer'
    )
  }

  return (
    <li className={`${styles.card} ${isVisited ? styles.cardVisited : ''}`} onClick={onOpenDetail}>
      <PlacePhoto name={place.name} address={place.address} lat={place.lat} lng={place.lng} Icon={cat.icon} />

      <div className={styles.cardTop}>
        <span className={styles.categoryBadge}><cat.icon /> {cat.label}</span>
        {place._distanceKm != null && (
          <span className={styles.distanceBadge}><IconPin /> {place._distanceKm.toFixed(1)}km</span>
        )}
        {isVisited && place.rating && (
          <span className={styles.ratingBadge}>
            <StarRating value={place.rating} />
          </span>
        )}
        {isVisited && <span className={styles.visitedBadge}><IconCheckCircle /> 行った</span>}
      </div>

      <button
        type="button"
        className={styles.placeName}
        onClick={e => { e.stopPropagation(); onSearchTitle?.() }}
        title="この場所をWeb検索"
      >
        {place.name}
        <IconSearch className={styles.placeNameSearchIcon} aria-hidden="true" />
      </button>

      {place.memo && <p className={styles.placeMemo}>{place.memo}</p>}
      {place.address && (
        <button
          className={styles.placeAddress}
          onClick={e => { e.stopPropagation(); openMap(e) }}
          title="地図で確認"
        ><IconPin /> {place.address}</button>
      )}
      {isVisited && place.review && <p className={styles.placeReview}><IconReview /> {place.review}</p>}

      {place.tags?.length > 0 && (
        <div className={styles.cardTags}>
          {place.tags.slice(0, 4).map(t => <span key={t} className={styles.tagPill}>#{t}</span>)}
          {place.tags.length > 4 && <span className={styles.tagPillMore}>+{place.tags.length - 4}</span>}
        </div>
      )}

      <div className={styles.cardBottom}>
        <div className={styles.cardMeta}>
          {place.added_by_member && (
            <span className={styles.addedBy}>{place.added_by_member.name}が追加</span>
          )}
          {isVisited && place.visited_at && (
            <span className={styles.visitedAt}>
              {new Date(place.visited_at).toLocaleDateString('ja-JP', { year: 'numeric', month: 'long', day: 'numeric' })}に訪問
            </span>
          )}
        </div>
        <div className={styles.cardActions}>
          <button
            className={styles.mapBtn}
            onClick={openMap}
            aria-label="地図を開く"
            title="Google Mapsで開く"
          ><IconPin /> 地図</button>
          {!isVisited && (
            <button
              className={styles.visitBtn}
              onClick={e => { e.stopPropagation(); onVisit() }}
            >行った！</button>
          )}
        </div>
      </div>
    </li>
  )
}

// ── タグ絞り込み欄（絞り込みパネル内） ────────────────────
// よく使われているタグ・プリセットタグをチップで選べるほか、
// まだどの場所にも付いていない新しいタグ名を入力して絞り込み条件に追加することもできる。
function TagFilterRow({ selected, suggestions, onToggle }) {
  const [input, setInput] = useState('')

  function handleAdd() {
    const t = input.trim()
    if (!t) return
    onToggle(t)
    setInput('')
  }

  return (
    <div className={styles.tagFilterRow}>
      <span className={styles.tagFilterLabel}>タグ</span>
      <div className={styles.categoryChips}>
        {selected.filter(t => !suggestions.includes(t)).map(t => (
          <button
            key={t}
            type="button"
            className={`${styles.chip} ${styles.chipActive}`}
            onClick={() => onToggle(t)}
          >#{t}</button>
        ))}
        {suggestions.map(t => (
          <button
            key={t}
            type="button"
            className={`${styles.chip} ${selected.includes(t) ? styles.chipActive : ''}`}
            onClick={() => onToggle(t)}
          >#{t}</button>
        ))}
      </div>
      <div className={styles.tagFilterAddRow}>
        <div className={styles.tagFilterInputWrapper}>
          <input
            className={styles.tagFilterInput}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleAdd() } }}
            placeholder="タグを入力して絞り込みに追加..."
            maxLength={20}
          />
        </div>
        <button type="button" className={styles.tagFilterAddBtn} onClick={handleAdd} disabled={!input.trim()}>
          追加
        </button>
      </div>
    </div>
  )
}

// ── タグ選択UI（追加・編集モーダル共通） ──────────────────
const MAX_TAGS = 12

function TagPicker({ tags, onChange, suggestions }) {
  const [input, setInput] = useState('')

  function addTag(raw) {
    const t = raw.trim()
    if (!t || tags.includes(t) || tags.length >= MAX_TAGS) { setInput(''); return }
    onChange([...tags, t])
    setInput('')
  }

  function toggleTag(t) {
    if (tags.includes(t)) {
      onChange(tags.filter(x => x !== t))
    } else if (tags.length < MAX_TAGS) {
      onChange([...tags, t])
    }
  }

  function removeTag(t) {
    onChange(tags.filter(x => x !== t))
  }

  function handleKeyDown(e) {
    // IME変換確定中のEnterは無視（日本語入力対策）
    if (e.nativeEvent?.isComposing) return
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault()
      addTag(input)
    } else if (e.key === 'Backspace' && !input && tags.length > 0) {
      removeTag(tags[tags.length - 1])
    }
  }

  // 選択肢に出す候補（プリセット＋よく使うタグ）。選択済みも残してトグル表示する
  const choices = [...new Set([...suggestions, ...tags])]
  // プリセットにも候補にも無い自由入力タグ
  const customTags = tags.filter(t => !suggestions.includes(t))
  const atLimit = tags.length >= MAX_TAGS

  return (
    <div className={styles.tagPicker}>
      <div className={styles.tagToggleGrid}>
        {choices.map(label => {
          const on = tags.includes(label)
          return (
            <button
              key={label}
              type="button"
              className={`${styles.tagToggle} ${on ? styles.tagToggleOn : ''}`}
              onClick={() => toggleTag(label)}
              aria-pressed={on}
              disabled={!on && atLimit}
            >
              <TagIcon label={label} className={styles.tagToggleIcon} />
              <span>{label}</span>
              {on && <IconCheck className={styles.tagToggleCheck} />}
            </button>
          )
        })}
      </div>

      {customTags.length > 0 && (
        <div className={styles.tagPickerSelected}>
          {customTags.map(t => (
            <span key={t} className={styles.tagPickerChip}>
              #{t}
              <button type="button" onClick={() => removeTag(t)} aria-label={`${t}を削除`}><IconClose /></button>
            </span>
          ))}
        </div>
      )}

      <input
        className={styles.input}
        value={input}
        onChange={e => setInput(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={atLimit ? `タグは最大${MAX_TAGS}個までです` : '自由なタグを追加（入力してEnter）'}
        maxLength={20}
        disabled={atLimit}
      />
    </div>
  )
}

// ── 場所追加モーダル ──────────────────────────────────────
function AddPlaceModal({ onSubmit, onClose, tagSuggestions }) {
  const [name, setName] = useState('')
  const [category, setCategory] = useState('food')
  const [memo, setMemo] = useState('')
  const [address, setAddress] = useState('')
  const [selectedName, setSelectedName] = useState('')
  const [lat, setLat] = useState(null)
  const [lng, setLng] = useState(null)
  const [tags, setTags] = useState([])
  const [submitting, setSubmitting] = useState(false)
  const inputRef = useRef(null)
  const autoNameRef = useRef('')   // 直前に自動入力した場所名（手入力と区別するため）

  function handlePickPlace(place) {
    setAddress(place.address || inputRef.current?.value || '')
    setSelectedName(place.name || '')
    setLat(place.lat)
    setLng(place.lng)
    // 場所名が未入力、または直前の自動入力のままなら、選んだ場所名で自動補完
    if (place.name) {
      setName(prev => (!prev.trim() || prev === autoNameRef.current) ? place.name : prev)
      autoNameRef.current = place.name
    }
  }

  async function handleSubmit(e) {
    e.preventDefault()
    if (!name.trim()) return
    setSubmitting(true)
    const finalAddress = address || inputRef.current?.value || ''
    try {
      await onSubmit({ name, category, memo, address: finalAddress, lat, lng, tags })
    } catch { /* 呼び出し元でトースト表示。モーダルは開いたまま再試行可能に */ }
    setSubmitting(false)
  }

  return (
    <Modal open onClose={onClose} title="行きたい場所を追加">
      <form onSubmit={handleSubmit} className={styles.form}>
        <label className={styles.label}>
          場所を検索（マップ連携）
          <PlaceSearchInput
            id="place-search"
            inputRef={inputRef}
            inputClassName={styles.input}
            placeholder="店名・施設名で検索（例: 海遊館）"
            autoFocus
            onPick={handlePickPlace}
          />
          <span className={styles.fieldHint}>検索して選ぶと、場所名・住所・地図が自動で入ります</span>
          {(selectedName || address) && (
            <p className={styles.acSelected}>
              <IconPin /> {selectedName || address}
              {selectedName && address && <span className={styles.acAddress}>{address}</span>}
            </p>
          )}
        </label>
        <label className={styles.label}>
          場所名
          <input
            className={styles.input}
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="例: 海遊館、一蘭 梅田店..."
            maxLength={100}
            required
          />
        </label>
        <label className={styles.label}>
          カテゴリ
          <div className={styles.categorySelect}>
            {Object.entries(CATEGORIES).map(([key, { label, icon: Icon }]) => (
              <button
                key={key}
                type="button"
                className={`${styles.categoryOption} ${category === key ? styles.categoryOptionActive : ''}`}
                onClick={() => setCategory(key)}
              ><Icon /> {label}</button>
            ))}
          </div>
        </label>
        <label className={styles.label}>
          タグ（任意・複数可）
          <TagPicker tags={tags} onChange={setTags} suggestions={tagSuggestions} />
        </label>
        <label className={styles.label}>
          メモ（任意）
          <input
            className={styles.input}
            value={memo}
            onChange={e => setMemo(e.target.value)}
            placeholder="例: 友達にすすめられた、子どもと行きたい..."
            maxLength={200}
          />
        </label>
        <div className={styles.formBtns}>
          <button type="button" className={styles.cancelBtn} onClick={onClose}>キャンセル</button>
          <button type="submit" className={styles.saveBtn} disabled={submitting || !name.trim()}>
            {submitting ? '追加中...' : '追加'}
          </button>
        </div>
      </form>
    </Modal>
  )
}

// ── 訪問記録モーダル ──────────────────────────────────────
function VisitModal({ place, onSubmit, onClose }) {
  const [visitedAt, setVisitedAt] = useState(new Date().toISOString().slice(0, 10))
  const [rating, setRating] = useState(0)
  const [review, setReview] = useState('')
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setSubmitting(true)
    await onSubmit({ visitedAt, rating, review })
    setSubmitting(false)
  }

  return (
    <Modal open onClose={onClose} title={<>「{place.name}」に行った！</>}>
      <form onSubmit={handleSubmit} className={styles.form}>
        <label className={styles.label}>
          訪問日
          <input
            className={styles.input}
            type="date"
            value={visitedAt}
            onChange={e => setVisitedAt(e.target.value)}
          />
        </label>
        <div className={styles.label}>
          評価
          <div className={styles.starRow}>
            {[1, 2, 3, 4, 5].map(n => (
              <button
                key={n}
                type="button"
                className={`${styles.starBtn} ${n <= rating ? styles.starActive : ''}`}
                onClick={() => setRating(n === rating ? 0 : n)}
                aria-label={`${n}点`}
              >{n <= rating ? <IconStarFill /> : <IconStar />}</button>
            ))}
            {rating > 0 && (
              <button type="button" className={styles.clearRating} onClick={() => setRating(0)}>
                クリア
              </button>
            )}
          </div>
        </div>
        <label className={styles.label}>
          ひとことレビュー（任意）
          <input
            className={styles.input}
            value={review}
            onChange={e => setReview(e.target.value)}
            placeholder="例: 最高だった！また行きたい..."
            maxLength={200}
          />
        </label>
        <div className={styles.formBtns}>
          <button type="button" className={styles.cancelBtn} onClick={onClose}>キャンセル</button>
          <button type="submit" className={styles.saveBtn} disabled={submitting}>
            {submitting ? '保存中...' : '記録する'}
          </button>
        </div>
      </form>
    </Modal>
  )
}

// ── 場所編集モーダル ──────────────────────────────────────
function EditPlaceModal({ place, onSubmit, onDelete, onClose, tagSuggestions }) {
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [name, setName] = useState(place.name)
  const [category, setCategory] = useState(place.category)
  const [memo, setMemo] = useState(place.memo ?? '')
  const [address, setAddress] = useState(place.address ?? '')
  const [selectedName, setSelectedName] = useState('')
  const [lat, setLat] = useState(place.lat ?? null)
  const [lng, setLng] = useState(place.lng ?? null)
  const [tags, setTags] = useState(place.tags ?? [])
  const [submitting, setSubmitting] = useState(false)
  const inputRef = useRef(null)
  const autoNameRef = useRef('')

  function handlePickPlace(picked) {
    setAddress(picked.address || inputRef.current?.value || '')
    setSelectedName(picked.name || '')
    setLat(picked.lat)
    setLng(picked.lng)
    // 名前が空、または直前の自動入力のままのときだけ場所名を補完（手入力した名前は保持）
    if (picked.name) {
      setName(prev => (!prev.trim() || prev === autoNameRef.current) ? picked.name : prev)
      autoNameRef.current = picked.name
    }
  }

  async function handleSubmit(e) {
    e.preventDefault()
    if (!name.trim()) return
    setSubmitting(true)
    const finalAddress = address || inputRef.current?.value || ''
    try {
      await onSubmit({ name, category, memo, address: finalAddress, lat, lng, tags })
    } catch { /* 呼び出し元でトースト表示。モーダルは開いたまま再試行可能に */ }
    setSubmitting(false)
  }

  return (
    <>
      <Modal open onClose={onClose} title="場所を編集">
        <form onSubmit={handleSubmit} className={styles.form}>
          <label className={styles.label}>
            場所名
            <input
              className={styles.input}
              value={name}
              onChange={e => setName(e.target.value)}
              maxLength={100}
              required
            />
          </label>
          <label className={styles.label}>
            カテゴリ
            <div className={styles.categorySelect}>
              {Object.entries(CATEGORIES).map(([key, { label, icon: Icon }]) => (
                <button
                  key={key}
                  type="button"
                  className={`${styles.categoryOption} ${category === key ? styles.categoryOptionActive : ''}`}
                  onClick={() => setCategory(key)}
                ><Icon /> {label}</button>
              ))}
            </div>
          </label>
          <label className={styles.label}>
            住所（任意）
            <PlaceSearchInput
              id="place-edit-address"
              inputRef={inputRef}
              inputClassName={styles.input}
              placeholder="例: 大阪府大阪市港区海岸通..."
              defaultValue={place.address ?? ''}
              onPick={handlePickPlace}
            />
            {(selectedName || address) && (
              <p className={styles.acSelected}>
                <IconPin /> {selectedName || address}
                {selectedName && address && <span className={styles.acAddress}>{address}</span>}
              </p>
            )}
          </label>
          <label className={styles.label}>
            タグ（任意・複数可）
            <TagPicker tags={tags} onChange={setTags} suggestions={tagSuggestions} />
          </label>
          <label className={styles.label}>
            メモ（任意）
            <input
              className={styles.input}
              value={memo}
              onChange={e => setMemo(e.target.value)}
              maxLength={200}
            />
          </label>
          <div className={styles.formBtns}>
            <button type="button" className={styles.deleteBtn} onClick={() => setConfirmDelete(true)}>削除</button>
            <button type="button" className={styles.cancelBtn} onClick={onClose}>キャンセル</button>
            <button type="submit" className={styles.saveBtn} disabled={submitting || !name.trim()}>
              {submitting ? '保存中...' : '保存'}
            </button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        open={confirmDelete}
        title="場所を削除しますか？"
        message={`「${place.name}」を削除します。この操作は取り消せません。`}
        confirmLabel="削除する"
        onConfirm={() => { setConfirmDelete(false); onDelete() }}
        onCancel={() => setConfirmDelete(false)}
      />
    </>
  )
}

// ── 地図ビュー ────────────────────────────────────────────
function MapView({ places }) {
  const mapRef = useRef(null)
  const mapInstanceRef = useRef(null)
  const AdvancedMarkerElementRef = useRef(null)
  const markersRef = useRef([])
  const [selectedPlace, setSelectedPlace] = useState(null)
  const [mapReady, setMapReady] = useState(false)

  const placesWithCoords = places.filter(p => p.lat != null && p.lng != null)

  // マップ初期化（マウント時1回のみ・API呼び出しは1回）
  useEffect(() => {
    let mounted = true
    async function init() {
      await loadGoogleMapsScript()
      if (!mounted || !mapRef.current) return
      const [{ Map }, { AdvancedMarkerElement }] = await Promise.all([
        window.google.maps.importLibrary('maps'),
        window.google.maps.importLibrary('marker'),
      ])
      if (!mounted) return
      AdvancedMarkerElementRef.current = AdvancedMarkerElement
      mapInstanceRef.current = new Map(mapRef.current, {
        center: { lat: 36.2048, lng: 138.2529 },
        zoom: 6,
        mapId: 'DEMO_MAP_ID',
        streetViewControl: false,
        mapTypeControl: false,
        fullscreenControl: false,
      })
      // マップ生成完了を通知し、下のピン配置エフェクトを起動させる
      // （非同期初期化のため、先に走っていたピン配置エフェクトは map が
      //   まだ null の状態で何もせず終了してしまっている）
      setMapReady(true)
    }
    init().catch(() => {})
    return () => { mounted = false }
  }, []) // マウント時1回のみ

  // フィルター変更時・マップ準備完了時にマーカーを更新（API呼び出しなし）
  useEffect(() => {
    const map = mapInstanceRef.current
    const AdvancedMarkerElement = AdvancedMarkerElementRef.current
    if (!map || !AdvancedMarkerElement) return

    // 既存ピンを削除
    markersRef.current.forEach(m => { m.map = null })
    markersRef.current = []

    if (placesWithCoords.length === 0) return

    // ピンを追加
    placesWithCoords.forEach(place => {
      const pin = document.createElement('div')
      pin.className = `${styles.mapPin}${place.status === 'visited' ? ` ${styles.mapPinVisited}` : ''}`
      pin.innerHTML = place.status === 'visited' ? MAP_PIN_VISITED_SVG : MAP_PIN_SVG
      const marker = new AdvancedMarkerElement({
        map,
        position: { lat: place.lat, lng: place.lng },
        content: pin,
        title: place.name,
      })
      marker.addListener('click', () => setSelectedPlace(place))
      markersRef.current.push(marker)
    })

    // 全ピンが収まるようにフィット
    if (placesWithCoords.length === 1) {
      map.setCenter({ lat: placesWithCoords[0].lat, lng: placesWithCoords[0].lng })
      map.setZoom(14)
    } else {
      const bounds = new window.google.maps.LatLngBounds()
      placesWithCoords.forEach(p => bounds.extend({ lat: p.lat, lng: p.lng }))
      map.fitBounds(bounds, { top: 60, right: 20, bottom: 80, left: 20 })
    }
  }, [placesWithCoords.length, places, mapReady]) // eslint-disable-line react-hooks/exhaustive-deps

  if (placesWithCoords.length === 0) {
    return (
      <div className={styles.mapEmpty}>
        <span className={styles.mapEmptyIcon}><IconMap /></span>
        <p>住所が登録された場所が地図に表示されます</p>
        <p className={styles.mapEmptyDesc}>場所を追加・編集して住所を入力してください</p>
      </div>
    )
  }

  return (
    <div className={styles.mapContainer}>
      <div ref={mapRef} className={styles.mapEl} />
      {selectedPlace && (
        <MapPopup place={selectedPlace} onClose={() => setSelectedPlace(null)} />
      )}
    </div>
  )
}

// ── 地図ピンタップ時のポップアップ ────────────────────────
function MapPopup({ place, onClose }) {
  const cat = CATEGORIES[place.category] ?? CATEGORIES.other
  const isVisited = place.status === 'visited'
  return (
    <div className={styles.mapPopup}>
      <div className={styles.mapPopupHeader}>
        <span className={styles.mapPopupCat}><cat.icon /></span>
        <span className={styles.mapPopupName}>{place.name}</span>
        <button className={styles.mapPopupClose} onClick={onClose} aria-label="閉じる"><IconClose /></button>
      </div>
      {place.address && <p className={styles.mapPopupAddress}><IconPin /> {place.address}</p>}
      <div className={styles.mapPopupMeta}>
        {isVisited && place.rating && (
          <span className={styles.mapPopupRating}>
            <StarRating value={place.rating} />
          </span>
        )}
        {isVisited
          ? <span className={styles.mapPopupVisited}><IconCheckCircle /> 行った</span>
          : <span className={styles.mapPopupWant}><IconStarFill /> 行きたい</span>
        }
      </div>
      {place.memo && <p className={styles.mapPopupMemo}>{place.memo}</p>}
    </div>
  )
}

// ── タイトルの簡易Web検索モーダル（モーダル内にブラウザを表示） ──
function WebSearchModal({ query, onClose }) {
  const [input, setInput] = useState(query ?? '')
  const [submitted, setSubmitted] = useState(query ?? '')
  const [loading, setLoading] = useState(true)

  // Google 検索を iframe 埋め込み可能な形（igu=1）で表示。ブロックされた場合は外部リンクで開く
  const frameSrc = `https://www.google.com/search?igu=1&q=${encodeURIComponent(submitted)}`
  const externalUrl = `https://www.google.com/search?q=${encodeURIComponent(submitted)}`

  function runSearch(e) {
    e.preventDefault()
    const q = input.trim()
    if (!q || q === submitted) return
    setLoading(true)
    setSubmitted(q)
  }

  return (
    <div className={styles.searchOverlay} onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className={styles.searchModal}>
        <div className={styles.searchModalBar}>
          <form className={styles.searchModalForm} onSubmit={runSearch}>
            <span className={styles.searchModalIcon}><IconSearch /></span>
            <input
              className={styles.searchModalInput}
              type="search"
              value={input}
              onChange={e => setInput(e.target.value)}
              aria-label="検索キーワード"
              placeholder="キーワードを検索"
            />
          </form>
          <a
            className={styles.searchModalExternal}
            href={externalUrl}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="ブラウザで開く"
            title="ブラウザで開く"
          ><IconExternal /></a>
          <button className={styles.searchModalClose} onClick={onClose} aria-label="閉じる"><IconClose /></button>
        </div>
        <div className={styles.searchModalBody}>
          {loading && <div className={styles.searchModalLoading}><LoadingSpinner inline /></div>}
          <iframe
            key={submitted}
            className={styles.searchModalFrame}
            src={frameSrc}
            title={`「${submitted}」の検索結果`}
            onLoad={() => setLoading(false)}
            referrerPolicy="no-referrer"
          />
        </div>
        <p className={styles.searchModalHint}>
          うまく表示されないときは右上の <IconExternal /> からブラウザで開けます
        </p>
      </div>
    </div>
  )
}
