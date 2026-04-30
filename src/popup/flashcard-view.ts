/**
 * flashcard-view.ts — Popup deck overview and SRS review session.
 *
 * Review modes (rotated per card during a session):
 *   recognition — see word → recall meaning   (default; always available)
 *   reading     — see word → recall reading (kana)
 *   cloze       — see sentence with blank → fill the word     (needs context)
 *   listening   — TTS plays sentence → identify the word      (needs context)
 *   production  — see English definition → recall the JP word
 *
 * Modes that need context fall back to recognition for context-less cards.
 *
 * States:
 *   loading       → fetching cards from storage
 *   overview      → stats + card list + start buttons
 *   review-front  → card front (varies by mode)
 *   review-back   → card back (varies by mode) + rate buttons
 *   quiz          → multiple-choice recognition mini-game
 *   done          → session summary
 */
import type {
  CardContext,
  FlashCard,
  KanjiInfo,
  Message,
  PitchAccentInfo,
  RelatedWord,
} from '@/shared/types'
import { getDueCards } from '@/shared/srs'
import { escapeHtml } from '@/shared/utils'

type ReviewMode = 'recognition' | 'reading' | 'cloze' | 'listening' | 'production'

const MODE_ROTATION: ReviewMode[] = [
  'recognition',
  'cloze',
  'reading',
  'listening',
  'production',
]

const MODE_LABELS: Record<ReviewMode, string> = {
  recognition: 'Recognition',
  reading: 'Reading',
  cloze: 'Cloze',
  listening: 'Listening',
  production: 'Production',
}

type ViewState =
  | { name: 'loading' }
  | { name: 'overview'; cards: FlashCard[]; due: FlashCard[] }
  | { name: 'review-front'; queue: FlashCard[]; index: number; total: number; mode: ReviewMode }
  | {
      name: 'review-back'
      card: FlashCard
      queue: FlashCard[]
      index: number
      total: number
      mode: ReviewMode
    }
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

// ---- Mode selection --------------------------------------------------------

function modeSupportedBy(card: FlashCard, mode: ReviewMode): boolean {
  if (mode === 'cloze' || mode === 'listening') return card.context !== null
  return true
}

/**
 * Picks the next mode for a given card based on its position in the queue.
 * Rotates through MODE_ROTATION but skips modes the card can't support.
 */
function pickMode(card: FlashCard, index: number): ReviewMode {
  const start = index % MODE_ROTATION.length
  for (let i = 0; i < MODE_ROTATION.length; i++) {
    const candidate = MODE_ROTATION[(start + i) % MODE_ROTATION.length]!
    if (modeSupportedBy(card, candidate)) return candidate
  }
  return 'recognition'
}

// ---- Entry point -----------------------------------------------------------

