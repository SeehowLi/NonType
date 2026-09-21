import { useEffect, useState } from 'react'
import { bindingFromHotkey, useAppStore } from '../stores/appStore'
import { getConfig, getCredentialStatus, setCredential, updateConfig } from '../lib/tauri'
import { HotkeyRecorder } from './Settings/ShortcutBindingList'

const modelDefault = 'doubao-seed-2-1-turbo-260628'
const baseDefault = 'https://ark.cn-beijing.volces.com/api/v3'

export function LocalInputSettings() {
  const config = useAppStore((s) => s.config)
  const pipelineState = useAppStore((s) => s.pipelineState)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [key, setKey] = useState('')
  const [hasKey, setHasKey] = useState(false)
  const [model, setModel] = useState(
    config.llm_provider === 'doubao' ? config.llm_model : modelDefault,
  )
  const [baseUrl, setBaseUrl] = useState(
    config.llm_provider === 'doubao' ? config.llm_base_url : baseDefault,
  )
  const [enabled, setEnabled] = useState(config.polish_enabled && config.llm_provider === 'doubao')

  useEffect(() => {
    let active = true
    getCredentialStatus('llm', 'doubao')
      .then((status) => {
        if (active) setHasKey(status.hasSecret)
      })
      .catch(() => {
        if (active) setMessage('无法读取豆包整理凭据状态。')
      })
    return () => {
      active = false
    }
  }, [])

  async function persist(next: typeof config) {
    await updateConfig(next)
    const saved = await getConfig()
    useAppStore.getState().setConfig(saved)
    useAppStore.getState().setSavedConfig(saved)
  }

  async function saveShortcut(hotkey: string, mode: 'hold' | 'toggle') {
    const binding = bindingFromHotkey(hotkey)
    if (!binding) {
      setMessage('不支持这个快捷键。')
      return
    }
    setBusy(true)
    try {
      await persist({
        ...config,
        hotkey,
        hotkey_mode: mode,
        hotkeys: {
          ...config.hotkeys,
          dictation: binding,
          dictationBindings: [binding],
          dictationMode: mode,
        },
      })
      setMessage('快捷键已保存并生效。')
    } catch {
      setMessage('快捷键保存或注册失败，保留之前的设置。')
    } finally {
      setBusy(false)
    }
  }

  async function saveLlm() {
    if (enabled && !hasKey && !key.trim()) {
      setMessage('请填写 Ark API Key。')
      return
    }
    if (!model.trim() || !baseUrl.trim()) {
      setMessage('请填写模型和 API 地址。')
      return
    }
    try {
      if (new URL(baseUrl).protocol !== 'https:') throw new Error()
    } catch {
      setMessage('API 地址必须是有效的 HTTPS 地址。')
      return
    }
    setBusy(true)
    try {
      if (key.trim()) {
        await setCredential('llm', 'doubao', key.trim())
        setKey('')
        setHasKey(true)
      }
      await persist({
        ...config,
        llm_provider: 'doubao',
        llm_model: model.trim(),
        llm_base_url: baseUrl.trim(),
        polish_enabled: enabled,
        streaming_insert_enabled: false,
      })
      setMessage('豆包整理配置已保存。整理超时或失败时会输出识别原文。')
    } catch {
      setMessage('保存失败，请检查 API 地址与系统凭据库。')
    } finally {
      setBusy(false)
    }
  }

  const disabled = busy || pipelineState !== 'idle'
  return (
    <section className="space-y-5 border-t border-border pt-5">
      <h2 className="text-lg font-semibold">快捷键</h2>
      <p>点击下方后按键盘或鼠标侧键；Esc 取消。侧键绑定后用于听写，不再执行浏览器前进/后退。</p>
      <HotkeyRecorder
        specialOptions={[
          { value: 'Mouse4', label: 'Mouse 4 · 后退侧键' },
          { value: 'Mouse5', label: 'Mouse 5 · 前进侧键' },
          { value: 'RightAlt', label: '右 Alt' },
        ]}
        value={config.hotkey}
        disabled={disabled}
        onSaved={(value) => void saveShortcut(value, 'toggle')}
      />
      <label className="block">
        录音方式
        <select
          aria-label="录音方式"
          value={config.hotkey_mode}
          disabled={disabled}
          onChange={(e) =>
            void saveShortcut(config.hotkey, e.target.value === 'hold' ? 'hold' : 'toggle')
          }
          className="block w-full p-3 bg-bg-secondary rounded"
        >
          <option value="toggle">按一下开始，再按一下结束</option>
          <option value="hold">按住说话，松开结束</option>
        </select>
      </label>
      <h2 className="text-lg font-semibold">豆包文本整理</h2>
      <label className="flex gap-2">
        <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
        识别后整理文本
      </label>
      <p>保留原意、数字和技术术语，去除口头重复并补充标点，不回答你的问题。</p>
      <label className="block">
        Ark API Key {hasKey ? '（已保存，留空保留）' : ''}
        <input
          type="password"
          autoComplete="off"
          value={key}
          onChange={(e) => setKey(e.target.value)}
          className="block w-full p-3 bg-bg-secondary rounded"
        />
      </label>
      <label className="block">
        模型
        <input
          value={model}
          onChange={(e) => setModel(e.target.value)}
          className="block w-full p-3 bg-bg-secondary rounded"
        />
      </label>
      <label className="block">
        API Base URL
        <input
          value={baseUrl}
          onChange={(e) => setBaseUrl(e.target.value)}
          className="block w-full p-3 bg-bg-secondary rounded"
        />
      </label>
      <button
        type="button"
        disabled={disabled}
        onClick={() => void saveLlm()}
        className="px-5 py-3 bg-accent text-white rounded disabled:opacity-50"
      >
        保存整理配置
      </button>
      <p role="status">{message}</p>
    </section>
  )
}
