# COMPONENTS.md — コンポーネント設計

## 構成の原則

- **ページ = 機能のコンテナ** (`src/pages/`)。データ取得・Realtime 購読・状態管理を担う
- **コンポーネント = 表示と局所的な操作** (`src/components/`)。データは props で受け取る
- 1 ページ内でしか使わない小さな部品（モーダル等）は、まずページファイル内のローカルコンポーネントとして定義してよい（例: `ShoppingPage` の `CreateListModal`）。**2 ページ目で必要になったら `src/components/` へ昇格**させる
- スタイルは同名の CSS Module を隣に置く（`Foo.jsx` + `Foo.module.css`）

## 既存コンポーネント（`src/components/`）

| コンポーネント | 役割 | 使用箇所 |
|---|---|---|
| `ProtectedRoute` | 未認証 / 家族未所属ユーザーのリダイレクト | `App.jsx` の保護ルート |
| `AppCard` | ホームのアプリランチャーカード | HomePage |
| `FamilyInfo` | 家族情報・メンバー表示・招待リンク | HomePage |
| `GroupSetup` | 家族グループ作成 / 参加フォーム | HomePage |
| `TodaySchedule` | 今日の予定サマリー | HomePage |
| `NotificationSettings` | Push 通知の購読・時刻設定モーダル | ShoppingPage |
| `ShoppingListPanel` | 買い物リストのパネル | Shopping 系 |
| `ShoppingItemList` | アイテム一覧・追加・チェック | ShoppingPage |
| `LoadingSpinner` | ローディング表示 | 各所 |
| `BottomNav` | アプリ横断のグローバルナビ（下部タブバー） | 全ページ（`.page` の最後の子として配置。通常フローに置くので高さの予約は不要） |
| `ConfirmDialog` | 破壊的操作の確認ダイアログ（削除など） | Shopping / Places / Inventory / Travel ほか |
| `EmptyState` | 空データ時の「アイコン＋一言＋主アクション」 | ShoppingPage ほか |
| `Toast` | 画面下部の一時通知（失敗通知・任意アクション） | ShoppingPage ほか |
| `OfflineBanner` | オフライン時の上部バナー（アプリ全体で 1 つ） | `App.jsx` |
| `JapanMap` | 日本地図（都道府県 SVG）。訪問済み都道府県のハイライトとタップ選択、ピンチ / ホイール / ボタンでの拡大縮小とドラッグ移動。`onZoomedChange` で拡大状態を外へ伝える | TravelPage |
| `schedule/*` | 予定表の画面部品（月 / 週 / アジェンダ・各モーダル） | SchedulePage |
| `travel/*` | 旅行の画面部品（詳細モーダル・行程リスト・準備リスト・各フォーム・地図パネル） | TravelPage |
| `places/PlaceDetailModal` | お出かけリストの場所詳細（読み取り専用）。地図 / Web検索 / 訪問記録 / 編集への導線 | PlacesPage |
| `places/PlacePhoto` | 場所の参考画像（Google の場所写真を名前・住所から取得）。一覧カードは画面に入ってから取得 | PlacesPage, PlaceDetailModal |
| `AddToShoppingListModal` | 他アプリから買い物リストへ品物を送る | PricePage / DishesPage |
| `VideoEmbed` | 動画（YouTube / TikTok）のサムネイル表示と、その場での埋め込み再生。再生状態は親が持つ | DishesPage |
| `PlaceSearchInput` | Google Places の場所検索入力欄（デバウンス・呼び出し上限つき。候補リストはポータル表示で呼び出し側のレイアウトを崩さない） | PlacesPage / 旅行の宿泊先 |
| `GlobalSearch` | アプリ横断検索モーダル | HomePage |
| `Modal` | 全ページ共通モーダル（ボトムシート↔中央表示、Esc / 背景タップで閉じる、フォーカストラップ、背景スクロールロック。表示領域（visual viewport）に追従するのでキーボード表示・ピンチでも位置がずれない） | 全ページのモーダル |
| `ErrorBoundary` | 描画エラー時のフォールバック UI（再試行 / ホームへ） | `App.jsx`（アプリ全体 + ルート単位） |
| `ErrorNotice` | データ取得失敗時のページ内表示（再読み込み） | `useFamilyData` の `error` と組で使う |

