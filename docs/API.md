# API.md — データアクセスと Edge Functions

本アプリに独自の REST API サーバーはない。データアクセスは **Supabase クライアント（`src/lib/supabase.js`）を直接使う**。認可はすべて RLS（[DATABASE.md](./DATABASE.md)）が担う。

## 環境変数

| 変数 | 用途 |
|---|---|
| `VITE_SUPABASE_URL` | Supabase プロジェクト URL |
| `VITE_SUPABASE_ANON_KEY` | Supabase anon キー（RLS 前提で公開可） |
| `VITE_VAPID_PUBLIC_KEY` | Web Push 公開鍵（`src/lib/pushNotifications.js`） |
| `VITE_GOOGLE_MAPS_API_KEY` | Google Maps JS API（`src/utils/googleMaps.js`。お出かけリストの地図・住所検索、旅行の宿泊先検索）。未設定でも各入力欄は通常のテキスト入力として動く。呼び出し制限は下記「Places Autocomplete の使い方」を参照 |

Edge Functions 側（Supabase ダッシュボードで設定）: `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` / `VAPID_SUBJECT` / `SUPABASE_SERVICE_ROLE_KEY`。

## クエリの標準パターン

### 一覧取得は `useFamilyData` を使う

家族スコープの「初回取得 + Realtime 購読 + 再取得」は `src/hooks/useFamilyData.js` に集約している。
新規ページはこのフックから書き始めること（`supabase.channel()` を自前で書くのは、行単位の差分適用など
再フェッチでは非効率な場合だけ。例: `DishesPage`）。

```js
const { data: items, loading, error, refetch } = useFamilyData(
  familyId => unwrap(
    supabase.from('inventory_items').select('*').eq('family_id', familyId).order('name')
  ),
  ['inventory_items'],   // この配列のテーブルの family_id 一致の変更を購読し、変化したら再取得
  [],                    // 取得前の初期値
)
```

- `unwrap(query)` は `error` を例外にして返り値を `data` だけにするヘルパー。フックが catch してログ + `error` に載せる
- 複数テーブルをまとめて取る場合は fetcher でオブジェクトを返す（`{ trips, activitiesMap }` など）
- `error` が立ったら `ErrorNotice`（再読み込みボタン付き）を出す。ローディングは `LoadingSpinner inline`

### 取得（SELECT）

```js
const { data, error } = await supabase
  .from('shopping_lists')
  .select('id, name, created_at, is_favorite')   // カラムを明示（* は極力避ける）
  .eq('family_id', familyMember.family_id)        // RLS で守られていても明示する
  .order('created_at', { ascending: false })
if (error) { console.error('リスト取得エラー:', error); return }
```

- リレーション取得は埋め込み構文: `select('*, budget_categories(name), family_members(id, name)')`
- FK が複数あるときは明示: `select('*, added_by_member:family_members!wish_places_added_by_fkey(id, name)')`
- 単一行は `.maybeSingle()`（0 件が正常系のとき）/ `.single()`（必ず 1 件のとき）

### 更新は楽観的更新 + ロールバック

UI を先に更新し、Supabase の `error` 時に元へ戻す（`ShoppingPage.handleToggleFavorite` が参照実装）:

```js
setItems(prev => prev.map(i => i.id === id ? { ...i, checked } : i))  // 1. 先に UI 反映
const { error } = await supabase.from('shopping_items').update({ checked }).eq('id', id)
if (error) {
  console.error('更新エラー:', error)
  setItems(prev => prev.map(i => i.id === id ? { ...i, checked: !checked } : i))  // 2. 失敗時ロールバック
}
```

### Realtime 購読（フックを使わない場合）

`useFamilyData` で足りないときだけ、ページの `useEffect` でチャンネルを作り、**必ずクリーンアップで解除**する:

```js
useEffect(() => {
  if (!familyMember?.family_id) return
  const channel = supabase
    .channel('shopping_lists_changes')  // チャンネル名は「テーブル名_changes」or「テーブル名_rt」
    .on('postgres_changes',
      { event: '*', schema: 'public', table: 'shopping_lists',
        filter: `family_id=eq.${familyMember.family_id}` },
      fetchLists)
    .subscribe()
  return () => supabase.removeChannel(channel)
}, [familyMember?.family_id, fetchLists])
```

- 購読対象テーブルは realtime パブリケーションに追加されている必要がある（[DATABASE.md](./DATABASE.md) の Realtime 列参照）
- コールバックは差分適用ではなく**再フェッチ**（`fetchXxx`）に統一している。データ量が小さい前提のシンプル設計

## Edge Functions（`supabase/functions/`、Deno / TypeScript）

| 関数 | 呼び出し元 | 役割 |
|---|---|---|
| `fetch-og-image` | クライアント（`supabase.functions.invoke('fetch-og-image', { body: { url } })`、DishesPage） | URL から OG 画像を取得し `dish-thumbnails` バケットへ永続保存（期限付き URL 対策）。http/https のみ許可する URL バリデーションあり |
| `send-shopping-notifications` | スケジュール実行（cron） | `family_settings.notification_hour`（JST）に一致する家族へ、未チェックの買い物アイテムを Web Push 通知。service_role で RLS をバイパス |
| `send-schedule-reminders` | スケジュール実行（cron） | リマインダー指定のある予定を JST の暦日で展開し、通知時刻に達した回を Web Push。二重送信は `schedule_reminder_log` で防止。オカレンス計算は `occurrences.ts` に分離 |
| `notify-schedule-change` | クライアント（SchedulePage） | 予定の追加・更新・コメント・日程調整を家族へ即時 Push（本人の端末と通知 OFF のユーザーは除外） |

