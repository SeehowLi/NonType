import { useEffect, lazy, Suspense } from 'react'
import i18n from './i18n'
import { useTauriEvents } from './hooks/useTauriEvents'
import { useTheme } from './hooks/useTheme'
import { useAppStore } from './stores/appStore'
import { getConfig } from './lib/tauri'
import { Capsule } from './components/Capsule'
import { ToastContainer } from './components/Toast'
const LocalApp = lazy(() => import('./LocalApp').then((m) => ({ default: m.LocalApp })))
const AskPanel = lazy(() => import('./components/AskPanel').then((m) => ({ default: m.AskPanel })))
function CapsuleApp() {
  useTauriEvents({ refreshHistory: false })
  useTheme()

  const setConfig = useAppStore((s) => s.setConfig)

  useEffect(() => {
    // Load config so DurationTimer gets the correct max_recording_seconds
    getConfig()
      .then((config) => {
        setConfig(config)
        // Restore UI language from config
        if (config.ui_language && config.ui_language !== i18n.language) {
          i18n.changeLanguage(config.ui_language)
          localStorage.setItem('ui_language', config.ui_language)
        }
      })
      .catch((e) => {
        console.error('Failed to load config in capsule:', e)
      })
  }, [setConfig])

  // Window show is handled by useCapsuleResize (setSize → setPosition → show),
  // which works on both Windows and macOS. The previous rAF-based show approach
  // failed on macOS because WKWebView pauses requestAnimationFrame in hidden windows.
  return <Capsule />
}

function AskApp() {
  useTheme()
  const setConfig = useAppStore((s) => s.setConfig)

  useEffect(() => {
    getConfig()
      .then((config) => {
        setConfig(config)
        if (config.ui_language && config.ui_language !== i18n.language) {
          i18n.changeLanguage(config.ui_language)
          localStorage.setItem('ui_language', config.ui_language)
        }
      })
      .catch((e) => {
        console.error('Failed to load config in Ask app:', e)
      })
  }, [setConfig])

  return (
    <>
      <AskPanel />
      <ToastContainer />
    </>
  )
}

function App() {
  // Capsule window loads with #capsule hash — detect synchronously, no race condition
  if (window.location.hash === '#capsule') return <CapsuleApp />
  if (window.location.hash === '#ask')
    return (
      <Suspense>
        <AskApp />
      </Suspense>
    )
  return (
    <Suspense>
      <LocalApp />
    </Suspense>
  )
}

export default App
