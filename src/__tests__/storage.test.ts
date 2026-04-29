import { describe, it, expect, vi } from 'vitest'
import { getSettings, saveSettings, clearSettings } from '@/shared/storage'
import { DEFAULT_SETTINGS } from '@/shared/constants'
import { chromeMock } from './setup'

// ---- getSettings -----------------------------------------------------------

describe('getSettings', () => {
  it('returns DEFAULT_SETTINGS when storage is empty', async () => {
    const settings = await getSettings()
    expect(settings).toEqual(DEFAULT_SETTINGS)
  })

  it('merges stored settings over defaults', async () => {
    // Pre-populate storage
    chromeMock.storage.sync.get.mockImplementationOnce(
      (_key: unknown, callback: (r: Record<string, unknown>) => void) => {
        callback({ settings: { enabled: false, fontSize: 'large' } })
      },
    )
    const settings = await getSettings()
    expect(settings.enabled).toBe(false)
    expect(settings.fontSize).toBe('large')
    // Other defaults preserved
    expect(settings.furiganaEnabled).toBe(DEFAULT_SETTINGS.furiganaEnabled)
  })

  it('handles undefined stored value gracefully', async () => {
    chromeMock.storage.sync.get.mockImplementationOnce(
      (_key: unknown, callback: (r: Record<string, unknown>) => void) => {
        callback({ settings: undefined })
      },
    )
    const settings = await getSettings()
    expect(settings).toEqual(DEFAULT_SETTINGS)
  })
})

// ---- saveSettings ----------------------------------------------------------

describe('saveSettings', () => {
  it('saves a partial settings update', async () => {
    await saveSettings({ enabled: false })
    expect(chromeMock.storage.sync.set).toHaveBeenCalledWith(
      expect.objectContaining({ settings: expect.objectContaining({ enabled: false }) }),
      expect.any(Function),
    )
  })

  it('merges with existing stored settings', async () => {
    // Simulate existing storage with enabled: false
    chromeMock.storage.sync.get.mockImplementationOnce(
      (_key: unknown, callback: (r: Record<string, unknown>) => void) => {
        callback({ settings: { enabled: false, fontSize: 'large' } })
      },
    )
    await saveSettings({ furiganaEnabled: false })

    const setCall = chromeMock.storage.sync.set.mock.calls[0]
    const saved = (setCall?.[0] as Record<string, unknown>)?.settings as Record<string, unknown>
    expect(saved?.['enabled']).toBe(false)
    expect(saved?.['fontSize']).toBe('large')
    expect(saved?.['furiganaEnabled']).toBe(false)
  })

  it('rejects when chrome.runtime.lastError is set', async () => {
    chromeMock.storage.sync.set.mockImplementationOnce(
      (_items: unknown, callback?: () => void) => {
        chromeMock.runtime.lastError = { message: 'QUOTA_EXCEEDED' }
        callback?.()
      },
    )
    await expect(saveSettings({ enabled: true })).rejects.toThrow('QUOTA_EXCEEDED')
  })

  it('includes all default fields in the saved object', async () => {
    await saveSettings({ enabled: true })
    const setCall = chromeMock.storage.sync.set.mock.calls[0]
    const saved = (setCall?.[0] as Record<string, unknown>)?.settings as Record<string, unknown>
    for (const key of Object.keys(DEFAULT_SETTINGS)) {
      expect(saved).toHaveProperty(key)
    }
  })
})

// ---- clearSettings ---------------------------------------------------------

describe('clearSettings', () => {
  it('calls chrome.storage.sync.remove with "settings"', async () => {
    await clearSettings()
    expect(chromeMock.storage.sync.remove).toHaveBeenCalledWith('settings', expect.any(Function))
  })

  it('rejects when chrome.runtime.lastError is set', async () => {
    chromeMock.storage.sync.remove.mockImplementationOnce(
      (_keys: unknown, callback?: () => void) => {
        chromeMock.runtime.lastError = { message: 'REMOVE_ERROR' }
        callback?.()
      },
    )
    await expect(clearSettings()).rejects.toThrow('REMOVE_ERROR')
  })

  it('resolves cleanly on success', async () => {
    await expect(clearSettings()).resolves.toBeUndefined()
  })
})
