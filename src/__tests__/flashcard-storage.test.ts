import { describe, it, expect } from 'vitest'
import {
  getFlashcards,
  getFlashcard,
  upsertFlashcard,
  deleteFlashcard,
  addFlashcard,
  reviewFlashcard,
} from '@/shared/flashcard-storage'
import { DEFAULT_EASE_FACTOR, createInitialFsrsState } from '@/shared/srs'
import type { FlashCard, Word, LookupResult } from '@/shared/types'

// ---- Fixtures --------------------------------------------------------------

function makeCard(overrides: Partial<FlashCard> = {}): FlashCard {
  const now = Date.now()
  return {
    id: '学生',
    word: '学生',
    reading: 'がくせい',
    dictionaryForm: '学生',
    partOfSpeech: '名詞',
    definitions: ['student'],
    source: 'jmdict',
    context: null,
    kanjiBreakdown: [],
    relatedWords: [],
    pitchAccent: null,
    fsrs: createInitialFsrsState(now),
    interval: 1,
    repetitions: 0,
    easeFactor: DEFAULT_EASE_FACTOR,
    stability: 1,
    dueDate: now,
    addedAt: now,
    lastReviewedAt: null,
    ...overrides,
  }
}

function makeWord(surface = '食べる'): Word {
  return {
    surface,
    reading: 'たべる',
    dictionaryForm: surface,
    partOfSpeech: '動詞',
    startIndex: 0,
    endIndex: surface.length,
  }
}

function makeResult(overrides: Partial<LookupResult> = {}): LookupResult {
  return {
    word: '食べる',
    reading: 'たべる',
    partOfSpeech: '動詞',
    definitions: ['to eat'],
    source: 'jmdict',
    ...overrides,
  }
}

// ---- getFlashcards ---------------------------------------------------------

describe('getFlashcards', () => {
  it('returns empty array when storage is empty', async () => {
    const cards = await getFlashcards()
    expect(cards).toEqual([])
  })

  it('returns all stored cards', async () => {
    const a = makeCard({ id: '学生' })
    const b = makeCard({ id: '食べる', word: '食べる' })
    await upsertFlashcard(a)
    await upsertFlashcard(b)

    const cards = await getFlashcards()
    expect(cards).toHaveLength(2)
    expect(cards.map((c) => c.id).sort()).toEqual(['学生', '食べる'])
  })
})

// ---- getFlashcard ----------------------------------------------------------

describe('getFlashcard', () => {
  it('returns null when card does not exist', async () => {
    const card = await getFlashcard('nonexistent')
    expect(card).toBeNull()
  })

  it('returns the card when it exists', async () => {
    const original = makeCard({ id: '学生' })
    await upsertFlashcard(original)

    const found = await getFlashcard('学生')
    expect(found).toEqual(original)
  })
})

// ---- upsertFlashcard -------------------------------------------------------

describe('upsertFlashcard', () => {
  it('inserts a new card', async () => {
    const card = makeCard()
    await upsertFlashcard(card)

    const found = await getFlashcard(card.id)
    expect(found).toEqual(card)
  })

  it('overwrites an existing card with the same id', async () => {
    const original = makeCard({ definitions: ['student'] })
    await upsertFlashcard(original)

    const updated = { ...original, definitions: ['student', 'pupil'] }
    await upsertFlashcard(updated)

    const found = await getFlashcard(original.id)
    expect(found?.definitions).toEqual(['student', 'pupil'])
  })
})

// ---- deleteFlashcard -------------------------------------------------------

describe('deleteFlashcard', () => {
  it('removes the card from storage', async () => {
    await upsertFlashcard(makeCard())
    await deleteFlashcard('学生')

    const found = await getFlashcard('学生')
    expect(found).toBeNull()
  })

  it('does not throw when deleting a non-existent card', async () => {
    await expect(deleteFlashcard('ghost')).resolves.toBeUndefined()
  })

  it('leaves other cards intact', async () => {
    const a = makeCard({ id: 'a' })
    const b = makeCard({ id: 'b' })
    await upsertFlashcard(a)
    await upsertFlashcard(b)
    await deleteFlashcard('a')

    const cards = await getFlashcards()
    expect(cards.map((c) => c.id)).toEqual(['b'])
  })
})

// ---- addFlashcard ----------------------------------------------------------

describe('addFlashcard', () => {
  it('creates a new card and returns isNew=true', async () => {
    const { card, isNew } = await addFlashcard(makeWord(), makeResult())
    expect(isNew).toBe(true)
    expect(card.id).toBe('食べる')
    expect(card.definitions).toEqual(['to eat'])
  })

  it('returns existing card and isNew=false on duplicate dictionaryForm', async () => {
    await addFlashcard(makeWord(), makeResult())
    const { card, isNew } = await addFlashcard(makeWord(), makeResult({ definitions: ['to consume'] }))
    expect(isNew).toBe(false)
    expect(card.definitions).toEqual(['to eat'])
  })

  it('persists the new card so getFlashcard can retrieve it', async () => {
    await addFlashcard(makeWord('見る'), makeResult({ word: '見る', reading: 'みる', definitions: ['to see'] }))
    const found = await getFlashcard('見る')
    expect(found).not.toBeNull()
    expect(found?.definitions).toEqual(['to see'])
  })

  it('initialises SRS fields with defaults', async () => {
    const { card } = await addFlashcard(makeWord(), makeResult())
    expect(card.repetitions).toBe(0)
    expect(card.easeFactor).toBe(DEFAULT_EASE_FACTOR)
    expect(card.interval).toBe(1)
    expect(card.lastReviewedAt).toBeNull()
  })
})

// ---- reviewFlashcard -------------------------------------------------------

describe('reviewFlashcard', () => {
  it('throws when card does not exist', async () => {
    await expect(reviewFlashcard('ghost', 3)).rejects.toThrow('ghost')
  })

  it('increments reps after a good review (quality=3)', async () => {
    const card = makeCard()
    const repsBefore = card.fsrs.reps
    await upsertFlashcard(card)

    const updated = await reviewFlashcard(card.id, 3)
    expect(updated.fsrs.reps).toBeGreaterThanOrEqual(repsBefore + 1)
    expect(updated.lastReviewedAt).not.toBeNull()
  })

  it('schedules sooner after a failed review than after a good one', async () => {
    const card = makeCard()
    await upsertFlashcard(card)

    const failed = await reviewFlashcard(card.id, 0)
    // Reset to a fresh card (overwriting back to initial state)
    await upsertFlashcard(card)
    const good = await reviewFlashcard(card.id, 4)

    expect(failed.dueDate).toBeLessThan(good.dueDate)
  })

  it('persists updated card to storage', async () => {
    const card = makeCard()
    const repsBefore = card.fsrs.reps
    await upsertFlashcard(card)
    await reviewFlashcard(card.id, 5)

    const fromStorage = await getFlashcard(card.id)
    expect(fromStorage?.fsrs.reps).toBeGreaterThanOrEqual(repsBefore + 1)
    expect(fromStorage?.lastReviewedAt).not.toBeNull()
  })

  it('sets dueDate in the future after successful review', async () => {
    const now = Date.now()
    const card = makeCard()
    await upsertFlashcard(card)

    const updated = await reviewFlashcard(card.id, 4)
    expect(updated.dueDate).toBeGreaterThan(now)
  })
})
