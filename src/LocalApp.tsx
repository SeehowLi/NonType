import { useEffect, useState } from 'react'
import { Home, History as HistoryIcon, BookOpen, Settings, SlidersHorizontal } from 'lucide-react'
import { PersonalizationSettings } from './components/PersonalizationSettings'
import { LocalHome } from './components/LocalHome'
import appIcon from '../src-tauri/icons/mvp/128x128.png'
import './styles/local-app.css'
import i18n from './i18n'
import { useTheme } from './hooks/useTheme'
import { useTauriEvents } from './hooks/useTauriEvents'
import { useAppStore } from './stores/appStore'
import {
  getConfig,
  getHistory,
  getDictionary,
  getCorrectionRules,
  getCredentialStatus,
  getHotkeyRegistrationError,
  setCredential,
  updateConfig,
  waitForDesktop,
} from './lib/tauri'
import { DictionaryPane } from './components/Settings/DictionaryPane'
import { History } from './components/History'
import { ToastContainer } from './components/Toast'
import { LocalInputSettings } from './components/LocalInputSettings'

const asrResources = [
  ['volc.seedasr.sauc.duration', '流式语音识别 2.0 · 小时版'],
  ['volc.bigasr.sauc.duration', '流式语音识别 1.0 · 小时版'],
  ['volc.seedasr.sauc.concurrent', '流式语音识别 2.0 · 并发版'],
  ['volc.bigasr.sauc.concurrent', '流式语音识别 1.0 · 并发版'],
] as const
const isAsrResource = (value: string) => asrResources.some(([id]) => id === value)

