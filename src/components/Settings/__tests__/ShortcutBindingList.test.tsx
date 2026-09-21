import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { HotkeyRecorder, ShortcutBindingList } from '../ShortcutBindingList'
import * as tauri from '../../../lib/tauri'

vi.mock('../../../lib/tauri', () => ({
  pauseHotkey: vi.fn().mockResolvedValue(undefined),
  resumeHotkey: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) =>
      ({
        'settings.pressKeyCombination': 'Press a key combination...',
        'settings.clickToConfirm': 'Click to confirm',
        'settings.shortcutAdd': 'Add shortcut',
        'settings.shortcutRemove': 'Remove shortcut',
        'settings.shortcutManage': 'Manage shortcut',
        'settings.shortcutMakePrimary': 'Make primary',
        'settings.shortcutPrimary': 'Primary',
        'settings.shortcutMax': 'Up to three shortcuts',
        'settings.hotkeyConflict': 'Shortcut conflict',
        'common.cancel': 'Cancel',
      })[key] || key,
  }),
}))

const ctrlSlash = { primary: '/', modifiers: ['Ctrl'] }
const f8 = { primary: 'F8', modifiers: [] }
const f9 = { primary: 'F9', modifiers: [] }

describe('ShortcutBindingList', () => {
  beforeEach(() => vi.clearAllMocks())
  afterEach(cleanup)

  it('records physical right Alt as a standalone key on release', () => {
    const saved = vi.fn()
    render(<HotkeyRecorder value="Ctrl+/" onSaved={saved} />)
    fireEvent.click(screen.getByRole('button', { name: 'Ctrl+/' }))
    fireEvent.keyDown(window, { key: 'Alt', code: 'AltRight', location: 2, altKey: true })
    expect(saved).not.toHaveBeenCalled()
    fireEvent.keyUp(window, { key: 'Alt', code: 'AltRight', location: 2 })
    expect(saved).toHaveBeenCalledWith('RightAlt')
    expect(tauri.pauseHotkey).toHaveBeenCalled()
    expect(tauri.resumeHotkey).toHaveBeenCalled()
  })

  it.each([[3, 'Mouse4'], [4, 'Mouse5']] as const)('records mouse side button %s on release', (button, key) => {
    const saved = vi.fn()
    render(<HotkeyRecorder value="RightAlt" onSaved={saved} />)
    fireEvent.click(screen.getByRole('button', { name: 'RightAlt' }))
    fireEvent.mouseDown(window, { button })
    expect(saved).not.toHaveBeenCalled()
    fireEvent.mouseUp(window, { button })
    expect(saved).toHaveBeenCalledExactlyOnceWith(key)
  })

  it('Escape cancels capture and clears a pending auto-save without replacing the binding', () => {
    vi.useFakeTimers()
    try {
      const saved = vi.fn()
      render(<HotkeyRecorder value="RightAlt" onSaved={saved} />)
      fireEvent.click(screen.getByRole('button', { name: 'RightAlt' }))
      fireEvent.keyDown(window, { key: 'F8', code: 'F8' })
      fireEvent.keyDown(window, { key: 'Escape', code: 'Escape' })
      vi.advanceTimersByTime(2000)
      expect(saved).not.toHaveBeenCalled()
      expect(screen.getByRole('button', { name: 'RightAlt' })).toBeInTheDocument()
      expect(tauri.resumeHotkey).toHaveBeenCalled()
    } finally {
      vi.useRealTimers()
    }
  })

  it('keeps a single required binding visually quiet', () => {
    render(
      <ShortcutBindingList
        role="dictation"
        label="Dictate"
        bindings={[ctrlSlash]}
        otherBindings={[]}
        required
        specialOptions={[]}
        onChange={vi.fn()}
      />,
    )

    expect(screen.queryByText('Primary')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Manage shortcut' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Remove shortcut' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Move shortcut/ })).not.toBeInTheDocument()
  })

  it('starts capture immediately and provides an explicit cancel action', () => {
    render(
      <ShortcutBindingList
        role="dictation"
        label="Dictate"
        bindings={[ctrlSlash]}
        otherBindings={[]}
        required
        specialOptions={[]}
        onChange={vi.fn()}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Add shortcut' }))

    expect(screen.getByRole('button', { name: 'Press a key combination...' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '—' })).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(
      screen.queryByRole('button', { name: 'Press a key combination...' }),
    ).not.toBeInTheDocument()
  })

  it('adds bindings up to three and disables a fourth', () => {
    const onChange = vi.fn()
    const { rerender } = render(
      <ShortcutBindingList
        role="dictation"
        label="Dictate"
        bindings={[ctrlSlash]}
        otherBindings={[]}
        required
        specialOptions={[{ value: 'F8', label: 'F8' }]}
        onChange={onChange}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Add shortcut' }))
    fireEvent.click(screen.getByRole('button', { name: 'F8' }))
    expect(onChange).toHaveBeenCalledWith([ctrlSlash, f8])

    rerender(
      <ShortcutBindingList
        role="dictation"
        label="Dictate"
        bindings={[ctrlSlash, f8, f9]}
        otherBindings={[]}
        required
        specialOptions={[]}
        onChange={onChange}
      />,
    )
    expect(screen.getByRole('button', { name: 'Add shortcut' })).toBeDisabled()
    expect(screen.getByText('Up to three shortcuts')).toBeInTheDocument()
  })

  it('manages multiple bindings from one restrained menu', () => {
    const onChange = vi.fn()
    render(
      <ShortcutBindingList
        role="dictation"
        label="Dictate"
        bindings={[ctrlSlash, f8]}
        otherBindings={[]}
        required
        specialOptions={[]}
        onChange={onChange}
      />,
    )

    expect(screen.getAllByText('Primary')).toHaveLength(1)
    const manageButtons = screen.getAllByRole('button', { name: 'Manage shortcut' })
    expect(manageButtons).toHaveLength(2)

    fireEvent.click(manageButtons[1])
    fireEvent.click(screen.getByRole('button', { name: 'Make primary' }))
    expect(onChange).toHaveBeenCalledWith([f8, ctrlSlash])
  })

  it('allows optional roles to remove their final binding', () => {
    const onChange = vi.fn()
    render(
      <ShortcutBindingList
        role="ask"
        label="Ask"
        bindings={[f8]}
        otherBindings={[]}
        required={false}
        specialOptions={[]}
        onChange={onChange}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Manage shortcut' }))
    fireEvent.click(screen.getByRole('button', { name: 'Remove shortcut' }))
    expect(onChange).toHaveBeenCalledWith([])
  })

  it('rejects a captured shortcut already used by another role', () => {
    const onChange = vi.fn()
    render(
      <ShortcutBindingList
        role="ask"
        label="Ask"
        bindings={[f8]}
        otherBindings={[ctrlSlash]}
        required={false}
        specialOptions={[{ value: 'Ctrl+/', label: 'Ctrl + /' }]}
        onChange={onChange}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'F8' }))
    fireEvent.click(screen.getByRole('button', { name: 'Ctrl + /' }))

    expect(screen.getByText('Shortcut conflict')).toBeInTheDocument()
    expect(onChange).not.toHaveBeenCalled()
    expect(tauri.resumeHotkey).toHaveBeenCalled()
  })

  it('resumes global hotkeys when capture is abandoned by unmounting', () => {
    const { unmount } = render(
      <ShortcutBindingList
        role="dictation"
        label="Dictate"
        bindings={[ctrlSlash]}
        otherBindings={[]}
        required
        specialOptions={[]}
        onChange={vi.fn()}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Ctrl+/' }))
    expect(tauri.pauseHotkey).toHaveBeenCalled()

    unmount()

    expect(tauri.resumeHotkey).toHaveBeenCalled()
  })
})
