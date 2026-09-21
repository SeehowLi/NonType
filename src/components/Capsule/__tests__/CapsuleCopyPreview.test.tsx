import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { writeText } from '@tauri-apps/plugin-clipboard-manager'
import { CapsuleCopyPreview } from '../CapsuleCopyPreview'
import { useAppStore } from '../../../stores/appStore'

vi.mock('@tauri-apps/plugin-clipboard-manager', () => ({ writeText: vi.fn() }))
afterEach(() => {
  cleanup()
  vi.resetAllMocks()
  useAppStore.setState(useAppStore.getInitialState())
})

describe('copy preview', () => {
  it('shows a short preview but copies the complete polished text', async () => {
    const text = '整理后的文字🙂\n'.repeat(80)
    vi.mocked(writeText).mockResolvedValue(undefined)
    render(<CapsuleCopyPreview text={text} />)
    expect(screen.getByText(/整理后的文字/).textContent?.length).toBeLessThan(text.length)
    fireEvent.click(screen.getByRole('button', { name: '复制完整文字' }))
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(text))
    expect(await screen.findByText('已复制完整文字')).toBeInTheDocument()
  })

  it('retains text after clipboard failure and allows retry', async () => {
    vi.mocked(writeText)
      .mockRejectedValueOnce(new Error('clipboard busy'))
      .mockResolvedValueOnce(undefined)
    render(<CapsuleCopyPreview text="不要丢失这句话" />)
    fireEvent.click(screen.getByRole('button', { name: '复制完整文字' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('复制失败')
    expect(screen.getByText('不要丢失这句话')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '复制完整文字' }))
    expect(await screen.findByText('已复制完整文字')).toBeInTheDocument()
  })

  it('dismisses only the preview', () => {
    useAppStore.setState({ copyPreview: '结果', pipelineState: 'idle' })
    render(<CapsuleCopyPreview text="结果" />)
    fireEvent.click(screen.getByRole('button', { name: '关闭文字预览' }))
    expect(useAppStore.getState().copyPreview).toBeNull()
    expect(useAppStore.getState().pipelineState).toBe('idle')
  })
})
