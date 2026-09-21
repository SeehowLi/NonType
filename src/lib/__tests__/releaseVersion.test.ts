import { describe, expect, it } from 'vitest'
import pkg from '../../../package.json'
import tauriConfig from '../../../src-tauri/tauri.conf.json'
import cargoSource from '../../../src-tauri/Cargo.toml?raw'
import constantsSource from '../constants.ts?raw'

describe('NonType release identity', () => {
  it('uses one release version across frontend and desktop metadata', () => {
    expect(tauriConfig.version).toBe(pkg.version)
    expect(cargoSource.match(/^version = "([^"]+)"/m)?.[1]).toBe(pkg.version)
  })
  it('keeps the visible NonType name and the compatible local data identifier', () => {
    expect(tauriConfig.productName).toBe('NonType')
    expect(tauriConfig.identifier).toBe('local.opentypeless.mvp')
  })
  it('allows a release build to provide its frontend version', () => {
    expect(constantsSource).toContain('import.meta.env.VITE_APP_VERSION')
  })
})
