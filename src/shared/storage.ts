import type { UserSettings } from './types/index.js'
import { DEFAULT_SETTINGS } from './constants.js'

export async function getSettings(): Promise<UserSettings> {
  return new Promise((resolve) => {
    chrome.storage.sync.get('settings', (result) => {
      const stored = (result['settings'] as Partial<UserSettings> | undefined) ?? {}
      resolve({ ...DEFAULT_SETTINGS, ...stored })
    })
  })
}

export async function saveSettings(settings: Partial<UserSettings>): Promise<void> {
  return new Promise((resolve, reject) => {
    chrome.storage.sync.get('settings', (current) => {
      const stored = (current['settings'] as Partial<UserSettings> | undefined) ?? {}
      const merged: UserSettings = { ...DEFAULT_SETTINGS, ...stored, ...settings }
      chrome.storage.sync.set({ settings: merged }, () => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message ?? 'Unknown storage error'))
        } else {
          resolve()
        }
      })
    })
  })
}

export async function clearSettings(): Promise<void> {
  return new Promise((resolve, reject) => {
    chrome.storage.sync.remove('settings', () => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message ?? 'Unknown storage error'))
      } else {
        resolve()
      }
    })
  })
}