export function renderFlashcardView(container: HTMLElement): void {
  let state: ViewState = { name: 'loading' }
  let allCards: FlashCard[] = []

  function render(): void {
    container.innerHTML = buildView(state)
    attachHandlers()
  }

  // ---- State transitions ---------------------------------------------------

  async function loadOverview(): Promise<void> {
    state = { name: 'loading' }
    render()
    allCards = await fetchCards()
    const due = getDueCards(allCards)
    state = { name: 'overview', cards: allCards, due }
    render()
  }

  function startReview(): void {
    if (state.name !== 'overview' || state.due.length === 0) return
    const queue = [...state.due]
    const first = queue[0]!
    state = {
      name: 'review-front',
      queue,
      index: 0,
      total: queue.length,
      mode: pickMode(first, 0),
    }
    render()
  }

  function startQuiz(allCardsArg: FlashCard[], dueCards: FlashCard[]): void {
    if (dueCards.length === 0) return
    const queue = [...dueCards]
    showQuizCard(allCardsArg, queue, 0)
  }

  function showQuizCard(allCardsArg: FlashCard[], queue: FlashCard[], index: number): void {
    const card = queue[index]
    if (!card) {
      state = { name: 'done', reviewed: index }
      render()
      return
    }
    const { choices, correctIndex } = buildChoices(card, allCardsArg)
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
    state = {
      name: 'review-back',
      card,
      queue: state.queue,
      index: state.index,
      total: state.total,
      mode: state.mode,
    }
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
      const nextCard = queue[next]!
      state = {
        name: 'review-front',
        queue,
        index: next,
        total,
        mode: pickMode(nextCard, next),
      }
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

  function quizNext(): void {
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
        container.querySelector('#ys-start-review')?.addEventListener('click', startReview)
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
        container.querySelector('#ys-tts-front')?.addEventListener('click', () => {
          if (state.name !== 'review-front') return
          const card = state.queue[state.index]
          if (card?.context) speak(card.context.sentence)
        })
        break
      case 'review-back':
        container.querySelectorAll<HTMLButtonElement>('.ys-rate-btn').forEach((btn) => {
          btn.addEventListener('click', () => void rateCard(parseInt(btn.dataset.quality!)))
        })
        container.querySelector('#ys-tts-back')?.addEventListener('click', () => {
          if (state.name !== 'review-back') return
          if (state.card.context) speak(state.card.context.sentence)
        })
        break
      case 'quiz':
        if (!state.answered) {
          container.querySelectorAll<HTMLButtonElement>('.ys-choice-btn').forEach((btn, i) => {
            btn.addEventListener('click', () => void answerQuiz(i))
          })
        } else {
          container.querySelector('#ys-quiz-next')?.addEventListener('click', quizNext)
        }
        break
      case 'done':
        container.querySelector('#ys-done-back')?.addEventListener('click', () => void loadOverview())
        break
    }
  }

  // ---- Initial load --------------------------------------------------------
  void loadOverview()
}

// ---- TTS -------------------------------------------------------------------

/**
 * Speaks Japanese text via the browser's SpeechSynthesis API. Falls back
 * silently if no Japanese voice is installed — better than crashing.
 */
function speak(text: string): void {
  try {
    window.speechSynthesis.cancel()
    const utter = new SpeechSynthesisUtterance(text)
    utter.lang = 'ja-JP'
    utter.rate = 0.9
    window.speechSynthesis.speak(utter)
  } catch {
    /* TTS unavailable — silently no-op */
  }
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
      return buildReviewFront(state.queue[state.index]!, state.index, state.total, state.mode)
    case 'review-back':
      return buildReviewBack(state.card, state.index, state.total, state.mode)
    case 'quiz':
      return buildQuiz(state)
    case 'done':
      return buildDone(state.reviewed)
  }
}

function buildOverview(cards: FlashCard[], due: FlashCard[]): string {
  const recentCards = [...cards].sort((a, b) => b.addedAt - a.addedAt).slice(0, 8)

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
  const hasCtx = card.context !== null
  return `
    <li class="ys-fc-row">
      <span class="ys-fc-word">${escapeHtml(card.word)}</span>
      <span class="ys-fc-reading">${escapeHtml(card.reading)}</span>
      <span class="ys-fc-def">${def}</span>
      ${hasCtx ? '<span class="ys-fc-ctx-badge" title="Has video context">●</span>' : ''}
      ${due ? '<span class="ys-fc-due-badge">due</span>' : ''}
      <button class="ys-fc-delete" data-id="${escapeHtml(card.id)}" title="Remove" aria-label="Remove ${escapeHtml(card.word)}">×</button>
    </li>
  `
}

// ---- Review fronts ---------------------------------------------------------

