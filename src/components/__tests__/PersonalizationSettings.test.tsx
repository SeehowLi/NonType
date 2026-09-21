import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { PersonalizationSettings } from '../PersonalizationSettings'
import { useAppStore } from '../../stores/appStore'
import * as api from '../../lib/tauri'
vi.mock('../../lib/tauri', () => ({ getConfig: vi.fn(), updateConfig: vi.fn() }))
beforeEach(() => {
  vi.clearAllMocks()
  useAppStore.setState(useAppStore.getInitialState())
  vi.mocked(api.updateConfig).mockResolvedValue()
  vi.mocked(api.getConfig).mockImplementation(
    async () => vi.mocked(api.updateConfig).mock.calls[0][0],
  )
})
afterEach(cleanup)
it('shows a recommended prompt and persists the user edit without changing API configuration', async () => {
  render(<PersonalizationSettings />)
  const editor = screen.getByRole('textbox', { name: '给 Turbo 的提示词' })
  expect((editor as HTMLTextAreaElement).value).toContain('请将我的语音转写')
  fireEvent.change(editor, { target: { value: '保留英文术语，按自然段整理。' } })
  fireEvent.click(screen.getByRole('button', { name: '保存提示词' }))
  await waitFor(() =>
    expect(api.updateConfig).toHaveBeenCalledWith(
      expect.objectContaining({ polish_custom_prompt: '保留英文术语，按自然段整理。' }),
    ),
  )
  expect(await screen.findByText('个性化提示词已保存，下次听写生效。')).toBeInTheDocument()
})
