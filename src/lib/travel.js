/**
 * 旅行記録（TravelPage）で共通に使う定数・日付ヘルパー。
 * ページと `components/travel/` の部品の両方から参照する。
 */

export const PREFECTURES = [
  '北海道',
  '青森県', '岩手県', '宮城県', '秋田県', '山形県', '福島県',
  '茨城県', '栃木県', '群馬県', '埼玉県', '千葉県', '東京都', '神奈川県',
  '新潟県', '富山県', '石川県', '福井県', '山梨県', '長野県',
  '岐阜県', '静岡県', '愛知県', '三重県',
  '滋賀県', '京都府', '大阪府', '兵庫県', '奈良県', '和歌山県',
  '鳥取県', '島根県', '岡山県', '広島県', '山口県',
  '徳島県', '香川県', '愛媛県', '高知県',
  '福岡県', '佐賀県', '長崎県', '熊本県', '大分県', '宮崎県', '鹿児島県',
  '沖縄県',
]

export const PREP_CATEGORIES = [
  { key: 'packing', label: '持ち物' },
  { key: 'todo', label: 'やること' },
]

export const PREP_CATEGORY_LABELS = Object.fromEntries(PREP_CATEGORIES.map(c => [c.key, c.label]))

export const PHASES = {
  upcoming: { label: '計画中', hint: '準備を進めましょう' },
  ongoing: { label: '旅行中', hint: '行程をチェックしながら進めましょう' },
  past: { label: 'おもいで', hint: '記録を振り返れます' },
}

const WEEKDAYS = ['日', '月', '火', '水', '木', '金', '土']

// 'yyyy-mm-dd' をローカル日付として読む（Date('yyyy-mm-dd') は UTC 解釈になるため）
function parseDate(dateStr) {
  return new Date(`${dateStr}T00:00:00`)
}

export function toDateStr(date) {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

export function todayStr() {
  return toDateStr(new Date())
}

export function formatDate(dateStr) {
  if (!dateStr) return ''
  const d = parseDate(dateStr)
  return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日（${WEEKDAYS[d.getDay()]}）`
}

export function shortDate(dateStr) {
  if (!dateStr) return ''
  const d = parseDate(dateStr)
  return `${d.getMonth() + 1}/${d.getDate()}(${WEEKDAYS[d.getDay()]})`
}

export function dateRange(start, end) {
  if (!start || !end) return ''
  if (start === end) return formatDate(start)
  return `${formatDate(start)}〜${formatDate(end)}`
}

/** 旅行期間の日付一覧。日付の入力ミスで長くなりすぎないよう 60 日で打ち切る */
export function tripDates(start, end) {
  if (!start || !end) return []
  const cursor = parseDate(start)
  const last = parseDate(end)
  const dates = []
  while (cursor <= last && dates.length < 60) {
    dates.push(toDateStr(cursor))
    cursor.setDate(cursor.getDate() + 1)
  }
  return dates.length ? dates : [start]
}

export function tripPhase(trip) {
  const today = todayStr()
  if (trip.end_date < today) return 'past'
  if (trip.start_date > today) return 'upcoming'
  return 'ongoing'
}

/** 出発まであと何日か（当日以降は null） */
export function daysUntil(dateStr) {
  if (!dateStr) return null
  const diff = Math.round((parseDate(dateStr) - parseDate(todayStr())) / 86400000)
  return diff > 0 ? diff : null
}

/**
 * 家族以外の同行者テキストから人数を数える。
 * 「祖母、友人」のように区切って書かれた分をそれぞれ 1 人として扱う。
 */
export function countExtraCompanions(text) {
  if (!text) return 0
  return text.split(/[、,，・/／\n]+/).map(part => part.trim()).filter(Boolean).length
}

/** 参加人数。同行者に選んだ家族メンバー + 家族以外の同行者 */
export function partySize(trip) {
  return (trip.companion_member_ids?.length ?? 0) + countExtraCompanions(trip.companions)
}

export function formatYen(value) {
  const n = Number(value)
  if (value == null || value === '' || !Number.isFinite(n)) return ''
  return `¥${Math.round(n).toLocaleString('ja-JP')}`
}

/**
 * お出かけリスト（wish_places）と突き合わせるためのキー。
 * 全角/半角・大文字小文字・空白の違いは同じ場所として扱う。
 */
export function placeKey(text) {
  if (!text) return ''
  return String(text).normalize('NFKC').toLowerCase().replace(/\s+/g, '')
}

/** 場所名 → お出かけリストの行。同名が複数あれば最初の 1 件を使う */
export function buildPlaceIndex(places) {
  const index = new Map()
  for (const place of places ?? []) {
    const key = placeKey(place.name)
    if (key && !index.has(key)) index.set(key, place)
  }
  return index
}

/** 行程の「場所」と一致するお出かけリストの行（なければ null） */
export function findWishPlace(index, text) {
  if (!index || !text) return null
  return index.get(placeKey(text)) ?? null
}

/** お出かけリストの行を地図で開くときの検索クエリ。座標があれば最優先 */
export function placeMapQuery(place) {
  if (place.lat != null && place.lng != null) return `${place.lat},${place.lng}`
  return place.address || place.name
}
