/**
 * srs.ts — Spaced Repetition Scheduler
 *
 * Uses FSRS (Free Spaced Repetition Scheduler, 2024+) via the ts-fsrs library.
 * FSRS replaces SM-2 (1987) — it's the algorithm modern Anki uses by default
 * and produces measurably better intervals.
 *
 * Public API surface is intentionally similar to the previous SM-2 module:
 *   - calculateNextReview(card, quality, now?) → SrsUpdate
 *   - createFlashCard(word, result, context?, now?) → FlashCard
 *   - isDue / getDueCards
 *
 * `quality` is the legacy 0..5 scale used by SM-2. We map it to FSRS Rating:
 *   0–1 → Again, 2 → Hard, 3–4 → Good, 5 → Easy.
 * The popup UI sends 0/1/3/5 so all four ratings are reachable.
 */
import { fsrs, createEmptyCard, Rating, type Card as FsrsCard, type Grade } from 'ts-fsrs'
import type {
  FlashCard,
  Word,
  LookupResult,
  CardContext,
  FsrsState,
  KanjiInfo,
  RelatedWord,
  PitchAccentInfo,
} from './types/index.js'

export const DEFAULT_EASE_FACTOR = 2.5
export const MIN_EASE_FACTOR = 1.3
export const DEFAULT_STABILITY = 1

const scheduler = fsrs()

export interface SrsUpdate {
  fsrs: FsrsState
  interval: number
  repetitions: number
  easeFactor: number
  stability: number
  dueDate: number
  lastReviewedAt: number
}

// ---- Quality → Rating mapping ----------------------------------------------

function qualityToRating(quality: number): Grade {
  if (quality <= 1) return Rating.Again as Grade
  if (quality === 2) return Rating.Hard as Grade
  if (quality <= 4) return Rating.Good as Grade
  return Rating.Easy as Grade
}

// ---- Serialisation ---------------------------------------------------------

function serialiseCard(card: FsrsCard): FsrsState {
  return {
    due: card.due.getTime(),
    stability: card.stability,
    difficulty: card.difficulty,
    elapsed_days: card.elapsed_days,
    scheduled_days: card.scheduled_days,
    learning_steps: card.learning_steps,
    reps: card.reps,
    lapses: card.lapses,
    state: card.state as 0 | 1 | 2 | 3,
    last_review: card.last_review ? card.last_review.getTime() : null,
  }
}

function deserialiseCard(state: FsrsState): FsrsCard {
  return {
    due: new Date(state.due),
    stability: state.stability,
    difficulty: state.difficulty,
    elapsed_days: state.elapsed_days,
    scheduled_days: state.scheduled_days,
    learning_steps: state.learning_steps,
    reps: state.reps,
    lapses: state.lapses,
    state: state.state,
    last_review: state.last_review ? new Date(state.last_review) : undefined,
  }
}

/**
 * Builds an empty FSRS card serialised for storage. `now` defines the initial
 * due date (cards are due immediately by default, mirroring SM-2 behaviour).
 */
export function createInitialFsrsState(now = Date.now()): FsrsState {
  const card = createEmptyCard(new Date(now))
  // createEmptyCard sets `due` to `now`. Confirm the mirror.
  return serialiseCard(card)
}

// ---- Public API ------------------------------------------------------------

/**
 * Given a card and a 0..5 quality rating, compute the next FSRS state +
 * mirror fields (interval, dueDate, etc) for the FlashCard schema.
 */
export function calculateNextReview(
  card: Pick<FlashCard, 'fsrs'>,
  quality: number,
  now = Date.now(),
): SrsUpdate {
  const fsrsCard = deserialiseCard(card.fsrs)
  const rating = qualityToRating(quality)
  const result = scheduler.next(fsrsCard, new Date(now), rating)
  const next = serialiseCard(result.card)

  return {
    fsrs: next,
    interval: next.scheduled_days,
    repetitions: next.reps,
    easeFactor: difficultyToEase(next.difficulty),
    stability: next.stability,
    dueDate: next.due,
    lastReviewedAt: now,
  }
}

/**
 * FSRS difficulty is on a 1..10 scale (higher = harder). Map to a SM-2-style
 * ease factor for legacy display in the popup. Inverse of the standard SM-2
 * range: easy cards (low difficulty) → high ease.
 */
function difficultyToEase(difficulty: number): number {
  const clamped = Math.max(1, Math.min(10, difficulty))
  // Linear map: 1 → 2.8, 10 → 1.3
  return 2.8 - ((clamped - 1) / 9) * (2.8 - MIN_EASE_FACTOR)
}

/**
 * Build a new FlashCard from a clicked word and its lookup result.
 * The card is due immediately (dueDate = now).
 */
export interface CreateCardExtras {
  context?: CardContext | null
  kanjiBreakdown?: KanjiInfo[]
  relatedWords?: RelatedWord[]
  pitchAccent?: PitchAccentInfo | null
}

export function createFlashCard(
  word: Word,
  result: LookupResult,
  extras: CreateCardExtras = {},
  now = Date.now(),
): FlashCard {
  const fsrsState = createInitialFsrsState(now)
  return {
    id: word.dictionaryForm,
    word: word.surface,
    reading: result.reading || word.reading,
    dictionaryForm: word.dictionaryForm,
    partOfSpeech: result.partOfSpeech || word.partOfSpeech,
    definitions: result.definitions,
    source: result.source,
    context: extras.context ?? null,
    kanjiBreakdown: extras.kanjiBreakdown ?? [],
    relatedWords: extras.relatedWords ?? [],
    pitchAccent: extras.pitchAccent ?? null,
    fsrs: fsrsState,
    dueDate: fsrsState.due,
    addedAt: now,
    lastReviewedAt: null,
    interval: 1,
    repetitions: 0,
    easeFactor: DEFAULT_EASE_FACTOR,
    stability: DEFAULT_STABILITY,
  }
}

export function isDue(card: Pick<FlashCard, 'dueDate'>, now = Date.now()): boolean {
  return now >= card.dueDate
}

export function getDueCards(cards: FlashCard[], now = Date.now()): FlashCard[] {
  return cards.filter((c) => isDue(c, now))
}

/**
 * Re-export the Rating enum for callers that want to interact with FSRS
 * directly (e.g. richer rating UIs).
 */
export { Rating }
