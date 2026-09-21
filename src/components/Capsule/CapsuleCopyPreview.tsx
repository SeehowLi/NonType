import { useState } from 'react'
import { Copy, Check, X } from 'lucide-react'
import { writeText } from '@tauri-apps/plugin-clipboard-manager'
import { useAppStore } from '../../stores/appStore'

export function CapsuleCopyPreview({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)
  const [failed, setFailed] = useState(false)
  const dismiss = useAppStore((s) => s.setCopyPreview)
  async function copy() {
    try {
      await writeText(text)
      setCopied(true)
      setFailed(false)
    } catch {
      setFailed(true)
    }
  }
  return (
    <div
      className="p-4 text-white"
      onPointerDown={(e) => e.stopPropagation()}
      onPointerUp={(e) => e.stopPropagation()}
    >
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs text-white/60">文字已就绪</span>
        <button
          type="button"
          aria-label="关闭文字预览"
          onClick={() => dismiss(null)}
          className="p-1 text-white/60 hover:text-white"
        >
          <X size={14} />
        </button>
      </div>
      <p
        className="text-sm leading-5 overflow-hidden whitespace-pre-wrap break-words h-[60px]"
        style={{ display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical' }}
      >
        {Array.from(text).slice(0, 180).join('')}
        {Array.from(text).length > 180 ? '…' : ''}
      </p>
      <button
        type="button"
        onClick={() => void copy()}
        className="mt-3 flex items-center gap-2 rounded-lg bg-white/15 px-3 py-1.5 text-xs hover:bg-white/25"
      >
        {copied ? <Check size={13} /> : <Copy size={13} />}
        {copied ? '已复制完整文字' : '复制完整文字'}
      </button>
      {failed && (
        <span role="alert" className="text-xs text-red-300">
          复制失败，请重试
        </span>
      )}
    </div>
  )
}
