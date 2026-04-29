import { getSettings, saveSettings } from '@/shared/storage'
import type { Message } from '@/shared/types'

// Initialise extension on install — ensures defaults exist in storage
chrome.runtime.onInstalled.addListener(() => {
  getSettings().catch(() => {
    // Defaults will be applied lazily on first getSettings() call
  })
})

chrome.runtime.onMessage.addListener(
  (message: Message, _sender, sendResponse): boolean => {
    switch (message.type) {
      case 'PING':
        sendResponse({ type: 'PONG' })
        return false

      case 'GET_SETTINGS':
        getSettings()
          .then((settings) => sendResponse(settings))
          .catch(() => sendResponse(null))
        return true // keep message channel open for async response

      case 'SAVE_SETTINGS':
        saveSettings(message.payload)
          .then(() => sendResponse({ type: 'SAVE_SETTINGS_RESULT', success: true }))
          .catch((err: Error) =>
            sendResponse({ type: 'SAVE_SETTINGS_RESULT', success: false, error: err.message }),
          )
        return true

      default:
        return false
    }
  },
)
