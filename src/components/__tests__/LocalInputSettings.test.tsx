import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { LocalInputSettings } from '../LocalInputSettings'
import { useAppStore } from '../../stores/appStore'
import * as api from '../../lib/tauri'

vi.mock('../../lib/tauri', () => ({
  getConfig: vi.fn(),
  getCredentialStatus: vi.fn(),
  setCredential: vi.fn(),
  updateConfig: vi.fn(),
  pauseHotkey: vi.fn().mockResolvedValue(undefined),
  resumeHotkey: vi.fn().mockResolvedValue(undefined),
}))
afterEach(cleanup)
beforeEach(() => {
  vi.clearAllMocks()
  useAppStore.setState(useAppStore.getInitialState())
  vi.mocked(api.getCredentialStatus).mockResolvedValue({
    namespace: 'llm',
    provider: 'doubao',
    hasSecret: false,
    updatedAt: null,
    storage: 'os-vault',
  })
  vi.mocked(api.updateConfig).mockResolvedValue()
  vi.mocked(api.setCredential).mockResolvedValue()
  vi.mocked(api.getConfig).mockImplementation(async () => {
    const calls = vi.mocked(api.updateConfig).mock.calls
    return calls[calls.length - 1]?.[0] || useAppStore.getState().config
  })
})
it('persists RightAlt and toggle with consistent typed and legacy bindings', async () => {
  render(<LocalInputSettings />)
  fireEvent.click(screen.getByRole('button', { name: useAppStore.getState().config.hotkey }))
  fireEvent.keyDown(window, { key: 'Alt', code: 'AltRight', location: 2, altKey: true })
  fireEvent.keyUp(window, { key: 'Alt', code: 'AltRight', location: 2 })
  await waitFor(() => expect(api.updateConfig).toHaveBeenCalled())
  const saved = vi.mocked(api.updateConfig).mock.calls[0][0]
  expect(saved.hotkey).toBe('RightAlt')
  expect(saved.hotkey_mode).toBe('toggle')
  expect(saved.hotkeys.dictationMode).toBe('toggle')
  expect(saved.hotkeys.dictationBindings).toEqual([{ primary: 'RightAlt', modifiers: [] }])
})
it('saves Ark credentials separately and enables the requested Turbo model', async () => {
  render(<LocalInputSettings />)
  fireEvent.click(screen.getByLabelText('识别后整理文本'))
  fireEvent.change(screen.getByLabelText(/Ark API Key/), { target: { value: 'test-ark-key' } })
  fireEvent.click(screen.getByText('保存整理配置'))
  await waitFor(() => expect(api.updateConfig).toHaveBeenCalled())
  expect(api.setCredential).toHaveBeenCalledWith('llm', 'doubao', 'test-ark-key')
  const saved = vi.mocked(api.updateConfig).mock.calls[0][0]
  expect(saved.llm_model).toBe('doubao-seed-2-1-turbo-260628')
  expect(saved.polish_enabled).toBe(true)
  expect(saved.streaming_insert_enabled).toBe(false)
  expect(JSON.stringify(saved)).not.toContain('test-ark-key')
})
