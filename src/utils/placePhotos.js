import { loadGoogleMapsScript } from './googleMaps'
import { createUsageLimit } from './apiUsageLimit'

/**
 * お出かけリストの場所に「参考画像」を出すための Google 場所写真の取得。
 *
 * 画像はユーザーに登録させず、登録済みの名前・住所から Google Places の
 * Text Search（新 Places API）で 1 件だけ引き当て、その場所の写真 URL を使う。
 * 写真そのものはアプリ側に保存しない（Google Maps Platform の規約で
 * 場所データの長期キャッシュが禁じられているため）。
 *
 * 無料枠に収めるための工夫:
 *   - 取得結果は端末の localStorage に短期キャッシュし、同じ場所を何度も引かない
 *   - 見つからなかった場合も「なし」をキャッシュして再検索を防ぐ
 *   - 画面に入ったカードだけ取得する（呼び出し側の IntersectionObserver）
 *   - 端末ごとに 1 日 / 1 か月の上限を設け、超えたら取得を止めて枠内に収める
 */
export const PHOTO_LIMITS = {
  monthly: 500,   // Text Search（Pro SKU）の無料枠 5,000/月 に対して 10%
  daily: 60,
}

const usageLimit = createUsageLimit({
  storageKey: 'place-photo-usage',
  monthly: PHOTO_LIMITS.monthly,
  daily: PHOTO_LIMITS.daily,
})

export const placePhotoQuota = usageLimit.quota

const CACHE_KEY = 'place-photo-cache'
const CACHE_MAX = 200
// 写真 URL には有効期限があるため長く持たない。規約上のキャッシュ上限（30日）内でもある
const HIT_TTL_MS = 7 * 24 * 60 * 60 * 1000
const MISS_TTL_MS = 3 * 24 * 60 * 60 * 1000
// カード用サムネイルと詳細用の大きい画像で URL を使い回すため 1 サイズに揃える
const PHOTO_MAX_WIDTH = 800

const inflight = new Map()

function cacheKey(name, address) {
  return `${(name || '').trim()}|${(address || '').trim()}`
}

function readCache() {
  try {
    const saved = JSON.parse(localStorage.getItem(CACHE_KEY) || '{}')
    return saved && typeof saved === 'object' ? saved : {}
  } catch {
    return {}
  }
}

function writeCache(key, entry) {
  try {
    const cache = readCache()
    cache[key] = entry
    const keys = Object.keys(cache)
    if (keys.length > CACHE_MAX) {
      keys
        .sort((a, b) => (cache[a].at ?? 0) - (cache[b].at ?? 0))
        .slice(0, keys.length - CACHE_MAX)
        .forEach(k => { delete cache[k] })
    }
    localStorage.setItem(CACHE_KEY, JSON.stringify(cache))
  } catch { /* 保存できなくても取得自体は動かす */ }
}

function lookupCache(key) {
  const entry = readCache()[key]
  if (!entry) return undefined
  const ttl = entry.url ? HIT_TTL_MS : MISS_TTL_MS
  if (Date.now() - (entry.at ?? 0) > ttl) return undefined
  return entry.url ? entry : null
}

async function searchPhoto({ name, address, lat, lng }) {
  await loadGoogleMapsScript()
  const { Place } = await window.google.maps.importLibrary('places')
  const { places } = await Place.searchByText({
    textQuery: [name, address].filter(Boolean).join(' '),
    fields: ['photos'],
    maxResultCount: 1,
    language: 'ja',
    region: 'jp',
    // 登録済みの座標があれば周辺を優先し、同名の別店舗を拾わないようにする
    ...(lat != null && lng != null
      ? { locationBias: { center: { lat, lng }, radius: 500 } }
      : {}),
  })
  const photo = places?.[0]?.photos?.[0]
  if (!photo) return null
  const attribution = photo.authorAttributions?.[0]
  return {
    url: photo.getURI({ maxWidth: PHOTO_MAX_WIDTH }),
    author: attribution?.displayName ?? null,
    authorUri: attribution?.uri ?? null,
  }
}

/**
 * 場所の参考画像を 1 枚取得する。
 * 見つからない・上限に達した・取得に失敗した場合は null を返す（画面側はプレースホルダー表示）。
 *
 * @returns {Promise<{ url: string, author: ?string, authorUri: ?string } | null>}
 */
export async function getPlacePhoto({ name, address, lat, lng }) {
  if (!name?.trim()) return null
  if (!import.meta.env.VITE_GOOGLE_MAPS_API_KEY) return null

  const key = cacheKey(name, address)
  const cached = lookupCache(key)
  if (cached !== undefined) return cached
  if (inflight.has(key)) return inflight.get(key)
  if (usageLimit.quota().exhausted) return null

  const request = (async () => {
    usageLimit.record()
    try {
      const photo = await searchPhoto({ name, address, lat, lng })
      writeCache(key, { ...(photo ?? { url: null }), at: Date.now() })
      return photo
    } catch (error) {
      console.error('場所写真の取得エラー:', error)
      writeCache(key, { url: null, at: Date.now() })
      return null
    } finally {
      inflight.delete(key)
    }
  })()

  inflight.set(key, request)
  return request
}