## 共通化ロードマップ

モーダルは `Modal` に集約済み。ボタン・空状態などは各ページに **CSS Module パターンとして重複**している（`styles.saveBtn` 等の同型実装）。方針:

- **すぐに全部共通化しない。** 動いている UI の一括置換はデグレリスクが利益を上回る
- 新規実装・既存改修で同じ部品が **3 箇所目**に必要になったタイミングで、以下の候補名で `src/components/` に抽出する

| 候補 | 抽出元パターン | 備考 |
|---|---|---|
| `BottomSheet` | モバイル向け選択 UI | `Modal` の `variant="sheet"` で概ね代替できる |
| `Button` | saveBtn / cancelBtn / dangerBtn | variant: primary / ghost / danger |
| `Input` / `SearchBar` | modalInput / 検索バー | 16px フォント維持（iOS ズーム防止） |
| `Card` | surface + radius-lg + shadow | |
| `EmptyState` | 絵文字 + 案内文 | 参照実装: `ShoppingPage` の empty |
| `Chip` / `Badge` | タグ表示（PlacesPage）・件数バッジ | |
| `Avatar` | メンバー表示 | |

抽出したらこの表を「既存コンポーネント」へ移動して更新すること。

## コンポーネントを書くときのルール

1. **関数コンポーネント + named `export default`**。クラスコンポーネント禁止（唯一の例外は `ErrorBoundary`。React の仕様上クラスでしか実装できない）
2. **props は分割代入**で受け取り、コールバックは `onXxx` 命名（`onClose`, `onSubmit`, `onToggleFavorite`）
3. **データ取得はページに置く**のが基本。コンポーネントが自分でフェッチするのは、その機能が自己完結している場合のみ（例: `ShoppingItemList` は `listId` を受けて自分でアイテムを取得・購読する）
4. **状態は最も近い場所に**: グローバル状態は `AuthContext` のみ。新たな Context / 状態管理ライブラリの追加は要相談
5. **表示ゆらぎの防御**: `familyMember?.name || familyMember?.email || '名前なし'` のように null を UI に漏らさない
6. **ローディング / 空 / エラーの 3 状態**を必ず考慮する。データゼロで真っ白な画面にしない
7. スタイルの詳細は [DESIGN.md](./DESIGN.md)、命名は [STYLE_GUIDE.md](./STYLE_GUIDE.md)

## ディレクトリ構成（現状と拡張方針)

```
src/
├── App.jsx              # ルーティング定義（新ページはここに追加）
├── main.jsx             # エントリポイント
├── index.css            # デザイントークン・グローバルスタイル（安易に触らない）
├── contexts/
│   └── AuthContext.jsx  # 認証・家族状態（唯一のグローバル状態）
├── pages/               # ルーティング単位。Foo.jsx + Foo.module.css
├── components/          # 複数ページで使う共通コンポーネント
│   ├── schedule/        # 予定表の画面部品（+ Schedule.module.css）。SchedulePage 専用
│   └── travel/          # 旅行の画面部品（+ Travel.module.css）。TravelPage 専用
├── hooks/               # （将来）useXxx カスタムフック。3 箇所目の重複ロジックから
├── lib/                 # 外部サービスクライアント（supabase, pushNotifications）
└── utils/               # 純粋なユーティリティ（googleMaps）
```

- 1 ページが大きくなりすぎた場合のみ、`components/<ページ名>/` に画面部品を切り出してよい（例: `components/schedule/`）。CSS Module はその配下に 1 枚置き、ページと部品で共有する
- 新しい階層（`features/` 等）への再編成は行わない。この構成の中で増やす
- ページ数がさらに増えて破綻し始めたら、その時に再編成を**提案**する（勝手にやらない）
