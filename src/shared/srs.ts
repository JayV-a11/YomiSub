import type { FlashCard, Word, LookupResult } from './types/index.js'

export const DEFAULT_EASE_FACTOR = 2.5
export const MIN_EASE_FACTOR = 1.3

export interface SrsUpdate {
  interval: number
  repetitions: number
  easeFactor: number
  dueDate: number
  lastReviewedAt: number
}

/**
 * SM-2 algorithm: given a card's current SRS state and a quality rating (0–5),
 * returns the updated interval, repetitions, easeFactor and next dueDate.
 *
 * Quality scale:
 *   0 = complete blackout / again
 *   1 = very hard
 *   2 = hard (correct but with significant difficulty)
 *   3 = good (correct with effort)
 *   4 = easy (correct with slight hesitation)
 *   5 = perfect recall
 *
 * Ratings < 3 reset the repetition streak (card shown again soon).
 */
export function calculateNextReview(
  card: Pick<FlashCard, 'interval' | 'repetitions' | 'easeFactor'>,
  quality: number,
  now = Date.now(),
): SrsUpdate {
  let { interval, repetitions, easeFactor } = card

  if (quality < 3) {
    interval = 1
    repetitions = 0
  } else {
    if (repetitions === 0) {
      interval = 1
    } else if (repetitions === 1) {
      interval = 6
    } else {
      interval = Math.round(interval * easeFactor)
    }
    repetitions++
  }

  easeFactor = Math.max(
    MIN_EASE_FACTOR,
    easeFactor + 0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02),
  )

  return {
    interval,
    repetitions,
    easeFactor,
    dueDate: now + interval * 24 * 60 * 60 * 1000,
    lastReviewedAt: now,
  }
}

/**
 * Build a new FlashCard from a clicked word and its lookup result.
 * The card is due immediately (dueDate = now).
 */
export function createFlashCard(word: Word, result: LookupResult, now = Date.now()): FlashCard {
  return {
    id: word.dictionaryForm,
    word: word.surface,
    reading: result.reading || word.reading,
    dictionaryForm: word.dictionaryForm,
    partOfSpeech: result.partOfSpeech || word.partOfSpeech,
    definitions: result.definitions,
    source: result.source,
    interval: 1,
    repetitions: 0,
    easeFactor: DEFAULT_EASE_FACTOR,
    dueDate: now,
    addedAt: now,
    lastReviewedAt: null,
  }
}

export function isDue(card: Pick<FlashCard, 'dueDate'>, now = Date.now()): boolean {
  return now >= card.dueDate
}

export function getDueCards(cards: FlashCard[], now = Date.now()): FlashCard[] {
  return cards.filter((c) => isDue(c, now))
}
