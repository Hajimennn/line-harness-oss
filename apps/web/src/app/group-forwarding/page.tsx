'use client'

import { useEffect, useState } from 'react'
import Header from '@/components/layout/header'
import { api } from '@/lib/api'
import { useAccount } from '@/contexts/account-context'
import type { GroupForwardRequest, GroupForwardRule } from '@line-crm/shared'

type RuleForm = {
  name: string
  sourceGroupId: string
  targetGroupId: string
  approverUserId: string
}

const emptyForm: RuleForm = {
  name: '',
  sourceGroupId: '',
  targetGroupId: '',
  approverUserId: '',
}

function formatDate(value: string | null) {
  if (!value) return '-'
  try {
    return new Intl.DateTimeFormat('ja-JP', {
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(value))
  } catch {
    return value
  }
}

export default function GroupForwardingPage() {
  const { selectedAccount } = useAccount()
  const [rules, setRules] = useState<GroupForwardRule[]>([])
  const [requests, setRequests] = useState<GroupForwardRequest[]>([])
  const [form, setForm] = useState<RuleForm>(emptyForm)
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  const load = async () => {
    setLoading(true)
    setError('')
    try {
      const [rulesRes, requestsRes] = await Promise.all([
        api.groupForwarding.rules.list(selectedAccount?.id),
        api.groupForwarding.requests.pending(selectedAccount?.id),
      ])
      if (rulesRes.success) setRules(rulesRes.data)
      else setError(rulesRes.error)
      if (requestsRes.success) setRequests(requestsRes.data)
      else setError(requestsRes.error)
    } catch {
      setError('データの読み込みに失敗しました。')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [selectedAccount?.id])

  const updateForm = (partial: Partial<RuleForm>) =>
    setForm((current) => ({ ...current, ...partial }))

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    if (!form.name || !form.sourceGroupId || !form.targetGroupId || !form.approverUserId) {
      setError('すべての項目を入力してください。')
      return
    }

    setSubmitting(true)
    try {
      const res = await api.groupForwarding.rules.create({
        lineAccountId: selectedAccount?.id ?? null,
        name: form.name.trim(),
        sourceGroupId: form.sourceGroupId.trim(),
        targetGroupId: form.targetGroupId.trim(),
        approverUserId: form.approverUserId.trim(),
      })
      if (!res.success) {
        setError(res.error)
        return
      }
      setForm(emptyForm)
      await load()
    } catch {
      setError('ルールの作成に失敗しました。')
    } finally {
      setSubmitting(false)
    }
  }

  const toggleRule = async (rule: GroupForwardRule) => {
    try {
      const res = await api.groupForwarding.rules.update(rule.id, { isActive: !rule.isActive })
      if (!res.success) {
        setError(res.error)
        return
      }
      await load()
    } catch {
      setError('ルールの更新に失敗しました。')
    }
  }

  return (
    <div>
      <Header
        title="承認付き転送"
        description="グループで受信したテキストを、承認後に別グループへ転送します"
      />

      {error && (
        <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="mb-6 bg-amber-50 border border-amber-200 rounded-lg p-4">
        <p className="text-sm font-semibold text-amber-900">グループIDはBotが参加済みのグループのみ使えます。</p>
        <p className="text-xs text-amber-800 mt-1">
          転送元・転送先の両方にBotが参加していない場合、受信や転送Pushは動作しません。
        </p>
      </div>

      <form onSubmit={handleCreate} className="bg-white border border-gray-200 rounded-lg p-5 mb-6">
        <h2 className="text-sm font-semibold text-gray-900 mb-4">転送ルールを作成</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <label className="block">
            <span className="text-xs font-medium text-gray-600">ルール名</span>
            <input
              value={form.name}
              onChange={(e) => updateForm({ name: e.target.value })}
              className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
              placeholder="例: AからBへ承認転送"
            />
          </label>
          <label className="block">
            <span className="text-xs font-medium text-gray-600">承認者 userId</span>
            <input
              value={form.approverUserId}
              onChange={(e) => updateForm({ approverUserId: e.target.value })}
              className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono"
              placeholder="Uxxxxxxxx"
            />
          </label>
          <label className="block">
            <span className="text-xs font-medium text-gray-600">転送元 groupId</span>
            <input
              value={form.sourceGroupId}
              onChange={(e) => updateForm({ sourceGroupId: e.target.value })}
              className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono"
              placeholder="Cxxxxxxxx"
            />
          </label>
          <label className="block">
            <span className="text-xs font-medium text-gray-600">転送先 groupId</span>
            <input
              value={form.targetGroupId}
              onChange={(e) => updateForm({ targetGroupId: e.target.value })}
              className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono"
              placeholder="Cxxxxxxxx"
            />
          </label>
        </div>
        <button
          type="submit"
          disabled={submitting}
          className="mt-4 px-4 py-2 rounded-lg text-white text-sm font-medium disabled:opacity-50"
          style={{ backgroundColor: '#06C755' }}
        >
          {submitting ? '作成中...' : '作成'}
        </button>
      </form>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <section className="bg-white border border-gray-200 rounded-lg overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100">
            <h2 className="text-sm font-semibold text-gray-900">ルール一覧</h2>
          </div>
          {loading ? (
            <div className="p-6 text-sm text-gray-400">読み込み中...</div>
          ) : rules.length === 0 ? (
            <div className="p-6 text-sm text-gray-400">ルールはまだありません。</div>
          ) : (
            <div className="divide-y divide-gray-100">
              {rules.map((rule) => (
                <div key={rule.id} className="p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h3 className="text-sm font-semibold text-gray-900">{rule.name}</h3>
                      <p className="text-xs text-gray-500 mt-2 font-mono break-all">From: {rule.sourceGroupId}</p>
                      <p className="text-xs text-gray-500 mt-1 font-mono break-all">To: {rule.targetGroupId}</p>
                      <p className="text-xs text-gray-500 mt-1 font-mono break-all">Approver: {rule.approverUserId}</p>
                    </div>
                    <button
                      onClick={() => toggleRule(rule)}
                      className={`shrink-0 px-3 py-1 rounded-full text-xs font-medium ${
                        rule.isActive ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
                      }`}
                    >
                      {rule.isActive ? '有効' : '無効'}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="bg-white border border-gray-200 rounded-lg overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100">
            <h2 className="text-sm font-semibold text-gray-900">承認待ち申請</h2>
          </div>
          {loading ? (
            <div className="p-6 text-sm text-gray-400">読み込み中...</div>
          ) : requests.length === 0 ? (
            <div className="p-6 text-sm text-gray-400">承認待ちはありません。</div>
          ) : (
            <div className="divide-y divide-gray-100">
              {requests.map((request) => (
                <div key={request.id} className="p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h3 className="text-sm font-semibold text-gray-900">
                        申請ID: <span className="font-mono">{request.approvalCode}</span>
                      </h3>
                      <p className="text-xs text-gray-500 mt-1">期限: {formatDate(request.expiresAt)}</p>
                      <p className="text-xs text-gray-500 mt-2 font-mono break-all">From: {request.sourceGroupId}</p>
                      <p className="text-xs text-gray-500 mt-1 font-mono break-all">To: {request.targetGroupId}</p>
                      <p className="mt-3 text-sm text-gray-800 whitespace-pre-wrap break-words">{request.messageText}</p>
                    </div>
                    <span className="shrink-0 px-2 py-1 rounded-full text-xs font-medium bg-yellow-100 text-yellow-700">
                      pending
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  )
}
