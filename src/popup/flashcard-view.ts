/**
 * flashcard-view.ts — Popup deck overview and SRS review session.
 *
 * States:
 *   loading       → fetching cards from storage
 *   overview      → stats + card list + start buttons
 *   review-front  → card front (word + reading)
 *   review-back   → card back (definitions) + rate buttons
 *   quiz          → multiple-choice recognition mini-game
 *   done          → session summary
 */
import type { FlashCard, Message } from '@/shared/types'
import { getDueCards } from '@/shared/srs'
import { escapeHtml } from '@/shared/utils'

type ViewState =
  | { name: 'loading' }
  | { name: 'overview'; cards: FlashCard[]; due: FlashCard[] }
  | { name: 'review-front'; queue: FlashCard[]; index: number; total: number }
  | { name: 'review-back'; card: FlashCard; queue: FlashCard[]; index: number; total: number }
  | {
      name: 'quiz'
      card: FlashCard
      choices: string[]
      correctIndex: number
      answered: boolean
      correct: boolean
      queue: FlashCard[]
      index: number
      total: number
    }
  | { name: 'done'; reviewed: number }

// ---- Entry point -----------------------------------------------------------

export function renderFlashcardView(container: HTMLElement): void {
  let state: ViewState = { name: 'loading' }

  function render(): void {
    container.innerHTML = buildView(state)
    attachHandlers()
  }

  // ---- State transitions ---------------------------------------------------

  async function loadOverview(): Promise<void> {
    state = { name: 'loading' }
    render()
    const cards = await fetchCards()
    const due = getDueCards(cards)
    state = { name: 'overview', cards, due }
    render()
  }

  function startReview(): void {
    if (state.name !== 'overview' || state.due.length === 0) return
    const queue = [...state.due]
    state = { name: 'review-front', queue, index: 0, total: queue.length }
    render()
  }

  function startQuiz(allCards: FlashCard[], dueCards: FlashCard[]): void {
    if (dueCards.length === 0) return
    const queue = [...dueCards]
    showQuizCard(allCards, queue, 0)
  }

  function showQuizCard(allCards: FlashCard[], queue: FlashCard[], index: number): void {
    const card = queue[index]
    if (!card) {
      state = { name: 'done', reviewed: index }
      render()
      return
    }
    const { choices, correctIndex } = buildChoices(card, allCards)
    state = {
      name: 'quiz',
      card,
      choices,
      correctIndex,
      answered: false,
      correct: false,
      queue,
      index,
      total: queue.length,
    }
    render()
  }

  function showAnswer(): void {
    if (state.name !== 'review-front') return
    const card = state.queue[state.index]
    if (!card) return
    state = { name: 'review-back', card, queue: state.queue, index: state.index, total: state.total }
    render()
  }

  async function rateCard(quality: number): Promise<void> {
    if (state.name !== 'review-back') return
    const { card, queue, index, total } = state
    await sendReview(card.id, quality)
    const next = index + 1
    if (next >= total) {
      state = { name: 'done', reviewed: total }
    } else {
      state = { name: 'review-front', queue, index: next, total }
    }
    render()
  }

  async function answerQuiz(choiceIndex: number): Promise<void> {
    if (state.name !== 'quiz' || state.answered) return
    const isCorrect = choiceIndex === state.correctIndex
    const quality = isCorrect ? 4 : 1
    await sendReview(state.card.id, quality)
    state = { ...state, answered: true, correct: isCorrect }
    render()
  }

  function quizNext(allCards: FlashCard[]): void {
    if (state.name !== 'quiz') return
    const next = state.index + 1
    if (next >= state.total) {
      state = { name: 'done', reviewed: state.total }
      render()
    } else {
      showQuizCard(allCards, state.queue, next)
    }
  }

  async function deleteCard(id: string): Promise<void> {
    await sendDelete(id)
    await loadOverview()
  }

  // ---- Event wiring --------------------------------------------------------

  function attachHandlers(): void {
    switch (state.name) {
      case 'overview': {
        const { due, cards } = state
        container
          .querySelector('#ys-start-review')
          ?.addEventListener('click', startReview)
        container
          .querySelector('#ys-start-quiz')
          ?.addEventListener('click', () => startQuiz(cards, due))
        container.querySelectorAll<HTMLButtonElement>('.ys-fc-delete').forEach((btn) => {
          btn.addEventListener('click', () => void deleteCard(btn.dataset.id!))
        })
        break
      }
      case 'review-front':
        container.querySelector('#ys-show-answer')?.addEventListener('click', showAnswer)
        container.querySelector('#ys-quit-review')?.addEventListener('click', () => void loadOverview())
        break
      case 'review-back':
        container.querySelectorAll<HTMLButtonElement>('.ys-rate-btn').forEach((btn) => {
          btn.addEventListener('click', () => void rateCard(parseInt(btn.dataset.quality!)))
        })
        break
      case 'quiz': {
        const allCards = /* will be reloaded */ [] as FlashCard[]
        if (!state.answered) {
          container.querySelectorAll<HTMLButtonElement>('.ys-choice-btn').forEach((btn, i) => {
            btn.addEventListener('click', () => void answerQuiz(i))
          })
        } else {
          container
            .querySelector('#ys-quiz-next')
            ?.addEventListener('click', () => quizNext(allCards))
        }
        break
      }
      case 'done':
        container.querySelector('#ys-done-back')?.addEventListener('click', () => void loadOverview())
        break
    }
  }

  // ---- Initial load --------------------------------------------------------
  void loadOverview()
}

