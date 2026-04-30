import { describe, it, expect } from 'vitest'
import {
  calculateNextReview,
  createFlashCard,
  createInitialFsrsState,
  isDue,
  getDueCards,
  DEFAULT_EASE_FACTOR,
} from '@/shared/srs'
import type { FlashCard, Word, LookupResult } from '@/shared/types'

// ---- Fixtures --------------------------------------------------------------

function makeCard(overrides: Partial<FlashCard> = {}): FlashCard {
  const addedAt = Date.now() - 86400_000
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
    fsrs: createInitialFsrsState(addedAt),
    interval: 1,
    repetitions: 0,
    easeFactor: DEFAULT_EASE_FACTOR,
    stability: 1,
    dueDate: Date.now() - 1000,
    addedAt,
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

// ---- calculateNextReview (FSRS) --------------------------------------------

describe('calculateNextReview (FSRS)', () => {
  it('increments reps after a successful review', () => {
    const card = makeCard()
    const result = calculateNextReview(card, 3)
    expect(result.repetitions).toBeGreaterThanOrEqual(1)
  })

  it('returns a future dueDate after a Good rating', () => {
    const now = 1_700_000_000_000
    const card = makeCard({ fsrs: createInitialFsrsState(now) })
    const result = calculateNextReview(card, 3, now)
    expect(result.dueDate).toBeGreaterThan(now)
  })

  it('schedules sooner for Again than for Easy', () => {
    const now = 1_700_000_000_000
    const card = makeCard({ fsrs: createInitialFsrsState(now) })
    const again = calculateNextReview(card, 0, now)
    const easy = calculateNextReview(card, 5, now)
    expect(again.dueDate).toBeLessThan(easy.dueDate)
  })

  it('schedules sooner for Hard than for Good', () => {
    const now = 1_700_000_000_000
    const card = makeCard({ fsrs: createInitialFsrsState(now) })
    const hard = calculateNextReview(card, 2, now)
    const good = calculateNextReview(card, 3, now)
    expect(hard.dueDate).toBeLessThanOrEqual(good.dueDate)
  })

  it('persists FSRS state for the next review', () => {
    const now = 1_700_000_000_000
    const card = makeCard({ fsrs: createInitialFsrsState(now) })
    const result = calculateNextReview(card, 3, now)
    expect(result.fsrs.reps).toBeGreaterThanOrEqual(1)
    expect(result.fsrs.due).toBe(result.dueDate)
  })

  it('mirrors fsrs.due into dueDate for cheap filtering', () => {
    const card = makeCard()
    const result = calculateNextReview(card, 3)
    expect(result.dueDate).toBe(result.fsrs.due)
  })

  it('sets lastReviewedAt to now', () => {
    const now = 1_700_000_000_000
    const card = makeCard()
    const result = calculateNextReview(card, 3, now)
    expect(result.lastReviewedAt).toBe(now)
  })

  it('increments lapses when rating is Again after a successful streak', () => {
    const now = 1_700_000_000_000
    let card = makeCard({ fsrs: createInitialFsrsState(now) })
    // Build up a few good reviews
    let upd = calculateNextReview(card, 4, now)
    card = { ...card, fsrs: upd.fsrs }
    upd = calculateNextReview(card, 4, now + 86400_000)
    card = { ...card, fsrs: upd.fsrs }
    const before = card.fsrs.lapses
    upd = calculateNextReview(card, 0, now + 2 * 86400_000)
    expect(upd.fsrs.lapses).toBeGreaterThanOrEqual(before + 1)
  })
})

// ---- createFlashCard -------------------------------------------------------

describe('createFlashCard', () => {
  it('uses dictionaryForm as id', () => {
    const word = makeWord('食べる')
    const card = createFlashCard(word, makeResult())
    expect(card.id).toBe('食べる')
  })

  it('uses word surface as word field', () => {
    const word = makeWord('食べ')
    const card = createFlashCard(word, makeResult())
    expect(card.word).toBe('食べ')
  })

  it('uses result.reading over word.reading when provided', () => {
    const word = makeWord()
    const result = makeResult({ reading: 'たべる-override' })
    const card = createFlashCard(word, result)
    expect(card.reading).toBe('たべる-override')
  })

  it('falls back to word.reading when result.reading is empty', () => {
    const word = makeWord()
    const result = makeResult({ reading: '' })
    const card = createFlashCard(word, result)
    expect(card.reading).toBe(word.reading)
  })

  it('starts with default ease factor and zero repetitions', () => {
    const card = createFlashCard(makeWord(), makeResult())
    expect(card.easeFactor).toBe(DEFAULT_EASE_FACTOR)
    expect(card.repetitions).toBe(0)
    expect(card.interval).toBe(1)
  })

  it('sets dueDate equal to addedAt (due immediately)', () => {
    const now = 1_700_000_000_000
    const card = createFlashCard(makeWord(), makeResult(), {}, now)
    expect(card.dueDate).toBe(now)
    expect(card.addedAt).toBe(now)
  })

  it('sets lastReviewedAt to null', () => {
    const card = createFlashCard(makeWord(), makeResult())
    expect(card.lastReviewedAt).toBeNull()
  })
})

// ---- isDue -----------------------------------------------------------------

describe('isDue', () => {
  it('returns true when dueDate is in the past', () => {
    const card = makeCard({ dueDate: Date.now() - 1000 })
    expect(isDue(card)).toBe(true)
  })

  it('returns true when dueDate equals now', () => {
    const now = Date.now()
    const card = makeCard({ dueDate: now })
    expect(isDue(card, now)).toBe(true)
  })

  it('returns false when dueDate is in the future', () => {
    const card = makeCard({ dueDate: Date.now() + 86_400_000 })
    expect(isDue(card)).toBe(false)
  })
})

// ---- getDueCards -----------------------------------------------------------

describe('getDueCards', () => {
  it('returns only cards whose dueDate is <= now', () => {
    const now = Date.now()
    const cards: FlashCard[] = [
      makeCard({ id: 'a', dueDate: now - 1000 }),
      makeCard({ id: 'b', dueDate: now + 86_400_000 }),
      makeCard({ id: 'c', dueDate: now }),
    ]
    const due = getDueCards(cards, now)
    expect(due.map((c) => c.id).sort()).toEqual(['a', 'c'])
  })

  it('returns empty array when no cards are due', () => {
    const cards = [makeCard({ dueDate: Date.now() + 1_000_000 })]
    expect(getDueCards(cards)).toHaveLength(0)
  })

  it('returns all cards when all are due', () => {
    const cards = [
      makeCard({ id: 'a', dueDate: 0 }),
      makeCard({ id: 'b', dueDate: 1000 }),
    ]
    expect(getDueCards(cards)).toHaveLength(2)
  })
})