function buildReviewFront(
  card: FlashCard,
  index: number,
  total: number,
  mode: ReviewMode,
): string {
  return `
    <div class="ys-fc-progress">
      <span>${index + 1} / ${total}</span>
      <span class="ys-fc-mode-pill">${MODE_LABELS[mode]}</span>
    </div>
    <div class="ys-fc-card">
      ${renderFront(card, mode)}
    </div>
    <button id="ys-show-answer" class="ys-btn ys-btn-primary ys-btn-block">Show answer</button>
    <button id="ys-quit-review" class="ys-btn ys-btn-block ys-btn-ghost">← Back to deck</button>
  `
}

function renderFront(card: FlashCard, mode: ReviewMode): string {
  switch (mode) {
    case 'recognition':
      return `
        <div class="ys-fc-front-word">${escapeHtml(card.word)}</div>
        <div class="ys-fc-front-reading">${escapeHtml(card.reading)}</div>
      `
    case 'reading':
      return `
        <div class="ys-fc-front-word">${escapeHtml(card.word)}</div>
        <div class="ys-fc-front-hint">Recall the reading…</div>
      `
    case 'production':
      return `
        <div class="ys-fc-front-prompt">Write in Japanese:</div>
        <div class="ys-fc-front-def">${escapeHtml(card.definitions[0] ?? '—')}</div>
      `
    case 'cloze':
      return renderClozeFront(card)
    case 'listening':
      return renderListeningFront(card)
  }
}

function renderClozeFront(card: FlashCard): string {
  const ctx = card.context
  if (!ctx) return renderFront(card, 'recognition')
  const masked = maskWord(ctx.sentence, ctx.wordSurface)
  return `
    <div class="ys-fc-front-prompt">Fill in the blank:</div>
    <div class="ys-fc-front-cloze">${masked}</div>
  `
}

function renderListeningFront(card: FlashCard): string {
  const ctx = card.context
  if (!ctx) return renderFront(card, 'recognition')
  return `
    <div class="ys-fc-front-prompt">Listen and identify the word:</div>
    <button id="ys-tts-front" class="ys-fc-tts-btn" type="button" aria-label="Play sentence">
      🔊 Play sentence
    </button>
  `
}

// ---- Review backs ----------------------------------------------------------

function buildReviewBack(
  card: FlashCard,
  index: number,
  total: number,
  mode: ReviewMode,
): string {
  return `
    <div class="ys-fc-progress">
      <span>${index + 1} / ${total}</span>
      <span class="ys-fc-mode-pill">${MODE_LABELS[mode]}</span>
    </div>
    <div class="ys-fc-card ys-fc-card--flipped">
      ${renderBack(card, mode)}
      ${card.context ? renderContextFooter(card.context) : ''}
    </div>
    <div class="ys-fc-rate-row">
      <button class="ys-rate-btn ys-rate-again" data-quality="0">Again</button>
      <button class="ys-rate-btn ys-rate-hard"  data-quality="1">Hard</button>
      <button class="ys-rate-btn ys-rate-good"  data-quality="3">Good</button>
      <button class="ys-rate-btn ys-rate-easy"  data-quality="5">Easy</button>
    </div>
  `
}

function renderBack(card: FlashCard, mode: ReviewMode): string {
  const defs = card.definitions.slice(0, 5)
  const defList =
    defs.length > 0
      ? `<ol class="ys-fc-defs">${defs.map((d) => `<li>${escapeHtml(d)}</li>`).join('')}</ol>`
      : ''

  const wordBlock = `
    <div class="ys-fc-front-word">${escapeHtml(card.word)}</div>
    <div class="ys-fc-front-reading">${escapeHtml(card.reading)}</div>
  `

  const extras = `
    ${renderPitchAccent(card.pitchAccent)}
    ${renderKanjiBreakdown(card.kanjiBreakdown)}
    ${renderRelatedWords(card.relatedWords)}
  `

  if (mode === 'cloze' && card.context) {
    return `
      ${renderClozeReveal(card.context)}
      ${wordBlock}
      <hr class="ys-fc-divider" />
      ${defList}
      ${extras}
    `
  }
  if (mode === 'listening' && card.context) {
    return `
      <button id="ys-tts-back" class="ys-fc-tts-btn" type="button">🔊 Replay</button>
      <p class="ys-fc-ctx-line">${escapeHtml(card.context.sentence)}</p>
      ${wordBlock}
      <hr class="ys-fc-divider" />
      ${defList}
      ${extras}
    `
  }

  // recognition / reading / production all reveal the same content
  return `
    ${wordBlock}
    <hr class="ys-fc-divider" />
    ${defList}
    ${extras}
  `
}

