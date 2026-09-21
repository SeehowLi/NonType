import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { LocalApp } from '../LocalApp'
import { useAppStore } from '../stores/appStore'
import * as api from '../lib/tauri'

vi.mock('../hooks/useTheme', () => ({ useTheme: () => {} }))
vi.mock('../hooks/useTauriEvents', () => ({ useTauriEvents: () => {} }))
vi.mock('../components/Settings/DictionaryPane', () => ({ DictionaryPane: () => null }))
vi.mock('../components/History', () => ({ History: () => null }))
vi.mock('../components/Toast', () => ({ ToastContainer: () => null }))
vi.mock('../i18n', () => ({ default: { changeLanguage: vi.fn() } }))
vi.mock('../lib/tauri', () => ({
  waitForDesktop: vi.fn(),
  getConfig: vi.fn(),
  getHistory: vi.fn(),
  getDictionary: vi.fn(),
  getCorrectionRules: vi.fn(),
  getCredentialStatus: vi.fn(),
  getHotkeyRegistrationError: vi.fn(),
  setCredential: vi.fn(),
  updateConfig: vi.fn(),
}))

describe('local setup', () => {
  afterEach(cleanup)
  beforeEach(() => {
    vi.resetAllMocks()
    vi.mocked(api.waitForDesktop).mockResolvedValue()
    useAppStore.setState(useAppStore.getInitialState())
    vi.mocked(api.getConfig).mockResolvedValue({
      ...useAppStore.getState().config,
      stt_provider: 'volcengine-doubao',
      stt_volcengine_resource_id: '',
      polish_enabled: false,
    })
    vi.mocked(api.getHistory).mockResolvedValue([])
    vi.mocked(api.getDictionary).mockResolvedValue([])
    vi.mocked(api.getCorrectionRules).mockResolvedValue([])
    vi.mocked(api.getHotkeyRegistrationError).mockResolvedValue(null)
    vi.mocked(api.getCredentialStatus).mockResolvedValue({
      namespace: 'stt',
      provider: 'volcengine-doubao',
      hasSecret: false,
      updatedAt: null,
      storage: 'os-vault',
    })
    vi.mocked(api.setCredential).mockResolvedValue()
    vi.mocked(api.updateConfig).mockResolvedValue()
  })

  it('requires a resource and credential before saving', async () => {
    render(<LocalApp />)
    fireEvent.click(await screen.findByText('保存配置'))
    expect(api.setCredential).not.toHaveBeenCalled()
    expect(api.updateConfig).not.toHaveBeenCalled()
  })

  it('does not reuse a saved instance id as an API resource', async () => {
    vi.mocked(api.getConfig).mockResolvedValue({
      ...useAppStore.getState().config,
      stt_provider: 'volcengine-doubao',
      stt_volcengine_resource_id: 'Speech_Recognition_Seed_streaming1234',
    })
    render(<LocalApp />)
    await screen.findByText(
      '之前填写的不是有效 Resource ID。请选择已开通的流式服务类型；已保存的凭据无需重填。',
    )
    expect(screen.getByLabelText('Resource ID')).toHaveValue('')
    fireEvent.click(screen.getByText('保存配置'))
    expect(api.updateConfig).not.toHaveBeenCalled()
  })

  it('waits for backend readiness before requesting application state', async () => {
    let ready!: () => void
    vi.mocked(api.waitForDesktop).mockReturnValue(
      new Promise<void>((resolve) => {
        ready = resolve
      }),
    )
    render(<LocalApp />)
    expect(api.getConfig).not.toHaveBeenCalled()
    ready()
    await screen.findByText('保存配置')
    expect(api.getConfig).toHaveBeenCalledOnce()
  })

  it('stores the credential only in the vault and clears the input', async () => {
    render(<LocalApp />)
    const input = await screen.findByLabelText(/Speech 凭据/)
    fireEvent.change(input, { target: { value: 'test-speech-secret' } })
    fireEvent.change(screen.getByLabelText('Resource ID'), {
      target: { value: 'volc.seedasr.sauc.duration' },
    })
    fireEvent.click(screen.getByText('保存配置'))
    await waitFor(() => expect(api.updateConfig).toHaveBeenCalled())
    expect(api.setCredential).toHaveBeenCalledWith('stt', 'volcengine-doubao', 'test-speech-secret')
    expect(JSON.stringify(vi.mocked(api.updateConfig).mock.calls)).not.toContain(
      'test-speech-secret',
    )
    expect(input).toHaveValue('')
  })

  it('does not save settings when the credential vault fails', async () => {
    vi.mocked(api.setCredential).mockRejectedValue(new Error('vault failed'))
    render(<LocalApp />)
    fireEvent.change(await screen.findByLabelText(/Speech 凭据/), {
      target: { value: 'test-secret' },
    })
    fireEvent.change(screen.getByLabelText('Resource ID'), {
      target: { value: 'volc.seedasr.sauc.duration' },
    })
    fireEvent.click(screen.getByText('保存配置'))
    await screen.findByText('保存失败，请检查系统凭据库是否可用后重试。')
    expect(api.updateConfig).not.toHaveBeenCalled()
  })
})
