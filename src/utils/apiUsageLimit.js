/**
 * 外部 API の呼び出し回数を端末ごとに数えて上限をかける小さなカウンタ。
 *
 * Google Maps Platform は SKU ごとに無料枠（月あたり数千コール）があるだけで、
 * 超えた分は課金される。家族用アプリで想定外の課金が起きないよう、無料枠より
 * 十分小さい上限を端末側に持たせて、超えたら呼び出し自体を止める。
 *
 * 記録先は localStorage なので端末ごとの目安。人数分を足しても無料枠に収まる
 * 値を各呼び出し側で設定すること。
 */
export function createUsageLimit({ storageKey, monthly, daily }) {
  function periodKeys() {
    const now = new Date()
    const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
    return { month, day: `${month}-${String(now.getDate()).padStart(2, '0')}` }
  }

  function read() {
    const { month, day } = periodKeys()
    try {
      const saved = JSON.parse(localStorage.getItem(storageKey) || '{}')
      return {
        month,
        day,
        monthCount: saved.month === month ? (saved.monthCount ?? 0) : 0,
        dayCount: saved.day === day ? (saved.dayCount ?? 0) : 0,
      }
    } catch {
      return { month, day, monthCount: 0, dayCount: 0 }
    }
  }

  /** 現在の使用状況（動作確認・設定画面からも読める形で返す） */
  function quota() {
    const usage = read()
    return {
      ...usage,
      monthlyLimit: monthly,
      dailyLimit: daily,
      exhausted: usage.monthCount >= monthly || usage.dayCount >= daily,
    }
  }

  function record() {
    const usage = read()
    try {
      localStorage.setItem(storageKey, JSON.stringify({
        month: usage.month,
        day: usage.day,
        monthCount: usage.monthCount + 1,
        dayCount: usage.dayCount + 1,
      }))
    } catch { /* localStorage が使えない環境でも機能自体は動かす */ }
  }

  return { quota, record }
}
