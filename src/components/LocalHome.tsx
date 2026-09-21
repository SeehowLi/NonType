import { useMemo } from 'react'
import { ArrowUpRight, AudioLines, BookOpen, Clock3, Mic2 } from 'lucide-react'
import { useAppStore } from '../stores/appStore'

export function LocalHome({ navigate }: { navigate: (view: string) => void }) {
  const history = useAppStore((s) => s.history)
  const config = useAppStore((s) => s.config)
  const dictionary = useAppStore((s) => s.dictionary)
  const rules = useAppStore((s) => s.correctionRules)
  const state = useAppStore((s) => s.pipelineState)
  const stats = useMemo(() => {
    const characters = history.reduce(
      (sum, item) =>
        sum + Array.from((item.polished_text || item.raw_text).replace(/\s/g, '')).length,
      0,
    )
    const minutes = history.reduce((sum, item) => sum + (item.duration_ms || 0), 0) / 60000
    const dates = new Map<string, number>()
    history.forEach((item) => {
      const day = new Date(item.created_at).toLocaleDateString('sv-SE')
      dates.set(day, (dates.get(day) || 0) + 1)
    })
    const days = Array.from({ length: 84 }, (_, i) => {
      const day = new Date()
      day.setDate(day.getDate() - 83 + i)
      const key = day.toLocaleDateString('sv-SE')
      return { key, count: dates.get(key) || 0 }
    })
    return { characters, minutes, days, active: dates.size }
  }, [history])
  return (
    <div className="local-home">
      <div className="local-eyebrow">YOUR VOICE, CLEARLY.</div>
      <h1>
        说出想法，
        <br />
        <span>让文字跟上你。</span>
      </h1>
      <p className="local-intro">按一下开始，说完再按一下。豆包帮你整理，光标所在即是落笔之处。</p>
      <div className="local-dashboard">
        <div className="local-main-column">
          <div className="local-section-title">
            <h2>你的语音足迹</h2>
            <span>最近 {history.length} 次 · 最多 200 条</span>
          </div>
          <div className="local-stat-grid">
            <div className="local-card">
              <AudioLines size={18} />
              <strong>
                {stats.characters.toLocaleString()}
                <small>字</small>
              </strong>
              <span>累计口述字数</span>
            </div>
            <div className="local-card">
              <Clock3 size={18} />
              <strong>
                {stats.minutes.toFixed(1)}
                <small>分钟</small>
              </strong>
              <span>口述时长</span>
            </div>
            <div className="local-card">
              <Mic2 size={18} />
              <strong>
                {stats.minutes > 0 ? Math.round(stats.characters / stats.minutes) : '—'}
                <small>字 / 分钟</small>
              </strong>
              <span>平均口述速度</span>
            </div>
            <div className="local-card">
              <BookOpen size={18} />
              <strong>
                {dictionary.length + rules.filter((r) => r.enabled).length}
                <small>条</small>
              </strong>
              <span>专属词汇与纠正</span>
            </div>
          </div>
          <section className="local-card local-activity">
            <div className="local-section-title">
              <h2>持续表达</h2>
              <span>已记录 {stats.active} 个活跃日</span>
            </div>
            <div className="local-heatmap">
              {stats.days.map((day) => (
                <div
                  key={day.key}
                  title={`${day.key} · ${day.count} 次`}
                  style={{
                    background: day.count
                      ? `rgba(125,149,255,${Math.min(0.3 + day.count * 0.15, 1)})`
                      : undefined,
                  }}
                />
              ))}
            </div>
            <footer>
              <span>最近 12 周 · 依据本地最近记录</span>
              <span>少 ▪ ▪ ▪ 多</span>
            </footer>
          </section>
          <section className="local-card local-recent">
            <div className="local-section-title">
              <h2>最近一次表达</h2>
              <button onClick={() => navigate('history')}>
                查看历史 <ArrowUpRight size={14} />
              </button>
            </div>
            <p>
              {history[0]?.polished_text ||
                history[0]?.raw_text ||
                '还没有听写记录。在任意输入框中，按下快捷键开始第一次表达。'}
            </p>
          </section>
        </div>
        <aside className="local-details">
          <section className="local-card">
            <div className="local-status">
              <i /> {state === 'idle' ? '已准备好' : '正在处理语音'}
            </div>
            <h2>你的输入开关</h2>
            <kbd>{config.hotkey.replace('Mouse', 'Mouse ').replace('RightAlt', 'Right Alt')}</kbd>
            <p>
              {config.hotkey_mode === 'toggle' ? '按一下开始，再按一下结束' : '按住说话，松开结束'}
            </p>
            <button onClick={() => navigate('setup')}>
              更换按键或鼠标侧键 <ArrowUpRight size={14} />
            </button>
          </section>
          <section className="local-card local-personal">
            <span className="local-eyebrow">PERSONAL DICTIONARY</span>
            <h2>越用，越懂你的词。</h2>
            <p>保存专有名词与常见误听。下次识别会参考你的词汇，Turbo 整理时也会保留它们。</p>
            <button onClick={() => navigate('dictionary')}>
              管理我的词典 <ArrowUpRight size={14} />
            </button>
          </section>
          <p className="local-note">
            音频默认不保存。词典和历史保存在这台电脑；识别与整理调用你配置的豆包服务。
          </p>
        </aside>
      </div>
    </div>
  )
}