export function LocalApp() {
  useTheme()
  useTauriEvents()
  const [view, setView] = useState('home')
  const [loaded, setLoaded] = useState(false)
  const [resource, setResource] = useState('')
  const [secret, setSecret] = useState('')
  const [hasSecret, setHasSecret] = useState(false)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const config = useAppStore((s) => s.config)
  const hotkeyError = useAppStore((s) => s.hotkeyRegistrationError)

  useEffect(() => {
    let active = true
    const step = <T,>(label: string, task: Promise<T>) =>
      task.catch(() => {
        throw new Error(label)
      })
    step('等待桌面初始化', waitForDesktop())
      .then(() =>
        Promise.all([
          step('读取设置', getConfig()),
          step('读取历史', getHistory(200, 0)),
          step('读取词典', getDictionary()),
          step('读取纠错规则', getCorrectionRules()),
          step('读取凭据状态', getCredentialStatus('stt', 'volcengine-doubao')),
          step('读取快捷键状态', getHotkeyRegistrationError()),
        ]),
      )
      .then(([saved, history, dictionary, rules, credential, shortcutError]) => {
        if (!active) return
        const store = useAppStore.getState()
        store.setConfig(saved)
        store.setSavedConfig(saved)
        store.setHistory(history)
        store.setDictionary(dictionary)
        store.setCorrectionRules(rules)
        store.setHotkeyRegistrationError(shortcutError)
        store.setOnboardingCompleted(true)
        setResource(
          isAsrResource(saved.stt_volcengine_resource_id) ? saved.stt_volcengine_resource_id : '',
        )
        if (!isAsrResource(saved.stt_volcengine_resource_id) || !credential.hasSecret)
          setView('setup')
        if (saved.stt_volcengine_resource_id && !isAsrResource(saved.stt_volcengine_resource_id)) {
          setMessage(
            '之前填写的不是有效 Resource ID。请选择已开通的流式服务类型；已保存的凭据无需重填。',
          )
        }
        setHasSecret(credential.hasSecret)
        void i18n.changeLanguage('zh')
        setLoaded(true)
      })
      .catch((error: unknown) => {
        if (active)
          setMessage(
            `初始化失败：${error instanceof Error ? error.message : '未知步骤'}。请重新打开。`,
          )
      })
    return () => {
      active = false
    }
  }, [])

  async function save() {
    if (!isAsrResource(resource) || (!hasSecret && !secret.trim())) {
      setMessage('请填写已开通的 Resource ID 和 Speech 凭据。')
      return
    }
    setBusy(true)
    setMessage('')
    try {
      if (secret.trim()) {
        await setCredential('stt', 'volcengine-doubao', secret.trim())
        setSecret('')
        setHasSecret(true)
      }
      await updateConfig({
        ...config,
        stt_provider: 'volcengine-doubao',
        stt_volcengine_resource_id: resource.trim(),
      })
      const saved = await getConfig()
      useAppStore.getState().setConfig(saved)
      useAppStore.getState().setSavedConfig(saved)
      setMessage('语音识别配置已保存。')
    } catch {
      setMessage('保存失败，请检查系统凭据库是否可用后重试。')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="local-shell">
      <aside className="local-sidebar">
        <div className="local-brand">
          <img src={appIcon} alt="" />
          <div>
            NonType<small className="block">PERSONAL VOICE INPUT</small>
          </div>
        </div>
        <nav aria-label="主导航">
          {(
            [
              ['home', '首页', Home],
              ['history', '历史记录', HistoryIcon],
              ['dictionary', '个人词典', BookOpen],
              ['personalization', '个性化', SlidersHorizontal],
              ['setup', '语音设置', Settings],
            ] as const
          ).map(([id, label, Icon]) => (
            <button key={id} type="button" onClick={() => setView(id)} aria-pressed={view === id}>
              <Icon size={18} />
              {label}
            </button>
          ))}
        </nav>
        <footer>
          你的声音，你的文字。
          <br />
          本地历史 · 豆包 AI
        </footer>
      </aside>
      {!loaded ? (
        <p className="p-6" role="status">
          {message || '正在加载…'}
        </p>
      ) : (
        <main className="local-content">
          {view === 'home' && <LocalHome navigate={setView} />}
          {view === 'personalization' && <PersonalizationSettings />}
          {view === 'setup' && (
            <section className="max-w-2xl mx-auto p-8 space-y-5">
              <h1 className="text-xl font-semibold">豆包流式语音输入</h1>
              <p>
                {config.polish_enabled
                  ? '识别后由豆包整理，再输入到光标位置。'
                  : '当前直接输出识别文本；可在下方启用豆包整理。'}
              </p>
              <p>
                <strong>{config.hotkey}</strong>：
                {config.hotkey_mode === 'toggle'
                  ? '按一下开始，再按一下结束'
                  : '按住录音，松开结束'}
                ；Esc 取消。
              </p>
              {hotkeyError && <p role="alert">快捷键注册失败：{hotkeyError}</p>}
              <label className="block">
                Speech 凭据 {hasSecret ? '（已存入系统凭据库，留空可保留）' : ''}
                <input
                  type="password"
                  autoComplete="off"
                  spellCheck={false}
                  value={secret}
                  onChange={(e) => setSecret(e.target.value)}
                  className="block w-full p-3 mt-2 rounded border border-border bg-bg-secondary"
                />
              </label>
              <p className="text-sm">
                旧版填写 App ID:Access Token；新版填写 Speech API Key。这里不使用 Ark API Key。
              </p>
              <label className="block">
                Resource ID
                <select
                  value={resource}
                  onChange={(e) => setResource(e.target.value)}
                  className="block w-full p-3 mt-2 rounded border border-border bg-bg-secondary"
                >
                  <option value="">请选择控制台已开通的服务类型</option>
                  {asrResources.map(([id, label]) => (
                    <option key={id} value={id}>
                      {label} — {id}
                    </option>
                  ))}
                </select>
              </label>
              <p className="text-sm">这是服务类型，不是实例 ID，也不是 Secret Key。</p>
              <button
                type="button"
                disabled={busy}
                onClick={() => void save()}
                className="px-5 py-3 rounded bg-accent text-white cursor-pointer disabled:opacity-50"
              >
                {busy ? '保存中…' : '保存配置'}
              </button>
              <p role="status">{message}</p>
              <LocalInputSettings />
            </section>
          )}
          {view === 'dictionary' && (
            <div className="p-8">
              <div className="local-page-header !p-0 mb-6">
                <h1>让它更懂你的表达。</h1>
                <p>
                  专有词会作为豆包 ASR 热词和 Turbo 术语提示。保存“误听 →
                  正确表达”后，下次会先在本地纠正；也可以从历史记录中添加纠错。每条规则均由你确认，可随时禁用或删除，不会擅自学习全部输入内容。
                </p>
              </div>
              <DictionaryPane />
            </div>
          )}
          {view === 'history' && <History />}
        </main>
      )}
      <ToastContainer />
    </div>
  )
}