/**
 * Renders a visual pitch-accent diagram. Each mora gets a small block stacked
 * either high or low according to the NHK drop-position convention:
 *   pattern 0      → low first mora, all subsequent high (heiban)
 *   pattern 1      → high first mora, all subsequent low (atamadaka)
 *   pattern N (>1) → low first, high through mora N, drop after
 */
function renderPitchAccent(pitch: PitchAccentInfo | null): string {
  if (!pitch || pitch.patterns.length === 0) return ''

  // Each accepted pattern renders its own row.
  const rows = pitch.patterns
    .map((p) => {
      const moras = splitMoras(pitch.reading)
      const dots: string[] = []
      for (let i = 0; i < moras.length; i++) {
        const high = isHighAtMora(i + 1, p, moras.length)
        dots.push(
          `<span class="ys-fc-pitch-mora ${high ? 'high' : 'low'}">${escapeHtml(moras[i]!)}</span>`,
        )
      }
      const label = pitchPatternName(p, moras.length)
      return `
        <div class="ys-fc-pitch-row">
          <span class="ys-fc-pitch-pattern">${dots.join('')}</span>
          <span class="ys-fc-pitch-label">${escapeHtml(label)}</span>
          <span class="ys-fc-pitch-num">[${p}]</span>
        </div>
      `
    })
    .join('')

  return `
    <hr class="ys-fc-divider" />
    <div class="ys-fc-pitch-section">
      <div class="ys-fc-section-title">Pitch accent</div>
      ${rows}
    </div>
  `
}

/**
 * Splits a hiragana reading into moras. Small kana (ゃゅょっ etc.) attach
 * to the preceding base kana — that two-codepoint pair is one mora.
 */
function splitMoras(reading: string): string[] {
  const SMALL = 'ゃゅょぁぃぅぇぉャュョァィゥェォ'
  const out: string[] = []
  for (const c of reading) {
    if (SMALL.includes(c) && out.length > 0) {
      out[out.length - 1] += c
    } else {
      out.push(c)
    }
  }
  return out
}

/**
 * Returns true if mora at 1-based position `pos` is high under pattern `p`
 * for a word of `len` moras.
 */
function isHighAtMora(pos: number, p: number, len: number): boolean {
  if (p === 0) return pos > 1 // heiban: low → high from mora 2
  if (p === 1) return pos === 1 // atamadaka: high only on mora 1
  // nakadaka / odaka: low first mora, high through mora p, drop after
  if (pos === 1) return false
  if (pos <= p) return true
  return false
  // (`len` is unused but kept for callers that may want to render trailing
  // particles in the future.)
  void len
}

function pitchPatternName(p: number, len: number): string {
  if (p === 0) return 'Heiban (平板)'
  if (p === 1) return 'Atamadaka (頭高)'
  if (p === len) return 'Odaka (尾高)'
  return 'Nakadaka (中高)'
}

function renderRelatedWords(related: RelatedWord[]): string {
  if (related.length === 0) return ''
  const items = related
    .map(
      (r) => `
      <li class="ys-fc-rel-row">
        <span class="ys-fc-rel-word">${escapeHtml(r.word)}</span>
        <span class="ys-fc-rel-reading">${escapeHtml(r.reading)}</span>
        <span class="ys-fc-rel-gloss">${escapeHtml(r.gloss)}</span>
      </li>
    `,
    )
    .join('')
  return `
    <hr class="ys-fc-divider" />
    <div class="ys-fc-related-section">
      <div class="ys-fc-section-title">See also</div>
      <ul class="ys-fc-rel-list">${items}</ul>
    </div>
  `
}

