import { getSettings, saveSettings } from '@/shared/storage'
import { addFlashcard, getFlashcards, reviewFlashcard, deleteFlashcard } from '@/shared/flashcard-storage'
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
        return true

      case 'SAVE_SETTINGS':
        saveSettings(message.payload)
          .then(() => sendResponse({ type: 'SAVE_SETTINGS_RESULT', success: true }))
          .catch((err: Error) =>
            sendResponse({ type: 'SAVE_SETTINGS_RESULT', success: false, error: err.message }),
          )
        return true

      case 'ADD_FLASHCARD':
        addFlashcard(message.payload.word, message.payload.result, {
          context: message.payload.context,
          kanjiBreakdown: message.payload.kanjiBreakdown,
          relatedWords: message.payload.relatedWords,
          pitchAccent: message.payload.pitchAccent,
        })
          .then(({ isNew }) =>
            sendResponse({ type: 'ADD_FLASHCARD_RESULT', success: true, isNew }),
          )
          .catch((err: Error) =>
            sendResponse({ type: 'ADD_FLASHCARD_RESULT', success: false, isNew: false, error: err.message }),
          )
        return true

      case 'GET_FLASHCARDS':
        getFlashcards()
          .then((cards) => sendResponse({ type: 'GET_FLASHCARDS_RESULT', payload: cards }))
          .catch(() => sendResponse({ type: 'GET_FLASHCARDS_RESULT', payload: [] }))
        return true

      case 'REVIEW_FLASHCARD':
        reviewFlashcard(message.payload.id, message.payload.quality)
          .then((card) =>
            sendResponse({ type: 'REVIEW_FLASHCARD_RESULT', success: true, card }),
          )
          .catch((err: Error) =>
            sendResponse({ type: 'REVIEW_FLASHCARD_RESULT', success: false, error: err.message }),
          )
        return true

      case 'DELETE_FLASHCARD':
        deleteFlashcard(message.payload.id)
          .then(() => sendResponse({ type: 'DELETE_FLASHCARD_RESULT', success: true }))
          .catch((err: Error) =>
            sendResponse({ type: 'DELETE_FLASHCARD_RESULT', success: false, error: err.message }),
          )
        return true

      default:
        return false
    }
  },
)
