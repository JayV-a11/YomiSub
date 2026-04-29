import type { FlashCard, Word, LookupResult } from './types/index.js'
import { createFlashCard, calculateNextReview } from './srs.js'

const STORE_KEY = 'flashcards'

type FlashCardStore = Record<string, FlashCard>

async function loadStore(): Promise<FlashCardStore> {
  return new Promise((resolve) => {
    chrome.storage.local.get(STORE_KEY, (result) => {
      resolve((result[STORE_KEY] as FlashCardStore | undefined) ?? {})
    })
  })
}

async function persistStore(store: FlashCardStore): Promise<void> {
  return new Promise((resolve, reject) => {
    chrome.storage.local.set({ [STORE_KEY]: store }, () => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message ?? 'Storage error'))
      } else {
        resolve()
      }
    })
  })
}

export async function getFlashcards(): Promise<FlashCard[]> {
  const store = await loadStore()
  return Object.values(store)
}

export async function getFlashcard(id: string): Promise<FlashCard | null> {
  const store = await loadStore()
  return store[id] ?? null
}

export async function upsertFlashcard(card: FlashCard): Promise<void> {
  const store = await loadStore()
  store[card.id] = card
  await persistStore(store)
}

export async function deleteFlashcard(id: string): Promise<void> {
  const store = await loadStore()
  delete store[id]
  await persistStore(store)
}

/**
 * Adds a new card for the given word. If a card with the same id already
 * exists, returns the existing card without modifying it (idempotent).
 */
export async function addFlashcard(
  word: Word,
  result: LookupResult,
): Promise<{ card: FlashCard; isNew: boolean }> {
  const store = await loadStore()
  const id = word.dictionaryForm
  const existing = store[id]
  if (existing) {
    return { card: existing, isNew: false }
  }
  const card = createFlashCard(word, result)
  store[id] = card
  await persistStore(store)
  return { card, isNew: true }
}

export async function reviewFlashcard(id: string, quality: number): Promise<FlashCard> {
  const store = await loadStore()
  const card = store[id]
  if (!card) throw new Error(`Flashcard not found: ${id}`)
  const update = calculateNextReview(card, quality)
  const updated: FlashCard = { ...card, ...update }
  store[id] = updated
  await persistStore(store)
  return updated
}