function renderKanjiBreakdown(breakdown: KanjiInfo[]): string {
  if (breakdown.length === 0) return ''
  const items = breakdown
    .map(
      (k) => `
      <div class="ys-fc-kanji-row">
        <span class="ys-fc-kanji-char">${escapeHtml(k.char)}</span>
        <div class="ys-fc-kanji-info">
          <div class="ys-fc-kanji-meanings">${escapeHtml(k.meanings.slice(0, 3).join(', '))}</div>
          ${
            k.onyomi.length > 0
              ? `<div class="ys-fc-kanji-readings"><span class="ys-fc-kanji-tag on">on</span> ${escapeHtml(k.onyomi.slice(0, 3).join('・'))}</div>`
              : ''
          }
          ${
            k.kunyomi.length > 0
              ? `<div class="ys-fc-kanji-readings"><span class="ys-fc-kanji-tag kun">kun</span> ${escapeHtml(k.kunyomi.slice(0, 3).join('・'))}</div>`
              : ''
          }
        </div>
      </div>
    `,
    )
    .join('')
  return `
    <hr class="ys-fc-divider" />
    <div class="ys-fc-kanji-section">
      <div class="ys-fc-section-title">Kanji</div>
      ${items}
    </div>
  `
}

function renderClozeReveal(ctx: CardContext): string {
  const idx = ctx.sentence.indexOf(ctx.wordSurface)
  if (idx < 0) {
    return `<p class="ys-fc-ctx-line">${escapeHtml(ctx.sentence)}</p>`
  }
  const before = ctx.sentence.slice(0, idx)
  const after = ctx.sentence.slice(idx + ctx.wordSurface.length)
  return `
    <p class="ys-fc-ctx-line">
      ${escapeHtml(before)}<span class="ys-fc-cloze-word">${escapeHtml(ctx.wordSurface)}</span>${escapeHtml(after)}
    </p>
  `
}

function renderContextFooter(ctx: CardContext): string {
  const safeUrl = escapeHtml(ctx.videoUrl)
  const safeTitle = escapeHtml(truncate(ctx.videoTitle, 60))
  return `
    <div class="ys-fc-ctx-footer">
      <a class="ys-fc-watch" href="${safeUrl}" target="_blank" rel="noreferrer noopener" title="Open at ${formatTimestamp(ctx.timestampSeconds)}">
        📺 Watch scene · ${formatTimestamp(ctx.timestampSeconds)}
      </a>
      ${safeTitle ? `<div class="ys-fc-ctx-source">${safeTitle}</div>` : ''}
    </div>
  `
}

// ---- Cloze helpers ---------------------------------------------------------

function maskWord(sentence: string, surface: string): string {
  const idx = sentence.indexOf(surface)
  if (idx < 0) return escapeHtml(sentence)
  const before = sentence.slice(0, idx)
  const after = sentence.slice(idx + surface.length)
  // Render blanks of roughly the same width as the masked word
  const blank = '＿'.repeat(Math.max(2, surface.length))
  return `${escapeHtml(before)}<span class="ys-fc-cloze-blank">${blank}</span>${escapeHtml(after)}`
}

// ---- Quiz ------------------------------------------------------------------

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
    <div class="ys-fc-progress">
      <span>${state.index + 1} / ${state.total}</span>
      <span class="ys-fc-mode-pill">Quiz</span>
    </div>
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

// ---- Formatting helpers ----------------------------------------------------

function formatTimestamp(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds))
  const m = Math.floor(s / 60)
  const r = s % 60
  return `${m}:${r.toString().padStart(2, '0')}`
}

function truncate(s: string, max: number): string {
  return s.length <= max ? s : s.slice(0, max - 1) + '…'
}