// ---- Chrome messaging helpers ----------------------------------------------

function fetchCards(): Promise<FlashCard[]> {
  return new Promise((resolve) => {
    const msg: Message = { type: 'GET_FLASHCARDS' }
    chrome.runtime.sendMessage(msg, (response: Message) => {
      if (chrome.runtime.lastError || response?.type !== 'GET_FLASHCARDS_RESULT') {
        resolve([])
        return
      }
      resolve(response.payload)
    })
  })
}

function sendReview(id: string, quality: number): Promise<void> {
  return new Promise((resolve) => {
    const msg: Message = { type: 'REVIEW_FLASHCARD', payload: { id, quality } }
    chrome.runtime.sendMessage(msg, () => resolve())
  })
}

function sendDelete(id: string): Promise<void> {
  return new Promise((resolve) => {
    const msg: Message = { type: 'DELETE_FLASHCARD', payload: { id } }
    chrome.runtime.sendMessage(msg, () => resolve())
  })
}

// ---- Quiz helpers ----------------------------------------------------------

function buildChoices(
  card: FlashCard,
  allCards: FlashCard[],
): { choices: string[]; correctIndex: number } {
  const correctDef = card.definitions[0] ?? '—'
  const distractors = allCards
    .filter((c) => c.id !== card.id && c.definitions.length > 0)
    .sort(() => Math.random() - 0.5)
    .slice(0, 3)
    .map((c) => c.definitions[0]!)

  const pool = [correctDef, ...distractors].sort(() => Math.random() - 0.5)
  const correctIndex = pool.indexOf(correctDef)
  return { choices: pool, correctIndex }
}

// ---- HTML builders ---------------------------------------------------------

function buildView(state: ViewState): string {
  switch (state.name) {
    case 'loading':
      return '<p class="ys-fc-loading">Loading deck…</p>'
    case 'overview':
      return buildOverview(state.cards, state.due)
    case 'review-front':
      return buildReviewFront(state.queue[state.index]!, state.index, state.total)
    case 'review-back':
      return buildReviewBack(state.card, state.index, state.total)
    case 'quiz':
      return buildQuiz(state)
    case 'done':
      return buildDone(state.reviewed)
  }
}

function buildOverview(cards: FlashCard[], due: FlashCard[]): string {
  const recentCards = [...cards]
    .sort((a, b) => b.addedAt - a.addedAt)
    .slice(0, 8)

  const hasCards = cards.length > 0
  const hasDue = due.length > 0

  return `
    <div class="ys-fc-stats">
      <div class="ys-fc-stat">
        <span class="ys-fc-stat-n">${cards.length}</span>
        <span class="ys-fc-stat-l">Total</span>
      </div>
      <div class="ys-fc-stat">
        <span class="ys-fc-stat-n ys-fc-due-n">${due.length}</span>
        <span class="ys-fc-stat-l">Due today</span>
      </div>
    </div>

    <div class="ys-fc-actions">
      <button id="ys-start-review" class="ys-btn ys-btn-primary" ${!hasDue ? 'disabled' : ''}>
        Review (${due.length})
      </button>
      <button id="ys-start-quiz" class="ys-btn" ${!hasDue ? 'disabled' : ''}>
        Quiz
      </button>
    </div>

    ${
      !hasCards
        ? '<p class="ys-fc-empty">Click any word in the subtitles to add it to your deck.</p>'
        : `<ul class="ys-fc-list">
            ${recentCards.map((c) => buildCardRow(c)).join('')}
          </ul>`
    }
  `
}