### Edge Function を書くときの規約

- CORS ヘッダー（`Access-Control-Allow-Origin` 等）と `OPTIONS` 応答を必ず実装する（既存 2 関数のパターンを踏襲）
- 入力は必ずバリデーションし、エラーは `{ error: string }` JSON + 適切なステータスコードで返す
- service_role キーは Edge Function 内のみ。クライアントに露出させない
- デプロイは `supabase functions deploy <name>`（手動）。完了報告にデプロイ要否を明記する
- **日付は JST の暦日で計算する。** クライアント（`src/lib/schedule.js`）はブラウザのローカル時刻で暦日を扱うため、Edge Function 側で UTC の暦日を使うと繰り返し予定の除外日や通知日が 1 日ずれる。繰り返しの計算を変更したら `node scripts/check-recurrence-parity.mjs` で両者の一致を確認する

## Push 通知（`src/lib/pushNotifications.js`）

- `isPushSupported()` / `getPushStatus()` / `subscribeToPush(familyId, userId)` / `unsubscribeFromPush()` を提供
- 購読は `push_subscriptions` テーブルにデバイスごとに保存（`UNIQUE(user_id, endpoint)`）
- 受信側は `public/sw-push.js`（vite-plugin-pwa の Workbox に `importScripts` で注入）

## 外部 API

- **Google Maps JS API**: `src/utils/googleMaps.js` の `loadGoogleMapsScript()` でシングルトンロード。`loading=async` + `importLibrary()` で必要ライブラリのみ読み込む。新たに地図機能を使う場合もこの関数を経由する
- 新しい外部 API の追加は原則 Edge Function 経由にする（API キー秘匿・CORS 回避のため）


## Places Autocomplete の使い方（課金を無料枠に収める）

場所検索は **必ず `components/PlaceSearchInput` を使う**。`google.maps.places.Autocomplete`
ウィジェットを直接使わないこと（1 文字入力するたびにリクエストが飛ぶ）。

無料枠は Essentials SKU で **月 10,000 コール**。`utils/placesAutocomplete.js` で次の制限をかけている。

| 制限 | 既定値 | 目的 |
|---|---|---|
| デバウンス | 450ms | 入力が落ち着いてから 1 回だけ問い合わせる |
| 最小文字数 | 2 文字 | 1 文字での無駄な検索をしない |
| 同一クエリのキャッシュ | セッション中 | 打ち直し・バックスペースで再検索しない |
| セッショントークン | 候補取得 → 詳細取得 | 1 セッションとして扱わせる |
| 1 日の上限 | 100 リクエスト | 端末ごと（localStorage 記録） |
| 1 か月の上限 | 1,000 リクエスト | 無料枠の 10%。上限到達後は候補を出さず手入力に任せる |

これで「9 文字を打って 1 件選ぶ」操作が **11 リクエスト → 2 リクエスト**になる。

**Google Cloud Console 側でも必ず併用すること**（アプリ側の上限は端末ごとの目安でしかない）:

- API キーに HTTP リファラー制限と API 制限（Maps JavaScript API / Places API のみ）をかける
- 「割り当て」で Places API の 1 日あたりリクエスト上限を設定する（真のハードリミット）
- 請求先アカウントに予算アラートを設定する


## 場所の参考画像（Google の場所写真）

お出かけリストの参考画像は `utils/placePhotos.js` の `getPlacePhoto({ name, address })` で取得し、
`components/places/PlacePhoto` が表示する。画像はユーザーに登録させず、写真をアプリ側に保存もしない
（Google Maps Platform の規約で場所データの長期キャッシュが禁止されているため）。

処理は「新 Places API の Text Search（`Place.searchByText`）で名前 + 住所から 1 件引き、その場所の
写真 1 枚の URL を使う」だけ。無料枠は Text Search（Pro SKU）が **月 5,000 コール**、
Place Photos（Essentials SKU）が **月 10,000 コール**で、次の制限をかけている。

| 制限 | 既定値 | 目的 |
|---|---|---|
| 取得タイミング | 画面に入ってから | 一覧を開いただけで全件取得しない（IntersectionObserver） |
| 結果のキャッシュ | 7 日（見つからない場合は 3 日） | 同じ場所を何度も引かない。写真 URL には期限があるため長く持たない |
| 同時リクエストの集約 | 同じ場所は 1 本 | 一覧と詳細を同時に開いても 1 回 |
| 1 日の上限 | 60 リクエスト | 端末ごと（localStorage 記録） |
| 1 か月の上限 | 500 リクエスト | 無料枠の 10%。上限到達後は画像を出さずプレースホルダー表示 |

**Google Cloud Console 側の準備**: API キーの API 制限に **Places API (New)** を追加する
（未有効だと取得に失敗し、画像なしの表示にフォールバックする）。割り当て・予算アラートは
Autocomplete と同じ考え方で設定する。

Google の場所写真は帰属表示が必要なため、`PlacePhoto` は画像右下に提供元（Google / 撮影者名）を出す。
