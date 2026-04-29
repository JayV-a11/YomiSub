import { describe, it, expect } from 'vitest'
import {
  calculateNextReview,
  createFlashCard,
  isDue,
  getDueCards,
  DEFAULT_EASE_FACTOR,
  MIN_EASE_FACTOR,
} from '@/shared/srs'
import type { FlashCard, Word, LookupResult } from '@/shared/types'

// ---- Fixtures --------------------------------------------------------------

function makeCard(overrides: Partial<FlashCard> = {}): FlashCard {
  return {
    id: '学生',
    word: '学生',
    reading: 'がくせい',
    dictionaryForm: '学生',
    partOfSpeech: '名詞',
    definitions: ['student'],
    source: 'jmdict',
    interval: 1,
    repetitions: 0,
    easeFactor: DEFAULT_EASE_FACTOR,
    dueDate: Date.now() - 1000,
    addedAt: Date.now() - 86400_000,
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

// ---- calculateNextReview ---------------------------------------------------

describe('calculateNextReview', () => {
  it('resets interval and repetitions when quality < 3 (again)', () => {
    const card = makeCard({ interval: 10, repetitions: 4 })
    const result = calculateNextReview(card, 0)
    expect(result.interval).toBe(1)
    expect(result.repetitions).toBe(0)
  })

  it('resets interval and repetitions when quality = 2 (hard boundary)', () => {
    const card = makeCard({ interval: 10, repetitions: 3 })
    const result = calculateNextReview(card, 2)
    expect(result.interval).toBe(1)
    expect(result.repetitions).toBe(0)
  })

  it('sets interval to 1 on first success (repetitions = 0)', () => {
    const card = makeCard({ repetitions: 0 })
    const result = calculateNextReview(card, 3)
    expect(result.interval).toBe(1)
    expect(result.repetitions).toBe(1)
  })

  it('sets interval to 6 on second success (repetitions = 1)', () => {
    const card = makeCard({ repetitions: 1, interval: 1 })
    const result = calculateNextReview(card, 3)
    expect(result.interval).toBe(6)
    expect(result.repetitions).toBe(2)
  })

  it('multiplies interval by easeFactor on subsequent successes', () => {
    const card = makeCard({ repetitions: 2, interval: 6, easeFactor: 2.5 })
    const result = calculateNextReview(card, 4)
    expect(result.interval).toBe(Math.round(6 * 2.5))
    expect(result.repetitions).toBe(3)
  })

  it('increases easeFactor for quality 5', () => {
    const card = makeCard({ easeFactor: 2.5 })
    const result = calculateNextReview(card, 5)
    expect(result.easeFactor).toBeGreaterThan(2.5)
  })

  it('decreases easeFactor for quality 3', () => {
    const card = makeCard({ easeFactor: 2.5 })
    const result = calculateNextReview(card, 3)
    expect(result.easeFactor).toBeLessThan(2.5)
  })

  it('never lets easeFactor drop below MIN_EASE_FACTOR', () => {
    const card = makeCard({ easeFactor: MIN_EASE_FACTOR })
    const result = calculateNextReview(card, 0)
    expect(result.easeFactor).toBeGreaterThanOrEqual(MIN_EASE_FACTOR)
  })

  it('sets dueDate in the future based on interval', () => {
    const now = Date.now()
    const card = makeCard({ repetitions: 1, interval: 1 })
    const result = calculateNextReview(card, 3, now)
    // interval=6 days from now
    expect(result.dueDate).toBe(now + 6 * 24 * 60 * 60 * 1000)
  })

  it('sets lastReviewedAt to now', () => {
    const now = 1_700_000_000_000
    const card = makeCard()
    const result = calculateNextReview(card, 3, now)
    expect(result.lastReviewedAt).toBe(now)
  })

  it('quality 1 resets the streak (< 3)', () => {
    const card = makeCard({ repetitions: 5, interval: 30 })
    const result = calculateNextReview(card, 1)
    expect(result.repetitions).toBe(0)
    expect(result.interval).toBe(1)
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
    const card = createFlashCard(makeWord(), makeResult(), now)
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
