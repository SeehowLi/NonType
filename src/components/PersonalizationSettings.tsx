import { useState } from 'react'
import { useAppStore } from '../stores/appStore'
import { getConfig, updateConfig } from '../lib/tauri'
import defaultPrompt from '../../prompts/personalization.txt?raw'

export function PersonalizationSettings() {
  const config = useAppStore((s) => s.config)
  const [prompt, setPrompt] = useState(config.polish_custom_prompt || defaultPrompt)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  async function save() {
    setBusy(true)
    try {
      await updateConfig({ ...useAppStore.getState().config, polish_custom_prompt: prompt.trim() })
      const saved = await getConfig()
      useAppStore.getState().setConfig(saved)
      useAppStore.getState().setSavedConfig(saved)
      setMessage('个性化提示词已保存，下次听写生效。')
    } catch {
      setMessage('保存失败，请重试。')
    } finally {
      setBusy(false)
    }
  }
  return (
    <section className="max-w-3xl mx-auto p-8 space-y-5">
      <h1 className="text-2xl font-semibold">个性化整理</h1>
      <p className="text-sm text-text-secondary leading-7">
        识别文字交给 Turbo
        前，会先附上这里的整理要求。你可以调整语气、段落与列表风格；始终以保留原意、不替你回答问题为边界。
      </p>
      <label className="block">
        给 Turbo 的提示词
        <textarea
          aria-label="给 Turbo 的提示词"
          value={prompt}
          onChange={(e) => {
            setPrompt(e.target.value)
            setMessage('')
          }}
          maxLength={2000}
          rows={15}
          spellCheck={false}
          className="block w-full mt-3 p-4 rounded-xl bg-bg-secondary border border-border text-sm leading-7 resize-y"
        />
      </label>
      <p className="text-xs text-text-tertiary">
        {prompt.length} / 2000 · 留空使用推荐提示词。只有启用豆包文本整理时生效。
      </p>
      <div className="flex gap-3">
        <button
          type="button"
          disabled={busy}
          onClick={() => void save()}
          className="px-5 py-2.5 rounded-lg bg-accent text-white disabled:opacity-50"
        >
          {busy ? '保存中…' : '保存提示词'}
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => {
            setPrompt(defaultPrompt)
            setMessage('已恢复推荐内容，点击保存后生效。')
          }}
          className="px-4 py-2.5 rounded-lg border border-border"
        >
          恢复推荐提示词
        </button>
      </div>
      <p role="status" className="text-sm">
        {message}
      </p>
    </section>
  )
}
