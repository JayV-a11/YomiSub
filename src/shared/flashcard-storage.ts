import type {
  FlashCard,
  Word,
  LookupResult,
  CardContext,
  KanjiInfo,
  RelatedWord,
  PitchAccentInfo,
} from './types/index.js'
import {
  createFlashCard,
  calculateNextReview,
  createInitialFsrsState,
  DEFAULT_STABILITY,
} from './srs.js'

const STORE_KEY = 'flashcards'

type FlashCardStore = Record<string, FlashCard>

/**
 * Backfills fields that may be missing on cards saved before a schema migration.
 * Pure read-side: callers can decide whether to persist the upgraded shape.
 *
 * Migrations performed:
 *   1. Add `context: null` if missing (Phase 1).
 *   2. Add `stability: 1` if missing (Phase 2 prep).
 *   3. Build FSRS state from legacy SM-2 fields (Phase 2 — FSRS).
 */
function migrateCard(card: FlashCard): FlashCard {
  const needsContext = card.context === undefined
  const needsStability = card.stability === undefined
  const needsFsrs = card.fsrs === undefined
  const needsKanji = card.kanjiBreakdown === undefined
  const needsRelated = card.relatedWords === undefined
  const needsPitch = card.pitchAccent === undefined
  if (
    !needsContext &&
    !needsStability &&
    !needsFsrs &&
    !needsKanji &&
    !needsRelated &&
    !needsPitch
  )
    return card

  return {
    ...card,
    context: card.context ?? null,
    stability: card.stability ?? DEFAULT_STABILITY,
    fsrs: card.fsrs ?? createInitialFsrsState(card.addedAt),
    kanjiBreakdown: card.kanjiBreakdown ?? [],
    relatedWords: card.relatedWords ?? [],
    pitchAccent: card.pitchAccent ?? null,
  }
}

async function loadStore(): Promise<FlashCardStore> {
  return new Promise((resolve) => {
    chrome.storage.local.get(STORE_KEY, (result) => {
      const raw = (result[STORE_KEY] as FlashCardStore | undefined) ?? {}
      const migrated: FlashCardStore = {}
      for (const [id, card] of Object.entries(raw)) migrated[id] = migrateCard(card)
      resolve(migrated)
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
 * exists, the existing card is kept but its context is backfilled if it
 * was missing — letting users "upgrade" plain cards by re-clicking the
 * same word in a video.
 */
export interface AddFlashcardExtras {
  context?: CardContext | null
  kanjiBreakdown?: KanjiInfo[]
  relatedWords?: RelatedWord[]
  pitchAccent?: PitchAccentInfo | null
}

export async function addFlashcard(
  word: Word,
  result: LookupResult,
  extras: AddFlashcardExtras = {},
): Promise<{ card: FlashCard; isNew: boolean }> {
  const store = await loadStore()
  const id = word.dictionaryForm
  const existing = store[id]
  if (existing) {
    // Backfill missing fields if the user re-clicks an old card with richer data.
    let upgraded = existing
    if (upgraded.context === null && extras.context) {
      upgraded = { ...upgraded, context: extras.context }
    }
    if (upgraded.kanjiBreakdown.length === 0 && (extras.kanjiBreakdown?.length ?? 0) > 0) {
      upgraded = { ...upgraded, kanjiBreakdown: extras.kanjiBreakdown! }
    }
    if (upgraded.relatedWords.length === 0 && (extras.relatedWords?.length ?? 0) > 0) {
      upgraded = { ...upgraded, relatedWords: extras.relatedWords! }
    }
    if (upgraded.pitchAccent === null && extras.pitchAccent) {
      upgraded = { ...upgraded, pitchAccent: extras.pitchAccent }
    }
    if (upgraded !== existing) {
      store[id] = upgraded
      await persistStore(store)
    }
    return { card: upgraded, isNew: false }
  }
  const card = createFlashCard(word, result, extras)
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