function buildCardRow(card: FlashCard): string {
  const def = escapeHtml(card.definitions[0] ?? '—').slice(0, 40)
  const due = Date.now() >= card.dueDate
  return `
    <li class="ys-fc-row">
      <span class="ys-fc-word">${escapeHtml(card.word)}</span>
      <span class="ys-fc-reading">${escapeHtml(card.reading)}</span>
      <span class="ys-fc-def">${def}</span>
      ${due ? '<span class="ys-fc-due-badge">due</span>' : ''}
      <button class="ys-fc-delete" data-id="${escapeHtml(card.id)}" title="Remove" aria-label="Remove ${escapeHtml(card.word)}">×</button>
    </li>
  `
}

function buildReviewFront(card: FlashCard, index: number, total: number): string {
  return `
    <div class="ys-fc-progress">${index + 1} / ${total}</div>
    <div class="ys-fc-card">
      <div class="ys-fc-front-word">${escapeHtml(card.word)}</div>
      <div class="ys-fc-front-reading">${escapeHtml(card.reading)}</div>
    </div>
    <button id="ys-show-answer" class="ys-btn ys-btn-primary ys-btn-block">Show answer</button>
    <button id="ys-quit-review" class="ys-btn ys-btn-block ys-btn-ghost">← Back to deck</button>
  `
}

function buildReviewBack(card: FlashCard, index: number, total: number): string {
  const defs = card.definitions.slice(0, 5)
  return `
    <div class="ys-fc-progress">${index + 1} / ${total}</div>
    <div class="ys-fc-card ys-fc-card--flipped">
      <div class="ys-fc-front-word">${escapeHtml(card.word)}</div>
      <div class="ys-fc-front-reading">${escapeHtml(card.reading)}</div>
      <hr class="ys-fc-divider" />
      <ol class="ys-fc-defs">
        ${defs.map((d) => `<li>${escapeHtml(d)}</li>`).join('')}
      </ol>
    </div>
    <div class="ys-fc-rate-row">
      <button class="ys-rate-btn ys-rate-again" data-quality="0">Again</button>
      <button class="ys-rate-btn ys-rate-hard"  data-quality="1">Hard</button>
      <button class="ys-rate-btn ys-rate-good"  data-quality="3">Good</button>
      <button class="ys-rate-btn ys-rate-easy"  data-quality="5">Easy</button>
    </div>
  `
}

function buildQuiz(state: Extract<ViewState, { name: 'quiz' }>): string {
  const { card, choices, correctIndex, answered, correct } = state

  const choiceButtons = choices
    .map((c, i) => {
      let cls = 'ys-choice-btn'
      if (answered) {
        if (i === correctIndex) cls += ' ys-choice--correct'
        else if (!correct && i !== correctIndex) cls += ' ys-choice--wrong'
      }
      return `<button class="${cls}" ${answered ? 'disabled' : ''}>${escapeHtml(c)}</button>`
    })
    .join('')

  return `
    <div class="ys-fc-progress">${state.index + 1} / ${state.total}</div>
    <div class="ys-fc-quiz-prompt">
      What does <strong>${escapeHtml(card.word)}</strong> mean?
    </div>
    <div class="ys-fc-choices">${choiceButtons}</div>
    ${
      answered
        ? `<p class="ys-fc-quiz-result ${correct ? 'correct' : 'wrong'}">
             ${correct ? '✓ Correct!' : '✗ Incorrect'}
           </p>
           <button id="ys-quiz-next" class="ys-btn ys-btn-primary ys-btn-block">Next</button>`
        : ''
    }
  `
}

function buildDone(reviewed: number): string {
  return `
    <div class="ys-fc-done">
      <div class="ys-fc-done-icon">🎉</div>
      <p class="ys-fc-done-title">Session complete!</p>
      <p class="ys-fc-done-sub">Reviewed ${reviewed} card${reviewed !== 1 ? 's' : ''}</p>
      <button id="ys-done-back" class="ys-btn ys-btn-primary ys-btn-block">Back to deck</button>
    </div>
  `
}
