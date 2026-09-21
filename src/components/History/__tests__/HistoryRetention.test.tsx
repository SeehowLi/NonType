import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { HistoryRetention } from '../HistoryRetention'
import { useAppStore } from '../../../stores/appStore'
import * as api from '../../../lib/tauri'
vi.mock('../../../lib/tauri', () => ({
  getConfig: vi.fn(),
  updateConfig: vi.fn(),
  getHistory: vi.fn(),
}))
beforeEach(() => {
  vi.clearAllMocks()
  useAppStore.setState(useAppStore.getInitialState())
  vi.mocked(api.updateConfig).mockResolvedValue()
  vi.mocked(api.getHistory).mockResolvedValue([])
  vi.mocked(api.getConfig).mockImplementation(
    async () => vi.mocked(api.updateConfig).mock.calls[0][0],
  )
})
afterEach(cleanup)
it('offers all five periods and applies the confirmed period with no hidden count cap', async () => {
  const changed = vi.fn()
  render(<HistoryRetention onChanged={changed} />)
  expect(screen.getAllByRole('option').map((o) => o.textContent)).toEqual([
    '1天',
    '1周',
    '1月',
    '1年',
    '永久',
  ])
  fireEvent.change(screen.getByRole('combobox'), { target: { value: '7' } })
  expect(api.updateConfig).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: '应用保存期限' }))
  await waitFor(() =>
    expect(api.updateConfig).toHaveBeenCalledWith(
      expect.objectContaining({ history_retention_days: 7, history_max_entries: 0 }),
    ),
  )
  await waitFor(() => expect(changed).toHaveBeenCalledOnce())
})
