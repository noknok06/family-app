import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { BsHouseFill } from 'react-icons/bs'
import { IconShopping, IconBell } from '../lib/icons'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'
import { useFamilyData, unwrap } from '../hooks/useFamilyData'
import ShoppingItemList from '../components/ShoppingItemList'
import NotificationSettings from '../components/NotificationSettings'
import ConfirmDialog from '../components/ConfirmDialog'
import Modal from '../components/Modal'
import BottomNav from '../components/BottomNav'
import EmptyState from '../components/EmptyState'
import ErrorNotice from '../components/ErrorNotice'
import Toast from '../components/Toast'
import styles from './ShoppingPage.module.css'

export default function ShoppingPage() {
  const navigate = useNavigate()
  const { familyMember } = useAuth()
  const [selectedListId, setSelectedListId] = useState(null)
  const [showCreate, setShowCreate] = useState(false)
  const [showNotifSettings, setShowNotifSettings] = useState(false)
  const [confirmDeleteList, setConfirmDeleteList] = useState(null) // list object
  const [toast, setToast] = useState(null) // { message, variant }

  const sortLists = (a, b) => {
    if (a.is_favorite !== b.is_favorite) return a.is_favorite ? -1 : 1
    return b.uncheckedCount - a.uncheckedCount
  }

  const {
    data: lists,
    loading: loadingLists,
    error: loadError,
    refetch: fetchLists,
    setData: setLists,
  } = useFamilyData(
    async familyId => {
      const lists = await unwrap(
        supabase.from('shopping_lists')
          .select('id, name, created_at, created_by, is_favorite')
          .eq('family_id', familyId).order('created_at', { ascending: false })
      )
      const uncheckedItems = lists.length
        ? await unwrap(
            supabase.from('shopping_items').select('list_id')
              .in('list_id', lists.map(l => l.id)).eq('checked', false)
          )
        : []
      const countMap = {}
      for (const item of uncheckedItems) {
        countMap[item.list_id] = (countMap[item.list_id] || 0) + 1
      }
      // お気に入り優先、同条件内は未購入数の多い順
      return lists.map(l => ({ ...l, uncheckedCount: countMap[l.id] || 0 })).sort(sortLists)
    },
    ['shopping_lists'],
    [],
  )

  useEffect(() => {
    if (lists.length > 0 && !selectedListId) {
      setSelectedListId(lists[0].id)
    }
  }, [lists, selectedListId])

  async function handleCreateList(name) {
    const { data, error } = await supabase
      .from('shopping_lists')
      .insert({ family_id: familyMember.family_id, name, created_by: familyMember.user_id })
      .select()
      .single()
    if (!error && data) {
      await fetchLists()
      setSelectedListId(data.id)
    }
  }

  async function handleToggleFavorite(listId) {
    const list = lists.find(l => l.id === listId)
    if (!list) return
    const is_favorite = !list.is_favorite
    setLists(prev => prev.map(l => l.id === listId ? { ...l, is_favorite } : l).sort(sortLists))
    const { error } = await supabase.from('shopping_lists').update({ is_favorite }).eq('id', listId)
    if (error) {
      console.error('お気に入り更新エラー:', error)
      setToast({ message: 'お気に入りの更新に失敗しました。通信環境を確認してください。', variant: 'error' })
      // ロールバック
      setLists(prev => prev.map(l => l.id === listId ? { ...l, is_favorite: !is_favorite } : l).sort(sortLists))
    }
  }

  async function handleDeleteList(listId) {
    await supabase.from('shopping_lists').delete().eq('id', listId)
    if (selectedListId === listId) {
      setSelectedListId(lists.find(l => l.id !== listId)?.id ?? null)
    }
  }

  const handleCountChange = useCallback((listId, count) => {
    setLists(prev => prev.map(list => list.id === listId ? { ...list, uncheckedCount: count } : list))
  }, [setLists])

  const selectedList = lists.find(l => l.id === selectedListId)

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <button className={styles.backBtn} onClick={() => navigate('/')} aria-label="ホームへ戻る"><BsHouseFill /></button>
        <h1 className={styles.headerTitle}><IconShopping className={styles.headerTitleIcon} /> 買い物リスト</h1>
        <button
          className={styles.notifBtn}
          onClick={() => setShowNotifSettings(true)}
          aria-label="通知設定"
          title="通知設定"
        ><IconBell /></button>
      </header>

      <div className={styles.body}>
        {/* リスト選択タブ */}
        <div className={styles.tabsBar}>
          {loadingLists ? (
            <span className={styles.tabsLoading}>読み込み中...</span>
          ) : (
            <div className={styles.tabsScroll}>
              {lists.map(l => (
                <button
                  key={l.id}
                  className={`${styles.tab} ${l.id === selectedListId ? styles.tabActive : ''}`}
                  onClick={() => setSelectedListId(l.id)}
                  aria-pressed={l.id === selectedListId}
                >
                  <span className={styles.tabName}>{l.name}</span>
                  {l.uncheckedCount > 0 && (
                    <span className={styles.tabBadge}>{l.uncheckedCount}</span>
                  )}
                </button>
              ))}
              <button className={styles.tabNew} onClick={() => setShowCreate(true)}>
                ＋ 新しいリスト
              </button>
            </div>
          )}
        </div>

        {/* コンテンツ */}
        <main className={styles.content}>
          {loadError ? (
            <ErrorNotice onRetry={fetchLists} />
          ) : selectedListId ? (
            <ShoppingItemList
              key={selectedListId}
              onCountChange={handleCountChange}
              onDeleteList={() => setConfirmDeleteList(selectedList)}
              listId={selectedListId}
              listName={selectedList?.name}
              memberName={familyMember?.name || familyMember?.email || '名前なし'}
              isFavorite={selectedList?.is_favorite ?? false}
              onToggleFavorite={() => handleToggleFavorite(selectedListId)}
            />
          ) : (
            !loadingLists && (
              <EmptyState
                icon={<IconShopping />}
                title="買い物リストを作りましょう"
                description="家族で共有できる買い物リストです。チェックするだけで即時に同期されます。"
                actionLabel="＋ 最初のリストを作成"
                onAction={() => setShowCreate(true)}
              />
            )
          )}
        </main>
      </div>

      {showNotifSettings && (
        <NotificationSettings
          familyMember={familyMember}
          onClose={() => setShowNotifSettings(false)}
        />
      )}

      {showCreate && (
        <CreateListModal
          onSubmit={async (name) => { await handleCreateList(name); setShowCreate(false) }}
          onClose={() => setShowCreate(false)}
        />
      )}

      <ConfirmDialog
        open={!!confirmDeleteList}
        title="リストを削除しますか？"
        message={confirmDeleteList
          ? `「${confirmDeleteList.name}」とリスト内のアイテムがすべて削除されます。この操作は取り消せません。`
          : ''}
        confirmLabel="削除する"
        onConfirm={async () => {
          const id = confirmDeleteList.id
          setConfirmDeleteList(null)
          await handleDeleteList(id)
        }}
        onCancel={() => setConfirmDeleteList(null)}
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

function CreateListModal({ onSubmit, onClose }) {
  const [name, setName] = useState('')
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    if (!name.trim()) return
    setSubmitting(true)
    await onSubmit(name.trim())
    setSubmitting(false)
  }

  return (
    <Modal open onClose={onClose} title="新しいリスト">
      <form onSubmit={handleSubmit} className={styles.modalForm}>
        <input
          className={styles.modalInput}
          type="text"
          value={name}
          onChange={e => setName(e.target.value)}
          placeholder="リスト名を入力..."
          maxLength={50}
          autoFocus
        />
        <div className={styles.modalBtns}>
          <button type="button" className={styles.cancelBtn} onClick={onClose}>キャンセル</button>
          <button type="submit" className={styles.saveBtn} disabled={submitting || !name.trim()}>
            {submitting ? '作成中...' : '作成'}
          </button>
        </div>
      </form>
    </Modal>
  )
}
