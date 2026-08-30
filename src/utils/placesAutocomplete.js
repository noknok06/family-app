import { loadGoogleMapsScript } from './googleMaps'
import { createUsageLimit } from './apiUsageLimit'

/**
 * Google Places Autocomplete の呼び出しを無料枠に収めるための制限と共通処理。
 *
 * 無料枠は Essentials SKU で月 10,000 コール。1 文字ごとにリクエストが飛ぶ
 * `places.Autocomplete` ウィジェットは使わず、以下で呼び出し回数を抑える。
 *
 *   - 入力が落ち着くまで待つ（デバウンス）+ 短い入力では検索しない
 *   - 同じ検索語の結果は使い回す（打ち直し・バックスペースで再検索しない）
 *   - セッショントークンで「候補取得 + 詳細取得」を 1 セッションにまとめる
 *   - 端末ごとに 1 日 / 1 か月の上限を設け、超えたら検索を止めて手入力に任せる
 *
 * 上限はブラウザの localStorage に記録するため端末ごとの目安。無料枠に対して
 * 十分小さい値にしてあるので、家族の人数分を足しても枠を超えない。
 */
export const PLACES_LIMITS = {
  monthly: 1000,   // 無料枠 10,000/月 に対して 10%
  daily: 100,
  minLength: 2,
  debounceMs: 450,
}

const usageLimit = createUsageLimit({
  storageKey: 'places-autocomplete-usage',
  monthly: PLACES_LIMITS.monthly,
  daily: PLACES_LIMITS.daily,
})

/** 現在の使用状況（設定画面や動作確認用にも読める形で返す） */
export const placesQuota = usageLimit.quota

/**
 * 入力欄 1 つ分の検索クライアント。
 * suggest() で候補、details() で確定した場所の詳細を取る。
 */
export function createPlacesSearch() {
  let autocompleteService = null
  let placesService = null
  let sessionToken = null
  const cache = new Map()

  async function ensureServices() {
    await loadGoogleMapsScript()
    await window.google.maps.importLibrary('places')
    const places = window.google.maps.places
    autocompleteService ||= new places.AutocompleteService()
    placesService ||= new places.PlacesService(document.createElement('div'))
    sessionToken ||= new places.AutocompleteSessionToken()
  }

  async function suggest(input) {
    const query = input.trim()
    if (query.length < PLACES_LIMITS.minLength) return { predictions: [], reason: 'short' }
    if (cache.has(query)) return { predictions: cache.get(query), reason: 'cache' }
    if (placesQuota().exhausted) return { predictions: [], reason: 'limit' }

    await ensureServices()
    usageLimit.record()
    const predictions = await new Promise(resolve => {
      autocompleteService.getPlacePredictions(
        {
          input: query,
          sessionToken,
          componentRestrictions: { country: 'jp' },
          language: 'ja',
        },
        (results, status) => resolve(status === 'OK' && results ? results : [])
      )
    })
    cache.set(query, predictions)
    return { predictions, reason: 'ok' }
  }

  async function details(placeId) {
    await ensureServices()
    usageLimit.record()
    const place = await new Promise(resolve => {
      placesService.getDetails(
        { placeId, sessionToken, fields: ['name', 'formatted_address', 'geometry'] },
        (result, status) => resolve(status === 'OK' ? result : null)
      )
    })
    // 詳細取得でセッションは閉じる。次の検索は新しいセッションとして始める
    sessionToken = new window.google.maps.places.AutocompleteSessionToken()
    cache.clear()
    if (!place) return null
    const location = place.geometry?.location
    return {
      name: place.name || '',
      address: place.formatted_address || '',
      lat: location ? location.lat() : null,
      lng: location ? location.lng() : null,
    }
  }

  return { suggest, details }
}
