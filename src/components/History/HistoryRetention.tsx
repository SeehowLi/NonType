import { useState } from 'react'
import { useAppStore } from '../../stores/appStore'
import { getConfig, getHistory, updateConfig } from '../../lib/tauri'

export function HistoryRetention({ onChanged }: { onChanged: () => void }) {
  const days = useAppStore((s) => s.config.history_retention_days)
  const [pending, setPending] = useState<number | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  async function save() {
    if (pending === null) return
    setBusy(true)
    setError('')
    try {
      await updateConfig({
        ...useAppStore.getState().config,
        history_enabled: true,
        history_retention_days: pending,
        history_max_entries: 0,
      })
      const config = await getConfig()
      useAppStore.getState().setConfig(config)
      useAppStore.getState().setSavedConfig(config)
      useAppStore.getState().setHistory(await getHistory(200, 0))
      onChanged()
      setPending(null)
    } catch {
      setError('保存失败，请重试。')
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="px-5 py-3 border-b border-border space-y-2 text-xs">
      <label className="flex items-center gap-3">
        历史记录保存时间
        <select
          aria-label="历史记录保存时间"
          disabled={busy}
          value={pending ?? days}
          onChange={(e) => setPending(Number(e.target.value))}
          className="rounded-lg bg-bg-secondary border border-border px-3 py-2"
        >
          <option value={1}>1天</option>
          <option value={7}>1周</option>
          <option value={30}>1月</option>
          <option value={365}>1年</option>
          <option value={0}>永久</option>
          {![0, 1, 7, 30, 365].includes(days) && <option value={days}>{days}天（原设置）</option>}
        </select>
      </label>
      <p className="text-text-tertiary">
        1月按30天、1年按365天计算；永久不会按时间或条数自动删除。
      </p>
      {pending !== null && (
        <div className="space-y-2">
          <p>
            {pending > 0
              ? '应用后会立即删除超出新期限的记录，无法恢复。'
              : '记录将永久保留，你仍可随时手动删除。'}
          </p>
          <div className="flex gap-3">
            <button
              disabled={busy}
              type="button"
              onClick={() => void save()}
              className="px-3 py-1.5 rounded bg-accent text-white"
            >
              应用保存期限
            </button>
            <button disabled={busy} type="button" onClick={() => setPending(null)}>
              取消
            </button>
          </div>
        </div>
      )}
      {error && <p role="alert">{error}</p>}
    </div>
  )
}
